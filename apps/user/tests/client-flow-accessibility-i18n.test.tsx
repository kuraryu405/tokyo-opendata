// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StayBridgeApp } from "../src/components/StayBridgeApp";
import { demoSituation } from "@staybridge/domain/demo";
import { createInitialSituation, serializeStoredSession } from "../src/components/staybridge-session";

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

describe("StayBridge client flow: accessibility i18n", () => {
  it("moves radio selection with keyboard arrows inside the native radiogroup", async () => {
    navigation.reset("/ja/check?step=2");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: { ...createInitialSituation(), currentMunicipality: "Kita", nationality: "MM" },
      stayAnswer: "unknown",
      familyAnswers: [],
      answeredSteps: [0, 1],
    }));
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    const firstOption = await screen.findByRole("radio", { name: "旅行" });
    await user.click(firstOption);
    expect((firstOption as HTMLInputElement).checked).toBe(true);

    firstOption.focus();
    await user.keyboard("{ArrowRight}");
    const secondOption = screen.getByRole("radio", { name: "家族・知人を訪ねるため" }) as HTMLInputElement;
    expect(secondOption.checked).toBe(true);
    expect(document.activeElement).toBe(secondOption);
    expect((firstOption as HTMLInputElement).checked).toBe(false);
  });

  it("scrolls instantly when the user prefers reduced motion", async () => {
    const scrollTo = vi.fn<(...args: unknown[]) => void>();
    vi.stubGlobal("scrollTo", scrollTo);
    vi.stubGlobal("matchMedia", vi.fn<() => { matches: boolean }>().mockReturnValue({ matches: true }));
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(screen.getByRole("button", { name: "デモの状況を読み込む" }));
    expect(await screen.findByRole("heading", { name: "回答を確認して、次の行動へ進みましょう" })).toBeTruthy();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "auto" });
  });

  it("scrolls smoothly by default", async () => {
    const scrollTo = vi.fn<(...args: unknown[]) => void>();
    vi.stubGlobal("scrollTo", scrollTo);
    vi.stubGlobal("matchMedia", vi.fn<() => { matches: boolean }>().mockReturnValue({ matches: false }));
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(screen.getByRole("button", { name: "デモの状況を読み込む" }));
    expect(await screen.findByRole("heading", { name: "回答を確認して、次の行動へ進みましょう" })).toBeTruthy();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" });
  });

  it("translates the main explanatory content without leaving Japanese copy", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await user.click(screen.getByRole("button", { name: /言語:/ }));
    await user.click(screen.getByRole("option", { name: "English" }));
    expect(screen.getByRole("heading", { name: "Find your next step for staying in Tokyo." })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /見つけよう/ })).toBeNull();
  });

  it("uses a custom keyboard-operable language listbox", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(document.querySelector(".language-select select")).toBeNull();
    const trigger = screen.getByRole("button", { name: /言語: 日本語/ });
    await user.click(trigger);
    const listbox = screen.getByRole("listbox", { name: "言語" });
    expect(within(listbox).getAllByRole("option")).toHaveLength(3);
    expect(within(listbox).getByRole("option", { name: "日本語" }).getAttribute("aria-selected")).toBe("true");

    await user.keyboard("{ArrowDown}{Enter}");
    expect(navigation.path()).toBe("/en");
    expect(screen.getByRole("button", { name: /Language: English/ })).toBeTruthy();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("reports Clipboard API failure instead of throwing", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error("denied")) },
    });
    restoreCompleteUserSession();
    navigation.reset("/ja/help");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(screen.getByRole("button", { name: /相談内容をまとめる/ }));
    await user.click(screen.getByRole("button", { name: /コピーする/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("コピーできませんでした");
  });
});
