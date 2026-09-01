// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoSituation } from "@staybridge/domain/demo";
import { StayBridgeApp } from "../src/components/StayBridgeApp";
import { serializeStoredSession } from "../src/components/staybridge-session";
import {
  createPendingSituationSubmission,
  PENDING_SITUATION_SUBMISSION_VERSION,
  saveSituationSubmission,
  SITUATION_SUBMISSION_TIMEOUT_MS,
} from "../src/consented-persistence";

const navigation = vi.hoisted(() => {
  let currentPath = "/ja/";
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const navigate = (path: string) => {
    const url = new URL(path, "http://localhost");
    currentPath = `${url.pathname}${url.search}`;
    notify();
  };
  return {
    getPathname: () => currentPath.split("?", 1)[0],
    getSearch: () => currentPath.includes("?") ? currentPath.slice(currentPath.indexOf("?") + 1) : "",
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    push: vi.fn<(path: string) => void>(navigate),
    replace: vi.fn<(path: string) => void>(navigate),
    reset: (path = "/ja/") => {
      currentPath = path;
      notify();
    },
  };
});

vi.mock("next/navigation", async () => {
  const React = await import("react");
  return {
    usePathname: () => React.useSyncExternalStore(navigation.subscribe, navigation.getPathname, navigation.getPathname),
    useSearchParams: () => React.useSyncExternalStore(navigation.subscribe, navigation.getSearch, navigation.getSearch),
    useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  };
});

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={String(href)} {...props}>{children}</a>,
}));

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

function restoreCompleteUserSession() {
  sessionStorage.setItem("staybridge.session", serializeStoredSession({
    provenance: "user",
    situation: demoSituation,
    stayAnswer: "unknown",
    familyAnswers: ["children"],
    answeredSteps: Array.from({ length: 10 }, (_, index) => index),
  }));
}

function hangUntilAborted(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (!(signal instanceof AbortSignal)) {
      reject(new Error("submission fetch must carry an abort signal"));
      return;
    }
    signal.addEventListener("abort", () => reject(new DOMException("This operation was aborted", "AbortError")), { once: true });
  });
}

function headersThenHangUntilAborted(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const signal = init?.signal;
  if (!(signal instanceof AbortSignal)) return Promise.reject(new Error("submission fetch must carry an abort signal"));
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      controller.enqueue(new TextEncoder().encode('{"ok":true,"data":{"id":"sit_11111111-1111-4111-8111-111111111111"'));
    },
  });
  signal.addEventListener("abort", () => {
    streamController?.error(new DOMException("This operation was aborted", "AbortError"));
  }, { once: true });
  return Promise.resolve(new Response(stream, { status: 201, headers: { "content-type": "application/json" } }));
}

function capabilityResponse(capability = `cap_${"A".repeat(43)}`): Response {
  return new Response(JSON.stringify({
    ok: true,
    data: { capability, expiresAt: "2026-08-24T10:05:00.000Z" },
  }), { status: 201, headers: { "content-type": "application/json" } });
}

const CAPABILITY_URL = "/api/situation-submission-capabilities";

/** Resolves the capability issue request; everything else goes to the fallback mock. */
function routeCapabilityIssue(
  fallback: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return (input, init) => {
    if (String(input) === CAPABILITY_URL) return Promise.resolve(capabilityResponse());
    return fallback(input, init);
  };
}

function savedCredentialsValue(): string {
  return JSON.stringify({
    id: "sit_22222222-2222-4222-8222-222222222222",
    deletionToken: "B".repeat(43),
  });
}

