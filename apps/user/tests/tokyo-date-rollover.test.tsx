// @vitest-environment jsdom

import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoSituation } from "@staybridge/domain/demo";
import { StayBridgeApp } from "../src/components/StayBridgeApp";
import { serializeStoredSession } from "../src/components/staybridge-session";

const navigation = vi.hoisted(() => {
  let currentPath = "/ja/roadmap";
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

beforeEach(() => {
  navigation.reset("/ja/roadmap");
  navigation.push.mockClear();
  navigation.replace.mockClear();
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
  sessionStorage.setItem("staybridge.session", serializeStoredSession({
    provenance: "demo",
    situation: demoSituation,
    stayAnswer: "unknown",
    familyAnswers: ["children"],
    answeredSteps: Array.from({ length: 10 }, (_, index) => index),
  }));
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("print", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Tokyo date rollover for catalog publication", () => {
  it("hides cards whose review window expires after Tokyo midnight on an open tab", async () => {
    // 2027-02-23 is the standard review-after date; the tab opens one hour before Tokyo midnight.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-02-23T14:30:00Z"));
    render(<StayBridgeApp assessmentDate="2027-02-23" />);

    expect(screen.getByRole("heading", { name: "通訳・やさしい日本語の支援を確認する" })).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90 * 60 * 1000);
    });

    expect(screen.getByText("現在表示できる確認済みカードがありません。公式相談先で状況を確認してください。")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "通訳・やさしい日本語の支援を確認する" })).toBeNull();
  });

  it("keeps publishable cards while the Tokyo calendar day is unchanged", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T14:30:00Z"));
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(screen.getByRole("heading", { name: "通訳・やさしい日本語の支援を確認する" })).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20 * 60 * 1000);
    });

    expect(screen.getByRole("heading", { name: "通訳・やさしい日本語の支援を確認する" })).toBeTruthy();
  });
});
