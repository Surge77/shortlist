from datetime import date

from app.checks import find_problems
from app.documents import ResumeSource
from app.experience import total_experience_months
from app.gemini import JsonGenerator
from app.prompts import build_contents
from app.schemas import Candidate, ExtractResponse


async def extract(source: ResumeSource, generator: JsonGenerator, today: date | None = None) -> ExtractResponse:
    candidate = await generator.generate(build_contents(source), Candidate)
    if not candidate.is_resume:
        return ExtractResponse(
            candidate=candidate,
            experience_months=None,
            warnings=[],
            invalid_fields=[],
            source_type=source.source_type,
            source_text=source.text,
        )

    months = total_experience_months(candidate.experience, today or date.today())
    warnings, invalid_fields = find_problems(candidate, months)
    return ExtractResponse(
        candidate=candidate,
        experience_months=months,
        warnings=warnings,
        invalid_fields=invalid_fields,
        source_type=source.source_type,
        source_text=source.text,
    )
