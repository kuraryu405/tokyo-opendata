// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoSituation } from "@staybridge/domain/demo";
import { StayBridgeApp } from "../src/components/StayBridgeApp";

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

beforeEach(() => {
  navigation.reset("/ja/");
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

describe("Unreadable stored session handling", () => {
  it.each([
    ["malformed JSON", "{broken"],
    ["schema mismatch", JSON.stringify({ version: 3, provenance: "user", stayAnswer: "unknown", familyAnswers: [], answeredSteps: [0], situation: { nationality: 5 } })],
    ["future version (rollback scenario)", JSON.stringify({ version: 9, provenance: "user", situation: demoSituation, stayAnswer: "known", familyAnswers: [], answeredSteps: [] })],
  ])("fails closed for %s without overwriting the raw session", async (_case, rawSession) => {
    sessionStorage.setItem("staybridge.session", rawSession);
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(await screen.findByRole("heading", { name: "前回の回答を読み取れません" })).toBeTruthy();
    await waitFor(() => expect(sessionStorage.getItem("staybridge.session")).toBe(rawSession));
  });

  it("discards the raw value only through the explicit fresh start and resumes writing afterwards", async () => {
    const user = userEvent.setup();
    const rawSession = "{broken";
    sessionStorage.setItem("staybridge.session", rawSession);
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await screen.findByRole("heading", { name: "前回の回答を読み取れません" });
    // Demo loading is paused while the unreadable session is protected.
    expect((screen.getByRole("button", { name: "デモの状況を読み込む" }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "新しく始める" }));
    expect(sessionStorage.getItem("staybridge.session")).toBeNull();
    expect(screen.queryByRole("heading", { name: "前回の回答を読み取れません" })).toBeNull();

    await user.click(await screen.findByRole("button", { name: "デモの状況を読み込む" }));
    await waitFor(() => expect(sessionStorage.getItem("staybridge.session")).toContain('"provenance":"demo"'));
  });

  it("does not expose the removed footer data reset for an unreadable session", async () => {
    const rawSession = "{broken";
    sessionStorage.setItem("staybridge.session", rawSession);
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await screen.findByRole("heading", { name: "前回の回答を読み取れません" });
    expect(screen.queryByRole("button", { name: "この端末のデータを消す" })).toBeNull();
    expect(navigation.path()).toBe("/ja/");
    expect(sessionStorage.getItem("staybridge.session")).toBe(rawSession);
    expect(screen.getByRole("heading", { name: "前回の回答を読み取れません" })).toBeTruthy();
  });
});
