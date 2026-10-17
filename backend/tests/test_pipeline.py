import asyncio

from app import pipeline
from app.documents import FileBlob, from_text
from app.gemini import GeminiRateLimited
from app.matching import MatchReply, MatchVerdict
from app.repository import NewApplication, StoredExtraction
from app.requirements import JobRequirements
from app.supabase_rest import SupabaseError
from tests.factories import a_candidate
from tests.fakes import ALICE_ID, OPEN_JOB_ID, FakeRepository
from tests.test_documents import PDF

APP_ID = "20000000-0000-4000-8000-000000000001"
PATH = f"{ALICE_ID}/{APP_ID}.pdf"
SQL_ONLY = JobRequirements(must_have=["SQL"])


def setup(*, requirements: JobRequirements | None = SQL_ONLY):
    repo = FakeRepository()
    job = repo.add_job(OPEN_JOB_ID, requirements=requirements)
    repo.files[PATH] = (PDF, "application/pdf")
    asyncio.run(repo.create_application(NewApplication(APP_ID, OPEN_JOB_ID, ALICE_ID, PATH, "a" * 64, "pdf", None)))
    return repo, job


def sql_met() -> MatchReply:
    return MatchReply(verdicts=[MatchVerdict(requirement_id="must-1", verdict="met", evidence="SQL")])


def test_a_new_application_is_extracted_matched_scored_and_saved(fake_generator):
    repo, job = setup()
    fake_generator.replies += [a_candidate(), sql_met()]

    asyncio.run(pipeline.process_new(APP_ID, from_text("resume"), job, repo, fake_generator))

    assert repo.extractions[APP_ID].candidate.full_name == "Asha Verma"
    assert repo.scores[APP_ID].result.total == 100.0
    assert repo.processing[APP_ID] == ("scored", None)


def test_gemini_failures_end_as_a_retryable_failed_status(fake_generator):
    repo, job = setup()
    fake_generator.replies.append(GeminiRateLimited())

    asyncio.run(pipeline.process_new(APP_ID, from_text("resume"), job, repo, fake_generator))

    assert repo.processing[APP_ID] == ("failed", GeminiRateLimited.user_message)


def test_unexpected_errors_are_caught_and_recorded(fake_generator):
    repo, job = setup()
    fake_generator.replies.append(RuntimeError("boom"))

    asyncio.run(pipeline.process_new(APP_ID, from_text("resume"), job, repo, fake_generator))

    assert repo.processing[APP_ID] == ("failed", pipeline.UNEXPECTED)


def test_a_failure_to_record_a_failure_does_not_raise(fake_generator, monkeypatch):
    repo, job = setup()
    fake_generator.replies.append(GeminiRateLimited())

    async def database_down(*_args, **_kwargs):
        raise SupabaseError()

    monkeypatch.setattr(repo, "set_processing", database_down)

    asyncio.run(pipeline.process_new(APP_ID, from_text("resume"), job, repo, fake_generator))


def test_a_job_without_requirements_cannot_be_scored(fake_generator):
    repo, job = setup(requirements=None)
    fake_generator.replies.append(a_candidate())

    asyncio.run(pipeline.process_new(APP_ID, from_text("resume"), job, repo, fake_generator))

    assert repo.processing[APP_ID] == ("failed", pipeline.NO_REQUIREMENTS)


def test_rescoring_reuses_the_saved_extraction(fake_generator):
    repo, _ = setup()
    repo.extractions[APP_ID] = StoredExtraction(a_candidate(), 24, [], [], None)
    fake_generator.replies.append(sql_met())

    asyncio.run(pipeline.rescore(APP_ID, repo, fake_generator))

    assert len(fake_generator.calls) == 1
    assert repo.processing[APP_ID] == ("scored", None)


def test_rescoring_without_an_extraction_reads_the_stored_resume(fake_generator):
    repo, _ = setup()
    fake_generator.replies += [a_candidate(), sql_met()]

    asyncio.run(pipeline.rescore(APP_ID, repo, fake_generator))

    extraction_request = fake_generator.calls[0]
    assert [part.mime_type for part in extraction_request if isinstance(part, FileBlob)] == ["application/pdf"]
    assert repo.scores[APP_ID].result.total == 100.0


def test_rescoring_an_application_that_vanished_does_nothing(fake_generator):
    repo = FakeRepository()

    asyncio.run(pipeline.rescore(APP_ID, repo, fake_generator))

    assert repo.processing == {} and fake_generator.calls == []


def test_rescore_all_goes_through_each_application(fake_generator):
    repo, _ = setup()
    repo.extractions[APP_ID] = StoredExtraction(a_candidate(), 24, [], [], None)
    fake_generator.replies.append(sql_met())

    asyncio.run(pipeline.rescore_all([APP_ID], repo, fake_generator))

    assert repo.processing[APP_ID] == ("scored", None)


def test_rescore_all_marks_each_application_and_skips_one_it_cannot_mark(fake_generator, monkeypatch):
    repo, _ = setup()
    repo.extractions[APP_ID] = StoredExtraction(a_candidate(), 24, [], [], None)
    calls: list[str] = []
    original = repo.set_processing

    async def flaky(application_id, status, error=None):
        calls.append(status)
        if application_id == "gone":
            raise SupabaseError()
        await original(application_id, status, error)

    monkeypatch.setattr(repo, "set_processing", flaky)
    fake_generator.replies.append(sql_met())

    asyncio.run(pipeline.rescore_all(["gone", APP_ID], repo, fake_generator))

    assert calls == ["processing", "processing", "scored"]
    assert repo.processing[APP_ID] == ("scored", None)


def test_unexpected_failures_are_logged_without_their_details(fake_generator, caplog):
    repo, job = setup()
    fake_generator.replies.append(RuntimeError("resume text: Asha Verma, 98765 43210"))

    asyncio.run(pipeline.process_new(APP_ID, from_text("resume"), job, repo, fake_generator))

    assert "RuntimeError" in caplog.text
    assert "Asha" not in caplog.text
