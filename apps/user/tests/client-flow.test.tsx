// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

function verifiedAssistantResponse(id: string, token: string) {
  return new Response(JSON.stringify({ ok: true, data: {
    answer: "北区の公開済み避難所を確認してください。", sourceIds: ["KITA_EARTHQUAKE_SHELTERS"], uncertainty: "開設状況を確認してください。", actionIds: ["CONTACT_OFFICIAL_SUPPORT"],
    sources: [{ id: "KITA_EARTHQUAKE_SHELTERS", officialUrl: "https://www.city.kita.lg.jp/safety/", dataUpdatedAt: "2025-09-01", fetchedAt: "2026-08-23T00:00:00.000Z", coverageNote: "発災時の開設は確認が必要です。" }],
    conversation: { id, deletionToken: token },
  } }), { headers: { "content-type": "application/json" } });
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
  it("renders the verified assistant in each locale and keeps IME Enter from sending", async () => {
    for (const locale of selectableUserLocales) {
      navigation.reset(`/${locale}/roadmap`);
      restoreCompleteUserSession();
      const fetchMock = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetchMock);
      const view = render(<StayBridgeApp />);
      expect(await screen.findByRole("heading", { name: /確認済み情報アシスタント|Verified information assistant|အတည်ပြုအချက်အလက်/ })).toBeTruthy();
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "避難所を確認したい" } });
      fireEvent.keyDown(input, { key: "Enter", isComposing: true });
      expect(fetchMock).not.toHaveBeenCalled();
      view.unmount();
      sessionStorage.clear();
    }
  });

  it("renders cited assistant fallback without requesting conversation persistence by default", async () => {
    navigation.reset("/ja/roadmap");
    restoreCompleteUserSession();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: {
      answer: "北区の公開済み避難所を確認してください。", sourceIds: ["KITA_EARTHQUAKE_SHELTERS"], uncertainty: "開設状況を確認してください。", actionIds: ["CONTACT_OFFICIAL_SUPPORT"],
      sources: [{ id: "KITA_EARTHQUAKE_SHELTERS", officialUrl: "https://www.city.kita.lg.jp/safety/", dataUpdatedAt: "2025-09-01", fetchedAt: "2026-08-23T00:00:00.000Z", coverageNote: "発災時の開設は確認が必要です。" }],
    } }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StayBridgeApp />);
    const input = await screen.findByRole("textbox");
    await user.type(input, "避難所を確認したい");
    await user.click(screen.getByRole("button", { name: "質問する" }));
    expect(await screen.findByText("北区の公開済み避難所を確認してください。")).toBeTruthy();
    expect(screen.getByRole("link", { name: "KITA_EARTHQUAKE_SHELTERS" }).getAttribute("href")).toBe("https://www.city.kita.lg.jp/safety/");
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("conversation");
  });

  it("retains both Q1 and Q2 conversation credentials and deletes every saved record", async () => {
    navigation.reset("/ja/roadmap");
    restoreCompleteUserSession();
    const token1 = "A".repeat(43);
    const token2 = "B".repeat(43);
    const id1 = "con_11111111-1111-4111-8111-111111111111";
    const id2 = "con_22222222-2222-4222-8222-222222222222";
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(verifiedAssistantResponse(id1, token1))
      .mockResolvedValueOnce(verifiedAssistantResponse(id2, token2))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { deleted: true } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { deleted: true } })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StayBridgeApp />);
    await user.click(await screen.findByRole("button", { name: "会話保存への同意を設定" }));
    const input = screen.getByRole("textbox");
    await user.type(input, "Q1");
    await user.click(screen.getByRole("button", { name: "質問する" }));
    await user.type(input, "Q2");
    await user.click(screen.getByRole("button", { name: "質問する" }));
    expect(await screen.findByText("保存済み会話: 2")).toBeTruthy();
    expect(JSON.parse(sessionStorage.getItem("staybridge.saved-conversation-credentials") ?? "null")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "保存済み会話をすべて削除 (2)" }));
    await waitFor(() => expect(screen.queryByText("保存済み会話: 2")).toBeNull());
    expect(fetchMock.mock.calls.slice(2).map(([url]) => url)).toEqual([`/api/conversations/${id1}`, `/api/conversations/${id2}`]);
    expect(sessionStorage.getItem("staybridge.saved-conversation-credentials")).toBeNull();
  });

  it("retains a failed conversation deletion credential while deleting every other record", async () => {
    navigation.reset("/ja/roadmap");
    restoreCompleteUserSession();
    const token1 = "A".repeat(43);
    const token2 = "B".repeat(43);
    const id1 = "con_33333333-3333-4333-8333-333333333333";
    const id2 = "con_44444444-4444-4444-8444-444444444444";
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(verifiedAssistantResponse(id1, token1))
      .mockResolvedValueOnce(verifiedAssistantResponse(id2, token2))
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StayBridgeApp />);
    await user.click(await screen.findByRole("button", { name: "会話保存への同意を設定" }));
    const input = screen.getByRole("textbox");
    await user.type(input, "Q1"); await user.click(screen.getByRole("button", { name: "質問する" }));
    await user.type(input, "Q2"); await user.click(screen.getByRole("button", { name: "質問する" }));
    await user.click(screen.getByRole("button", { name: "保存済み会話をすべて削除 (2)" }));
    expect(await screen.findByText("削除できなかった会話が残っています。もう一度削除できます。")).toBeTruthy();
    expect(screen.getByText("保存済み会話: 1")).toBeTruthy();
    expect(JSON.parse(sessionStorage.getItem("staybridge.saved-conversation-credentials") ?? "null")).toEqual([{ id: id2, deletionToken: token2 }]);
    expect(fetchMock.mock.calls.slice(2).map(([url]) => url)).toEqual([`/api/conversations/${id1}`, `/api/conversations/${id2}`]);
  });

  it("migrates the legacy single conversation credential to the retained-record array", async () => {
    navigation.reset("/ja/roadmap");
    restoreCompleteUserSession();
    const legacy = { id: "con_55555555-5555-4555-8555-555555555555", deletionToken: "C".repeat(43) };
    sessionStorage.setItem("staybridge.saved-conversation-credentials", JSON.stringify(legacy));
    render(<StayBridgeApp />);
    expect(await screen.findByText("保存済み会話: 1")).toBeTruthy();
    expect(JSON.parse(sessionStorage.getItem("staybridge.saved-conversation-credentials") ?? "null")).toEqual([legacy]);
  });
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
  });

  it("links from the user landing page to the municipality preparedness view", async () => {
    render(<StayBridgeApp />);

    expect(screen.getByRole("link", { name: /行政・支援者向け Preparedness View/ }).getAttribute("href")).toBe("http://localhost:3001");
  });

  it("saves only allowlisted Situation fields after separate explicit consent", async () => {
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      data: { id: "sit_11111111-1111-4111-8111-111111111111", created: true },
    }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StayBridgeApp />);

    await user.click(await screen.findByRole("button", { name: "同意して保存" }));
    expect(await screen.findByRole("heading", { name: "削除に必要な情報" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0];
    expect(request[0]).toBe("/api/situation-submissions");
    const options = request[1] as RequestInit;
    const body = JSON.parse(String(options.body)) as Record<string, unknown>;
    const answers = body.answers as Record<string, unknown>;
    expect(answers.municipalityCode).toBe("13117");
    expect(answers).not.toHaveProperty("nationality");
    expect(answers).not.toHaveProperty("knownStayDeadline");
    expect(answers).not.toHaveProperty("stayDeadlineKnown");
    expect(answers).not.toHaveProperty("visitPurposeOther");
    expect(String(body.deletionToken)).toHaveLength(43);
    expect(sessionStorage.getItem("staybridge.saved-situation-credentials")).toContain("sit_11111111");
  });

  it("never saves the public demo fixture as support-need input", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StayBridgeApp />);

    await user.click(screen.getByRole("button", { name: "デモの状況を読み込む" }));
    const saveButton = await screen.findByRole("button", { name: "同意して保存" });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/デモ回答は支援ニーズデータへ保存できません/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem("staybridge.session") ?? "{}")).toMatchObject({ version: 3, provenance: "demo" });

    navigation.reset("/ja/check?step=0");
    await waitFor(() => expect(navigation.path()).toBe("/ja/status"));
    expect(JSON.parse(sessionStorage.getItem("staybridge.session") ?? "{}")).toMatchObject({ version: 3, provenance: "demo" });
    expect((screen.getByRole("button", { name: "同意して保存" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("requires a full re-answer before saving a legacy session without provenance", async () => {
    navigation.reset("/ja/status");
    sessionStorage.setItem("staybridge.session", JSON.stringify({
      version: 2,
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StayBridgeApp />);

    const saveButton = await screen.findByRole("button", { name: "同意して保存" });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "回答を見直す" }));
    expect(navigation.path()).toBe("/ja/check?step=0");
    expect(screen.getByRole("radio", { name: "北区" }).getAttribute("aria-checked")).toBe("false");
    expect((screen.getByRole("button", { name: /次へ/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps an incomplete legacy session on the safe review screen without a redirect loop", async () => {
    navigation.reset("/ja/status");
    sessionStorage.setItem("staybridge.session", JSON.stringify({
      version: 2,
      situation: demoSituation,
      stayAnswer: "unknown",
      familyAnswers: ["children"],
      answeredSteps: [0],
    }));
    render(<StayBridgeApp />);

    expect(await screen.findByRole("heading", { name: "今の状況を整理しました" })).toBeTruthy();
    expect(navigation.path()).toBe("/ja/status");
    expect((screen.getByRole("button", { name: "同意して保存" }) as HTMLButtonElement).disabled).toBe(true);

    navigation.reset("/ja/check?step=0");
    await waitFor(() => expect(navigation.path()).toBe("/ja/status"));
    expect(screen.getByRole("heading", { name: "今の状況を整理しました" })).toBeTruthy();
  });

  it("clears every demo answer before review and enables saving only after a complete real questionnaire", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      data: { id: "sit_77777777-7777-4777-8777-777777777777", created: true },
    }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StayBridgeApp />);

    await user.click(screen.getByRole("button", { name: "デモの状況を読み込む" }));
    await user.click(await screen.findByRole("button", { name: "回答を見直す" }));
    expect(navigation.path()).toBe("/ja/check?step=0");
    expect(sessionStorage.getItem("staybridge.session")).toBeNull();
    expect(screen.getByRole("radio", { name: "北区" }).getAttribute("aria-checked")).toBe("false");
    expect((screen.getByRole("button", { name: /次へ/ }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("radio", { name: "新宿区" }));
    await user.click(screen.getByRole("button", { name: /次へ/ }));
    expect(navigation.path()).toBe("/ja/check?step=1");

    navigation.reset("/ja/status");
    await waitFor(() => expect(navigation.path()).toBe("/ja/check?step=1"));
    expect(screen.queryByRole("button", { name: "同意して保存" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    for (const answer of ["その他", "仕事", "3か月以内", "帰国できる", "書類を確認したい"] as const) {
      await user.click(screen.getByRole("radio", { name: answer }));
      await user.click(screen.getByRole("button", { name: /次へ/ }));
    }
    await user.click(screen.getByRole("checkbox", { name: "いない" }));
    await user.click(screen.getByRole("button", { name: /次へ/ }));
    await user.click(screen.getByRole("radio", { name: "賃貸住宅" }));
    await user.click(screen.getByRole("button", { name: /次へ/ }));
    await user.click(screen.getByRole("checkbox", { name: "相談先" }));
    await user.click(screen.getByRole("button", { name: /次へ/ }));
    await user.click(screen.getByRole("radio", { name: "日常会話ができる" }));
    await user.click(screen.getByRole("button", { name: /状況を整理する/ }));

    const saveButton = await screen.findByRole("button", { name: "同意して保存" });
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);
    await user.click(saveButton);
    await screen.findByRole("heading", { name: "削除に必要な情報" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { answers: { municipalityCode: string } };
    expect(body.answers.municipalityCode).toBe("13104");
  });

  it("keeps the Rule Engine journey working after refusal or save failure", async () => {
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "unavailable" },
    }), { status: 503, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StayBridgeApp />);

    await user.click(await screen.findByRole("button", { name: "同意して保存" }));
    expect(await screen.findByText("保存できませんでした。回答と次の案内は引き続き利用できます。")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /次のステップを見る/ }));
    expect(screen.getByRole("heading", { name: "あなたの次のステップ" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "保存しない" }));
    expect(screen.getByText("保存しない設定です。主要な案内はそのまま利用できます。")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "子どもの教育について相談する" })).toBeTruthy();
  });

  it("deletes a saved Situation record only with its in-memory deletion code", async () => {
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        data: { id: "sit_22222222-2222-4222-8222-222222222222", created: true },
      }), { status: 201, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        data: { deleted: true },
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StayBridgeApp />);

    await user.click(await screen.findByRole("button", { name: "同意して保存" }));
    await user.click(await screen.findByRole("button", { name: "このサーバー記録を削除" }));
    expect(await screen.findByText("サーバー記録を削除しました。")).toBeTruthy();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/situation-submissions/sit_22222222-2222-4222-8222-222222222222");
    const headers = fetchMock.mock.calls[1][1]?.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^Bearer [A-Za-z0-9_-]{43}$/);
    expect(sessionStorage.getItem("staybridge.saved-situation-credentials")).toBeNull();
  });

  it("restores deletion credentials across remounts and blocks answer reset until server deletion", async () => {
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      data: { id: "sit_44444444-4444-4444-8444-444444444444", created: true },
    }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const firstRender = render(<StayBridgeApp />);

    await user.click(await screen.findByRole("button", { name: "同意して保存" }));
    await screen.findByRole("heading", { name: "削除に必要な情報" });
    await user.click(screen.getByRole("button", { name: "回答を見直す" }));
    expect(navigation.path()).toBe("/ja/status");
    await waitFor(() => expect(document.activeElement?.id).toBe("saved-situation-credentials"));

    firstRender.unmount();
    render(<StayBridgeApp />);
    expect(await screen.findByText("sit_44444444-4444-4444-8444-444444444444")).toBeTruthy();
    expect(screen.getByText(/このタブのsessionStorageにも保持/)).toBeTruthy();
  });

  it("restores pending secrets after an ambiguous response and retries without a duplicate", async () => {
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    const fetchMock = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("response lost after request"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        data: { id: "sit_33333333-3333-4333-8333-333333333333", created: false },
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const firstRender = render(<StayBridgeApp />);

    await user.click(await screen.findByRole("button", { name: "同意して保存" }));
    await screen.findByText("保存できませんでした。回答と次の案内は引き続き利用できます。");
    const pendingBeforeReload = sessionStorage.getItem("staybridge.pending-situation-submission");
    expect(pendingBeforeReload).toBeTruthy();
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>;

    firstRender.unmount();
    render(<StayBridgeApp />);
    await screen.findByText("保存できませんでした。回答と次の案内は引き続き利用できます。");
    await user.click(screen.getByRole("button", { name: "同意して保存" }));
    await screen.findByRole("heading", { name: "削除に必要な情報" });

    const retryBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as Record<string, unknown>;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(retryBody.idempotencyKey).toBe(firstBody.idempotencyKey);
    expect(retryBody.deletionToken).toBe(firstBody.deletionToken);
    expect(sessionStorage.getItem("staybridge.pending-situation-submission")).toBeNull();
    expect(sessionStorage.getItem("staybridge.saved-situation-credentials")).toContain("sit_33333333");
  });

  it("guards saved records from direct, Back, Home, and demo state-changing routes", async () => {
    restoreCompleteUserSession();
    sessionStorage.setItem("staybridge.saved-situation-credentials", JSON.stringify({
      id: "sit_55555555-5555-4555-8555-555555555555",
      deletionToken: "A".repeat(43),
    }));
    navigation.reset("/ja/check?step=4");
    const user = userEvent.setup();
    render(<StayBridgeApp />);

    await waitFor(() => expect(navigation.path()).toBe("/ja/status"));
    expect(await screen.findByText("sit_55555555-5555-4555-8555-555555555555")).toBeTruthy();

    navigation.reset("/ja/check?step=0");
    await waitFor(() => expect(navigation.path()).toBe("/ja/status"));
    await user.click(screen.getByRole("button", { name: /ホーム/ }));
    await waitFor(() => expect(navigation.path()).toBe("/ja/status"));
    expect(screen.queryByRole("button", { name: "デモの状況を読み込む" })).toBeNull();

    await user.click(screen.getByRole("button", { name: /次のステップを見る/ }));
    expect(await screen.findByRole("heading", { name: "あなたの次のステップ" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "近くの支援" }));
    await waitFor(() => expect(navigation.path()).toBe("/ja/local?filter=all"));
    await user.click(screen.getByRole("button", { name: "相談先" }));
    await waitFor(() => expect(navigation.path()).toBe("/ja/help"));
  });

  it("treats a 404 deletion retry as completion for the locally held credential", async () => {
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    sessionStorage.setItem("staybridge.saved-situation-credentials", JSON.stringify({
      id: "sit_66666666-6666-4666-8666-666666666666",
      deletionToken: "A".repeat(43),
    }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error: { code: "NOT_FOUND", message: "not found" },
    }), { status: 404, headers: { "content-type": "application/json" } })));
    const user = userEvent.setup();
    render(<StayBridgeApp />);

    await user.click(await screen.findByRole("button", { name: "このサーバー記録を削除" }));
    expect(await screen.findByText("サーバー記録を削除しました。")).toBeTruthy();
    expect(sessionStorage.getItem("staybridge.saved-situation-credentials")).toBeNull();
  });

  it("labels conversation consent as a preference without claiming a saved conversation", async () => {
    navigation.reset("/ja/roadmap");
    restoreCompleteUserSession();
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StayBridgeApp />);

    await user.click(await screen.findByRole("button", { name: "会話保存への同意を設定" }));
    expect(screen.getByText(/AI相談はまだ開始されておらず、会話も保存されていません/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the configured production municipality URL in the landing link", async () => {
    vi.stubEnv("NEXT_PUBLIC_MUNICIPALITY_APP_URL", "https://municipality.staybridge.example/");
    render(<StayBridgeApp />);

    expect(screen.getByRole("link", { name: /行政・支援者向け Preparedness View/ }).getAttribute("href")).toBe("https://municipality.staybridge.example");
  });

  it("offers start over after completed answers and returns to the first question", async () => {
    const user = userEvent.setup();
    restoreCompleteUserSession();
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
    restoreCompleteUserSession();
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
      provenance: "user",
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
      provenance: "user",
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
      provenance: "user",
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

  it("shows every official source for a multi-source action and deduplicates support desks", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp />);
    await user.click(screen.getByRole("button", { name: "デモの状況を読み込む" }));
    await user.click(screen.getByRole("button", { name: /次のステップを見る/ }));

    const workAction = screen.getByRole("heading", { name: "働ける条件を先に確認する" }).closest("article");
    expect(workAction).not.toBeNull();
    expect(within(workAction!).getAllByRole("link")).toHaveLength(2);
    expect(within(workAction!).getAllByText(/確認日:/)).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "相談先" }));
    await waitFor(() => expect(screen.getAllByText(getUserMessages("ja").ui.sectionOfficialSupport)).toHaveLength(2));
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
      provenance: "user",
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
      provenance: "user",
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
      provenance: "user",
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
      "provenance",
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
