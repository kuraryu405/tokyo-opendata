// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoSituation } from "@staybridge/domain/demo";
import { getUserMessages } from "@staybridge/i18n/client";
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

function partialUserSession() {
  return serializeStoredSession({
    provenance: "user",
    situation: demoSituation,
    stayAnswer: "unknown",
    familyAnswers: ["children"],
    answeredSteps: [0, 1, 2, 3, 4],
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
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Consultation summary route guard", () => {
  it("returns a fresh direct visit to /summary to the first question", async () => {
    navigation.reset("/ja/summary");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await waitFor(() => expect(navigation.path()).toBe("/ja/check?step=0"));
    expect(screen.queryByRole("heading", { name: getUserMessages("ja").ui.summaryTitle })).toBeNull();
  });

  it("returns a partially answered direct visit to /summary to the first unanswered step", async () => {
    sessionStorage.setItem("staybridge.session", partialUserSession());
    navigation.reset("/en/summary");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await waitFor(() => expect(navigation.path()).toBe("/en/check?step=5"));
    expect(screen.queryByRole("heading", { name: getUserMessages("en").ui.summaryTitle })).toBeNull();
  });

  it("re-applies the guard when browser history changes an already-mounted partial session to /summary", async () => {
    sessionStorage.setItem("staybridge.session", partialUserSession());
    navigation.reset("/ja/help");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    expect(screen.getByRole("heading", { name: getUserMessages("ja").ui.helpTitle })).toBeTruthy();

    navigation.reset("/ja/summary");

    await waitFor(() => expect(navigation.path()).toBe("/ja/check?step=5"));
    expect(screen.queryByRole("heading", { name: getUserMessages("ja").ui.summaryTitle })).toBeNull();
  });

  it("keeps the consultation summary reachable for a completed answer session", async () => {
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    navigation.reset("/ja/summary");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await waitFor(() => expect(navigation.path()).toBe("/ja/summary"));
    expect(screen.getByRole("heading", { name: getUserMessages("ja").ui.summaryTitle })).toBeTruthy();
  });

  it("keeps the consultation summary reachable for a completed demo session", async () => {
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "demo",
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    navigation.reset("/ja/summary");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await waitFor(() => expect(navigation.path()).toBe("/ja/summary"));
    expect(screen.getByRole("heading", { name: getUserMessages("ja").ui.summaryTitle })).toBeTruthy();
  });

  it("sends an incomplete demo session from /summary back to the review screen", async () => {
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "demo",
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: [],
      answeredSteps: [0, 1],
    }));
    navigation.reset("/ja/summary");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await waitFor(() => expect(navigation.path()).toBe("/ja/status"));
    expect(screen.queryByRole("heading", { name: getUserMessages("ja").ui.summaryTitle })).toBeNull();
  });
});