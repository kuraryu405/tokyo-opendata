// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupportChat } from "../src/components/SupportChat";

describe("SupportChat conversation log autoscroll", () => {
  let scrollToSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollToSpy = vi.fn();
    Element.prototype.scrollTo = scrollToSpy as unknown as typeof Element.prototype.scrollTo;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      reply: "窓口で確認してください。",
    }), { status: 200, headers: { "content-type": "application/json" } })));
  });

  afterEach(() => {
    cleanup();
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
    expect(alert.textContent).toContain("個人情報");
    expect(screen.queryByText("窓口で確認してください。")).toBeNull();
    expect(document.querySelector(".chat-log")).toBeNull();
  });
});
