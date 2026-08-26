import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteSituationSubmission } from "../src/consented-persistence";

const credentials = {
  id: "sit_11111111-1111-4111-8111-111111111111",
  deletionToken: "A".repeat(43),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Situation deletion response contract", () => {
  it("accepts only the deletion endpoint's canonical 404 as idempotent completion", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: { code: "DELETION_NOT_FOUND", message: "No matching record was found." },
    }), {
      status: 404,
      headers: { "content-type": "application/json; charset=UTF-8" },
    })));

    await expect(deleteSituationSubmission(credentials)).resolves.toBeUndefined();
  });

  it.each([
    ["routing 404", { ok: false, error: { code: "NOT_FOUND", message: "Not found." } }, "application/json"],
    ["extended envelope", { ok: false, error: { code: "DELETION_NOT_FOUND", message: "No matching record was found.", extra: true } }, "application/json"],
    ["HTML proxy 404", "<h1>Not found</h1>", "text/html"],
  ])("rejects %s so local deletion credentials are retained", async (_name, body, contentType) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      typeof body === "string" ? body : JSON.stringify(body),
      { status: 404, headers: { "content-type": contentType } },
    )));

    await expect(deleteSituationSubmission(credentials)).rejects.toThrow("SITUATION_DELETION_FAILED");
  });
});
