// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StayBridgeApp } from "../src/components/StayBridgeApp";
import { demoSituation } from "@staybridge/domain/demo";
import type { VisitPurpose } from "@staybridge/domain/types";
import { sourceRegistry } from "@staybridge/data";
import { supportCopy } from "@staybridge/i18n";
import { getUserMessages, selectableUserLocales } from "@staybridge/i18n/client";
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

function restoreCompleteDemoSession() {
  sessionStorage.setItem("staybridge.session", serializeStoredSession({
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

describe("StayBridge client flow", () => {
  it.each(selectableUserLocales)("renders the representative full flow in %s", async (locale) => {
    const messages = getUserMessages(locale);
    const user = userEvent.setup();
    render(<StayBridgeApp />);

    await user.selectOptions(screen.getByRole("combobox"), locale);
    await user.click(screen.getByRole("button", { name: messages.ui.demo }));
    expect(screen.getByRole("heading", { name: messages.ui.reviewed })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: new RegExp(messages.ui.seeRoadmap) }));
    expect(screen.getByRole("heading", { name: messages.ui.roadmapTitle })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: messages.ui.navLocal }));
    expect(screen.getByRole("heading", { name: messages.ui.localTitle })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: messages.ui.navHelp }));
    expect(screen.getByRole("heading", { name: messages.ui.helpTitle })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: new RegExp(messages.ui.summary) }));
    expect(screen.getByRole("heading", { name: messages.ui.summaryTitle })).toBeTruthy();
    expect(screen.queryByText(messages.ui.summaryIntro)).toBeNull();
    expect(screen.queryByText(messages.ui.notDecision)).toBeNull();
    expect(screen.queryByText(messages.ui.helpIntro)).toBeNull();
  });

  it.each(selectableUserLocales)("returns from every primary destination to the %s locale home", async (locale) => {
    const messages = getUserMessages(locale);
    const user = userEvent.setup();
    restoreCompleteDemoSession();
    navigation.reset(`/${locale}/roadmap`);
    render(<StayBridgeApp />);

    for (const destination of ["roadmap", "local", "help", "summary"] as const) {
      navigation.reset(`/${locale}/${destination}`);
      const home = await screen.findByRole("button", { name: messages.ui.homeLabel });
      home.focus();
      expect(document.activeElement).toBe(home);
      await user.keyboard("{Enter}");
      expect(navigation.path()).toBe(`/${locale}`);
      expect(screen.getByRole("button", { name: messages.ui.demo })).toBeTruthy();
    }
  });

  it("links from the user landing page to the municipality preparedness view", async () => {
    render(<StayBridgeApp />);

    expect(screen.getByRole("link", { name: /行政・支援者向け Preparedness View/ }).getAttribute("href")).toBe("http://localhost:3001");
  });

  it("uses the configured production municipality URL in the landing link", async () => {
    vi.stubEnv("NEXT_PUBLIC_MUNICIPALITY_APP_URL", "https://municipality.staybridge.example/");
    render(<StayBridgeApp />);

    expect(screen.getByRole("link", { name: /行政・支援者向け Preparedness View/ }).getAttribute("href")).toBe("https://municipality.staybridge.example");
  });

  it("offers start over after completed answers and returns to the first question", async () => {
    const user = userEvent.setup();
    restoreCompleteDemoSession();
    render(<StayBridgeApp />);

    await screen.findByRole("button", { name: "わたしのステップ" });
    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));
    expect(screen.getByRole("button", { name: "最初からやり直す" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "最初からやり直す" }));
    expect(screen.getByRole("heading", { name: "今、東京のどの地域に滞在していますか？" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "北区" }).getAttribute("aria-checked")).toBe("false");
  });

  it("does not render internal defaults as selected before each single-answer step is answered", async () => {
    const user = userEvent.setup();
    navigation.reset("/ja/check?step=2");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      situation: { ...createInitialSituation(), currentMunicipality: "Kita", nationality: "MMR" },
      stayAnswer: "unknown",
      familyAnswers: [],
      answeredSteps: [0, 1],
    }));
    render(<StayBridgeApp />);

    expect((await screen.findByRole("radio", { name: "分からない / 答えたくない" })).getAttribute("aria-checked")).toBe("false");
    await user.click(screen.getByRole("radio", { name: "旅行" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(screen.getByRole("radio", { name: "分からない" }).getAttribute("aria-checked")).toBe("false");
    await user.click(screen.getByRole("radio", { name: "7日以内" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(screen.getByRole("radio", { name: "分からない" }).getAttribute("aria-checked")).toBe("false");
    await user.click(screen.getByRole("radio", { name: "帰国できる" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(screen.getByRole("radio", { name: "分からない" }).getAttribute("aria-checked")).toBe("false");
    await user.click(screen.getByRole("radio", { name: "書類を確認したい" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    const noFamily = screen.getByRole("checkbox", { name: "いない" });
    await user.click(noFamily);
    expect(noFamily.getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(screen.getByRole("radio", { name: "答えたくない" }).getAttribute("aria-checked")).toBe("false");
    await user.click(screen.getByRole("radio", { name: "家族・知人の家" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    const consultationNeed = screen.getByRole("checkbox", { name: "相談先" });
    await user.click(consultationNeed);
    expect(consultationNeed.getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(screen.getByRole("radio", { name: "ほとんど話せない" }).getAttribute("aria-checked")).toBe("false");
  });

  it("keeps completed answers navigable without a landing start button", async () => {
    const user = userEvent.setup();
    restoreCompleteDemoSession();
    render(<StayBridgeApp />);

    await screen.findByRole("button", { name: "わたしのステップ" });
    expect(screen.queryByRole("button", { name: "今の状況を確認する" })).toBeNull();
    expect(screen.getByRole("banner").querySelector(".header-restart")).toBeNull();

    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));
    expect(screen.getByRole("heading", { name: "あなたの次のステップ" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "最初からやり直す" })).toBeTruthy();
  });

  it("does not invent location, nationality, or needs when Help is opened directly", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp />);

    await user.click(screen.getByRole("button", { name: "相談先" }));
    await user.click(screen.getByRole("button", { name: /相談内容をまとめる/ }));

    expect(screen.getByText("まだ入力された情報はありません。")).toBeTruthy();
    expect(screen.getByText("まだ確認したいことは選択されていません。")).toBeTruthy();
    expect(screen.queryByText(/地域: 北区/)).toBeNull();
    expect(screen.queryByText(/国籍・地域: ミャンマー/)).toBeNull();
  });

  it("shows no Kita resources before a municipality is selected", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp />);

    await user.click(screen.getByRole("button", { name: "近くの支援" }));
    expect(screen.getByText(/詳細な地域データに対応していません/)).toBeTruthy();
    expect(screen.queryByText("豊川小学校")).toBeNull();
  });

  it("restores locale and all persisted form state safely", async () => {
    navigation.reset("/en/check?step=0");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      situation: demoSituation,
      stayAnswer: "documents",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    const user = userEvent.setup();
    render(<StayBridgeApp />);

    await screen.findByRole("button", { name: "My steps" });
    expect(screen.getByRole("radio", { name: /Kita City/ }).getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByRole("radio", { name: /Myanmar/ }).getAttribute("aria-checked")).toBe("true");
    for (let index = 0; index < 4; index += 1) await user.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByRole("radio", { name: /I want to check my documents/ }).getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByRole("checkbox", { name: /A child is with me/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("does not flash an empty result while restoring a completed session", async () => {
    navigation.reset("/ja/status");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    render(<StayBridgeApp />);

    expect(await screen.findByRole("heading", { name: "今の状況を整理しました" })).toBeTruthy();
    expect(screen.queryByText("まだ入力された情報はありません。")).toBeNull();
  });

  it("returns a direct link to the final question to the first unanswered step", async () => {
    navigation.reset("/ja/check?step=9");
    render(<StayBridgeApp />);

    await waitFor(() => expect(navigation.path()).toBe("/ja/check?step=0"));
    expect(screen.getByText("質問 01")).toBeTruthy();
  });

  it("keeps a restart from reopening the old result route through Back", async () => {
    navigation.reset("/ja/roadmap");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    const user = userEvent.setup();
    render(<StayBridgeApp />);

    await user.click(screen.getByRole("button", { name: /最初からやり直す/ }));
    expect(navigation.path()).toBe("/ja/check?step=0");
    navigation.reset("/ja/status");

    await waitFor(() => expect(navigation.path()).toBe("/ja/check?step=0"));
    expect(screen.queryByText("今の状況を整理しました")).toBeNull();
    expect(screen.getByText("質問 01")).toBeTruthy();
  });

  it("guards direct result links when no completed session exists", async () => {
    navigation.reset("/ja/status");
    render(<StayBridgeApp />);

    await waitFor(() => expect(navigation.path()).toBe("/ja/check?step=0"));
    expect(screen.queryByText("今の状況を整理しました")).toBeNull();
    expect(screen.getByText("質問 01")).toBeTruthy();
  });

  it("translates the main explanatory content without leaving Japanese copy", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp />);
    await user.selectOptions(screen.getByRole("combobox"), "en");
    expect(screen.getByText("Organize your situation one question at a time without knowing official terms.")).toBeTruthy();
    expect(screen.queryByText("制度名を知らなくても、今の状況を一問ずつ整理。")).toBeNull();
  });

  it("continues with an explicit warning when session storage rejects writes", async () => {
    const failingStorage = memoryStorage();
    failingStorage.setItem = () => { throw new Error("denied"); };
    vi.stubGlobal("sessionStorage", failingStorage);
    render(<StayBridgeApp />);

    expect((await screen.findByRole("status")).textContent).toContain("端末への保存ができませんでした");
  });

  it("reports Clipboard API failure instead of throwing", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error("denied")) },
    });
    render(<StayBridgeApp />);

    await user.click(screen.getByRole("button", { name: "相談先" }));
    await user.click(screen.getByRole("button", { name: /相談内容をまとめる/ }));
    await user.click(screen.getByRole("button", { name: /コピーする/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("コピーできませんでした");
  });

  it("shows every eligible official source for a multi-source action", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp />);
    await user.click(screen.getByRole("button", { name: "デモの状況を読み込む" }));
    await user.click(screen.getByRole("button", { name: /次のステップを見る/ }));

    const workAction = screen.getByRole("heading", { name: "働ける条件を先に確認する" }).closest("article");
    expect(workAction).not.toBeNull();
    const workLinks = within(workAction!).getAllByRole("link");
    expect(workLinks.length).toBeGreaterThan(2);
    expect(workLinks.some((link) => link.getAttribute("href")?.includes("hataraku.metro.tokyo.lg.jp"))).toBe(true);
    expect(within(workAction!).getAllByText(/確認日:/).length).toBeGreaterThan(2);

    await user.click(screen.getByRole("button", { name: "相談先" }));
    expect(await screen.findByRole("heading", { name: "関連する公式情報", level: 2 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: sourceRegistry.TOKYO_LABOR_CONSULT.title, level: 3 })).toBeTruthy();
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
        situation: { ...demoSituation, visitPurpose, needs: ["stay", "consultation", "medical"] },
        stayAnswer: "unknown",
        familyAnswers: ["children"],
        answeredSteps: Array.from({ length: 10 }, (_, index) => index),
      }));
      render(<StayBridgeApp />);

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
      situation: { ...demoSituation, visitPurpose: "tourism", needs: ["accommodation", "living_cost", "medical"] },
      stayAnswer: "unknown",
      familyAnswers: ["none"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    render(<StayBridgeApp />);

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
      situation: {
        ...demoSituation,
        visitPurpose: "resident",
        needs: ["stay", "consultation", "accommodation", "living_cost", "education", "childcare", "medical", "employment", "language", "daily_life"],
      },
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    render(<StayBridgeApp />);

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
      situation: { ...demoSituation, visitPurpose: "resident" },
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    render(<StayBridgeApp />);

    expect(await screen.findByText(answer)).toBeTruthy();
    expect(screen.getByText(note)).toBeTruthy();
    expect(screen.queryByText(supportCopy.FRESC.answersInText.ja)).toBeNull();
    expect(screen.queryByText(supportCopy.FRESC.notes.ja)).toBeNull();
  });

  it("routes consultation actions to people and local actions to their exact category", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp />);
    await user.click(screen.getByRole("button", { name: "デモの状況を読み込む" }));
    await user.click(screen.getByRole("button", { name: /次のステップを見る/ }));

    const accommodationAction = screen.getByRole("heading", { name: "今後の滞在場所を整理する" }).closest("article");
    await user.click(within(accommodationAction!).getByRole("button", { name: /生活相談先を見る/ }));
    expect(screen.getByRole("heading", { name: "人に相談する" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));
    const schoolAction = screen.getByRole("heading", { name: "子どもの教育について相談する" }).closest("article");
    await user.click(within(schoolAction!).getByRole("button", { name: /近くの学校を見る/ }));
    expect(screen.getByRole("tab", { name: "学校・教育" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("豊川小学校")).toBeTruthy();
    expect(screen.queryByText("おうじキッズクリニック")).toBeNull();

    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));
    const medicalAction = screen.getByRole("heading", { name: "医療を受けられる場所を確認する" }).closest("article");
    await user.click(within(medicalAction!).getByRole("button", { name: /近くの医療機関を見る/ }));
    expect(screen.getByRole("tab", { name: "医療" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("おうじキッズクリニック")).toBeTruthy();
    expect(screen.queryByText("豊川小学校")).toBeNull();
  });

  it("renders restored stay and family answers in the consultation summary", async () => {
    const user = userEvent.setup();
    navigation.reset("/en/");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      situation: { ...demoSituation, knownStayDeadline: undefined, stayDeadlineKnown: false, familyMembers: { children: [] } },
      stayAnswer: "documents",
      familyAnswers: ["spouse"],
      answeredSteps: [5, 6],
    }));
    render(<StayBridgeApp />);
    await screen.findByRole("button", { name: "My steps" });

    await user.click(screen.getByRole("button", { name: "Get help" }));
    await user.click(screen.getByRole("button", { name: /Create consultation summary/ }));
    expect(screen.getByText("I want to check my documents")).toBeTruthy();
    expect(screen.getByText("My spouse is with me")).toBeTruthy();
    expect(screen.queryByText("No")).toBeNull();
  });

  it("keeps spouse and child answers together across roadmap and summary", async () => {
    const user = userEvent.setup();
    navigation.reset("/en/");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children", "spouse"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    render(<StayBridgeApp />);
    await screen.findByRole("button", { name: "My steps" });

    await user.click(screen.getByRole("button", { name: "My steps" }));
    expect(screen.getByRole("heading", { name: "Ask about your child’s education" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Get help" }));
    await user.click(screen.getByRole("button", { name: /Create consultation summary/ }));
    expect(screen.getByText(/A child is with me · age: 6-11 \/ My spouse is with me/)).toBeTruthy();
  });

  it("provides explicit onward navigation and source dates in Local Action", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp />);
    await user.click(screen.getByRole("button", { name: "デモの状況を読み込む" }));
    await user.click(screen.getByRole("button", { name: /次のステップを見る/ }));
    await user.click(screen.getByRole("button", { name: "近くの支援" }));

    expect(screen.getByRole("button", { name: /ステップへ戻る/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /相談先へ進む/ })).toBeTruthy();
    const schoolCard = screen.getByRole("heading", { name: "豊川小学校" }).closest("article");
    expect(within(schoolCard!).getByText("データ更新: 公開日不明")).toBeTruthy();
    expect(within(schoolCard!).getByText("確認日: 2026-08-14")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /相談先へ進む/ }));
    expect(screen.getByRole("heading", { name: "人に相談する" })).toBeTruthy();
  });

  it("renders directly from the URL and preserves the active screen query when changing language", async () => {
    navigation.reset("/ja/check?step=4");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: [0, 1, 2, 3],
    }));
    const user = userEvent.setup();
    render(<StayBridgeApp />);

    expect(screen.getByText("質問 05")).toBeTruthy();
    await user.selectOptions(screen.getByRole("combobox"), "en");
    expect(navigation.path()).toBe("/en/check?step=4");
    expect(screen.getByText("QUESTION 05")).toBeTruthy();
  });

  it("re-renders direct back and forward URL changes instead of keeping screen state", async () => {
    const { unmount } = render(<StayBridgeApp />);

    navigation.reset("/my/summary");
    await waitFor(() => expect(screen.getByRole("heading", { name: getUserMessages("my").ui.summaryTitle })).toBeTruthy());
    navigation.reset("/en/local?filter=medical");
    await waitFor(() => expect(screen.getByRole("heading", { name: getUserMessages("en").ui.localTitle })).toBeTruthy());
    expect(screen.getByRole("tab", { name: getUserMessages("en").ui.medical }).getAttribute("aria-selected")).toBe("true");
    unmount();
  });

  it("keeps route state out of the session answer payload", async () => {
    navigation.reset("/en/local?filter=medical");
    render(<StayBridgeApp />);

    await waitFor(() => expect(sessionStorage.getItem("staybridge.session")).not.toBeNull());
    const stored = sessionStorage.getItem("staybridge.session") ?? "";
    const storedSession = JSON.parse(stored) as Record<string, unknown>;
    expect(Object.keys(storedSession)).toEqual([
      "version",
      "situation",
      "stayAnswer",
      "familyAnswers",
      "answeredSteps",
    ]);
    expect(storedSession).not.toHaveProperty("locale");
    expect(storedSession).not.toHaveProperty("screen");
    expect(storedSession).not.toHaveProperty("step");
    expect(storedSession).not.toHaveProperty("filter");
  });
});
