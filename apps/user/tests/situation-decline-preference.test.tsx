// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
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

beforeEach(() => {
  navigation.reset("/ja/status");
  navigation.push.mockClear();
  navigation.replace.mockClear();
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
  restoreCompleteUserSession();
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("print", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Situation persistence decline preference", () => {
  it("remembers an explicit decline across a reload for the same answer session", async () => {
    const user = userEvent.setup();
    const firstRender = render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(await screen.findByRole("button", { name: "このタブだけで続ける" }));
    expect(screen.getByText("このタブだけで案内を続けます。")).toBeTruthy();
    expect(sessionStorage.getItem("staybridge.situation-persistence-preference")).toBe("declined");

    firstRender.unmount();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    expect(await screen.findByText("このタブだけで案内を続けます。")).toBeTruthy();
    expect(screen.queryByText("Situation Check の回答を保存に同意していません") ?? null).toBeNull();
    expect(sessionStorage.getItem("staybridge.session")).not.toBeNull();
  });

  it("forgets the decline when the answer session is reset explicitly", async () => {
    const user = userEvent.setup();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(await screen.findByRole("button", { name: "このタブだけで続ける" }));
    await screen.findByText("このタブだけで案内を続けます。");

    await user.click(screen.getByRole("button", { name: /次のステップを見る/ }));
    await user.click(screen.getByRole("button", { name: "最初からやり直す" }));

    expect(sessionStorage.getItem("staybridge.situation-persistence-preference")).toBeNull();
  });

  it("keeps an ambiguous save protected across reloads without recording a decline", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        data: { capability: `cap_${"A".repeat(43)}`, expiresAt: "2026-08-24T10:05:00.000Z" },
      }), { status: 201, headers: { "content-type": "application/json" } }))
      .mockRejectedValueOnce(new TypeError("response lost after request"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const firstRender = render(<StayBridgeApp assessmentDate="2026-08-23" />);

    await user.click(await screen.findByRole("button", { name: "同意して保存" }));
    await screen.findByText("保存できませんでした。回答と次の案内は引き続き利用できます。");
    const pendingBefore = sessionStorage.getItem("staybridge.pending-situation-submission");
    expect(pendingBefore).toBeTruthy();
    expect((screen.getByRole("button", { name: "このタブだけで続ける" }) as HTMLButtonElement).disabled).toBe(true);
    expect(sessionStorage.getItem("staybridge.situation-persistence-preference")).toBeNull();

    firstRender.unmount();
    render(<StayBridgeApp assessmentDate="2026-08-23" />);
    await screen.findByText("保存できませんでした。回答と次の案内は引き続き利用できます。");
    expect(JSON.parse(sessionStorage.getItem("staybridge.pending-situation-submission") ?? "{}")).toEqual(
      JSON.parse(pendingBefore ?? "{}"),
    );
    expect((screen.getByRole("button", { name: "このタブだけで続ける" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
