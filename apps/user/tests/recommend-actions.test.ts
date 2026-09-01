import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleRecommendActionsRequest,
  RECOMMEND_ACTIONS_INFERENCE_TIMEOUT_MS,
  RECOMMEND_ACTIONS_MODEL,
  type RecommendActionsAi,
  type RecommendActionsRateLimiter,
} from "../src/ai/recommend-actions";

function recommendRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://staybridge.example/api/recommend-actions", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://staybridge.example", ...headers },
    body: JSON.stringify(body),
  });
}

function availableRateLimiter() {
  return {
    limit: vi.fn<RecommendActionsRateLimiter["limit"]>().mockResolvedValue({ success: true }),
  };
}

describe("Q3 recommendation worker endpoint", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends only validated Q3 text as untrusted user-role data", async () => {
    const run = vi.fn<RecommendActionsAi["run"]>().mockResolvedValue({
      response: JSON.stringify({ actionIds: ["CHECK_MEDICAL_OPTIONS"] }),
    });
    const rateLimiter = availableRateLimiter();
    const response = await handleRecommendActionsRequest(
      recommendRequest({ text: "国際会議で医療支援について発表するため" }, { "cf-connecting-ip": "192.0.2.5" }),
      { ai: { run }, rateLimiter },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ actionIds: ["CHECK_MEDICAL_OPTIONS"] });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(rateLimiter.limit).toHaveBeenCalledWith({ key: "recommend-actions:192.0.2.5" });
    const [model, input] = run.mock.calls[0];
    expect(model).toBe(RECOMMEND_ACTIONS_MODEL);
    expect(input.messages.map(({ role }) => role)).toEqual(["system", "user"]);
    expect(input.messages[1].content).toContain("国際会議で医療支援について発表するため");
    expect(input.messages[1].content).not.toContain("nationality");
    expect(input).toEqual(expect.objectContaining({ max_tokens: 128, temperature: 0 }));
    expect(Object.keys(input).sort()).toEqual(["max_tokens", "messages", "temperature"]);
  });

  it("rejects cross-origin, non-JSON, malformed, extra-field, blank, and overlong input", async () => {
    const run = vi.fn<RecommendActionsAi["run"]>();
    const bindings = { ai: { run }, rateLimiter: availableRateLimiter() };
    const crossOrigin = recommendRequest({ text: "test" }, { origin: "https://attacker.example" });
    const wrongMethod = new Request("https://staybridge.example/api/recommend-actions");
    const wrongMethodResponse = await handleRecommendActionsRequest(wrongMethod, bindings);
    expect(wrongMethodResponse.status).toBe(405);
    expect(wrongMethodResponse.headers.get("allow")).toBe("POST");
    expect((await handleRecommendActionsRequest(crossOrigin, bindings)).status).toBe(403);
    expect((await handleRecommendActionsRequest(new Request("https://staybridge.example/api/recommend-actions", { method: "POST", headers: { origin: "https://staybridge.example" }, body: "test" }), bindings)).status).toBe(415);
    expect((await handleRecommendActionsRequest(new Request("https://staybridge.example/api/recommend-actions", { method: "POST", headers: { "content-type": "application/jsonp", origin: "https://staybridge.example" }, body: "{}" }), bindings)).status).toBe(415);
    expect((await handleRecommendActionsRequest(recommendRequest({ text: "test" }, { "content-type": "application/json; charset=utf-8", "content-length": "not-a-number" }), bindings)).status).toBe(400);
    expect((await handleRecommendActionsRequest(new Request("https://staybridge.example/api/recommend-actions", { method: "POST", headers: { "content-type": "application/json", origin: "https://staybridge.example" }, body: "{" }), bindings)).status).toBe(400);
    expect((await handleRecommendActionsRequest(recommendRequest({ text: "test", nationality: "MMR" }), bindings)).status).toBe(400);
    expect((await handleRecommendActionsRequest(recommendRequest({ text: "   " }), bindings)).status).toBe(400);
    expect((await handleRecommendActionsRequest(recommendRequest({ text: "あ".repeat(301) }), bindings)).status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a browser POST without Origin before rate limiting or inference", async () => {
    const run = vi.fn<RecommendActionsAi["run"]>();
    const rateLimiter = availableRateLimiter();
    const response = await handleRecommendActionsRequest(
      new Request("https://staybridge.example/api/recommend-actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "イベント参加" }),
      }),
      { ai: { run }, rateLimiter },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "ORIGIN_NOT_ALLOWED" });
    expect(rateLimiter.limit).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a body that is not valid UTF-8", async () => {
    const request = new Request("https://staybridge.example/api/recommend-actions", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://staybridge.example" },
      body: new Uint8Array([0xc3, 0x28]),
    });
    const response = await handleRecommendActionsRequest(request, {
      ai: { run: vi.fn<RecommendActionsAi["run"]>() },
      rateLimiter: availableRateLimiter(),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_REQUEST" });
  });

  it("fails closed when rate limiting or AI is unavailable", async () => {
    const run = vi.fn<RecommendActionsAi["run"]>();
    const noLimiter = await handleRecommendActionsRequest(recommendRequest({ text: "イベント参加" }), { ai: { run } });
    expect(noLimiter.status).toBe(503);
    await expect(noLimiter.json()).resolves.toEqual({ error: "RATE_LIMIT_UNAVAILABLE" });

    const limited = await handleRecommendActionsRequest(recommendRequest({ text: "イベント参加" }), {
      ai: { run },
      rateLimiter: { limit: vi.fn<RecommendActionsRateLimiter["limit"]>().mockResolvedValue({ success: false }) },
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");

    const noAi = await handleRecommendActionsRequest(recommendRequest({ text: "イベント参加" }), {
      rateLimiter: availableRateLimiter(),
    });
    expect(noAi.status).toBe(503);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects the entire AI response when IDs are unknown, duplicated, or over the maximum", async () => {
    for (const actionIds of [
      ["CHECK_MEDICAL_OPTIONS", "NOT_ALLOWED"],
      ["CHECK_MEDICAL_OPTIONS", "CHECK_MEDICAL_OPTIONS"],
      ["CHECK_STAY_STATUS", "CONTACT_OFFICIAL_SUPPORT", "CHECK_MEDICAL_OPTIONS", "FIND_LANGUAGE_SUPPORT"],
    ]) {
      const response = await handleRecommendActionsRequest(recommendRequest({ text: "イベント参加" }), {
        ai: { run: vi.fn<RecommendActionsAi["run"]>().mockResolvedValue({ response: JSON.stringify({ actionIds }) }) },
        rateLimiter: availableRateLimiter(),
      });
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({ error: "INVALID_AI_RESPONSE" });
    }
  });

  it("masks contact data and rejects high-risk document identifiers before inference", async () => {
    const run = vi.fn<RecommendActionsAi["run"]>().mockResolvedValue({ response: JSON.stringify({ actionIds: [] }) });
    const masked = await handleRecommendActionsRequest(
      recommendRequest({ text: "連絡先 user@example.com を伝えるため" }),
      { ai: { run }, rateLimiter: availableRateLimiter() },
    );
    expect(masked.status).toBe(200);
    expect(run.mock.calls[0][1].messages[1].content).toContain("[REDACTED_EMAIL]");
    expect(run.mock.calls[0][1].messages[1].content).not.toContain("user@example.com");

    const rejected = await handleRecommendActionsRequest(
      recommendRequest({ text: "パスポート番号 TR1234567 の確認" }),
      { ai: { run }, rateLimiter: availableRateLimiter() },
    );
    expect(rejected.status).toBe(400);
    const normalizedRejected = await handleRecommendActionsRequest(
      recommendRequest({ text: "ＰＡＳＳＰＯＲＴ ＴＲ１２３４５６７" }),
      { ai: { run }, rateLimiter: availableRateLimiter() },
    );
    expect(normalizedRejected.status).toBe(400);
    expect(run).toHaveBeenCalledOnce();
  });

  it("times out inference and never adopts a late result", async () => {
    vi.useFakeTimers();
    let releaseRun: ((value: { response: string }) => void) | undefined;
    const run = vi.fn<RecommendActionsAi["run"]>().mockImplementation(
      () => new Promise((resolve) => { releaseRun = resolve; }),
    );
    const responsePromise = handleRecommendActionsRequest(recommendRequest({ text: "イベント参加" }), {
      ai: { run },
      rateLimiter: availableRateLimiter(),
    });
    await vi.advanceTimersByTimeAsync(RECOMMEND_ACTIONS_INFERENCE_TIMEOUT_MS);
    releaseRun?.({ response: JSON.stringify({ actionIds: ["CHECK_MEDICAL_OPTIONS"] }) });
    const response = await responsePromise;
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "AI_REQUEST_FAILED" });
  });

  it("stops reading a streamed body at the byte limit and applies rate limiting first", async () => {
    const chunk = new TextEncoder().encode("x".repeat(1_000));
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    }, { highWaterMark: 0 });
    const request = new Request("https://staybridge.example/api/recommend-actions", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://staybridge.example" },
      body,
      duplex: "half",
    } as RequestInit);
    const response = await handleRecommendActionsRequest(request, { rateLimiter: availableRateLimiter() });
    expect(response.status).toBe(413);
    expect(pulls).toBe(3);
    expect(cancelled).toBe(true);

    let limitedPulls = 0;
    const limitedBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        limitedPulls += 1;
        controller.enqueue(new Uint8Array([1]));
      },
    }, { highWaterMark: 0 });
    const limitedRequest = new Request("https://staybridge.example/api/recommend-actions", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://staybridge.example" },
      body: limitedBody,
      duplex: "half",
    } as RequestInit);
    const limitedResponse = await handleRecommendActionsRequest(limitedRequest, {
      rateLimiter: { limit: vi.fn<RecommendActionsRateLimiter["limit"]>().mockResolvedValue({ success: false }) },
    });
    expect(limitedResponse.status).toBe(429);
    expect(limitedPulls).toBe(0);
  });
});
