// Runs the real migrations on Postgres (PGlite) and checks every access rule as the role
// a browser would hold: anon, a candidate, or HR. Each test gets a fresh database.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = new URL("../migrations/", import.meta.url);
const STUBS = readFileSync(new URL("./supabase-stubs.sql", import.meta.url), "utf8");

const HR = "00000000-0000-4000-8000-000000000001";
const ALICE = "00000000-0000-4000-8000-000000000002";
const BOB = "00000000-0000-4000-8000-000000000003";
const OPEN_JOB = "10000000-0000-4000-8000-000000000001";
const DRAFT_JOB = "10000000-0000-4000-8000-000000000002";
const CLOSED_JOB = "10000000-0000-4000-8000-000000000003";
const ALICE_APP = "20000000-0000-4000-8000-000000000001";
const BOB_APP = "20000000-0000-4000-8000-000000000002";
const ALICE_CLOSED_APP = "20000000-0000-4000-8000-000000000003";
const SHA = "a".repeat(64);
const DESCRIPTION = "Build and maintain data pipelines for the analytics team.";

async function freshDb() {
  const db = new PGlite();
  await db.exec(STUBS);
  for (const file of readdirSync(MIGRATIONS).sort()) {
    await db.exec(readFileSync(new URL(file, MIGRATIONS), "utf8"));
  }
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${HR}', 'hr@example.com', '{"full_name": "Hana Recruiter"}'),
      ('${ALICE}', 'alice@example.com', '{"full_name": "Alice Example"}'),
      ('${BOB}', 'bob@example.com', '{}');
    update public.profiles set role = 'hr' where id = '${HR}';
    insert into public.jobs (id, created_by, title, description, status, requirements) values
      ('${OPEN_JOB}', '${HR}', 'Data Engineer', '${DESCRIPTION}', 'open', '{}'),
      ('${DRAFT_JOB}', '${HR}', 'Draft Role', '${DESCRIPTION}', 'draft', null),
      ('${CLOSED_JOB}', '${HR}', 'Closed Role', '${DESCRIPTION}', 'closed', '{}');
    insert into public.applications (id, job_id, candidate_id, resume_path, resume_sha256, source_type) values
      ('${ALICE_APP}', '${OPEN_JOB}', '${ALICE}', '${ALICE}/${ALICE_APP}.pdf', '${SHA}', 'pdf'),
      ('${BOB_APP}', '${OPEN_JOB}', '${BOB}', '${BOB}/${BOB_APP}.pdf', '${SHA}', 'pdf'),
      ('${ALICE_CLOSED_APP}', '${CLOSED_JOB}', '${ALICE}', '${ALICE}/${ALICE_CLOSED_APP}.pdf', '${SHA}', 'pdf');
    insert into public.extractions (application_id, record, prompt_version) values ('${ALICE_APP}', '{}', 'v1');
    insert into public.scores (application_id, total, band, breakdown, scoring_version, requirements_version)
      values ('${ALICE_APP}', 82.5, 'strong', '{}', 'v1', 1);
    insert into storage.objects (bucket_id, name) values
      ('resumes', '${ALICE}/${ALICE_APP}.pdf'), ('resumes', '${BOB}/${BOB_APP}.pdf');
  `);
  return db;
}

// Runs one statement as a browser would: the API role plus the user's JWT claims.
async function as(db, user, sql, params = []) {
  const role = user ? "authenticated" : "anon";
  const claims = JSON.stringify(user ? { sub: user, role } : { role });
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    return (await tx.query(sql, params)).rows;
  });
}

const ids = (rows) => rows.map((row) => row.id).sort();

test("signing up creates a candidate profile with the given name", async () => {
  const db = await freshDb();
  const rows = await as(db, ALICE, "select role, full_name from public.profiles where id = $1", [ALICE]);
  assert.deepEqual(rows, [{ role: "candidate", full_name: "Alice Example" }]);
});

test("a candidate cannot promote themselves to hr", async () => {
  const db = await freshDb();
  await assert.rejects(as(db, ALICE, `update public.profiles set role = 'hr' where id = '${ALICE}'`), /permission denied/);
});

test("a candidate can rename themselves but not someone else", async () => {
  const db = await freshDb();
  await as(db, ALICE, `update public.profiles set full_name = 'Alice E.' where id in ('${ALICE}', '${BOB}')`);
  const rows = await db.query("select id, full_name from public.profiles where id in ($1, $2) order by id", [ALICE, BOB]);
  assert.deepEqual(rows.rows, [{ id: ALICE, full_name: "Alice E." }, { id: BOB, full_name: null }]);
});

test("anyone signed out sees only open jobs", async () => {
  const db = await freshDb();
  assert.deepEqual(ids(await as(db, null, "select id from public.jobs")), [OPEN_JOB]);
});

test("a candidate sees open jobs and closed jobs they applied to, never drafts", async () => {
  const db = await freshDb();
  assert.deepEqual(ids(await as(db, ALICE, "select id from public.jobs")), [OPEN_JOB, CLOSED_JOB].sort());
  assert.deepEqual(ids(await as(db, BOB, "select id from public.jobs")), [OPEN_JOB]);
});

test("hr sees every job", async () => {
  const db = await freshDb();
  assert.equal((await as(db, HR, "select id from public.jobs")).length, 3);
});

test("only hr can create jobs", async () => {
  const db = await freshDb();
  const insert = `insert into public.jobs (title, description) values ('New Role', '${DESCRIPTION}') returning created_by`;
  await assert.rejects(as(db, ALICE, insert), /row-level security/);
  await assert.rejects(as(db, null, insert), /permission denied/);
  assert.deepEqual(await as(db, HR, insert), [{ created_by: HR }]);
});

test("a job cannot open before its requirements are approved", async () => {
  const db = await freshDb();
  await assert.rejects(
    as(db, HR, `update public.jobs set status = 'open' where id = '${DRAFT_JOB}'`),
    /open_jobs_have_requirements/,
  );
});

test("hr cannot write requirements directly; only the api can", async () => {
  const db = await freshDb();
  await assert.rejects(
    as(db, HR, `update public.jobs set requirements = '{"must_have": []}' where id = '${DRAFT_JOB}'`),
    /permission denied/,
  );
});

test("a candidate sees only their own applications", async () => {
  const db = await freshDb();
  assert.deepEqual(ids(await as(db, ALICE, "select id from public.applications")), [ALICE_APP, ALICE_CLOSED_APP].sort());
  assert.deepEqual(ids(await as(db, BOB, "select id from public.applications")), [BOB_APP]);
  assert.equal((await as(db, HR, "select id from public.applications")).length, 3);
});

test("a candidate cannot create applications or change their stage directly", async () => {
  const db = await freshDb();
  await assert.rejects(
    as(db, BOB, `insert into public.applications (job_id, candidate_id, resume_path, resume_sha256, source_type)
                 values ('${CLOSED_JOB}', '${BOB}', 'x', '${SHA}', 'pdf')`),
    /permission denied/,
  );
  await assert.rejects(
    as(db, ALICE, `update public.applications set stage = 'hired' where id = '${ALICE_APP}'`),
    /permission denied/,
  );
});

test("scores, extractions, notes and stage history are invisible to candidates", async () => {
  const db = await freshDb();
  for (const table of ["scores", "extractions", "notes", "stage_events"]) {
    assert.deepEqual(await as(db, ALICE, `select * from public.${table}`), [], table);
  }
  assert.deepEqual(await as(db, HR, "select total::text, band from public.scores"), [{ total: "82.5", band: "strong" }]);
});

test("a candidate withdraws their own application and the change is audited", async () => {
  const db = await freshDb();
  await as(db, ALICE, "select public.withdraw_application($1)", [ALICE_APP]);
  const app = await db.query("select stage from public.applications where id = $1", [ALICE_APP]);
  assert.equal(app.rows[0].stage, "withdrawn");
  const events = await as(db, HR, "select from_stage, to_stage, actor_id from public.stage_events");
  assert.deepEqual(events, [{ from_stage: "submitted", to_stage: "withdrawn", actor_id: ALICE }]);
});

test("nobody can withdraw someone else's application or a decided one", async () => {
  const db = await freshDb();
  await assert.rejects(as(db, BOB, "select public.withdraw_application($1)", [ALICE_APP]), /no longer be withdrawn/);
  await as(db, HR, "select public.set_application_stage($1, 'shortlisted')", [ALICE_APP]);
  await assert.rejects(as(db, ALICE, "select public.withdraw_application($1)", [ALICE_APP]), /no longer be withdrawn/);
});

test("hr moves an application's stage and each move is audited", async () => {
  const db = await freshDb();
  await as(db, HR, "select public.set_application_stage($1, 'reviewing')", [BOB_APP]);
  await as(db, HR, "select public.set_application_stage($1, 'shortlisted')", [BOB_APP]);
  const events = await as(db, HR, "select from_stage, to_stage from public.stage_events order by id");
  assert.deepEqual(events, [
    { from_stage: "submitted", to_stage: "reviewing" },
    { from_stage: "reviewing", to_stage: "shortlisted" },
  ]);
});

test("candidates cannot move stages and hr cannot reopen a withdrawn application", async () => {
  const db = await freshDb();
  await assert.rejects(as(db, ALICE, "select public.set_application_stage($1, 'hired')", [ALICE_APP]), /Only HR/);
  await as(db, ALICE, "select public.withdraw_application($1)", [ALICE_APP]);
  await assert.rejects(as(db, HR, "select public.set_application_stage($1, 'reviewing')", [ALICE_APP]), /withdrew/);
  await assert.rejects(as(db, HR, "select public.set_application_stage($1, 'withdrawn')", [BOB_APP]), /Only the candidate/);
});

test("signed-out visitors cannot call the stage functions", async () => {
  const db = await freshDb();
  await assert.rejects(as(db, null, "select public.withdraw_application($1)", [ALICE_APP]), /permission denied/);
});

test("hr writes notes as themselves only", async () => {
  const db = await freshDb();
  const rows = await as(db, HR, "insert into public.notes (application_id, body) values ($1, 'Strong SQL') returning author_id", [ALICE_APP]);
  assert.deepEqual(rows, [{ author_id: HR }]);
  await assert.rejects(
    as(db, HR, "insert into public.notes (application_id, author_id, body) values ($1, $2, 'spoof')", [ALICE_APP, ALICE]),
    /row-level security/,
  );
  await assert.rejects(as(db, ALICE, "insert into public.notes (application_id, body) values ($1, 'hi')", [ALICE_APP]), /row-level security/);
});

test("a candidate reads only their own resume file and cannot upload", async () => {
  const db = await freshDb();
  const names = (rows) => rows.map((row) => row.name).sort();
  assert.deepEqual(names(await as(db, ALICE, "select name from storage.objects")), [`${ALICE}/${ALICE_APP}.pdf`]);
  assert.equal((await as(db, HR, "select name from storage.objects")).length, 2);
  await assert.rejects(
    as(db, ALICE, `insert into storage.objects (bucket_id, name) values ('resumes', '${ALICE}/x.pdf')`),
    /row-level security/,
  );
});

test("the demo seed promotes the HR account and publishes valid fictional jobs", async () => {
  const db = await freshDb();
  await db.exec(`update public.profiles set role = 'candidate' where id = '${HR}'`);

  await db.exec(readFileSync(new URL("../seed.sql", import.meta.url), "utf8"));

  const role = await db.query("select role from public.profiles where id = $1", [HR]);
  assert.equal(role.rows[0].role, "hr");
  const titles = (await as(db, null, "select title from public.jobs order by title")).map((row) => row.title);
  assert.deepEqual(titles, ["Backend Engineer (Python)", "Data Analyst", "Data Engineer", "Machine Learning Intern"]);
  const seeded = await db.query("select requirements from public.jobs where title = 'Data Analyst'");
  assert.deepEqual(seeded.rows[0].requirements.must_have, ["SQL", "Python", "Power BI or Tableau"]);
});

test("hr cannot create a job that skips the draft step or carries unvalidated requirements", async () => {
  const db = await freshDb();
  await assert.rejects(
    as(db, HR, `insert into public.jobs (title, description, status, requirements)
                values ('Sneaky', '${DESCRIPTION}', 'open', '{"must_have": 5}')`),
    /permission denied/,
  );
});

test("browser roles hold no truncate privilege", async () => {
  const db = await freshDb();
  await assert.rejects(as(db, HR, "truncate public.notes"), /permission denied/);
});

test("signed-out visitors cannot call is_hr", async () => {
  const db = await freshDb();
  await assert.rejects(as(db, null, "select public.is_hr()"), /permission denied/);
  assert.deepEqual(await as(db, HR, "select public.is_hr() as hr"), [{ hr: true }]);
});

test("a candidate cannot point their profile at a resume file; only the api sets it", async () => {
  const db = await freshDb();
  const update = `update public.profiles set resume_path = '${BOB}/${BOB_APP}.pdf', resume_source_type = 'pdf' where id = '${ALICE}'`;
  await assert.rejects(as(db, ALICE, update), /permission denied/);
});

test("a saved resume always has both its file and its type", async () => {
  const db = await freshDb();
  await assert.rejects(
    db.query(`update public.profiles set resume_path = '${ALICE}/profile-1.pdf' where id = $1`, [ALICE]),
    /saved_resume_complete/,
  );
  await db.query(
    `update public.profiles set resume_path = '${ALICE}/profile-1.pdf', resume_source_type = 'pdf' where id = $1`, [ALICE]);
  const rows = await as(db, ALICE, "select resume_path from public.profiles where id = $1", [ALICE]);
  assert.deepEqual(rows, [{ resume_path: `${ALICE}/profile-1.pdf` }]);
});
