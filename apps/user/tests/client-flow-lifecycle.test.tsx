// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StayBridgeApp } from "../src/components/StayBridgeApp";
import { demoSituation } from "@staybridge/domain/demo";
import { getUserMessages, selectableUserLocales } from "@staybridge/i18n/client";
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

function restoreCompleteUserSession() {
  sessionStorage.setItem("staybridge.session", serializeStoredSession({
    provenance: "user",
    situation: demoSituation,
    stayAnswer: "unknown",
    familyAnswers: ["children"],
    answeredSteps: Array.from({ length: 10 }, (_, index) => index),
  }));
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

describe("StayBridge client flow: lifecycle", () => {
  it.each(selectableUserLocales)("renders the representative full flow in %s", async (locale) => {
    const messages = getUserMessages(locale);
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(screen.getByRole("button", { name: /言語:/ }));
    await user.click(screen.getByRole("option", { name: getUserMessages(locale).metadata.nativeLabel }));
    await user.click(screen.getByRole("button", { name: messages.ui.demo }));
    expect(screen.getByRole("heading", { name: messages.ui.reviewed })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: new RegExp(messages.ui.seeRoadmap) }));
    expect(screen.getByRole("heading", { name: messages.ui.roadmapTitle })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: messages.ui.navLocal }));
    expect(screen.getByRole("heading", { name: messages.ui.localTitle })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: messages.ui.navHelp }));
    expect(screen.getByRole("heading", { name: messages.ui.helpTitle })).toBeTruthy();
    expect(document.querySelector("details.safe-notice")).toBeNull();
    expect(screen.queryByText(messages.ui.notDecision)).toBeNull();
    expect(screen.getByText(messages.ui.emergency)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: new RegExp(messages.ui.summary) }));
    expect(screen.getByRole("heading", { name: messages.ui.summaryTitle })).toBeTruthy();
    expect(screen.getByText(messages.ui.summaryIntro)).toBeTruthy();
    expect(screen.queryByText(messages.ui.notDecision)).toBeNull();
    expect(screen.queryByText(messages.ui.helpIntro)).toBeNull();
  });

  it("remounts the result and next destinations as cinematic slide cards", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(screen.getByRole("button", { name: "デモの状況を読み込む" }));
    const statusCard = document.querySelector(".cinematic-route-card");
    expect(statusCard).toBeTruthy();
    expect(document.querySelector(".cinematic-shell > .velorah-video source")?.getAttribute("src")).toBe("/tokyo-aerial-4308.mp4");
    expect(document.querySelector(".cinematic-shell > .velorah-nav")).toBeTruthy();
    expect(document.querySelector(".site-header")).toBeNull();
    expect(document.querySelector(".site-footer")).toBeNull();

    await user.click(screen.getByRole("button", { name: /次のステップを見る/ }));
    const roadmapCard = document.querySelector(".cinematic-route-card");
    expect(roadmapCard).toBeTruthy();
    expect(roadmapCard).not.toBe(statusCard);

    await user.click(screen.getByRole("button", { name: "近くの支援" }));
    const localCard = document.querySelector(".cinematic-route-card");
    expect(localCard).not.toBe(roadmapCard);

    await user.click(screen.getByRole("button", { name: "相談先" }));
    expect(document.querySelector(".cinematic-route-card")).not.toBe(localCard);
    expect(document.querySelector("details.safe-notice")).toBeNull();
  });

  it.each(selectableUserLocales)("returns from every primary destination to the %s locale home", async (locale) => {
    const messages = getUserMessages(locale);
    const user = userEvent.setup();
    restoreCompleteDemoSession();
    navigation.reset(`/${locale}/roadmap`);
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    for (const destination of ["roadmap", "local", "help", "summary"] as const) {
      await act(async () => {
        navigation.reset(`/${locale}/${destination}`);
      });
      const home = await screen.findByRole("button", { name: messages.ui.homeLabel });
      home.focus();
      expect(document.activeElement).toBe(home);
      await user.keyboard("{Enter}");
      expect(navigation.path()).toBe(`/${locale}`);
      expect(screen.getByRole("button", { name: messages.ui.demo })).toBeTruthy();
    }
  });

  it("keeps the landing page to the fullscreen hero without the former lower content", async () => {
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(screen.queryByRole("link", { name: /行政・支援者向けの確認画面/ })).toBeNull();
    expect(document.querySelector(".velorah-below")).toBeNull();
    expect(document.querySelector(".site-footer")).toBeNull();
  });

  it("does not restore the removed municipality link from a build-time origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_MUNICIPALITY_APP_URL", "https://municipality.staybridge.example/");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(screen.queryByRole("link", { name: /行政・支援者向けの確認画面/ })).toBeNull();
  });

  it("offers start over after completed answers and returns to the first question", async () => {
    const user = userEvent.setup();
    restoreCompleteDemoSession();
    navigation.reset("/ja/roadmap");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await screen.findByRole("button", { name: "わたしのステップ" });
    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));
    expect(screen.getByRole("button", { name: "最初からやり直す" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "最初からやり直す" }));
    expect(screen.getByRole("heading", { name: "東京のどの地域に滞在していますか？" })).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "東京23区から選択" }) as HTMLInputElement).value).toBe("");
  });

  it("returns from the first question to the landing page", async () => {
    vi.stubGlobal("matchMedia", vi.fn<() => { matches: boolean }>().mockReturnValue({ matches: false }));
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(screen.getAllByRole("button", { name: "フォームに回答する" }).at(-1)!);
    expect(document.querySelector(".velorah-hero-main.is-exiting")).toBeTruthy();
    await waitFor(() => expect(navigation.path()).toBe("/ja/check?step=0"));
    expect(document.querySelector(".cinematic-shell .velorah-video source")?.getAttribute("src")).toBe("/tokyo-aerial-4308.mp4");
    expect(document.querySelector(".cinematic-shell > .velorah-nav")).toBeTruthy();
    expect(document.querySelector(".site-header")).toBeNull();
    expect(document.querySelector(".site-footer")).toBeNull();
    const firstCard = document.querySelector(".question-card");
    fireEvent.change(screen.getByRole("combobox", { name: "東京23区から選択" }), { target: { value: "世田谷区" } });
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(screen.getByRole("heading", { name: "国籍・地域を教えてください。" })).toBeTruthy();
    const secondCard = document.querySelector(".question-card");
    expect(secondCard).not.toBe(firstCard);
    expect(secondCard?.classList.contains("question-card-forward")).toBe(true);
    await user.click(screen.getByRole("button", { name: /^← 戻る$/ }));
    expect(document.querySelector(".question-card")?.classList.contains("question-card-backward")).toBe(true);
    await user.click(screen.getByRole("button", { name: /^← 戻る$/ }));

    expect(navigation.path()).toBe("/ja");
    expect(screen.getAllByRole("button", { name: "フォームに回答する" })).toHaveLength(2);
  });

  it("keeps completed answers accessible and exposes the landing form entry", async () => {
    const user = userEvent.setup();
    restoreCompleteDemoSession();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    const startButtons = await screen.findAllByRole("button", { name: "フォームに回答する" });
    expect(startButtons).toHaveLength(2);
    await user.click(startButtons.at(-1)!);
    await waitFor(() => expect(navigation.path()).toBe("/ja/status"));
  });

  it("sends unanswered Help visitors to the first question instead of an empty consultation summary", async () => {
    const user = userEvent.setup();
    navigation.reset("/ja/help");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(screen.getByRole("button", { name: /相談内容をまとめる/ }));
    expect(navigation.path()).toBe("/ja/check?step=0");
    expect(screen.queryByRole("heading", { name: "相談サマリー" })).toBeNull();
    expect(screen.queryByText(/地域: 北区/)).toBeNull();
    expect(screen.queryByText(/国籍・地域: ミャンマー/)).toBeNull();
  });

  it("shows no Kita resources before a municipality is selected", async () => {
    navigation.reset("/ja/local");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(screen.getByText(/相談窓口の一覧から、この地域で利用できる支援を確認/)).toBeTruthy();
    expect(screen.queryByText("豊川小学校")).toBeNull();
  });

  it("restores locale and all persisted form state safely", async () => {
    navigation.reset("/en/check?step=0");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await screen.findByRole("button", { name: "My steps" });
    expect((screen.getByRole("combobox", { name: "Choose from Tokyo's 23 wards" }) as HTMLInputElement).value).toMatch(/Kita City/);
    await user.click(screen.getByRole("button", { name: /Next/ }));
    expect((screen.getByRole("combobox", { name: "Choose a country or region" }) as HTMLInputElement).value).toMatch(/Myanmar/);
    for (let index = 0; index < 4; index += 1) await user.click(screen.getByRole("button", { name: /Next/ }));
    expect((screen.getByRole("radio", { name: /I do not know/ }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("button", { name: /Next/ }));
    expect((screen.getByRole("checkbox", { name: /A child is with me/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("does not flash an empty result while restoring a completed session", async () => {
    navigation.reset("/ja/status");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(await screen.findByRole("heading", { name: "回答を確認して、次の行動へ進みましょう" })).toBeTruthy();
    expect(screen.queryByText("まだ入力された情報はありません。")).toBeNull();
  });

  it("returns a direct link to the final question to the first unanswered step", async () => {
    navigation.reset("/ja/check?step=9");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await waitFor(() => expect(navigation.path()).toBe("/ja/check?step=0"));
    expect(screen.getByText("質問 01")).toBeTruthy();
  });

  it("gates the primary navigation by assessment progress", async () => {
    const user = userEvent.setup();
    navigation.reset("/ja/");
    const landingRender = render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(await screen.findAllByRole("button", { name: "フォームに回答する" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "わたしのステップ" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "デモの状況を読み込む" }));
    expect(await screen.findByRole("heading", { name: "回答を確認して、次の行動へ進みましょう" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "主要ナビゲーション" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "わたしのステップ" })).toBeTruthy();

    landingRender.unmount();
    sessionStorage.removeItem("staybridge.session");
    navigation.reset("/ja/check?step=2");
    const checkRender = render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await screen.findByRole("heading", { name: "東京のどの地域に滞在していますか？" });
    await waitFor(() => expect(navigation.path()).toBe("/ja/check?step=0"));
    expect(screen.getByRole("navigation", { name: "主要ナビゲーション" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "わたしのステップ" })).toBeNull();
    expect(screen.getByRole("button", { name: "近くの支援" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "相談先" })).toBeTruthy();

    checkRender.unmount();
    restoreCompleteUserSession();
    navigation.reset("/ja/check?step=0");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await waitFor(() => expect((screen.getByRole("combobox", { name: "東京23区から選択" }) as HTMLInputElement).value).toBe("北区"));
    expect(screen.getByRole("button", { name: "わたしのステップ" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));
    expect(await screen.findByRole("heading", { name: "あなたの次のステップ" })).toBeTruthy();
  });

  it("keeps a restart from reopening the old result route through Back", async () => {    navigation.reset("/ja/roadmap");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(screen.getByRole("button", { name: /最初からやり直す/ }));
    expect(navigation.path()).toBe("/ja/check?step=0");
    navigation.reset("/ja/status");

    await waitFor(() => expect(navigation.path()).toBe("/ja/check?step=0"));
    expect(screen.queryByText("回答を確認して、次の行動へ進みましょう")).toBeNull();
    expect(screen.getByText("質問 01")).toBeTruthy();
  });

  it("guards direct result links when no completed session exists", async () => {
    navigation.reset("/ja/status");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await waitFor(() => expect(navigation.path()).toBe("/ja/check?step=0"));
    expect(screen.queryByText("回答を確認して、次の行動へ進みましょう")).toBeNull();
    expect(screen.getByText("質問 01")).toBeTruthy();
  });

  it("continues with an explicit warning when session storage rejects writes", async () => {
    const failingStorage = memoryStorage();
    failingStorage.setItem = () => { throw new Error("denied"); };
    vi.stubGlobal("sessionStorage", failingStorage);
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect((await screen.findByRole("status")).textContent).toContain("端末への保存ができませんでした");
  });

  it("re-evaluates the latest cards after changing an answer and reloading", async () => {
    navigation.reset("/ja/roadmap");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: {
        ...demoSituation,
        familyMembers: { children: [] },
        needs: ["medical"],
      },
      stayAnswer: "known",
      familyAnswers: ["none"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    const user = userEvent.setup();
    const firstRender = render(<StayBridgeApp assessmentDate="2026-08-23" />);
    expect(await screen.findByRole("heading", { name: "日本に滞在できる期間を確認する" })).toBeTruthy();

    navigation.reset("/ja/check?step=4");
    await screen.findByRole("heading", { name: "予定どおり帰国できますか？" });
    await user.click(screen.getByRole("radio", { name: "帰国できる" }));
    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));
    expect(screen.queryByRole("heading", { name: "日本に滞在できる期間を確認する" })).toBeNull();
    expect(screen.getByRole("heading", { name: "医療を受けられる場所を確認する" })).toBeTruthy();
    await waitFor(() => expect(sessionStorage.getItem("staybridge.session")).toContain('"returnStatus":"possible"'));

    firstRender.unmount();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    expect(await screen.findByRole("heading", { name: "医療を受けられる場所を確認する" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "日本に滞在できる期間を確認する" })).toBeNull();
  });

  it("renders directly from the URL and preserves the active screen query when changing language", async () => {
    navigation.reset("/ja/check?step=4");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: [0, 1, 2, 3],
    }));
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(screen.getByText("質問 05")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /言語:/ }));
    await user.click(screen.getByRole("option", { name: "English" }));
    expect(navigation.path()).toBe("/en/check?step=4");
    expect(screen.getByText("Question 05")).toBeTruthy();
  });

  it("re-renders direct back and forward URL changes instead of keeping screen state", async () => {
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    const { unmount } = render(<StayBridgeApp assessmentDate="2026-08-23" />);

    navigation.reset("/my/summary");
    await waitFor(() => expect(screen.getByRole("heading", { name: getUserMessages("my").ui.summaryTitle })).toBeTruthy());
    navigation.reset("/en/local?filter=medical");
    await waitFor(() => expect(screen.getByRole("heading", { name: getUserMessages("en").ui.localTitle })).toBeTruthy());
    expect(screen.getByRole("button", { name: getUserMessages("en").ui.medical, pressed: true })).toBeTruthy();
    unmount();
  });

  it("keeps route state out of the session answer payload", async () => {
    navigation.reset("/en/local?filter=medical");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await waitFor(() => expect(sessionStorage.getItem("staybridge.session")).not.toBeNull());
    const stored = sessionStorage.getItem("staybridge.session") ?? "";
    const storedSession = JSON.parse(stored) as Record<string, unknown>;
    expect(Object.keys(storedSession)).toEqual([
      "version",
      "provenance",
      "situation",
      "stayAnswer",
      "familyAnswers",
      "answeredSteps",
      "otherAnswers",
      "aiRecommendation",
    ]);
    expect(storedSession).not.toHaveProperty("locale");
    expect(storedSession).not.toHaveProperty("screen");
    expect(storedSession).not.toHaveProperty("step");
    expect(storedSession).not.toHaveProperty("filter");
  });
});
