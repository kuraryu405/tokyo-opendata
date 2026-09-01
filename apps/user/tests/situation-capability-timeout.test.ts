// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { demoSituation } from "@staybridge/domain/demo";
import {
  createPendingSituationSubmission,
  saveSituationSubmission,
  SITUATION_SUBMISSION_TIMEOUT_MS,
} from "../src/consented-persistence";

function hangUntilAborted(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (!(signal instanceof AbortSignal)) {
      reject(new Error("capability fetch must carry an abort signal"));
      return;
    }
    signal.addEventListener(
      "abort",
      () => reject(new DOMException("This operation was aborted", "AbortError")),
      { once: true },
    );
  });
}

function headersThenHangUntilAborted(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const signal = init?.signal;
  if (!(signal instanceof AbortSignal)) return Promise.reject(new Error("capability fetch must carry an abort signal"));
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      controller.enqueue(new TextEncoder().encode('{"ok":true,"data":{"capability":"cap_'));
    },
  });
  signal.addEventListener("abort", () => {
    streamController?.error(new DOMException("This operation was aborted", "AbortError"));
  }, { once: true });
  return Promise.resolve(new Response(stream, {
    status: 201,
    headers: { "content-type": "application/json" },
  }));
}

async function flushRequests() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Situation capability request deadline", () => {
  it("times out while capability issuance itself is pending", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(hangUntilAborted);
    vi.stubGlobal("fetch", fetchMock);

    const request = saveSituationSubmission(createPendingSituationSubmission(demoSituation));
    void request.catch(() => {});
    await flushRequests();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/situation-submission-capabilities");
    const signal = fetchMock.mock.calls[0][1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);

    await vi.advanceTimersByTimeAsync(SITUATION_SUBMISSION_TIMEOUT_MS);

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect((signal as AbortSignal).aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the same deadline active while the capability response body is streaming", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(headersThenHangUntilAborted);
    vi.stubGlobal("fetch", fetchMock);

    const request = saveSituationSubmission(createPendingSituationSubmission(demoSituation));
    void request.catch(() => {});
    await flushRequests();

    const signal = fetchMock.mock.calls[0][1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);

    await vi.advanceTimersByTimeAsync(SITUATION_SUBMISSION_TIMEOUT_MS);

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect((signal as AbortSignal).aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("propagates an owning abort controller to capability issuance", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(hangUntilAborted);
    vi.stubGlobal("fetch", fetchMock);
    const ownerController = new AbortController();

    const request = saveSituationSubmission(
      createPendingSituationSubmission(demoSituation),
      ownerController.signal,
    );
    await flushRequests();
    const signal = fetchMock.mock.calls[0][1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);

    ownerController.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect((signal as AbortSignal).aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
