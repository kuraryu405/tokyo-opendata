// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

describe("StayBridge client flow", () => {
  it.each(selectableUserLocales)("renders the representative full flow in %s", async (locale) => {
    const messages = getUserMessages(locale);
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

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
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

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
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(screen.getByRole("link", { name: /行政・支援者向けの確認画面/ }).getAttribute("href")).toBe("/crisis");
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
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

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
    expect(JSON.parse(sessionStorage.getItem("staybridge.saved-situation-credentials") ?? "{}")).toMatchObject({
      version: 1,
      id: "sit_11111111-1111-4111-8111-111111111111",
    });
  });

  it("never saves the public demo fixture as support-need input", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

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
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    const saveButton = await screen.findByRole("button", { name: "同意して保存" });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "回答を見直す" }));
    expect(navigation.path()).toBe("/ja/check?step=0");
    expect((screen.getByRole("radio", { name: "北区" }) as HTMLInputElement).checked).toBe(false);
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
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

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
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(screen.getByRole("button", { name: "デモの状況を読み込む" }));
    await user.click(await screen.findByRole("button", { name: "回答を見直す" }));
    expect(navigation.path()).toBe("/ja/check?step=0");
    expect(sessionStorage.getItem("staybridge.session")).toBeNull();
    expect((screen.getByRole("radio", { name: "北区" }) as HTMLInputElement).checked).toBe(false);
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
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

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
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

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
    const firstRender = render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(await screen.findByRole("button", { name: "同意して保存" }));
    await screen.findByRole("heading", { name: "削除に必要な情報" });
    await user.click(screen.getByRole("button", { name: "回答を見直す" }));
    expect(navigation.path()).toBe("/ja/status");
    await waitFor(() => expect(document.activeElement?.id).toBe("saved-situation-credentials"));

    firstRender.unmount();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    expect(await screen.findByText("sit_44444444-4444-4444-8444-444444444444")).toBeTruthy();
    expect(screen.getByText(/このタブのsessionStorageにも保持/)).toBeTruthy();
  });

  it("treats an absent saved-credentials key as unsaved and allows the normal local clear", async () => {
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await screen.findByRole("heading", { name: "Situation Check の回答を保存" });
    await user.click(screen.getByRole("button", { name: "この端末のデータを消す" }));

    expect(navigation.path()).toBe("/ja");
    expect(sessionStorage.getItem("staybridge.session")).toBeNull();
    expect(sessionStorage.getItem("staybridge.saved-situation-credentials")).toBeNull();
  });

  it.each([
    ["malformed JSON", "{"],
    ["wrong id", JSON.stringify({ version: 1, id: "sit_not-valid", deletionToken: "A".repeat(43) })],
    ["wrong token", JSON.stringify({ version: 1, id: "sit_55555555-5555-4555-8555-555555555555", deletionToken: "short" })],
    ["unknown version", JSON.stringify({ version: 2, id: "sit_55555555-5555-4555-8555-555555555555", deletionToken: "A".repeat(43) })],
  ])("fails closed for %s saved credentials until explicit local-only discard", async (_case, storedCredentials) => {
    restoreCompleteUserSession();
    sessionStorage.setItem("staybridge.saved-situation-credentials", storedCredentials);
    navigation.reset("/ja/check?step=4");
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await waitFor(() => expect(navigation.path()).toBe("/ja/status"));
    expect(await screen.findByRole("heading", { name: "削除情報を確認できません" })).toBeTruthy();
    expect(screen.getByText(/サーバー記録が残っている可能性/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /次のステップを見る/ }));
    expect(navigation.path()).toBe("/ja/roadmap");
    await user.click(screen.getByRole("button", { name: "最初からやり直す" }));
    await waitFor(() => expect(navigation.path()).toBe("/ja/status"));
    await user.click(screen.getByRole("button", { name: "回答を見直す" }));
    expect(navigation.path()).toBe("/ja/status");
    await user.click(screen.getByRole("button", { name: "この端末のデータを消す" }));
    expect(navigation.path()).toBe("/ja/status");
    expect(sessionStorage.getItem("staybridge.session")).not.toBeNull();
    expect(sessionStorage.getItem("staybridge.saved-situation-credentials")).toBe(storedCredentials);

    await user.click(screen.getByRole("button", { name: "サーバー記録を残して端末データだけ破棄" }));
    expect(navigation.path()).toBe("/ja");
    expect(sessionStorage.getItem("staybridge.session")).toBeNull();
    expect(sessionStorage.getItem("staybridge.saved-situation-credentials")).toBeNull();
  });

  it("preserves a valid pending retry when corrupt saved credentials are discarded", async () => {
    restoreCompleteUserSession();
    const pendingSecrets = {
      idempotencyKey: "pending-retry-key-1234",
      deletionToken: "A".repeat(43),
    };
    sessionStorage.setItem("staybridge.saved-situation-credentials", "{");
    sessionStorage.setItem("staybridge.pending-situation-submission", JSON.stringify(pendingSecrets));
    navigation.reset("/ja/status");
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(await screen.findByRole("heading", { name: "削除情報を確認できません" })).toBeTruthy();
    expect(screen.getByText(/別の未完了の保存情報も残っています/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "壊れた削除情報だけ破棄" }));

    expect(sessionStorage.getItem("staybridge.saved-situation-credentials")).toBeNull();
    expect(sessionStorage.getItem("staybridge.pending-situation-submission")).toBe(JSON.stringify(pendingSecrets));
    expect(sessionStorage.getItem("staybridge.session")).not.toBeNull();
    expect(await screen.findByText("保存できませんでした。回答と次の案内は引き続き利用できます。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "同意して保存" })).toBeTruthy();
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
    const firstRender = render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(await screen.findByRole("button", { name: "同意して保存" }));
    await screen.findByText("保存できませんでした。回答と次の案内は引き続き利用できます。");
    const pendingBeforeReload = sessionStorage.getItem("staybridge.pending-situation-submission");
    expect(pendingBeforeReload).toBeTruthy();
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>;

    firstRender.unmount();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
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
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await waitFor(() => expect(navigation.path()).toBe("/ja/status"));
    expect(await screen.findByText("sit_55555555-5555-4555-8555-555555555555")).toBeTruthy();
    expect(JSON.parse(sessionStorage.getItem("staybridge.saved-situation-credentials") ?? "{}")).toMatchObject({
      version: 1,
      id: "sit_55555555-5555-4555-8555-555555555555",
    });

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

  it("treats a canonical deletion 404 retry as completion for the locally held credential", async () => {
    navigation.reset("/ja/status");
    restoreCompleteUserSession();
    sessionStorage.setItem("staybridge.saved-situation-credentials", JSON.stringify({
      id: "sit_66666666-6666-4666-8666-666666666666",
      deletionToken: "A".repeat(43),
    }));
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error: { code: "DELETION_NOT_FOUND", message: "No matching record was found." },
    }), { status: 404, headers: { "content-type": "application/json" } })));
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

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
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(await screen.findByRole("button", { name: "会話保存への同意を設定" }));
    expect(screen.getByText(/AI相談はまだ開始されておらず、会話も保存されていません/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not embed a build-time municipality origin in the landing link", async () => {
    vi.stubEnv("NEXT_PUBLIC_MUNICIPALITY_APP_URL", "https://municipality.staybridge.example/");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(screen.getByRole("link", { name: /行政・支援者向けの確認画面/ }).getAttribute("href")).toBe("/crisis");
  });

  it("offers start over after completed answers and returns to the first question", async () => {
    const user = userEvent.setup();
    restoreCompleteDemoSession();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await screen.findByRole("button", { name: "わたしのステップ" });
    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));
    expect(screen.getByRole("button", { name: "最初からやり直す" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "最初からやり直す" }));
    expect(screen.getByRole("heading", { name: "今、東京のどの地域に滞在していますか？" })).toBeTruthy();
    expect((screen.getByRole("radio", { name: "北区" }) as HTMLInputElement).checked).toBe(false);
  });

  it("does not render internal defaults as selected before each single-answer step is answered", async () => {
    const user = userEvent.setup();
    navigation.reset("/ja/check?step=2");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: { ...createInitialSituation(), currentMunicipality: "Kita", nationality: "MMR" },
      stayAnswer: "unknown",
      familyAnswers: [],
      answeredSteps: [0, 1],
    }));
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect((await screen.findByRole("radio", { name: "分からない / 答えたくない" }) as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole("radio", { name: "旅行" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect((screen.getByRole("radio", { name: "分からない" }) as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole("radio", { name: "7日以内" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect((screen.getByRole("radio", { name: "分からない" }) as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole("radio", { name: "帰国できる" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect((screen.getByRole("radio", { name: "分からない" }) as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole("radio", { name: "書類を確認したい" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    const noFamily = screen.getByRole("checkbox", { name: "いない" });
    await user.click(noFamily);
    expect((noFamily as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect((screen.getByRole("radio", { name: "答えたくない" }) as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole("radio", { name: "家族・知人の家" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    const consultationNeed = screen.getByRole("checkbox", { name: "相談先" });
    await user.click(consultationNeed);
    expect((consultationNeed as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect((screen.getByRole("radio", { name: "ほとんど話せない" }) as HTMLInputElement).checked).toBe(false);
  });

  it("keeps completed answers navigable without a landing start button", async () => {
    const user = userEvent.setup();
    restoreCompleteDemoSession();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await screen.findByRole("button", { name: "わたしのステップ" });
    expect(screen.queryByRole("button", { name: "今の状況を確認する" })).toBeNull();
    expect(screen.getByRole("banner").querySelector(".header-restart")).toBeNull();

    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));
    expect(screen.getByRole("heading", { name: "あなたの次のステップ" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "最初からやり直す" })).toBeTruthy();
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

  it("does not invent location, nationality, or needs when Help is opened directly", async () => {
    const user = userEvent.setup();
    navigation.reset("/ja/help");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(screen.getByRole("button", { name: /相談内容をまとめる/ }));

    expect(screen.getByText("まだ入力された情報はありません。")).toBeTruthy();
    expect(screen.getByText("まだ確認したいことは選択されていません。")).toBeTruthy();
    expect(screen.queryByText(/地域: 北区/)).toBeNull();
    expect(screen.queryByText(/国籍・地域: ミャンマー/)).toBeNull();
  });

  it("shows no Kita resources before a municipality is selected", async () => {
    navigation.reset("/ja/local");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(screen.getByText(/支援情報はまだ掲載がありません/)).toBeTruthy();
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
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await screen.findByRole("button", { name: "My steps" });
    expect((screen.getByRole("radio", { name: /Kita City/ }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("button", { name: /Next/ }));
    expect((screen.getByRole("radio", { name: /Myanmar/ }) as HTMLInputElement).checked).toBe(true);
    for (let index = 0; index < 4; index += 1) await user.click(screen.getByRole("button", { name: /Next/ }));
    expect((screen.getByRole("radio", { name: /I want to check my documents/ }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("button", { name: /Next/ }));
    expect((screen.getByRole("checkbox", { name: /A child is with me/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("requires an explicit child age instead of assuming school age", async () => {
    navigation.reset("/ja/check?step=6");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: { ...demoSituation, familyMembers: { children: [] } },
      stayAnswer: "known",
      familyAnswers: [],
      answeredSteps: [0, 1, 2, 3, 4, 5],
    }));
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await screen.findByRole("heading", { name: "一緒に日本にいる家族はいますか？" });

    await user.click(screen.getByRole("checkbox", { name: "子どもがいる" }));
    expect(screen.getByRole("button", { name: /次へ/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByText("6-11", { selector: ".age-options .selected" })).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "3-5" }));
    expect((screen.getByRole("button", { name: /次へ/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("checkbox", { name: "3-5" }).closest(".age-chip")!.classList.contains("selected")).toBe(true);

    await user.click(screen.getByRole("checkbox", { name: "3-5" }));
    expect(screen.getByRole("button", { name: /次へ/ }).hasAttribute("disabled")).toBe(true);
  });

  it("tracks several child ages through rules, summary, and reload", async () => {
    navigation.reset("/ja/check?step=6");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: { ...demoSituation, familyMembers: { children: [] }, needs: [] },
      stayAnswer: "unknown",
      familyAnswers: [],
      answeredSteps: [0, 1, 2, 3, 4, 5],
    }));
    const user = userEvent.setup();
    const firstRender = render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await screen.findByRole("heading", { name: "一緒に日本にいる家族はいますか？" });

    await user.click(screen.getByRole("checkbox", { name: "子どもがいる" }));
    await user.click(screen.getByRole("checkbox", { name: "3-5" }));
    expect(screen.queryByRole("checkbox", { name: "6-11" })?.closest(".age-chip")?.classList.contains("selected")).toBe(false);
    await user.click(screen.getByRole("button", { name: /次へ/ }));

    await user.click(screen.getByRole("radio", { name: "賃貸住宅" }));
    await user.click(screen.getByRole("button", { name: /次へ/ }));
    await user.click(screen.getByRole("checkbox", { name: "子どもの学校・教育" }));
    await user.click(screen.getByRole("checkbox", { name: "子どもの生活" }));
    await user.click(screen.getByRole("button", { name: /次へ/ }));
    await user.click(screen.getByRole("radio", { name: "日常会話ができる" }));
    await user.click(screen.getByRole("button", { name: /状況を整理する/ }));

    await user.click(await screen.findByRole("button", { name: /次のステップを見る/ }));
    expect(screen.getByRole("heading", { name: "子どもと利用できる地域資源を確認する" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "子どもの教育について相談する" })).toBeNull();

    navigation.reset("/ja/check?step=6");
    await screen.findByRole("heading", { name: "一緒に日本にいる家族はいますか？" });
    await user.click(screen.getByRole("checkbox", { name: "6-11" }));
    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));

    expect(screen.getByRole("heading", { name: "子どもと利用できる地域資源を確認する" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "子どもの教育について相談する" })).toBeTruthy();
    await waitFor(() => expect(sessionStorage.getItem("staybridge.session")).toContain('"children":[{"ageGroup":"3-5"},{"ageGroup":"6-11"}]'));

    navigation.reset("/ja/summary");
    firstRender.unmount();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    expect(await screen.findByText(/年齢: 3-5、6-11/)).toBeTruthy();
  });

  it("moves radio selection with keyboard arrows inside the native radiogroup", async () => {
    navigation.reset("/ja/check?step=0");
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    const firstOption = await screen.findByRole("radio", { name: "北区" });
    await user.click(firstOption);
    expect((firstOption as HTMLInputElement).checked).toBe(true);

    (screen.getByRole("radio", { name: "北区" }) as HTMLInputElement).focus();
    await user.keyboard("{ArrowRight}");
    const secondOption = screen.getByRole("radio", { name: "新宿区" }) as HTMLInputElement;
    expect(secondOption.checked).toBe(true);
    expect(document.activeElement).toBe(secondOption);
    expect((screen.getByRole("radio", { name: "北区" }) as HTMLInputElement).checked).toBe(false);
  });

  it("accepts a past stay deadline and shows the urgent deadline rules", async () => {
    navigation.reset("/ja/check?step=5");
    sessionStorage.setItem("staybridge.session", serializeStoredSession({
      provenance: "user",
      situation: {
        ...demoSituation,
        returnStatus: "possible",
        stayDeadlineKnown: false,
        knownStayDeadline: undefined,
        accommodation: "rental",
        japaneseLevel: "advanced",
        familyMembers: { children: [] },
        needs: [],
      },
      stayAnswer: "unknown",
      familyAnswers: ["none"],
      answeredSteps: Array.from({ length: 10 }, (_, index) => index),
    }));
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await screen.findByRole("heading", { name: "日本にいつまで滞在できるか分かりますか？" });

    await user.click(screen.getByRole("radio", { name: "分かっている" }));
    const deadline = screen.getByLabelText("滞在できる期限（任意）") as HTMLInputElement;
    expect(deadline.getAttribute("min")).toBeNull();
    await user.type(deadline, "2026-08-22");
    expect(deadline.value).toBe("2026-08-22");
    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));

    const urgentStay = await screen.findByRole("heading", { name: "日本に滞在できる期間を確認する" });
    const urgentCard = urgentStay.closest("article");
    expect(urgentCard).not.toBeNull();
    expect(within(urgentCard!).queryByText(/優先度/)).toBeNull();
    expect(within(urgentCard!).queryByText("R-STAY-DEADLINE-PAST")).toBeNull();
    expect(within(urgentCard!).getByText("入力した滞在期限を過ぎているため、すぐに公式窓口へ状況を確認する案内を表示しています。")).toBeTruthy();
    expect(within(urgentCard!).getByRole("button", { name: /公式相談先を見る/ })).toBeTruthy();
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

    expect(await screen.findByRole("heading", { name: "今の状況を整理しました" })).toBeTruthy();
    expect(screen.queryByText("まだ入力された情報はありません。")).toBeNull();
  });

  it("keeps the self-reported status review free of confirmation checkmarks", async () => {
    navigation.reset("/ja/status");
    restoreCompleteDemoSession();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(await screen.findByRole("heading", { name: "今の状況を整理しました" })).toBeTruthy();
    const resultPage = document.querySelector(".result-page");
    expect(resultPage).not.toBeNull();
    expect(resultPage!.textContent).not.toContain("✓");
  });

  it("returns a direct link to the final question to the first unanswered step", async () => {
    navigation.reset("/ja/check?step=9");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await waitFor(() => expect(navigation.path()).toBe("/ja/check?step=0"));
    expect(screen.getByText("質問 01")).toBeTruthy();
  });

  it("scrolls instantly when the user prefers reduced motion", async () => {
    const scrollTo = vi.fn<(...args: unknown[]) => void>();
    vi.stubGlobal("scrollTo", scrollTo);
    vi.stubGlobal("matchMedia", vi.fn<() => { matches: boolean }>().mockReturnValue({ matches: true }));
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(screen.getByRole("button", { name: "デモの状況を読み込む" }));
    expect(await screen.findByRole("heading", { name: "今の状況を整理しました" })).toBeTruthy();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "auto" });
  });

  it("scrolls smoothly by default", async () => {
    const scrollTo = vi.fn<(...args: unknown[]) => void>();
    vi.stubGlobal("scrollTo", scrollTo);
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(screen.getByRole("button", { name: "デモの状況を読み込む" }));
    expect(await screen.findByRole("heading", { name: "今の状況を整理しました" })).toBeTruthy();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" });
  });

  it("gates the primary navigation by assessment progress", async () => {
    const user = userEvent.setup();
    navigation.reset("/ja/");
    const landingRender = render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect(await screen.findByRole("button", { name: "今の状況を確認する" })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();

    await user.click(screen.getByRole("button", { name: "デモの状況を読み込む" }));
    expect(await screen.findByRole("heading", { name: "今の状況を整理しました" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "主要ナビゲーション" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "わたしのステップ" })).toBeTruthy();

    landingRender.unmount();
    sessionStorage.removeItem("staybridge.session");
    navigation.reset("/ja/check?step=2");
    const checkRender = render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await screen.findByRole("heading", { name: "今、東京のどの地域に滞在していますか？" });
    await waitFor(() => expect(navigation.path()).toBe("/ja/check?step=0"));
    expect(screen.getByRole("navigation", { name: "主要ナビゲーション" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "わたしのステップ" })).toBeNull();
    expect(screen.getByRole("button", { name: "近くの支援" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "相談先" })).toBeTruthy();

    checkRender.unmount();
    restoreCompleteUserSession();
    navigation.reset("/ja/check?step=0");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await waitFor(() => expect(screen.getByRole("radio", { name: "北区" }).closest(".option-button")?.classList.contains("selected")).toBe(true));
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
    expect(screen.queryByText("今の状況を整理しました")).toBeNull();
    expect(screen.getByText("質問 01")).toBeTruthy();
  });

  it("guards direct result links when no completed session exists", async () => {
    navigation.reset("/ja/status");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await waitFor(() => expect(navigation.path()).toBe("/ja/check?step=0"));
    expect(screen.queryByText("今の状況を整理しました")).toBeNull();
    expect(screen.getByText("質問 01")).toBeTruthy();
  });

  it("translates the main explanatory content without leaving Japanese copy", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await user.selectOptions(screen.getByRole("combobox"), "en");
    expect(screen.getByText("Organize your situation one question at a time without knowing official terms.")).toBeTruthy();
    expect(screen.queryByText("制度名を知らなくても、今の状況を一問ずつ整理。")).toBeNull();
  });

  it("continues with an explicit warning when session storage rejects writes", async () => {
    const failingStorage = memoryStorage();
    failingStorage.setItem = () => { throw new Error("denied"); };
    vi.stubGlobal("sessionStorage", failingStorage);
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    expect((await screen.findByRole("status")).textContent).toContain("端末への保存ができませんでした");
  });

  it("reports Clipboard API failure instead of throwing", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error("denied")) },
    });
    navigation.reset("/ja/help");
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(screen.getByRole("button", { name: /相談内容をまとめる/ }));
    await user.click(screen.getByRole("button", { name: /コピーする/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("コピーできませんでした");
  });

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
    expect(within(workAction!).getByText(/在留資格によって異なります/)).toBeTruthy();

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
    const schoolAction = screen.getByRole("heading", { name: "子どもの教育について相談する" }).closest("article");
    await user.click(within(schoolAction!).getByRole("button", { name: /近くの学校を見る/ }));
    expect(screen.getByRole("button", { name: "学校・教育", pressed: true })).toBeTruthy();
    expect(screen.getByText("この地域の支援情報はまだ掲載がありません。相談窓口の一覧をご利用ください。")).toBeTruthy();
    expect(screen.queryByText("豊川小学校")).toBeNull();
    expect(screen.queryByText("おうじキッズクリニック")).toBeNull();

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
      stayAnswer: "documents",
      familyAnswers: ["spouse"],
      answeredSteps: [5, 6],
    }));
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await screen.findByRole("heading", { name: "Talk to a person" });
    await user.click(screen.getByRole("button", { name: /Create consultation summary/ }));
    expect(screen.getByText("I want to check my documents")).toBeTruthy();
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
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await screen.findByRole("button", { name: "My steps" });

    await user.click(screen.getByRole("button", { name: "My steps" }));
    expect(screen.getByRole("heading", { name: "Ask about your child’s education" })).toBeTruthy();
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
    expect(within(resourceCard!).getByText("データ更新: 公開日不明")).toBeTruthy();
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
    await screen.findByRole("heading", { name: "今、予定どおり帰国できますか？" });
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
    await user.selectOptions(screen.getByRole("combobox"), "en");
    expect(navigation.path()).toBe("/en/check?step=4");
    expect(screen.getByText("Question 05")).toBeTruthy();
  });

  it("re-renders direct back and forward URL changes instead of keeping screen state", async () => {
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
    ]);
    expect(storedSession).not.toHaveProperty("locale");
    expect(storedSession).not.toHaveProperty("screen");
    expect(storedSession).not.toHaveProperty("step");
    expect(storedSession).not.toHaveProperty("filter");
  });
});
