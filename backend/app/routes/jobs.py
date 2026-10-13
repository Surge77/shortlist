"""HR's requirement builder: draft requirements from a description, then approve them."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends

from app import pipeline
from app.auth import HrUser, Repo
from app.errors import UserFacingError
from app.gemini import JsonGenerator, get_generator
from app.requirements import DraftRequest, JobRequirements, RequirementsSaved, RequirementsUpdate, draft_requirements

Generator = Annotated[JsonGenerator, Depends(get_generator)]

router = APIRouter(prefix="/api")


class JobNotFound(UserFacingError):
    status_code = 404
    user_message = "That job doesn't exist."


class RescoreQueued(RequirementsSaved):
    queued: int


@router.post("/requirements/draft", response_model=JobRequirements)
async def draft(body: DraftRequest, _: HrUser, generator: Generator) -> JobRequirements:
    return await draft_requirements(body.description, generator)


@router.put("/jobs/{job_id}/requirements", response_model=RequirementsSaved)
async def save(job_id: UUID, body: RequirementsUpdate, _: HrUser, repo: Repo) -> RequirementsSaved:
    job = await repo.get_job(str(job_id))
    if job is None:
        raise JobNotFound()
    version = job.requirements_version + 1
    await repo.save_requirements(job.id, body.requirements, body.weights, version)
    return RequirementsSaved(requirements_version=version)


@router.post("/jobs/{job_id}/rescore", response_model=RescoreQueued, status_code=202)
async def rescore_job(job_id: UUID, _: HrUser, repo: Repo, generator: Generator,
                      background: BackgroundTasks) -> RescoreQueued:
    job = await repo.get_job(str(job_id))
    if job is None:
        raise JobNotFound()
    ids = await repo.list_application_ids(job.id)
    background.add_task(pipeline.rescore_all, ids, repo, generator)
    return RescoreQueued(requirements_version=job.requirements_version, queued=len(ids))
