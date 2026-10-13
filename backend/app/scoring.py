"""The fit score: plain arithmetic over checked verdicts and computed numbers.

No model is involved here. Each category earns a credit between 0 and 1, categories the
job does not ask about drop out, and the rest share 100 points in proportion to HR's
weights. Every point can be traced to a verdict with its quote, or to a computed number.
"""

import re
from typing import Literal

from pydantic import BaseModel

from app.matching import CheckedVerdict, Verdict
from app.requirements import EducationLevel, JobRequirements, Weights
from app.schemas import Education

SCORING_VERSION = "1"

Band = Literal["strong", "possible", "weak"]
Category = Literal["must_have", "nice_to_have", "experience", "education", "certifications"]

STRONG_FROM = 75.0
POSSIBLE_FROM = 50.0
MONTHS_PER_YEAR = 12
CREDIT: dict[Verdict, float] = {"met": 1.0, "partial": 0.5, "missing": 0.0}
LEVEL_RANK: dict[EducationLevel, int] = {"high_school": 1, "diploma": 2, "bachelor": 3, "master": 4, "doctorate": 5}
LABELS: dict[Category, str] = {
    "must_have": "Must-have skills",
    "nice_to_have": "Nice-to-have skills",
    "experience": "Experience",
    "education": "Education",
    "certifications": "Certifications",
}

# Checked from the highest level down; dots and apostrophes are removed first, so
# "B.Sc." reads as "bsc" and "Master's" as "masters".
DEGREE_PATTERNS: list[tuple[EducationLevel, re.Pattern[str]]] = [
    ("doctorate", re.compile(r"\b(phd|dphil|doctor|doctorate|doctoral)\b")),
    ("master", re.compile(r"\b(masters?|msc|ms|ma|mba|mtech|meng|mca|mcom|mphil|pgdm)\b")),
    ("bachelor", re.compile(r"\b(bachelors?|bsc|bs|ba|btech|be|beng|bca|bcom|bba|undergraduate)\b")),
    ("diploma", re.compile(r"\b(diploma|associates?|polytechnic)\b")),
    ("high_school", re.compile(r"\b(high school|secondary|hsc|ssc|12th|a levels?)\b")),
]


class RequirementResult(BaseModel):
    id: str
    category: Category
    text: str
    verdict: Verdict
    evidence: str | None
    unverified: bool


class CategoryResult(BaseModel):
    category: Category
    label: str
    credit: float
    max_points: float
    points: float
    detail: str


class ScoreResult(BaseModel):
    total: float | None
    band: Band | None
    categories: list[CategoryResult]
    requirements: list[RequirementResult]
    knockouts: list[str]
    flags: list[str]


def degree_level(degree: str | None) -> EducationLevel | None:
    text = re.sub(r"[.'’]", "", (degree or "").casefold())
    for level, pattern in DEGREE_PATTERNS:
        if pattern.search(text):
            return level
    return None


def highest_level(education: list[Education]) -> EducationLevel | None:
    levels: list[EducationLevel] = [level for entry in education if (level := degree_level(entry.degree))]
    return max(levels, key=lambda level: LEVEL_RANK[level], default=None)


def experience_credit(months: int | None, min_years: float | None) -> float | None:
    if not min_years:
        return None
    if months is None:
        return 0.0
    return min(1.0, months / (min_years * MONTHS_PER_YEAR))


def level_credit(candidate: EducationLevel | None, required: EducationLevel | None) -> float | None:
    if required is None:
        return None
    if candidate is None:
        return 0.0
    gap = LEVEL_RANK[required] - LEVEL_RANK[candidate]
    return 1.0 if gap <= 0 else 0.5 if gap == 1 else 0.0


def band_for(total: float) -> Band:
    return "strong" if total >= STRONG_FROM else "possible" if total >= POSSIBLE_FROM else "weak"


