"""Seeds the demo, then scores every seeded application with the real pipeline (Gemini).

    cd backend && .venv/Scripts/python -m app.demo.seed

Run from a machine with backend/.env. Safe to run again: it resets to the seeded state
and only scores what has no current score. One application at a time, with a pause, to
stay inside Gemini's free-tier rate limit; failures get another pass.
"""

import asyncio
import sys
from datetime import UTC, datetime

from app.config import demo_settings
from app.demo.fixtures import SEEDED_REQUIREMENTS_VERSION, load_fixtures
from app.demo.reset import restore
from app.demo.store import SupabaseDemoStore
from app.gemini import get_generator
from app.pipeline import rescore_all
from app.repository import get_repository
from app.supabase_rest import get_rest

SECONDS_BETWEEN_APPLICATIONS = 8
SCORING_PASSES = 3


async def main() -> int:
    rest = get_rest()
    if rest is None:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env first.")
        return 1
    data = load_fixtures()
    store = SupabaseDemoStore(rest)
    settings = demo_settings()
    hr_emails = settings.hr_emails if settings else frozenset({data.hr_email})

    report = await restore(store, data, hr_emails, datetime.now(UTC))
    print(f"Restored {len(data.jobs)} jobs and {len(data.applications)} applications; removed "
          f"{report.deleted_applications} applications, {report.deleted_jobs} jobs, {report.deleted_accounts} accounts.")

    seeded = [application.id for application in data.applications]
    repo, generator = get_repository(), get_generator()
    pending = report.needs_scoring
    for scoring_pass in range(1, SCORING_PASSES + 1):
        if not pending:
            break
        print(f"Pass {scoring_pass}: scoring {len(pending)} applications…")
        for number, application_id in enumerate(pending, start=1):
            await rescore_all([application_id], repo, generator)
            print(f"  {number}/{len(pending)}", flush=True)
            await asyncio.sleep(SECONDS_BETWEEN_APPLICATIONS)
        pending = await store.needing_score(seeded, SEEDED_REQUIREMENTS_VERSION)

    if pending:
        print(f"{len(pending)} applications are still unscored; run the seed again in a few minutes.")
        return 1
    print("Every seeded application is scored.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
