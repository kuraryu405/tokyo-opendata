// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
  navigation.reset("/ja/roadmap");
  navigation.push.mockClear();
  navigation.replace.mockClear();
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
  restoreCompleteDemoSession();
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("print", vi.fn());
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
    reply: "公式相談先で確認してください。",
  }), { status: 200, headers: { "content-type": "application/json" } }))));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("AI consultation transcript lifetime", () => {
  it("keeps the conversation when leaving the roadmap for help and returning", async () => {
    const user = userEvent.setup();
    const view = render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(await screen.findByRole("button", { name: "相談窓口で何を聞けばいい？" }));
    expect(await screen.findByText("公式相談先で確認してください。")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "相談先" }));
    expect(screen.getByRole("heading", { name: "人に相談する" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));
    expect(screen.getByText("相談窓口で何を聞けばいい？")).toBeTruthy();
    expect(screen.getByText("公式相談先で確認してください。")).toBeTruthy();
    view.unmount();
  });

  it("keeps the conversation when leaving the roadmap for local support and returning", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(await screen.findByRole("button", { name: "相談窓口で何を聞けばいい？" }));
    expect(await screen.findByText("公式相談先で確認してください。")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "近くの支援" }));
    expect(navigation.path()).toContain("/local");
    await user.click(screen.getByRole("button", { name: "わたしのステップ" }));

    expect(screen.getByText("相談窓口で何を聞けばいい？")).toBeTruthy();
    expect(screen.getByText("公式相談先で確認してください。")).toBeTruthy();
  });

  it("keeps the transcript across locale changes while subsequent requests use the selected locale", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(await screen.findByRole("button", { name: "相談窓口で何を聞けばいい？" }));
    expect(await screen.findByText("公式相談先で確認してください。")).toBeTruthy();

    await user.selectOptions(screen.getByRole("combobox"), "en");
    expect(navigation.path()).toBe("/en/roadmap");
    expect(screen.getByText("相談窓口で何を聞けばいい？")).toBeTruthy();
    expect(screen.getByText("公式相談先で確認してください。")).toBeTruthy();

    const input = screen.getByRole("textbox", { name: "What do you want to ask?" });
    await user.type(input, "What should I bring?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByText("公式相談先で確認してください。")).toHaveLength(2));
    const requestBody = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body)) as { locale: string };
    expect(requestBody.locale).toBe("en");
  });

  it("clears both transcript and unsent draft when the user clears the conversation", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(await screen.findByRole("button", { name: "相談窓口で何を聞けばいい？" }));
    expect(await screen.findByText("公式相談先で確認してください。")).toBeTruthy();
    const input = screen.getByRole("textbox", { name: "相談したいこと" });
    await user.type(input, "まだ送らない下書き");

    await user.click(screen.getByRole("button", { name: "会話を消去" }));
    expect(screen.queryByText("公式相談先で確認してください。")).toBeNull();
    expect((input as HTMLTextAreaElement).value).toBe("");
  });

  it("discards the conversation on a full remount (reload) as documented", () => {
    const first = render(<StayBridgeApp assessmentDate="2026-08-23" />);
    first.unmount();

    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    expect(screen.queryByText("公式相談先で確認してください。")).toBeNull();
    expect(document.querySelector(".chat-log")).toBeNull();
  });

  it("clears the conversation together with the device-data reset", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(await screen.findByRole("button", { name: "相談窓口で何を聞けばいい？" }));
    expect(await screen.findByText("公式相談先で確認してください。")).toBeTruthy();
    const input = screen.getByRole("textbox", { name: "相談したいこと" });
    await user.type(input, "消去される下書き");

    await user.click(screen.getByRole("button", { name: "この端末のデータを消す" }));
    expect(navigation.path()).toBe("/ja");
    expect(sessionStorage.getItem("staybridge.session")).toBeNull();

    await user.click(screen.getByRole("button", { name: "デモの状況を読み込む" }));
    await screen.findByRole("heading", { name: "今の状況を整理しました" });
    await user.click(screen.getByRole("button", { name: /次のステップを見る/ }));
    expect(screen.queryByText("公式相談先で確認してください。")).toBeNull();
    expect(document.querySelector(".chat-log")).toBeNull();
    expect((screen.getByRole("textbox", { name: "相談したいこと" }) as HTMLTextAreaElement).value).toBe("");
  });
});