def _mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _years(months: int) -> str:
    years = months / MONTHS_PER_YEAR
    return f"{years:.1f}".rstrip("0").rstrip(".") + (" year" if years == 1 else " years")


def _experience_detail(months: int | None, min_years: float) -> str:
    needed = _years(round(min_years * MONTHS_PER_YEAR))
    have = "unknown" if months is None else _years(months)
    return f"{have} of {needed} asked for"


def _education_detail(level: EducationLevel | None, required: EducationLevel | None, field: Verdict | None) -> str:
    parts: list[str] = []
    if required:
        shown = level.replace("_", " ") if level else "not stated"
        parts.append(f"highest degree {shown}, {required.replace('_', ' ')} asked for")
    if field:
        parts.append(f"field of study {field}")
    return "; ".join(parts).capitalize()


def compute_score(
    requirements: JobRequirements,
    verdicts: list[CheckedVerdict],
    experience_months: int | None,
    education: list[Education],
    weights: Weights,
    *,
    has_hidden_instructions: bool = False,
) -> ScoreResult:
    results = [
        RequirementResult(id=v.item.id, category=v.item.category, text=v.item.text, verdict=v.verdict,
                          evidence=v.evidence, unverified=v.unverified)
        for v in verdicts
    ]

    def credits(category: Category) -> list[float]:
        return [CREDIT[r.verdict] for r in results if r.category == category]

    def met_detail(category: Category) -> str:
        items = [r for r in results if r.category == category]
        met = sum(r.verdict == "met" for r in items)
        partial = sum(r.verdict == "partial" for r in items)
        return f"{met} of {len(items)} met" + (f", {partial} partly" if partial else "")

    level = highest_level(education)
    field_verdict: Verdict | None = next((r.verdict for r in results if r.category == "education"), None)
    education_parts = [c for c in (level_credit(level, requirements.education_level),
                                   CREDIT[field_verdict] if field_verdict else None) if c is not None]

    raw: dict[Category, tuple[float | None, str]] = {
        "must_have": (_mean(credits("must_have")), met_detail("must_have")),
        "nice_to_have": (_mean(credits("nice_to_have")), met_detail("nice_to_have")),
        "experience": (experience_credit(experience_months, requirements.min_years),
                       _experience_detail(experience_months, requirements.min_years or 0)),
        "education": (_mean(education_parts), _education_detail(level, requirements.education_level, field_verdict)),
        "certifications": (_mean(credits("certifications")), met_detail("certifications")),
    }
    weight_of = weights.model_dump()
    included: dict[Category, tuple[float, str]] = {
        cat: (credit, detail) for cat, (credit, detail) in raw.items() if credit is not None and weight_of[cat] > 0
    }
    weight_total = sum(weight_of[cat] for cat in included)

    flags = [f"Evidence for “{r.text}” is not in the resume, so it counts as missing" for r in results if r.unverified]
    if requirements.min_years and experience_months is None:
        flags.append("Total experience is unknown (no usable job dates), so experience scores zero")
    if has_hidden_instructions:
        flags.append("The resume contains text aimed at AI screening; read it yourself before relying on this score")
    knockouts = [r.text for r in results if r.category == "must_have" and r.verdict == "missing"]

    if weight_total == 0:
        flags.append("The job has no requirements to score against")
        return ScoreResult(total=None, band=None, categories=[], requirements=results, knockouts=knockouts, flags=flags)

    categories: list[CategoryResult] = []
    total = 0.0
    for cat, (credit, detail) in included.items():
        max_points = weight_of[cat] / weight_total * 100
        total += credit * max_points
        categories.append(CategoryResult(category=cat, label=LABELS[cat], credit=round(credit, 3),
                                         max_points=round(max_points, 1), points=round(credit * max_points, 1),
                                         detail=detail))
    total = round(total, 1)
    return ScoreResult(total=total, band=band_for(total), categories=categories, requirements=results,
                       knockouts=knockouts, flags=flags)
