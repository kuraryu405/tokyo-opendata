// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSupportChatMemory, SupportChat } from "../src/components/SupportChat";

describe("SupportChat conversation lifecycle", () => {
  let scrollToSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearSupportChatMemory();
    sessionStorage.clear();
    scrollToSpy = vi.fn<(...args: unknown[]) => void>();
    Element.prototype.scrollTo = scrollToSpy as unknown as typeof Element.prototype.scrollTo;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      reply: "窓口で確認してください。",
    }), { status: 200, headers: { "content-type": "application/json" } })));
  });

  afterEach(() => {
    cleanup();
    clearSupportChatMemory();
    sessionStorage.clear();
    Reflect.deleteProperty(Element.prototype, "scrollTo");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("scrolls the log toward the latest entry after sending and after the reply", async () => {
    const user = userEvent.setup();
    render(<SupportChat locale="ja" />);

    const input = screen.getByRole("textbox", { name: "相談したいこと" });
    await user.type(input, "窓口で何を聞けばいいですか？");
    await user.click(screen.getByRole("button", { name: "送る" }));

    expect(await screen.findByText("窓口で確認してください。")).toBeTruthy();
    expect(scrollToSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const [options] of scrollToSpy.mock.calls as Array<[{ top: number; behavior: string }]>) {
      expect(options.top).toBeGreaterThanOrEqual(0);
      expect(options.behavior).toBe("smooth");
    }
  });

  it("scrolls instantly when the user prefers reduced motion", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    const user = userEvent.setup();
    render(<SupportChat locale="ja" />);

    const input = screen.getByRole("textbox", { name: "相談したいこと" });
    await user.type(input, "持っていくものは？");
    await user.click(screen.getByRole("button", { name: "送る" }));

    expect(await screen.findByText("窓口で確認してください。")).toBeTruthy();
    const lastCall = scrollToSpy.mock.calls.at(-1) as [{ top: number; behavior: string }];
    expect(lastCall[0].behavior).toBe("auto");
  });

  it("shows the personal-identifier notice when the server rejects the message", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      error: "HIGH_RISK_IDENTIFIER",
    }), { status: 400, headers: { "content-type": "application/json" } })));
    const user = userEvent.setup();
    render(<SupportChat locale="ja" />);

    const input = screen.getByRole("textbox", { name: "相談したいこと" });
    await user.type(input, "パスポート番号 TR1234567");
    await user.click(screen.getByRole("button", { name: "送る" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("旅券番号");
    expect(screen.queryByText("窓口で確認してください。")).toBeNull();
    expect(document.querySelector(".chat-log")).toBeNull();
  });

  it("keeps completed messages when the chat unmounts for an app route change", async () => {
    const user = userEvent.setup();
    const view = render(<SupportChat locale="ja" />);

    await user.type(screen.getByRole("textbox", { name: "相談したいこと" }), "相談先を確認したい");
    await user.click(screen.getByRole("button", { name: "送る" }));
    expect(await screen.findByText("窓口で確認してください。")).toBeTruthy();

    view.unmount();
    render(<SupportChat locale="ja" />);

    expect(screen.getByText("相談先を確認したい")).toBeTruthy();
    expect(screen.getByText("窓口で確認してください。")).toBeTruthy();
    expect(sessionStorage.length).toBe(0);
  });

  it("keeps the in-memory transcript across locale route changes and clears it explicitly", async () => {
    const user = userEvent.setup();
    const view = render(<SupportChat locale="ja" />);

    await user.type(screen.getByRole("textbox", { name: "相談したいこと" }), "持ち物を整理したい");
    await user.click(screen.getByRole("button", { name: "送る" }));
    expect(await screen.findByText("窓口で確認してください。")).toBeTruthy();

    view.unmount();
    const englishView = render(<SupportChat locale="en" />);
    expect(screen.getByText("持ち物を整理したい")).toBeTruthy();
    expect(screen.getByText("窓口で確認してください。")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Clear conversation" }));
    expect(screen.queryByText("持ち物を整理したい")).toBeNull();
    englishView.unmount();

    render(<SupportChat locale="ja" />);
    expect(screen.queryByText("持ち物を整理したい")).toBeNull();
    expect(screen.getByText("相談窓口で何を聞けばいい？")).toBeTruthy();
  });
});
