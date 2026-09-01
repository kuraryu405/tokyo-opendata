// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoSituation } from "@staybridge/domain/demo";
import { StayBridgeApp } from "../src/components/StayBridgeApp";
import { serializeStoredSession } from "../src/components/staybridge-session";

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
    path: () => currentPath,
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

const testSubmissionCapability = `cap_${"A".repeat(43)}`;

function capabilityResponse(capability = testSubmissionCapability): Response {
  return new Response(JSON.stringify({
    ok: true,
    data: { capability, expiresAt: "2026-08-24T10:05:00.000Z" },
  }), { status: 201, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  navigation.reset();
  navigation.push.mockClear();
  navigation.replace.mockClear();
  vi.stubGlobal("matchMedia", vi.fn<() => { matches: boolean }>().mockReturnValue({ matches: true }));
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

describe("StayBridge saved credentials", () => {
  it("deletes a saved Situation record only with its in-memory deletion code", async () => {
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(capabilityResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        data: { id: "sit_22222222-2222-4222-8222-222222222222", created: true },
      }), { status: 201, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        data: { deleted: true },
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(await screen.findByRole("button", { name: "同意して保存" }));
    await user.click(await screen.findByRole("button", { name: "このサーバー記録を削除" }));
    expect(await screen.findByText("サーバー記録を削除しました。")).toBeTruthy();
    expect(fetchMock.mock.calls[2][0]).toBe("/api/situation-submissions/sit_22222222-2222-4222-8222-222222222222");
    const headers = fetchMock.mock.calls[2][1]?.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^Bearer [A-Za-z0-9_-]{43}$/);
    expect(sessionStorage.getItem("staybridge.saved-situation-credentials")).toBeNull();
  });

  it("restores deletion credentials across remounts and blocks answer reset until server deletion", async () => {
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(capabilityResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        data: { id: "sit_44444444-4444-4444-8444-444444444444", created: true },
      }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const firstRender = render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(await screen.findByRole("button", { name: "同意して保存" }));
    await screen.findByRole("heading", { name: "削除に必要な情報" });
    await user.click(screen.getByRole("button", { name: "回答を見直す" }));
    expect(navigation.path()).toBe("/ja/status");
    await waitFor(() => expect(document.activeElement?.id).toBe("saved-situation-credentials"));

    firstRender.unmount();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    expect(await screen.findByText("sit_44444444-4444-4444-8444-444444444444")).toBeTruthy();
    expect(screen.getByText(/このタブのsessionStorageにも保持/)).toBeTruthy();
  });

  it("removes the former footer clear action when there are no saved credentials", async () => {
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await screen.findByRole("heading", { name: "回答の保存方法を選ぶ" });
    expect(screen.queryByRole("button", { name: "この端末のデータを消す" })).toBeNull();
    expect(document.querySelector(".site-footer")).toBeNull();
    expect(sessionStorage.getItem("staybridge.session")).not.toBeNull();
    expect(sessionStorage.getItem("staybridge.saved-situation-credentials")).toBeNull();
  });

  it.each([
    ["malformed JSON", "{"],
    ["wrong id", JSON.stringify({ version: 1, id: "sit_not-valid", deletionToken: "A".repeat(43) })],
    ["wrong token", JSON.stringify({ version: 1, id: "sit_55555555-5555-4555-8555-555555555555", deletionToken: "short" })],
    ["unknown version", JSON.stringify({ version: 2, id: "sit_55555555-5555-4555-8555-555555555555", deletionToken: "A".repeat(43) })],
  ])("fails closed for %s saved credentials until explicit local-only discard", async (_case, storedCredentials) => {
    restoreCompleteUserSession();
    sessionStorage.setItem("staybridge.saved-situation-credentials", storedCredentials);
    navigation.reset("/ja/check?step=4");
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await waitFor(() => expect(navigation.path()).toBe("/ja/status"));
    expect(await screen.findByRole("heading", { name: "削除情報を確認できません" })).toBeTruthy();
    expect(screen.getByText(/サーバー記録が残っている可能性/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /次のステップを見る/ }));
    expect(navigation.path()).toBe("/ja/roadmap");
    await user.click(screen.getByRole("button", { name: "最初からやり直す" }));
    await waitFor(() => expect(navigation.path()).toBe("/ja/status"));
    await user.click(screen.getByRole("button", { name: "回答を見直す" }));
    expect(navigation.path()).toBe("/ja/status");

    await user.click(screen.getByRole("button", { name: "サーバー記録を残して端末データだけ破棄" }));
    expect(navigation.path()).toBe("/ja");
    expect(sessionStorage.getItem("staybridge.session")).toBeNull();
    expect(sessionStorage.getItem("staybridge.saved-situation-credentials")).toBeNull();
  });


  it("guards saved records from direct, Back, Home, and demo state-changing routes", async () => {
    restoreCompleteUserSession();
    sessionStorage.setItem("staybridge.saved-situation-credentials", JSON.stringify({
      id: "sit_55555555-5555-4555-8555-555555555555",
      deletionToken: "A".repeat(43),
    }));
    navigation.reset("/ja/check?step=4");
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await waitFor(() => expect(navigation.path()).toBe("/ja/status"));
    expect(await screen.findByText("sit_55555555-5555-4555-8555-555555555555")).toBeTruthy();
    expect(JSON.parse(sessionStorage.getItem("staybridge.saved-situation-credentials") ?? "{}")).toMatchObject({
      version: 1,
      id: "sit_55555555-5555-4555-8555-555555555555",
    });

    navigation.reset("/ja/check?step=0");
    await waitFor(() => expect(navigation.path()).toBe("/ja/status"));
    await user.click(screen.getByRole("button", { name: /ホーム/ }));
    await waitFor(() => expect(navigation.path()).toBe("/ja/status"));
    expect(screen.queryByRole("button", { name: "デモの状況を読み込む" })).toBeNull();

    await user.click(screen.getByRole("button", { name: /次のステップを見る/ }));
    expect(await screen.findByRole("heading", { name: "あなたの次のステップ" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "近くの支援" }));
    await waitFor(() => expect(navigation.path()).toBe("/ja/local?filter=all"));
    await user.click(screen.getByRole("button", { name: "相談先" }));
    await waitFor(() => expect(navigation.path()).toBe("/ja/help"));
  });

  it("treats a canonical deletion 404 retry as completion for the locally held credential", async () => {
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    sessionStorage.setItem("staybridge.saved-situation-credentials", JSON.stringify({
      id: "sit_66666666-6666-4666-8666-666666666666",
      deletionToken: "A".repeat(43),
    }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error: { code: "DELETION_NOT_FOUND", message: "No matching record was found." },
    }), { status: 404, headers: { "content-type": "application/json" } })));
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(await screen.findByRole("button", { name: "このサーバー記録を削除" }));
    expect(await screen.findByText("サーバー記録を削除しました。")).toBeTruthy();
    expect(sessionStorage.getItem("staybridge.saved-situation-credentials")).toBeNull();
  });

});
