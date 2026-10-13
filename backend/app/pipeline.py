"""What happens to an application after it is submitted: extract, match, score, save.

Runs as a background task, so every failure ends as a `failed` status with a message HR
can act on (and retry), never as an exception nobody sees.
"""

import logging

from fastapi.concurrency import run_in_threadpool

from app import service
from app.documents import ResumeSource, from_upload
from app.errors import UserFacingError
from app.gemini import JsonGenerator
from app.matching import build_checklist, match
from app.prompts import PROMPT_VERSION
from app.repository import Job, Repository, StoredExtraction
from app.scoring import SCORING_VERSION, compute_score

logger = logging.getLogger(__name__)

NOT_A_RESUME = "This file doesn't look like a resume."
NO_REQUIREMENTS = "The job has no approved requirements to score against."
UNEXPECTED = "Processing failed unexpectedly. Try rescoring."


async def _score(application_id: str, job: Job, extraction: StoredExtraction, repo: Repository,
                 generator: JsonGenerator) -> None:
    if job.requirements is None:
        await repo.set_processing(application_id, "failed", NO_REQUIREMENTS)
        return
    verdicts = await match(build_checklist(job.requirements), extraction.candidate, generator)
    result = compute_score(job.requirements, verdicts, extraction.experience_months,
                           extraction.candidate.education, job.weights,
                           has_hidden_instructions=extraction.candidate.has_hidden_instructions)
    await repo.save_score(application_id, result, SCORING_VERSION, job.requirements_version)
    await repo.set_processing(application_id, "scored")


async def _extract_and_score(application_id: str, source: ResumeSource, job: Job, repo: Repository,
                             generator: JsonGenerator) -> None:
    response = await service.extract(source, generator)
    extraction = StoredExtraction(candidate=response.candidate, experience_months=response.experience_months,
                                  warnings=response.warnings, invalid_fields=list(response.invalid_fields),
                                  source_text=response.source_text)
    await repo.save_extraction(application_id, extraction, PROMPT_VERSION)
    if not response.candidate.is_resume:
        await repo.set_processing(application_id, "failed", NOT_A_RESUME)
        return
    await _score(application_id, job, extraction, repo, generator)


async def _record_failure(application_id: str, repo: Repository, message: str) -> None:
    try:
        await repo.set_processing(application_id, "failed", message)
    except UserFacingError:
        logger.error("Could not record the failure of application %s", application_id)


async def process_new(application_id: str, source: ResumeSource, job: Job, repo: Repository,
                      generator: JsonGenerator) -> None:
    try:
        await _extract_and_score(application_id, source, job, repo, generator)
    except UserFacingError as exc:
        await _record_failure(application_id, repo, exc.user_message)
    except Exception:  # background-task boundary: nobody else will see this exception
        logger.exception("Processing application %s failed", application_id)
        await _record_failure(application_id, repo, UNEXPECTED)


async def rescore(application_id: str, repo: Repository, generator: JsonGenerator) -> None:
    """Scores again against the job's current requirements, re-reading the resume only
    when there is no saved extraction (for example, after a failed first attempt)."""
    try:
        application = await repo.get_application(application_id)
        job = await repo.get_job(application.job_id) if application else None
        if application is None or job is None:
            return
        extraction = await repo.get_extraction(application_id)
        if extraction is not None and extraction.candidate.is_resume:
            await _score(application_id, job, extraction, repo, generator)
            return
        data = await repo.load_resume(application.resume_path)
        source = await run_in_threadpool(from_upload, data)
        await _extract_and_score(application_id, source, job, repo, generator)
    except UserFacingError as exc:
        await _record_failure(application_id, repo, exc.user_message)
    except Exception:  # background-task boundary
        logger.exception("Rescoring application %s failed", application_id)
        await _record_failure(application_id, repo, UNEXPECTED)


async def rescore_all(application_ids: list[str], repo: Repository, generator: JsonGenerator) -> None:
    # One at a time: a job's applications in parallel would trip Gemini's rate limit.
    for application_id in application_ids:
        await rescore(application_id, repo, generator)
