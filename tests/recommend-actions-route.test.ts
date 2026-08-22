import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/recommend-actions/route";
import { env } from "./cloudflare-workers.mock";

const endpoint = "https://staybridge.example/api/recommend-actions";

function jsonRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

describe("recommend actions route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rate limits a valid request before invoking Workers AI", async () => {
    const userLimit = vi.spyOn(env.AI_USER_RATE_LIMITER, "limit").mockResolvedValue({ success: true });
    const globalLimit = vi.spyOn(env.AI_GLOBAL_RATE_LIMITER, "limit").mockResolvedValue({ success: false });
    const aiRun = vi.spyOn(env.AI, "run");

    const response = await POST(jsonRequest(JSON.stringify({ text: "イベントに参加するため" }), {
      "cf-connecting-ip": "203.0.113.10",
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(userLimit).toHaveBeenCalledWith({ key: "recommend-actions:203.0.113.10" });
    expect(globalLimit).toHaveBeenCalledWith({ key: "recommend-actions" });
    expect(aiRun).not.toHaveBeenCalled();
  });

  it("rejects an oversized streamed body without relying on Content-Length", async () => {
    const request = jsonRequest(JSON.stringify({ text: "x".repeat(2_100) }));
    expect(request.headers.get("content-length")).toBeNull();

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "REQUEST_TOO_LARGE" });
  });

  it("returns only allowlisted card ids from Workers AI", async () => {
    vi.spyOn(env.AI_USER_RATE_LIMITER, "limit").mockResolvedValue({ success: true });
    vi.spyOn(env.AI_GLOBAL_RATE_LIMITER, "limit").mockResolvedValue({ success: true });
    vi.spyOn(env.AI, "run").mockResolvedValue({
      response: JSON.stringify({ actionIds: ["CHECK_MEDICAL_OPTIONS", "NOT_ALLOWED"] }),
    });

    const response = await POST(jsonRequest(JSON.stringify({ text: "医療相談のため" })));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ actionIds: ["CHECK_MEDICAL_OPTIONS"] });
  });
});
