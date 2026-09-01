// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Corrupt pending Situation submission secrets", () => {
  it.each([
    ["malformed JSON", "{not-json"],
    ["unknown version schema", JSON.stringify({ version: 99, idempotencyKey: "k".repeat(20), deletionToken: "A".repeat(43) })],
  ])("fails closed for %s instead of treating it as no pending save", async (_case, storedPending) => {
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    sessionStorage.setItem("staybridge.pending-situation-submission", storedPending);
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(await screen.findByRole("heading", { name: "未完了の保存情報を確認できません" })).toBeTruthy();
    expect(screen.getByText(/サーバーで完了している可能性/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "同意して保存" })).toBeNull();

    expect(screen.queryByRole("button", { name: "この端末のデータを消す" })).toBeNull();
    expect(sessionStorage.getItem("staybridge.pending-situation-submission")).toBe(storedPending);
    expect(sessionStorage.getItem("staybridge.session")).not.toBeNull();
  });

  it("keeps the raw pending value untouched across a reload until an explicit discard", async () => {
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    const storedPending = JSON.stringify({ legacyField: true });
    sessionStorage.setItem("staybridge.pending-situation-submission", storedPending);
    const firstRender = render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await screen.findByRole("heading", { name: "未完了の保存情報を確認できません" });

    firstRender.unmount();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await screen.findByRole("heading", { name: "未完了の保存情報を確認できません" });
    expect(sessionStorage.getItem("staybridge.pending-situation-submission")).toBe(storedPending);

    fireEvent.click(screen.getByRole("button", { name: "読み取れない保存情報を破棄" }));
    expect(sessionStorage.getItem("staybridge.pending-situation-submission")).toBeNull();
    expect(await screen.findByRole("button", { name: "同意して保存" })).toBeTruthy();
    expect(sessionStorage.getItem("staybridge.session")).not.toBeNull();
  });

  it("preserves the unreadable pending value when only the corrupt saved credentials are discarded", async () => {
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    const storedPending = "{corrupt";
    sessionStorage.setItem("staybridge.saved-situation-credentials", "{");
    sessionStorage.setItem("staybridge.pending-situation-submission", storedPending);
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(await screen.findByRole("heading", { name: "削除情報を確認できません" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "壊れた削除情報だけ破棄" }));

    expect(sessionStorage.getItem("staybridge.saved-situation-credentials")).toBeNull();
    expect(sessionStorage.getItem("staybridge.pending-situation-submission")).toBe(storedPending);
    expect(await screen.findByRole("heading", { name: "未完了の保存情報を確認できません" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "この端末のデータを消す" })).toBeNull();
  });
});