/** Drains pending promise reactions without touching the fake clock. */
async function flushSubmissions() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  navigation.reset();
  navigation.push.mockClear();
  navigation.replace.mockClear();
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("print", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Situation persistence request timeouts", () => {
  it("aborts a never-settling save request and recovers the consent UI without losing the pending secrets", async () => {
    vi.useFakeTimers();
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(capabilityResponse())
      .mockImplementationOnce(hangUntilAborted)
      .mockResolvedValueOnce(capabilityResponse(`cap_${"B".repeat(43)}`))
      .mockResolvedValue(new Response(JSON.stringify({
        ok: true,
        data: { id: "sit_11111111-1111-4111-8111-111111111111", created: false },
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    fireEvent.click(screen.getByRole("button", { name: "同意して保存" }));
    await flushSubmissions();
    expect(screen.getByText("保存しています…")).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toBe(CAPABILITY_URL);
    expect(fetchMock.mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SITUATION_SUBMISSION_TIMEOUT_MS);
    });
    expect(screen.getByText("保存できませんでした。回答と次の案内は引き続き利用できます。")).toBeTruthy();
    const saveSignal = fetchMock.mock.calls[1][1]?.signal as AbortSignal | undefined;
    expect(saveSignal?.aborted).toBe(true);

    const firstBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as Record<string, unknown>;
    const { capability: _sentCapability, ...requestWithoutCapability } = firstBody;
    // The stored snapshot keeps the exact original request (capability excluded).
    expect(JSON.parse(sessionStorage.getItem("staybridge.pending-situation-submission") ?? "{}")).toEqual({
      version: PENDING_SITUATION_SUBMISSION_VERSION,
      request: requestWithoutCapability,
    });

    fireEvent.click(screen.getByRole("button", { name: "同意して保存" }));
    await flushSubmissions();
    expect(screen.getByRole("heading", { name: "削除に必要な情報" })).toBeTruthy();
    expect(fetchMock.mock.calls[2][0]).toBe(CAPABILITY_URL);
    const retryBody = JSON.parse(String(fetchMock.mock.calls[3][1]?.body)) as { idempotencyKey: string };
    expect(retryBody.idempotencyKey).toBe(firstBody.idempotencyKey as string);
    expect(sessionStorage.getItem("staybridge.pending-situation-submission")).toBeNull();
  });

  it("keeps the timeout active while a successful response body is still streaming", async () => {
    vi.useFakeTimers();
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(routeCapabilityIssue(headersThenHangUntilAborted));
    vi.stubGlobal("fetch", fetchMock);
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    fireEvent.click(screen.getByRole("button", { name: "同意して保存" }));
    await flushSubmissions();
    expect(screen.getByText("保存しています…")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SITUATION_SUBMISSION_TIMEOUT_MS);
    });

    const streamingSignal = fetchMock.mock.calls[1][1]?.signal;
    expect(streamingSignal).toBeInstanceOf(AbortSignal);
    expect((streamingSignal as AbortSignal).aborted).toBe(true);
    expect(screen.getByText("保存できませんでした。回答と次の案内は引き続き利用できます。")).toBeTruthy();
    expect(sessionStorage.getItem("staybridge.pending-situation-submission")).not.toBeNull();
  });

  it("allows an owning request controller to abort a submission", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(routeCapabilityIssue(hangUntilAborted));
    vi.stubGlobal("fetch", fetchMock);
    const ownerController = new AbortController();
    const request = saveSituationSubmission(createPendingSituationSubmission(demoSituation), ownerController.signal);
    await flushSubmissions();
    const internalSignal = fetchMock.mock.calls[1][1]?.signal as AbortSignal;

    ownerController.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(internalSignal.aborted).toBe(true);
  });

  it("aborts the app-owned save request when StayBridgeApp unmounts", async () => {
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(routeCapabilityIssue(hangUntilAborted));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<StayBridgeApp assessmentDate="2026-08-23" />);

    fireEvent.click(screen.getByRole("button", { name: "同意して保存" }));
    await flushSubmissions();
    const signal = fetchMock.mock.calls[1][1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);

    view.unmount();
    await Promise.resolve();

    expect((signal as AbortSignal).aborted).toBe(true);
  });

  it("keeps the deletion credentials usable when the delete request never settles", async () => {
    vi.useFakeTimers();
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    sessionStorage.setItem("staybridge.saved-situation-credentials", savedCredentialsValue());
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(hangUntilAborted);
    vi.stubGlobal("fetch", fetchMock);
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    fireEvent.click(screen.getByRole("button", { name: "このサーバー記録を削除" }));
    expect(screen.getByText("削除しています…")).toBeTruthy();
    await flushSubmissions();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/situation-submissions/sit_22222222-2222-4222-8222-222222222222");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SITUATION_SUBMISSION_TIMEOUT_MS);
    });
    expect(screen.getByText("削除できませんでした。記録IDと削除コードを保管して、後でもう一度お試しください。")).toBeTruthy();
    const deleteSignal = fetchMock.mock.calls[0][1]?.signal as AbortSignal | undefined;
    expect(deleteSignal?.aborted).toBe(true);
    const storedCredentials = JSON.parse(sessionStorage.getItem("staybridge.saved-situation-credentials") ?? "{}") as Record<string, unknown>;
    expect(storedCredentials).toEqual({
      version: 1,
      id: "sit_22222222-2222-4222-8222-222222222222",
      deletionToken: "B".repeat(43),
    });

    fireEvent.click(screen.getByRole("button", { name: "このサーバー記録を削除" }));
    expect(screen.getByText("削除しています…")).toBeTruthy();
  });
});