// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

function completeUserSession() {
  return serializeStoredSession({
    provenance: "user",
    situation: demoSituation,
    stayAnswer: "unknown",
    familyAnswers: ["children"],
    answeredSteps: Array.from({ length: 10 }, (_, index) => index),
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

describe("Landing demo entry protection", () => {
  const demoLabel = getUserMessages("ja").ui.demo;

  it("keeps the demo available on a fresh landing", () => {
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    expect(screen.getByRole("button", { name: demoLabel })).toBeTruthy();
  });

  it.each([
    ["partially answered", [0, 1, 2, 3, 4]],
    ["fully answered", Array.from({ length: 10 }, (_, index) => index)],
  ])("hides the demo for a %s real session so answers cannot be overwritten silently", (_case, answeredSteps) => {
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps,
    }));
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(screen.queryByRole("button", { name: demoLabel })).toBeNull();
    expect(sessionStorage.getItem("staybridge.session")).toContain('"provenance":"user"');
  });

  it("keeps the demo hidden after the user explicitly declines server persistence", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("staybridge.session", completeUserSession());
    navigation.reset("/ja/status");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(await screen.findByRole("button", { name: "このタブだけで続ける" }));
    await user.click(screen.getByRole("button", { name: getUserMessages("ja").ui.homeLabel }));

    expect(screen.queryByRole("button", { name: demoLabel })).toBeNull();
    expect(sessionStorage.getItem("staybridge.session")).toContain('"provenance":"user"');
  });

  it("keeps saved real answers behind the protected-state guard instead of exposing the demo loader", async () => {
    sessionStorage.setItem("staybridge.session", completeUserSession());
    sessionStorage.setItem("staybridge.saved-situation-credentials", JSON.stringify({
      id: "sit_11111111-1111-4111-8111-111111111111",
      deletionToken: "A".repeat(43),
    }));
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(await screen.findByRole("heading", { name: "削除に必要な情報" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: demoLabel })).toBeNull();
    expect(sessionStorage.getItem("staybridge.session")).toContain('"provenance":"user"');
  });

  it("keeps the demo available while a demo session itself is loaded", () => {
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "demo",
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(screen.getByRole("button", { name: demoLabel })).toBeTruthy();
  });
});