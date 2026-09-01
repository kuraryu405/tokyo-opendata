// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StayBridgeApp } from "../src/components/StayBridgeApp";
import { demoSituation } from "@staybridge/domain/demo";
import type { VisitPurpose } from "@staybridge/domain/types";
import { sourceRegistry } from "@staybridge/data";
import { supportCopy } from "@staybridge/i18n";
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

function restoreCompleteDemoSession() {
  sessionStorage.setItem("staybridge.session", serializeStoredSession({
    provenance: "demo",
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

describe("StayBridge client flow: roadmap summary", () => {
  it("shows every eligible official source for a multi-source action", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await user.click(screen.getByRole("button", { name: "デモの状況を読み込む" }));
    await user.click(screen.getByRole("button", { name: /次のステップを見る/ }));

    const workAction = screen.getByRole("heading", { name: "働ける条件を先に確認する" }).closest("article");
    expect(workAction).not.toBeNull();
    const workLinks = within(workAction!).getAllByRole("link");
    expect(workLinks.length).toBeGreaterThan(2);
    expect(workLinks.some((link) => link.getAttribute("href")?.includes("hataraku.metro.tokyo.lg.jp"))).toBe(true);
    expect(workLinks.some((link) => (link.textContent ?? "").includes("Bureau of Labor"))).toBe(true);
    expect(within(workAction!).queryByText(/確認日:/)).toBeNull();
    expect(within(workAction!).queryByText(/LICENSE:/)).toBeNull();
    expect(within(workAction!).getByText(/確認先:.*確認項目:.*就労の範囲/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "相談先" }));
    expect(await screen.findByRole("heading", { name: "関連する公式情報", level: 2 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: sourceRegistry.TOKYO_LABOR_CONSULT.title, level: 3 })).toBeTruthy();
  });

  it("numbers roadmap actions uniquely across timing groups from 01", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await user.click(screen.getByRole("button", { name: "デモの状況を読み込む" }));
    await user.click(screen.getByRole("button", { name: /次のステップを見る/ }));

    const numbers = [...document.querySelectorAll(".action-number")].map((element) => element.textContent);
    const parsed = numbers.map((value) => Number(value));
    expect(numbers.length).toBeGreaterThan(2);
    expect(parsed[0]).toBe(1);
    for (let index = 1; index < numbers.length; index += 1) expect(parsed[index]).toBe(parsed[index - 1] + 1);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers[0]).toBe("01");
  });

  it.each([
    ["tourism", false, false],
    ["visiting_family_or_friends", false, false],
    ["other", false, false],
    ["unknown", false, false],
    ["work", true, false],
    ["study", true, false],
    ["resident", true, true],
  ] satisfies Array<[VisitPurpose, boolean, boolean]>) (
    "filters resident/status sources for %s",
    async (visitPurpose, showsStatusConsultation, showsTmcNavi) => {
      navigation.reset("/en/help");
      sessionStorage.setItem("staybridge.session", serializeStoredSession({
        provenance: "user",
        situation: { ...demoSituation, visitPurpose, needs: ["stay", "consultation", "medical"] },
        stayAnswer: "unknown",
        familyAnswers: ["children"],
        answeredSteps: Array.from({ length: 10 }, (_, index) => index),
      }));
      render(<StayBridgeApp assessmentDate="2026-08-23" />);

      await screen.findByRole("heading", { name: "Official information for your situation" });
      expect(Boolean(screen.queryByRole("heading", { name: sourceRegistry.TOKYO_FRESC_STATUS_CONSULT.title }))).toBe(showsStatusConsultation);
      expect(Boolean(screen.queryByRole("heading", { name: sourceRegistry.TMC_NAVI.title }))).toBe(showsTmcNavi);
      expect(Boolean(screen.queryByRole("heading", { name: sourceRegistry.TOKYO_MEDICAL_TMCNAVI.title }))).toBe(showsTmcNavi);
      expect(screen.getByRole("heading", { name: sourceRegistry.FRESC.title })).toBeTruthy();
    },
  );

  it("filters tourism medical sources, deduplicates repeated mappings, and keeps accessible card structure", async () => {
    navigation.reset("/ja/help");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: { ...demoSituation, visitPurpose: "tourism", needs: ["accommodation", "living_cost", "medical"] },
      stayAnswer: "unknown",
      familyAnswers: ["none"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    const groupHeading = await screen.findByRole("heading", { name: "関連する公式情報", level: 2 });
    const group = groupHeading.closest("section");
    expect(group).not.toBeNull();
    expect(within(group!).getAllByRole("heading", { name: sourceRegistry.TOKYO_HOUSING_SUPPORT.title, level: 3 })).toHaveLength(1);
    expect(within(group!).getByRole("heading", { name: sourceRegistry.TOKYO_MEDICAL_INFO.title, level: 3 })).toBeTruthy();
    expect(within(group!).queryByRole("heading", { name: sourceRegistry.TOKYO_MEDICAL_TMCNAVI.title })).toBeNull();
    expect(within(group!).queryByRole("heading", { name: sourceRegistry.TOKYO_SCHOOL_ENROLL_EN.title })).toBeNull();

    const medicalCard = within(group!).getByRole("heading", { name: sourceRegistry.TOKYO_MEDICAL_INFO.title }).closest("article");
    const link = within(medicalCard!).getByRole("link");
    expect(link.getAttribute("aria-label")).toContain(sourceRegistry.TOKYO_MEDICAL_INFO.title);
  });

  it("keeps support card indexes at two digits after the ninth card", async () => {
    navigation.reset("/ja/help");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: {
        ...demoSituation,
        visitPurpose: "resident",
        needs: ["stay", "consultation", "accommodation", "living_cost", "education", "childcare", "medical", "employment", "language", "daily_life"],
      },
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    const groupHeading = await screen.findByRole("heading", { name: "関連する公式情報" });
    const indexes = [...groupHeading.closest("section")!.querySelectorAll(".support-index")].map((element) => element.textContent);
    expect(indexes.length).toBeGreaterThan(10);
    expect(indexes.slice(0, 11)).toEqual(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"]);
    expect(indexes).not.toContain("010");
  });

  it.each([
    ["en", supportCopy.FRESC.answersInText.en, supportCopy.FRESC.notes.en],
    ["my", supportCopy.FRESC.answersInText.my, supportCopy.FRESC.notes.my],
  ] as const)("shows only %s support copy", async (locale, answer, note) => {
    navigation.reset(`/${locale}/help`);
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: { ...demoSituation, visitPurpose: "resident" },
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(await screen.findByText(answer)).toBeTruthy();
    expect(screen.getByText(note)).toBeTruthy();
    expect(screen.queryByText(supportCopy.FRESC.answersInText.ja)).toBeNull();
    expect(screen.queryByText(supportCopy.FRESC.notes.ja)).toBeNull();
  });

  it("falls back to official support when no reviewed card resolves", async () => {
    navigation.reset("/ja/roadmap");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: {
        ...demoSituation,
        returnStatus: "possible",
        stayDeadlineKnown: false,
        knownStayDeadline: undefined,
        japaneseLevel: "advanced",
        familyMembers: { children: [] },
        needs: [],
      },
      stayAnswer: "known",
      familyAnswers: [],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(await screen.findByText(/現在表示できる確認済みカードがありません/)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "日本に滞在できる期間を確認する" })).toBeNull();
    expect(screen.getByRole("button", { name: /公式相談先を見る/ })).toBeTruthy();
  });

  it("routes consultation actions to people and local actions to their exact category", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await user.click(screen.getByRole("button", { name: "デモの状況を読み込む" }));
    await user.click(screen.getByRole("button", { name: /次のステップを見る/ }));

    const accommodationAction = screen.getByRole("heading", { name: "今後の滞在場所を整理する" }).closest("article");
    await user.click(within(accommodationAction!).getByRole("button", { name: /生活相談先を見る/ }));
    expect(screen.getByRole("heading", { name: "人に相談する" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));
    // The school card is fail-closed while the school source publishes zero rows.
    expect(screen.queryByRole("heading", { name: "子どもの教育について相談する" })).toBeNull();
    const childSupportAction = screen.getByRole("heading", { name: "子どもと利用できる地域資源を確認する" }).closest("article");
    await user.click(within(childSupportAction!).getByRole("button", { name: /子どもの居場所を見る/ }));
    expect(screen.getByRole("button", { name: "子どもの居場所", pressed: true })).toBeTruthy();
    expect(screen.getByText("赤羽北児童館")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));
    const medicalAction = screen.getByRole("heading", { name: "医療を受けられる場所を確認する" }).closest("article");
    await user.click(within(medicalAction!).getByRole("button", { name: /近くの医療機関を見る/ }));
    expect(screen.getByRole("button", { name: "医療", pressed: true })).toBeTruthy();
    expect(screen.getByText("おうじキッズクリニック")).toBeTruthy();
    expect(screen.queryByText("豊川小学校")).toBeNull();
  });

  it("renders restored stay and family answers in the consultation summary", async () => {
    const user = userEvent.setup();
    navigation.reset("/en/help");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: { ...demoSituation, knownStayDeadline: undefined, stayDeadlineKnown: false, familyMembers: { children: [] } },
      stayAnswer: "unknown",
      familyAnswers: ["spouse"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await screen.findByRole("heading", { name: "Talk to a person" });
    await user.click(screen.getByRole("button", { name: /Create consultation summary/ }));
    expect(screen.getByText("I do not know")).toBeTruthy();
    expect(screen.getByText("My spouse is with me")).toBeTruthy();
    expect(screen.queryByText("No")).toBeNull();
    expect(document.querySelector(".summary-sheet time")?.textContent).toBe("August 23, 2026");
  });

  it("keeps spouse and child answers together across roadmap and summary", async () => {
    const user = userEvent.setup();
    navigation.reset("/en/");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children", "spouse"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    navigation.reset("/en/roadmap");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await screen.findByRole("button", { name: "My steps" });

    await user.click(screen.getByRole("button", { name: "My steps" }));
    expect(screen.getByRole("heading", { name: "Find local places for your child" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Get help" }));
    await user.click(screen.getByRole("button", { name: /Create consultation summary/ }));
    expect(screen.getByText(/A child is with me · age: 6-11 \/ My spouse is with me/)).toBeTruthy();
  });

  it("provides explicit onward navigation and source dates in Local Action", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await user.click(screen.getByRole("button", { name: "デモの状況を読み込む" }));
    await user.click(screen.getByRole("button", { name: /次のステップを見る/ }));
    await user.click(screen.getByRole("button", { name: "近くの支援" }));

    expect(screen.getByRole("button", { name: /ステップへ戻る/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /相談先へ進む/ })).toBeTruthy();
    const resourceCard = screen.getByRole("heading", { name: "おうじキッズクリニック" }).closest("article");
    expect(within(resourceCard!).getByText("データ更新: 2024-10-31")).toBeTruthy();
    expect(within(resourceCard!).getByText("取得日: 2026-08-23")).toBeTruthy();
    expect(within(resourceCard!).queryByText(/確認日/)).toBeNull();
    expect(within(resourceCard!).getByText("東京都北区")).toBeTruthy();
    expect(within(resourceCard!).getByRole("link", { name: /LICENSE: Creative Commons Attribution 4.0 International/ }).getAttribute("href")).toBe("https://creativecommons.org/licenses/by/4.0/");
    await user.click(within(resourceCard!).getByText("出典を見る"));
    expect(within(resourceCard!).getByText("自治体標準オープンデータセット：医療機関一覧")).toBeTruthy();
    expect(within(resourceCard!).getByText("東京都北区Open DataをStayBridge用に一部選定・正規化しています")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /相談先へ進む/ }));
    expect(screen.getByRole("heading", { name: "人に相談する" })).toBeTruthy();
  });

  it("explains each displayed action with its natural-language reason and source link", async () => {
    const user = userEvent.setup();
    restoreCompleteDemoSession();
    navigation.reset("/ja/roadmap");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await screen.findByRole("button", { name: "わたしのステップ" });

    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));
    const stayCard = screen.getByRole("heading", { name: "日本に滞在できる期間を確認する" }).closest("article");
    expect(stayCard).not.toBeNull();
    await user.click(within(stayCard!).getByText("なぜこの案内？"));

    expect(within(stayCard!).queryByText("R-STAY-RETURN-DIFFICULT-SHORT-NEAR")).toBeNull();
    expect(within(stayCard!).queryByText("returnStatus=difficult")).toBeNull();
    expect(within(stayCard!).getByText("「旅行・短期の訪問で来た」「予定どおり帰ることが難しい」と回答したため表示しています。")).toBeTruthy();
    expect(within(stayCard!).getByRole("link", { name: /Immigration Services Agency/ })).toBeTruthy();
  });
});
