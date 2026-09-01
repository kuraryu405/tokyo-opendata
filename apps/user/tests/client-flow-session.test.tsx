// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoSituation } from "@staybridge/domain/demo";
import { getUserMessages } from "@staybridge/i18n/client";
import { StayBridgeApp } from "../src/components/StayBridgeApp";

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

const testSubmissionCapability = `cap_${"A".repeat(43)}`;

function capabilityResponse(capability = testSubmissionCapability): Response {
  return new Response(JSON.stringify({
    ok: true,
    data: { capability, expiresAt: "2026-08-24T10:05:00.000Z" },
  }), { status: 201, headers: { "content-type": "application/json" } });
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

describe("StayBridge session recovery", () => {
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
    expect(JSON.parse(sessionStorage.getItem("staybridge.session") ?? "{}")).toMatchObject({ version: 5, provenance: "demo" });

    navigation.reset("/ja/check?step=0");
    await waitFor(() => expect(navigation.path()).toBe("/ja/status"));
    expect(JSON.parse(sessionStorage.getItem("staybridge.session") ?? "{}")).toMatchObject({ version: 5, provenance: "demo" });
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
    expect((screen.getByRole("combobox", { name: "東京23区から選択" }) as HTMLInputElement).value).toBe("");
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

    expect(await screen.findByRole("heading", { name: "回答を確認して、次の行動へ進みましょう" })).toBeTruthy();
    expect(navigation.path()).toBe("/ja/status");
    expect((screen.getByRole("button", { name: "同意して保存" }) as HTMLButtonElement).disabled).toBe(true);

    navigation.reset("/ja/check?step=0");
    await waitFor(() => expect(navigation.path()).toBe("/ja/status"));
    expect(screen.getByRole("heading", { name: "回答を確認して、次の行動へ進みましょう" })).toBeTruthy();
  });

  it("clears every demo answer before review and enables saving only after a complete real questionnaire", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(capabilityResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
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
    expect((screen.getByRole("combobox", { name: "東京23区から選択" }) as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("button", { name: /次へ/ }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByRole("combobox", { name: "東京23区から選択" }), { target: { value: "新宿区" } });
    await user.click(screen.getByRole("button", { name: /次へ/ }));
    expect(navigation.path()).toBe("/ja/check?step=1");

    navigation.reset("/ja/status");
    await waitFor(() => expect(navigation.path()).toBe("/ja/check?step=1"));
    expect(screen.queryByRole("button", { name: "同意して保存" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    const myanmarLabel = getUserMessages("ja").questions[1][2].find(([value]) => value === "MM")?.[1] ?? "";
    fireEvent.change(screen.getByRole("combobox", { name: "国名・地域名から選択" }), { target: { value: myanmarLabel } });
    await user.click(screen.getByRole("button", { name: /次へ/ }));
    for (const answer of ["仕事", "3か月以内", "帰国できる", "分からない"] as const) {
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as { answers: { municipalityCode: string } };
    expect(body.answers.municipalityCode).toBe("13104");
  });

});
