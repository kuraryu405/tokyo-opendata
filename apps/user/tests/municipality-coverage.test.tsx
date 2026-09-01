// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoSituation } from "@staybridge/domain/demo";
import type { Situation } from "@staybridge/domain/types";
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

const situationFor = (municipality: string, needs: Situation["needs"], children: Situation["familyMembers"]["children"]): Situation => ({
  ...demoSituation,
  currentMunicipality: municipality,
  visitPurpose: "other",
  originalDepartureWindow: "within_3_months",
  returnStatus: "possible",
  stayDeadlineKnown: false,
  accommodation: "rental",
  japaneseLevel: "advanced",
  familyMembers: { children },
  needs,
});

beforeEach(() => {
  navigation.reset("/ja/roadmap");
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

describe("Municipality resource coverage gating for local-action cards", () => {
  it.each([
    ["Kita", true],
    ["Shinjuku", false],
    ["Toshima", false],
    ["Setagaya", false],
    ["Edogawa", false],
  ])("shows the medical listing card in %s only when coverage exists", (municipality, expected) => {
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: situationFor(municipality, ["medical"], []),
      stayAnswer: "known",
      familyAnswers: [],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
      otherAnswers: { area: "", nationality: "", visitPurpose: "テスト用の訪問目的", family: "" },
    }));
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    const medicalVisible = screen.queryByRole("heading", { name: "医療を受けられる場所を確認する" });
    expect(medicalVisible?.textContent ?? null).toBe(expected ? "医療を受けられる場所を確認する" : null);
    const cardCount = document.querySelectorAll(".action-card").length;
    expect(cardCount).toBe(expected ? 1 : 0);
  });

  it.each([
    ["Kita", true],
    ["Shinjuku", false],
    ["Toshima", false],
    ["Setagaya", false],
  ])("gates school and child-support cards by coverage for %s", (municipality, expected) => {
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: { ...situationFor(municipality, [], [{ ageGroup: "6-11" }]), returnStatus: "difficult" },
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
      otherAnswers: { area: "", nationality: "", visitPurpose: "テスト用の訪問目的", family: "" },
    }));
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    // The school card also stays hidden in Kita while its source publishes zero rows.
    const education = screen.queryByRole("heading", { name: "子どもの教育について相談する" });
    expect(education?.textContent ?? null).toBeNull();
    const childSupport = screen.queryByRole("heading", { name: "子どもと利用できる地域資源を確認する" });
    expect(childSupport?.textContent ?? null).toBe(expected ? "子どもと利用できる地域資源を確認する" : null);
  });

  it("keeps consult-only cards available regardless of municipality coverage", () => {
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: situationFor("Shinjuku", ["living_cost", "medical"], []),
      stayAnswer: "known",
      familyAnswers: [],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
      otherAnswers: { area: "", nationality: "", visitPurpose: "テスト用の訪問目的", family: "" },
    }));
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(screen.getByRole("heading", { name: "当面の生活費について相談する" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "医療を受けられる場所を確認する" })).toBeNull();
  });
});
