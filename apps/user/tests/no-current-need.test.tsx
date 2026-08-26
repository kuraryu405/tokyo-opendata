// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
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

describe("No-current-need assessment option", () => {
  it("completes the flow with 特になし alone instead of forcing a fake need", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: {
        nationality: "UNKNOWN",
        currentMunicipality: "",
        visitPurpose: "other",
        originalDepartureWindow: "unknown",
        returnStatus: "possible",
        stayDeadlineKnown: false,
        accommodation: "prefer_not_to_say",
        japaneseLevel: "advanced",
        familyMembers: { children: [] },
        needs: [],
      },
      stayAnswer: "known",
      familyAnswers: [],
      answeredSteps: [0, 1, 2, 3, 4, 5, 6, 7],
    }));
    navigation.reset("/ja/check?step=8");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(await screen.findByRole("checkbox", { name: "特になし" }));
    expect((screen.getByRole("button", { name: /次へ/ }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole("button", { name: /次へ/ }));

    expect(screen.getByText("ほとんど話せない")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "十分話せる" }));
    await user.click(screen.getByRole("button", { name: /状況を整理する/ }));
    expect(await screen.findByRole("heading", { name: "今の状況を整理しました" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /次のステップを見る/ }));
    // No cards may be invented from an explicit no-current-need answer.
    expect(screen.getByText("現在表示できる確認済みカードがありません。公式相談先で状況を確認してください。")).toBeTruthy();
    expect(document.querySelectorAll(".action-card").length).toBe(0);
  });

  it("makes 特になし exclusive with real needs in both directions", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: { ...demoSituation, familyMembers: { children: [] }, needs: ["living_cost"] },
      stayAnswer: "unknown",
      familyAnswers: [],
      answeredSteps: [0, 1, 2, 3, 4, 5, 6, 7],
    }));
    navigation.reset("/ja/check?step=8");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    const livingCost = await screen.findByRole("checkbox", { name: "生活費" });
    expect((livingCost as HTMLInputElement).checked).toBe(true);

    await user.click(screen.getByRole("checkbox", { name: "特になし" }));
    expect((livingCost as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "特になし" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole("checkbox", { name: "生活費", checked: true })).toBeNull();

    await user.click(livingCost);
    expect((screen.getByRole("checkbox", { name: "特になし" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "生活費" }) as HTMLInputElement).checked).toBe(true);
  });
});
