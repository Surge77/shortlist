import { afterEach, describe, expect, it, vi } from "vitest";

import { applyToJob, draftRequirements, rescoreJob, saveRequirements, UNEXPECTED_REPLY } from "../src/api";
import { DEFAULT_WEIGHTS, EMPTY_REQUIREMENTS } from "../src/data/types";
import * as supabase from "../src/lib/supabase";

vi.mock("../src/lib/supabase", () => ({ accessToken: vi.fn(), supabase: null, NOT_CONFIGURED: "" }));

function replyWith(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("API calls", () => {
  it("sends the session token and the resume as multipart form data", async () => {
    vi.mocked(supabase.accessToken).mockResolvedValue("session-jwt");
    const fetchMock = replyWith({ id: "app-1" }, 201);
    const file = new File(["%PDF"], "cv.pdf");

    const result = await applyToJob("job/1", file, "  Hello  ");

    expect(result).toEqual({ ok: true, data: { id: "app-1" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/jobs/job%2F1/applications");
    expect(init.headers).toEqual({ Authorization: "Bearer session-jwt" });
    expect((init.body as FormData).get("file")).toBe(file);
    expect((init.body as FormData).get("cover_note")).toBe("Hello");
  });

  it("leaves out an empty cover note and the header when signed out", async () => {
    vi.mocked(supabase.accessToken).mockResolvedValue(null);
    const fetchMock = replyWith({ id: "app-1" }, 201);

    await applyToJob("job-1", new File(["%PDF"], "cv.pdf"), "   ");

    const init = fetchMock.mock.calls[0][1];
    expect(init.headers).toEqual({});
    expect((init.body as FormData).has("cover_note")).toBe(false);
  });

  it("sends JSON for requirement drafting and saving", async () => {
    const fetchMock = replyWith(EMPTY_REQUIREMENTS);
    await draftRequirements("A long enough job description");
    expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ description: "A long enough job description" });

    const saveMock = replyWith({ requirements_version: 2 });
    const saved = await saveRequirements("job-1", EMPTY_REQUIREMENTS, DEFAULT_WEIGHTS);
    expect(saved).toEqual({ ok: true, data: { requirements_version: 2 } });
    expect(saveMock.mock.calls[0][1].method).toBe("PUT");
  });

  it("refuses replies of the wrong shape and passes on server messages", async () => {
    replyWith({ unexpected: true }, 202);
    expect(await rescoreJob("job-1")).toEqual({ ok: false, message: UNEXPECTED_REPLY });

    replyWith({ detail: "Your account can't do that." }, 403);
    expect(await rescoreJob("job-1")).toEqual({ ok: false, message: "Your account can't do that." });
  });
});
