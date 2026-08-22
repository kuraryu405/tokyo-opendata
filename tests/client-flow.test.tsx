// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StayBridgeApp } from "../src/components/StayBridgeApp";
import { demoSituation } from "../src/domain/demo";
import { createInitialSituation, parseStoredSession, serializeStoredSession } from "../src/components/staybridge-session";

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

function restoreCompleteEmptySession() {
  sessionStorage.setItem("staybridge.session", serializeStoredSession({
    situation: createInitialSituation(),
    stayAnswer: "unknown",
    familyAnswers: ["none"],
    answeredSteps: Array.from({ length: 10 }, (_, index) => index),
  }));
}

async function openCompletedRoadmap(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("button", { name: "わたしのステップ" });
  await user.click(screen.getByRole("button", { name: "わたしのステップ" }));
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("print", vi.fn());
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StayBridge client flow", () => {
  it("returns to the landing page from the first question without question notices", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp />);

    expect(screen.queryByRole("button", { name: "デモの状況を読み込む" })).toBeNull();
    expect(screen.queryByLabelText("StayBridge roadmap preview")).toBeNull();
    expect(screen.queryByText("答えるのは、次の行動に必要なことだけです")).toBeNull();
    expect(screen.queryByRole("button", { name: "この端末のデータを消す" })).toBeNull();
    expect(screen.queryByRole("button", { name: "最初からやり直す" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "今の状況を確認する" }));
    expect(window.location.search).toBe("?screen=check&step=0");
    expect(screen.queryByRole("navigation", { name: "Primary" })).toBeNull();
    expect(screen.queryByRole("button", { name: "最初からやり直す" })).toBeNull();
    expect(screen.queryByText("正確な住所は必要ありません。")).toBeNull();
    expect(screen.queryByText(/氏名、パスポート番号/)).toBeNull();

    const backToTop = screen.getByRole("button", { name: "トップページへ戻る" });
    expect(backToTop.getAttribute("disabled")).toBeNull();

    await user.click(screen.getByRole("radio", { name: "北区" }));
    await user.click(screen.getByRole("button", { name: "最初からやり直す" }));
    expect(screen.getByRole("radio", { name: "北区" }).getAttribute("aria-checked")).toBe("false");
    expect(sessionStorage.getItem("staybridge.session")).toBeNull();

    await user.click(screen.getByRole("radio", { name: "北区" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(window.location.search).toBe("?screen=check&step=1");
    expect(screen.queryByText("この回答は地域の支援準備には送信されません。")).toBeNull();

    await user.click(screen.getByRole("button", { name: "戻る" }));
    await user.click(screen.getByRole("button", { name: "トップページへ戻る" }));

    expect(screen.getByRole("button", { name: "今の状況を確認する" })).toBeTruthy();
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

  it("keeps completed answers navigable without a landing start button", async () => {
    const user = userEvent.setup();
    restoreCompleteDemoSession();
    render(<StayBridgeApp />);

    await screen.findByRole("button", { name: "わたしのステップ" });
    expect(screen.queryByRole("button", { name: "今の状況を確認する" })).toBeNull();
    expect(screen.getByRole("banner").querySelector(".header-restart")).toBeNull();

    await user.click(screen.getByRole("button", { name: "わたしのステップへ戻る" }));
    expect(screen.getByRole("heading", { name: "あなたの次のステップ" })).toBeTruthy();
    expect(screen.getByText("気に入らないですか？")).toBeTruthy();
    expect(screen.getByRole("button", { name: "最初からやり直す" })).toBeTruthy();

    const historyLength = window.history.length;
    await user.click(screen.getByRole("button", { name: /^わたしのステップ$/ }));
    expect(window.history.length).toBe(historyLength);
  });

  it("supports browser back and forward through question navigation", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp />);

    await user.click(screen.getByRole("button", { name: "今の状況を確認する" }));
    await user.click(screen.getByRole("radio", { name: "北区" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(screen.getByRole("heading", { name: "国籍・地域を教えてください。" })).toBeTruthy();

    window.history.back();
    await waitFor(() => expect(screen.getByRole("heading", { name: "今、東京のどの地域に滞在していますか？" })).toBeTruthy());
    expect(window.location.search).toBe("?screen=check&step=0");

    window.history.forward();
    await waitFor(() => expect(screen.getByRole("heading", { name: "国籍・地域を教えてください。" })).toBeTruthy());
    expect(window.location.search).toBe("?screen=check&step=1");

    expect(screen.queryByRole("button", { name: "わたしのステップ" })).toBeNull();

  });

  it("restores a question from its URL when the prerequisite answer exists", async () => {
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      situation: { ...createInitialSituation(), currentMunicipality: "北区" },
      stayAnswer: "unknown",
      familyAnswers: [],
      answeredSteps: [0],
    }));
    window.history.replaceState(null, "", "/?screen=check&step=1");
    render(<StayBridgeApp />);

    expect(await screen.findByRole("heading", { name: "国籍・地域を教えてください。" })).toBeTruthy();
  });

  it("does not render internal unknown defaults as selected answers", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      situation: { ...createInitialSituation(), currentMunicipality: "Kita", nationality: "MMR" },
      stayAnswer: "unknown",
      familyAnswers: [],
      answeredSteps: [0, 1],
    }));
    window.history.replaceState(null, "", "/?screen=check&step=2");
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
    await user.click(screen.getByRole("checkbox", { name: "いない" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(screen.getByRole("radio", { name: "答えたくない" }).getAttribute("aria-checked")).toBe("false");
    await user.click(screen.getByRole("radio", { name: "家族・知人の家" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    await user.click(screen.getByRole("checkbox", { name: "相談先" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(screen.getByRole("radio", { name: "ほとんど話せない" }).getAttribute("aria-checked")).toBe("false");
  });

  it("requires and restores free text for area and nationality Other answers", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp />);
    await user.click(screen.getByRole("button", { name: "今の状況を確認する" }));

    await user.click(screen.getByRole("radio", { name: "その他" }));
    const areaInput = screen.getByRole("textbox", { name: "滞在している区市町村を教えてください" });
    expect(screen.getByRole("button", { name: "次へ" }).getAttribute("disabled")).not.toBeNull();
    expect(screen.getByText("この内容はWorkers AIには送信されません。", { exact: false })).toBeTruthy();
    await user.type(areaInput, "世田谷区");
    expect(screen.getByRole("button", { name: "次へ" }).getAttribute("disabled")).toBeNull();
    await user.click(screen.getByRole("button", { name: "次へ" }));

    await user.click(screen.getByRole("radio", { name: "その他" }));
    const nationalityInput = screen.getByRole("textbox", { name: "国籍・地域を教えてください" });
    expect(screen.getByRole("button", { name: "次へ" }).getAttribute("disabled")).not.toBeNull();
    await user.type(nationalityInput, "タイ");
    await user.click(screen.getByRole("button", { name: "戻る" }));
    expect((screen.getByRole("textbox", { name: "滞在している区市町村を教えてください" }) as HTMLTextAreaElement).value).toBe("世田谷区");
    await waitFor(() => {
      const restored = parseStoredSession(sessionStorage.getItem("staybridge.session"));
      expect(restored?.situation.currentMunicipalityOther).toBe("世田谷区");
      expect(restored?.situation.nationalityOther).toBe("タイ");
    });
  });

  it("requires and restores free text after selecting Other", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      situation: { ...createInitialSituation(), currentMunicipality: "Kita", nationality: "MMR" },
      stayAnswer: "unknown",
      familyAnswers: [],
      answeredSteps: [0, 1],
    }));
    window.history.replaceState(null, "", "/?screen=check&step=2");
    render(<StayBridgeApp />);

    await user.click(await screen.findByRole("radio", { name: "その他" }));
    const input = screen.getByRole("textbox", { name: "その他の予定を教えてください" });
    expect(screen.getByRole("button", { name: "次へ" }).getAttribute("disabled")).not.toBeNull();
    await user.type(input, "国際会議に参加するため");
    expect(screen.getByRole("button", { name: "次へ" }).getAttribute("disabled")).toBeNull();
    await waitFor(() => expect(parseStoredSession(sessionStorage.getItem("staybridge.session"))?.situation.visitPurposeOther).toBe("国際会議に参加するため"));

    await user.click(screen.getByRole("button", { name: "戻る" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(screen.getByRole("radio", { name: "その他" }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByRole("textbox", { name: "その他の予定を教えてください" }) as HTMLTextAreaElement).value).toBe("国際会議に参加するため");
  });

  it("requires free text when Other family is selected", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: [],
      answeredSteps: [0, 1, 2, 3, 4, 5],
    }));
    window.history.replaceState(null, "", "/?screen=check&step=6");
    render(<StayBridgeApp />);

    await user.click(await screen.findByRole("checkbox", { name: "その他家族がいる" }));
    const familyInput = screen.getByRole("textbox", { name: "一緒にいる家族について教えてください" });
    expect(screen.getByRole("button", { name: "次へ" }).getAttribute("disabled")).not.toBeNull();
    await user.type(familyInput, "親");
    expect(screen.getByRole("button", { name: "次へ" }).getAttribute("disabled")).toBeNull();
    await waitFor(() => expect(parseStoredSession(sessionStorage.getItem("staybridge.session"))?.situation.familyOther).toBe("親"));
  });

  it("uses validated Workers AI card ids and sends only the Other text", async () => {
    const user = userEvent.setup();
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      actionIds: ["CHECK_LIVING_COST_SUPPORT", "NOT_ALLOWED"],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", request);
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      situation: { ...demoSituation, visitPurpose: "other", visitPurposeOther: "家族の生活費を手伝うため" },
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    window.history.replaceState({ staybridge: { screen: "check", step: 9 } }, "", "/?screen=check&step=9");
    render(<StayBridgeApp />);

    await user.click(await screen.findByRole("button", { name: "状況を整理する" }));
    await screen.findByRole("heading", { name: "今の状況を整理しました" }, { timeout: 1200 });
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[0]).toBe("/api/recommend-actions");
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({ text: "家族の生活費を手伝うため" });
    await user.click(screen.getByRole("button", { name: "次のステップを見る" }));
    expect(await screen.findByRole("heading", { name: "当面の生活費について相談する" })).toBeTruthy();
    expect(screen.queryByText("NOT_ALLOWED")).toBeNull();
  });

  it("clears stale Workers AI cards when Question 3 is edited", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      situation: { ...demoSituation, visitPurpose: "other", visitPurposeOther: "生活費を手伝うため" },
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
      recommendedActionIds: ["CHECK_LIVING_COST_SUPPORT"],
    }));
    window.history.replaceState(null, "", "/?screen=check&step=2");
    render(<StayBridgeApp />);

    await user.click(await screen.findByRole("radio", { name: "旅行" }));
    await waitFor(() => expect(parseStoredSession(sessionStorage.getItem("staybridge.session"))?.recommendedActionIds).toEqual([]));

    cleanup();
    window.history.replaceState(null, "", "/?screen=roadmap");
    render(<StayBridgeApp />);
    expect(await screen.findByRole("heading", { name: "あなたの次のステップ" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "当面の生活費について相談する" })).toBeNull();
  });

  it("falls back to rule cards when Workers AI is unavailable", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")));
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      situation: { ...demoSituation, visitPurpose: "other", visitPurposeOther: "イベントに参加するため" },
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    window.history.replaceState({ staybridge: { screen: "check", step: 9 } }, "", "/?screen=check&step=9");
    render(<StayBridgeApp />);

    await user.click(await screen.findByRole("button", { name: "状況を整理する" }));
    await screen.findByRole("heading", { name: "今の状況を整理しました" }, { timeout: 1200 });
    await user.click(screen.getByRole("button", { name: "次のステップを見る" }));
    expect(await screen.findByRole("heading", { name: "日本に滞在できる期間を確認する" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "当面の生活費について相談する" })).toBeNull();
  });

  it("does not re-enter the previous assessment flow from history after start over", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp />);

    await user.click(screen.getByRole("button", { name: "今の状況を確認する" }));
    await user.click(screen.getByRole("radio", { name: "北区" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    const staleQuestionState = window.history.state;
    await user.click(screen.getByRole("button", { name: "最初からやり直す" }));
    window.history.replaceState(staleQuestionState, "", "/?screen=check&step=1");
    window.dispatchEvent(new PopStateEvent("popstate", { state: staleQuestionState }));

    await waitFor(() => expect(screen.getByRole("button", { name: "今の状況を確認する" })).toBeTruthy());
    expect(window.location.search).toBe("");
    expect(sessionStorage.getItem("staybridge.session")).toBeNull();

    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    window.history.replaceState(staleQuestionState, "", "/?screen=check&step=0");
    window.dispatchEvent(new PopStateEvent("popstate", { state: staleQuestionState }));
    expect(back).toHaveBeenCalledOnce();
    expect(window.location.search).toBe("");
    back.mockRestore();
  });

  it("keeps the consultation preparation card without the supplementary introduction", async () => {
    const user = userEvent.setup();
    restoreCompleteDemoSession();
    render(<StayBridgeApp />);

    await screen.findByRole("button", { name: "わたしのステップ" });
    await user.click(screen.getByRole("button", { name: "相談先" }));

    expect(screen.getByRole("heading", { name: "人に相談する" })).toBeTruthy();
    expect(screen.getAllByText(/OFFICIAL SUPPORT/)).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "相談前に準備すること" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /相談内容をまとめる/ })).toBeTruthy();
    expect(screen.queryByText(/この内容は、あなたの滞在状況によって手続が変わる/)).toBeNull();

    await user.click(screen.getByRole("button", { name: /相談内容をまとめる/ }));
    expect(screen.getByRole("heading", { name: "相談員に見せるサマリー" })).toBeTruthy();
  });

  it("shows no Kita resources before a municipality is selected", async () => {
    const user = userEvent.setup();
    restoreCompleteEmptySession();
    render(<StayBridgeApp />);

    await screen.findByRole("button", { name: "わたしのステップ" });
    await user.click(screen.getByRole("button", { name: "近くの支援" }));
    expect(screen.getByText(/詳細な地域データに対応していません/)).toBeTruthy();
    expect(screen.queryByText("豊川小学校")).toBeNull();
  });

  it("shows a brief loading state before opening the completed assessment", async () => {
    const user = userEvent.setup();
    restoreCompleteDemoSession();
    window.history.replaceState({ staybridge: { screen: "check", step: 9 } }, "", "/");
    render(<StayBridgeApp />);

    const finish = await screen.findByRole("button", { name: "状況を整理する" });
    await waitFor(() => expect(finish.getAttribute("disabled")).toBeNull());
    await user.click(finish);

    expect(screen.getByRole("status").textContent).toContain("次のステップを準備しています");
    expect(screen.queryByRole("button", { name: "わたしのステップ" })).toBeNull();
    expect(screen.getByRole("button", { name: "StayBridge Tokyo home" }).getAttribute("disabled")).not.toBeNull();
    expect(await screen.findByRole("heading", { name: "今の状況を整理しました" }, { timeout: 1200 })).toBeTruthy();
  });

  it("cancels result preparation when browser back leaves the final question", async () => {
    const user = userEvent.setup();
    restoreCompleteDemoSession();
    window.history.replaceState({ staybridge: { screen: "check", step: 9 } }, "", "/?screen=check&step=9");
    render(<StayBridgeApp />);

    const finish = await screen.findByRole("button", { name: "状況を整理する" });
    await user.click(finish);
    expect(screen.getByRole("status")).toBeTruthy();

    window.history.replaceState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    await new Promise((resolve) => window.setTimeout(resolve, 750));

    expect(screen.queryByRole("heading", { name: "今の状況を整理しました" })).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("restores a non-empty consultation date from history", async () => {
    restoreCompleteDemoSession();
    window.history.replaceState({ staybridge: { screen: "summary", step: 0 } }, "", "/?screen=summary");
    render(<StayBridgeApp />);

    expect(await screen.findByRole("heading", { name: "相談員に見せるサマリー" })).toBeTruthy();
    expect(document.querySelector(".summary-sheet time")?.textContent).not.toBe("");
  });

  it("restores the selected local category from a direct URL", async () => {
    restoreCompleteDemoSession();
    window.history.replaceState(null, "", "/?screen=local&filter=medical");
    render(<StayBridgeApp />);

    expect((await screen.findByRole("tab", { name: "医療" })).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("おうじキッズクリニック")).toBeTruthy();
    expect(screen.queryByText("豊川小学校")).toBeNull();
  });

  it("restores the locale and all persisted form state safely", async () => {
    localStorage.setItem("staybridge.locale", "en");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      situation: demoSituation,
      stayAnswer: "documents",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    window.history.replaceState({ staybridge: { screen: "check", step: 0 } }, "", "/?screen=check&step=0");
    const user = userEvent.setup();
    render(<StayBridgeApp />);

    expect((await screen.findByRole("radio", { name: /Kita City/ })).getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByRole("radio", { name: /Myanmar/ }).getAttribute("aria-checked")).toBe("true");
    for (let index = 0; index < 4; index += 1) await user.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByRole("radio", { name: /I want to check my documents/ }).getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByRole("checkbox", { name: /A child is with me/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("translates the landing-page action without leaving the Japanese copy", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp />);
    await user.selectOptions(screen.getByRole("combobox"), "en");
    expect(screen.getByRole("button", { name: "Check my situation" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "今の状況を確認する" })).toBeNull();
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
    restoreCompleteDemoSession();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error("denied")) },
    });
    render(<StayBridgeApp />);

    await screen.findByRole("button", { name: "相談先" });
    await user.click(screen.getByRole("button", { name: "相談先" }));
    await user.click(screen.getByRole("button", { name: /相談内容をまとめる/ }));
    await user.click(screen.getByRole("button", { name: /コピーする/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("コピーできませんでした");
  });

  it("shows every official source for a multi-source action and deduplicates support desks", async () => {
    const user = userEvent.setup();
    restoreCompleteDemoSession();
    render(<StayBridgeApp />);
    await openCompletedRoadmap(user);

    const workAction = (await screen.findByRole("heading", { name: "働ける条件を先に確認する" })).closest("article");
    expect(workAction).not.toBeNull();
    expect(within(workAction!).getAllByRole("link")).toHaveLength(2);
    expect(within(workAction!).getAllByText(/確認日:/)).toHaveLength(2);
    expect(screen.queryByText("重要な順に並べました。すべてを今日終える必要はありません。")).toBeNull();
    expect(screen.queryByText("この地域で確認できる場所")).toBeNull();
    expect(screen.queryByText("人に相談する")).toBeNull();

    await user.click(screen.getByRole("button", { name: "相談先" }));
    await waitFor(() => expect(screen.getAllByText(/OFFICIAL SUPPORT/)).toHaveLength(2));
  });

  it("routes consultation actions to people and local actions to their exact category", async () => {
    const user = userEvent.setup();
    restoreCompleteDemoSession();
    render(<StayBridgeApp />);
    await openCompletedRoadmap(user);

    const accommodationAction = (await screen.findByRole("heading", { name: "今後の滞在場所を整理する" })).closest("article");
    await user.click(within(accommodationAction!).getByRole("button", { name: /生活相談先を見る/ }));
    expect(screen.getByRole("heading", { name: "人に相談する" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));
    const schoolAction = screen.getByRole("heading", { name: "子どもの教育について相談する" }).closest("article");
    await user.click(within(schoolAction!).getByRole("button", { name: /近くの学校を見る/ }));
    const schoolHistoryState = window.history.state;
    const schoolHistoryUrl = `${window.location.pathname}${window.location.search}`;
    expect(window.location.search).toBe("?screen=local&filter=school");
    expect(screen.getByRole("tab", { name: "学校・教育" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("豊川小学校")).toBeTruthy();
    expect(screen.queryByText("おうじキッズクリニック")).toBeNull();

    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));
    const medicalAction = screen.getByRole("heading", { name: "医療を受けられる場所を確認する" }).closest("article");
    await user.click(within(medicalAction!).getByRole("button", { name: /近くの医療機関を見る/ }));
    expect(screen.getByRole("tab", { name: "医療" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("おうじキッズクリニック")).toBeTruthy();
    expect(screen.queryByText("豊川小学校")).toBeNull();

    window.history.replaceState(schoolHistoryState, "", schoolHistoryUrl);
    window.dispatchEvent(new PopStateEvent("popstate", { state: schoolHistoryState }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "学校・教育" }).getAttribute("aria-selected")).toBe("true"));
    expect(screen.getByText("豊川小学校")).toBeTruthy();
    expect(screen.queryByText("おうじキッズクリニック")).toBeNull();
  });

  it("renders restored stay and family answers in the consultation summary", async () => {
    const user = userEvent.setup();
    localStorage.setItem("staybridge.locale", "en");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      situation: { ...demoSituation, knownStayDeadline: undefined, stayDeadlineKnown: false, familyMembers: { children: [] } },
      stayAnswer: "documents",
      familyAnswers: ["spouse"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    render(<StayBridgeApp />);

    await screen.findByRole("button", { name: "Get help" });
    await user.click(screen.getByRole("button", { name: "Get help" }));
    await user.click(screen.getByRole("button", { name: /Create consultation summary/ }));
    expect(screen.getByText("I want to check my documents")).toBeTruthy();
    expect(screen.getByText("My spouse is with me")).toBeTruthy();
    expect(screen.queryByText("No")).toBeNull();
  });

  it("keeps spouse and child answers together across roadmap and summary", async () => {
    const user = userEvent.setup();
    localStorage.setItem("staybridge.locale", "en");
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

  it("shows source dates in Local Action without supplementary navigation", async () => {
    const user = userEvent.setup();
    restoreCompleteDemoSession();
    render(<StayBridgeApp />);
    await openCompletedRoadmap(user);
    await screen.findByRole("heading", { name: "今後の滞在場所を整理する" });
    await user.click(screen.getByRole("button", { name: "近くの支援" }));

    expect(screen.queryByText(/あなたの状況に関係する公共資源を、公開データから表示しています/)).toBeNull();
    expect(screen.queryByText(/正確な位置情報を使わず/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^ステップへ戻る$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /相談先へ進む/ })).toBeNull();
    const schoolCard = screen.getByRole("heading", { name: "豊川小学校" }).closest("article");
    expect(within(schoolCard!).getByText("データ更新: 公開日不明")).toBeTruthy();
    expect(within(schoolCard!).getByText("確認日: 2026-08-14")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "相談先" }));
    expect(screen.getByRole("heading", { name: "人に相談する" })).toBeTruthy();
  });

  it("leaves the previous assessment flow with one real browser back after start over", async () => {
    const user = userEvent.setup();
    restoreCompleteDemoSession();
    render(<StayBridgeApp />);

    await screen.findByRole("button", { name: "わたしのステップ" });
    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));
    await user.click(screen.getByRole("button", { name: "最初からやり直す" }));
    expect(screen.getByRole("heading", { name: "今、東京のどの地域に滞在していますか？" })).toBeTruthy();

    window.history.back();
    await waitFor(() => expect(screen.getByRole("button", { name: "今の状況を確認する" })).toBeTruthy());
    expect(window.location.search).toBe("");
  });
});
