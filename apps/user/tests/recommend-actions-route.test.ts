import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "../app/api/recommend-actions/route";
import { env, resetRecommendationEnv } from "./cloudflare-workers.mock";

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
    resetRecommendationEnv();
  });

  it("requires JSON and rejects malformed input", async () => {
    const wrongType = new Request(endpoint, { method: "POST", body: "text" });
    expect((await POST(wrongType)).status).toBe(415);
    const malformed = await POST(jsonRequest("{"));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "INVALID_JSON" });
  });

  it("rejects an oversized streamed body without relying on Content-Length", async () => {
    const request = jsonRequest(JSON.stringify({ text: "x".repeat(2_100) }));
    expect(request.headers.get("content-length")).toBeNull();

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "REQUEST_TOO_LARGE" });
  });

  it("rate limits a valid request before invoking Workers AI", async () => {
    env.AI_GLOBAL_RATE_LIMITER!.limit.mockResolvedValue({ success: false });

    const response = await POST(jsonRequest(JSON.stringify({ text: "イベントに参加するため" }), {
      "cf-connecting-ip": "203.0.113.10",
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(env.AI_USER_RATE_LIMITER!.limit).toHaveBeenCalledWith({ key: "recommend-actions:203.0.113.10" });
    expect(env.AI_GLOBAL_RATE_LIMITER!.limit).toHaveBeenCalledWith({ key: "recommend-actions" });
    expect(env.AI!.run).not.toHaveBeenCalled();
  });

  it("fails closed when either rate limiter is missing or unavailable", async () => {
    env.AI_USER_RATE_LIMITER = undefined;
    const missing = await POST(jsonRequest(JSON.stringify({ text: "医療相談のため" })));
    expect(missing.status).toBe(503);
    expect(await missing.json()).toEqual({ error: "RATE_LIMIT_UNAVAILABLE" });
    expect(env.AI!.run).not.toHaveBeenCalled();

    resetRecommendationEnv();
    env.AI_GLOBAL_RATE_LIMITER!.limit.mockRejectedValue(new Error("unavailable"));
    const failed = await POST(jsonRequest(JSON.stringify({ text: "医療相談のため" })));
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "RATE_LIMIT_UNAVAILABLE" });
    expect(env.AI!.run).not.toHaveBeenCalled();
  });

  it("returns AI_UNAVAILABLE only after both rate-limit checks succeed", async () => {
    env.AI = undefined;
    const response = await POST(jsonRequest(JSON.stringify({ text: "医療相談のため" })));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "AI_UNAVAILABLE" });
    expect(env.AI_USER_RATE_LIMITER!.limit).toHaveBeenCalledOnce();
    expect(env.AI_GLOBAL_RATE_LIMITER!.limit).toHaveBeenCalledOnce();
  });

  it("returns only allowlisted card ids from Workers AI", async () => {
    env.AI!.run.mockResolvedValue({
      response: JSON.stringify({ actionIds: ["CHECK_MEDICAL_OPTIONS", "NOT_ALLOWED"] }),
    });

    const response = await POST(jsonRequest(JSON.stringify({ text: "医療相談のため" })));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ actionIds: ["CHECK_MEDICAL_OPTIONS"] });
  });
});
