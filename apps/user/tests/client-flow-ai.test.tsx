// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StayBridgeApp } from "../src/components/StayBridgeApp";
import { demoSituation } from "@staybridge/domain/demo";
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

function restoreQ3OtherSession(actionIds: Array<"CHECK_LIVING_COST_SUPPORT"> = []) {
  const input = "国際会議へ参加するため";
  sessionStorage.setItem("staybridge.session", serializeStoredSession({
    provenance: "user",
    situation: { ...demoSituation, visitPurpose: "other" },
    stayAnswer: "unknown",
    familyAnswers: ["children"],
    answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    otherAnswers: { area: "", nationality: "", visitPurpose: input, family: "", accommodation: "", needs: "" },
    aiRecommendation: actionIds.length ? { input, actionIds } : null,
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

describe("StayBridge client flow: ai", () => {
  it("collects a searched ward plus Q2/Q3/Q7 Other text, sends only Q3, and unions an allowlisted AI card", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      actionIds: ["CHECK_MEDICAL_OPTIONS", "CONTACT_OFFICIAL_SUPPORT"],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-24" />);

    await user.click(screen.getAllByRole("button", { name: "フォームに回答する" }).at(-1)!);
    fireEvent.change(await screen.findByRole("combobox", { name: "東京23区から選択" }), { target: { value: "世田谷区" } });
    await user.click(screen.getByRole("button", { name: "次へ" }));

    await user.click(screen.getByRole("button", { name: "その他" }));
    await user.type(screen.getByRole("textbox", { name: "国籍または地域を入力" }), "タイ");
    await user.click(screen.getByRole("button", { name: "次へ" }));

    await user.click(screen.getByRole("radio", { name: "その他" }));
    const q3 = screen.getByRole("textbox", { name: "その他の来日目的を入力" }) as HTMLTextAreaElement;
    expect(q3.maxLength).toBe(300);
    expect(screen.queryByText(/この内容のみ Cloudflare Workers AI へ送信します/)).toBeNull();
    expect(screen.queryByText("0 / 300")).toBeNull();
    expect(screen.queryByText("「その他」を選んだ場合は入力が必要です。")).toBeNull();
    expect((screen.getByRole("button", { name: "次へ" }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(q3, "医療に関する国際会議へ参加するため");
    await user.click(screen.getByRole("button", { name: "次へ" }));

    for (const answer of ["3か月以内", "帰国できる", "分からない"] as const) {
      await user.click(screen.getByRole("radio", { name: answer }));
      await user.click(screen.getByRole("button", { name: "次へ" }));
    }
    await user.click(screen.getByRole("checkbox", { name: "その他家族がいる" }));
    const q7 = screen.getByRole("textbox", { name: "一緒にいるその他の家族を入力" }) as HTMLTextAreaElement;
    expect(q7.maxLength).toBe(100);
    await user.type(q7, "親");
    await user.click(screen.getByRole("button", { name: "次へ" }));
    await user.click(screen.getByRole("radio", { name: "賃貸住宅" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    await user.click(screen.getByRole("checkbox", { name: "相談先" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    await user.click(screen.getByRole("radio", { name: "日常会話ができる" }));
    await user.click(screen.getByRole("button", { name: "状況を整理する" }));

    expect(await screen.findByRole("heading", { name: "回答を確認して、次の行動へ進みましょう" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/recommend-actions");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ text: "医療に関する国際会議へ参加するため" });
    expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain("世田谷区");
    expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain("タイ");
    expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain("親");
    for (const summaryText of ["地域: 世田谷区", "国籍・地域: タイ", "その他: 医療に関する国際会議へ参加するため", "その他家族がいる: 親"]) {
      expect(screen.getByText(summaryText)).toBeTruthy();
    }

    await user.click(screen.getByRole("button", { name: /次のステップを見る/ }));
    // Setagaya currently has no normalized local-resource coverage, so the AI-suggested medical card is filtered.
    expect(screen.queryByRole("heading", { name: "医療を受けられる場所を確認する" })).toBeNull();
    expect(screen.getAllByRole("heading", { name: "専門の相談窓口へ相談する" }).length).toBeGreaterThanOrEqual(1);
    const stored = JSON.parse(sessionStorage.getItem("staybridge.session") ?? "{}") as Record<string, unknown>;
    expect(stored).toMatchObject({
      version: 5,
      otherAnswers: { area: "", nationality: "タイ", visitPurpose: "医療に関する国際会議へ参加するため", family: "親", accommodation: "", needs: "" },
      aiRecommendation: { input: "医療に関する国際会議へ参加するため", actionIds: ["CHECK_MEDICAL_OPTIONS", "CONTACT_OFFICIAL_SUPPORT"] },
    });
  });

  it.each([
    ["request failure", new Response(JSON.stringify({ error: "AI_REQUEST_FAILED" }), { status: 502, headers: { "content-type": "application/json" } })],
    ["invalid client payload", new Response(JSON.stringify({ actionIds: ["NOT_ALLOWED"] }), { status: 200, headers: { "content-type": "application/json" } })],
  ] as const)("falls back to Rule Engine cards after %s", async (_label, response) => {
    navigation.reset("/ja/check?step=9");
    restoreQ3OtherSession();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response));
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-24" />);

    await user.click(await screen.findByRole("button", { name: "状況を整理する" }));
    expect(await screen.findByRole("heading", { name: "回答を確認して、次の行動へ進みましょう" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /次のステップを見る/ }));
    expect(screen.getByRole("heading", { name: "専門の相談窓口へ相談する" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "当面の生活費について相談する" })).toBeNull();
    expect(JSON.parse(sessionStorage.getItem("staybridge.session") ?? "{}")).toMatchObject({ aiRecommendation: null });
  });

  it("aborts a pending recommendation when leaving the final question and ignores the late result", async () => {
    navigation.reset("/ja/check?step=9");
    restoreQ3OtherSession();
    let releaseFetch: ((response: Response) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(
      () => new Promise<Response>((resolve) => { releaseFetch = resolve; }),
    ));
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-24" />);

    await user.click(await screen.findByRole("button", { name: "状況を整理する" }));
    expect(screen.getByRole("button", { name: "次のステップを準備しています" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /戻る/ }));
    expect(navigation.path()).toBe("/ja/check?step=8");

    releaseFetch?.(new Response(JSON.stringify({ actionIds: ["CHECK_LIVING_COST_SUPPORT"] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    await waitFor(() => expect(navigation.path()).toBe("/ja/check?step=8"));
    expect(JSON.parse(sessionStorage.getItem("staybridge.session") ?? "{}")).toMatchObject({ aiRecommendation: null });
  });

  it("falls back to Rule Engine-only cards when the client timeout reaches eight seconds", async () => {
    vi.useFakeTimers();
    navigation.reset("/ja/check?step=9");
    restoreQ3OtherSession(["CHECK_LIVING_COST_SUPPORT"]);
    let capturedSignal: AbortSignal | undefined;
    let releaseFetch: ((response: Response) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise<Response>((resolve) => { releaseFetch = resolve; });
    }));
    render(<StayBridgeApp assessmentDate="2026-08-24" />);

    fireEvent.click(screen.getByRole("button", { name: "状況を整理する" }));
    expect(screen.getByRole("button", { name: "次のステップを準備しています" })).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_999);
    });
    expect(navigation.path()).toBe("/ja/check?step=9");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(capturedSignal?.aborted).toBe(true);
    expect(navigation.path()).toBe("/ja/status");
    expect(JSON.parse(sessionStorage.getItem("staybridge.session") ?? "{}")).toMatchObject({ aiRecommendation: null });
    await act(async () => {
      releaseFetch?.(new Response(JSON.stringify({ actionIds: ["CHECK_LIVING_COST_SUPPORT"] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
      await Promise.resolve();
    });
    expect(navigation.path()).toBe("/ja/status");
    expect(JSON.parse(sessionStorage.getItem("staybridge.session") ?? "{}")).toMatchObject({ aiRecommendation: null });
    fireEvent.click(screen.getByRole("button", { name: /次のステップを見る/ }));
    expect(screen.getByRole("heading", { name: "専門の相談窓口へ相談する" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "当面の生活費について相談する" })).toBeNull();
  });

  it("ignores a delayed result after unmount and reloads without AI-derived cards", async () => {
    navigation.reset("/ja/check?step=9");
    restoreQ3OtherSession(["CHECK_LIVING_COST_SUPPORT"]);
    let capturedSignal: AbortSignal | undefined;
    let releaseFetch: ((response: Response) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise<Response>((resolve) => { releaseFetch = resolve; });
    }));
    const firstRender = render(<StayBridgeApp assessmentDate="2026-08-24" />);

    fireEvent.click(screen.getByRole("button", { name: "状況を整理する" }));
    expect(JSON.parse(sessionStorage.getItem("staybridge.session") ?? "{}")).toMatchObject({ aiRecommendation: null });
    firstRender.unmount();
    expect(capturedSignal?.aborted).toBe(true);
    await act(async () => {
      releaseFetch?.(new Response(JSON.stringify({ actionIds: ["CHECK_LIVING_COST_SUPPORT"] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
      await Promise.resolve();
    });

    expect(JSON.parse(sessionStorage.getItem("staybridge.session") ?? "{}")).toMatchObject({ aiRecommendation: null });
    navigation.reset("/ja/roadmap");
    render(<StayBridgeApp assessmentDate="2026-08-24" />);
    expect(screen.getByRole("heading", { name: "あなたの次のステップ" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "当面の生活費について相談する" })).toBeNull();
  });

  it("ignores a delayed result after restart and does not recreate the cleared session", async () => {
    navigation.reset("/ja/check?step=9");
    restoreQ3OtherSession(["CHECK_LIVING_COST_SUPPORT"]);
    let capturedSignal: AbortSignal | undefined;
    let releaseFetch: ((response: Response) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise<Response>((resolve) => { releaseFetch = resolve; });
    }));
    const firstRender = render(<StayBridgeApp assessmentDate="2026-08-24" />);

    fireEvent.click(screen.getByRole("button", { name: "状況を整理する" }));
    fireEvent.click(screen.getByRole("button", { name: /最初からやり直す/ }));
    expect(capturedSignal?.aborted).toBe(true);
    expect(navigation.path()).toBe("/ja/check?step=0");
    expect(sessionStorage.getItem("staybridge.session")).toBeNull();
    await act(async () => {
      releaseFetch?.(new Response(JSON.stringify({ actionIds: ["CHECK_LIVING_COST_SUPPORT"] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
      await Promise.resolve();
    });

    expect(sessionStorage.getItem("staybridge.session")).toBeNull();
    expect(screen.queryByRole("heading", { name: "当面の生活費について相談する" })).toBeNull();
    firstRender.unmount();
    navigation.reset("/ja/roadmap");
    render(<StayBridgeApp assessmentDate="2026-08-24" />);
    expect(navigation.path()).toBe("/ja/check?step=0");
    expect(screen.getByRole("heading", { name: "東京のどの地域に滞在していますか？" })).toBeTruthy();
  });

  it("invalidates restored AI cards as soon as Q3 text changes", async () => {
    restoreQ3OtherSession(["CHECK_LIVING_COST_SUPPORT"]);
    navigation.reset("/ja/roadmap");
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-24" />);

    expect(await screen.findByRole("heading", { name: "当面の生活費について相談する" })).toBeTruthy();
    navigation.reset("/ja/check?step=2");
    const q3 = await screen.findByRole("textbox", { name: "その他の来日目的を入力" });
    await user.clear(q3);
    await user.type(q3, "別のイベントへ参加するため");
    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));

    expect(await screen.findByRole("heading", { name: "あなたの次のステップ" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "当面の生活費について相談する" })).toBeNull();
    expect(JSON.parse(sessionStorage.getItem("staybridge.session") ?? "{}")).toMatchObject({ aiRecommendation: null });
  });

  it("uses AI to organize a question without sending saved assessment answers", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      reply: "窓口では、滞在について確認したいことを最初に伝えてください。",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    restoreCompleteDemoSession();
    navigation.reset("/ja/roadmap");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(await screen.findByRole("heading", { name: "AI相談アシスタント" })).toBeTruthy();
    expect(screen.getByText(/状況確認の回答は自動送信されません/)).toBeTruthy();
    const input = screen.getByRole("textbox", { name: "相談したいこと" });
    await user.type(input, "窓口で何を聞けばいいですか？");
    await user.click(screen.getByRole("button", { name: "送る" }));

    expect(await screen.findByText("窓口では、滞在について確認したいことを最初に伝えてください。")).toBeTruthy();
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      locale: "ja",
      messages: [{ role: "user", content: "窓口で何を聞けばいいですか？" }],
    });
    expect(String(request.body)).not.toContain(demoSituation.knownStayDeadline);
    expect(String(request.body)).not.toContain(demoSituation.nationality);

    await user.click(screen.getByRole("button", { name: "会話を消去" }));
    expect(screen.queryByText("窓口では、滞在について確認したいことを最初に伝えてください。")).toBeNull();
    expect(screen.getByRole("button", { name: "近くの支援" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "相談先" })).toBeTruthy();
  });

  it("keeps a user-first alternating history on the fifth AI question", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const payload = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const question = payload.messages.at(-1)?.content ?? "";
      return new Response(JSON.stringify({ reply: question.replace("質問", "回答") }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    restoreCompleteDemoSession();
    navigation.reset("/ja/roadmap");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    const input = await screen.findByRole("textbox", { name: "相談したいこと" });
    for (let turn = 1; turn <= 5; turn += 1) {
      await user.type(input, `質問${turn}`);
      await user.click(screen.getByRole("button", { name: "送る" }));
      expect(await screen.findByText(`回答${turn}`)).toBeTruthy();
    }

    const [, fifthRequest] = fetchMock.mock.calls[4] as [string, RequestInit];
    const fifthPayload = JSON.parse(String(fifthRequest.body)) as { messages: Array<{ role: string; content: string }> };
    expect(fifthPayload.messages).toHaveLength(7);
    expect(fifthPayload.messages.map(({ role }) => role)).toEqual(["user", "assistant", "user", "assistant", "user", "assistant", "user"]);
    expect(fifthPayload.messages[0].content).toBe("質問2");
    expect(fifthPayload.messages.at(-1)?.content).toBe("質問5");
  });

  it("does not send unfinished IME input and shows a retryable failure", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    restoreCompleteDemoSession();
    navigation.reset("/ja/roadmap");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    const input = await screen.findByRole("textbox", { name: "相談したいこと" });
    await user.type(input, "在留資格について");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "送る" }));
    expect((await screen.findByRole("alert")).textContent).toContain("AI案内を利用できません");
    expect((input as HTMLTextAreaElement).value).toBe("在留資格について");
  });
});
