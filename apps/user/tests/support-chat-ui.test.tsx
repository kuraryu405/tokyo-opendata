// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupportChat } from "../src/components/SupportChat";

describe("SupportChat conversation log autoscroll", () => {
  let scrollToSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    scrollToSpy = vi.fn<(...args: unknown[]) => void>();
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
    render(<SupportChat locale="ja" consent="idle" />);

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
    render(<SupportChat locale="ja" consent="idle" />);

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
    render(<SupportChat locale="ja" consent="idle" />);

    const input = screen.getByRole("textbox", { name: "相談したいこと" });
    await user.type(input, "パスポート番号 TR1234567");
    await user.click(screen.getByRole("button", { name: "送る" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("旅券番号");
    expect(screen.queryByText("窓口で確認してください。")).toBeNull();
    expect(document.querySelector(".chat-log")).toBeNull();
  });

  it("writes recoverable deletion secrets before an accepted request and replaces them with saved credentials", async () => {
    const recordId = "con_11111111-1111-4111-8111-111111111111";
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const pending = sessionStorage.getItem("staybridge.pending-conversation-request");
      expect(pending).toContain('"version":1');
      expect(pending).toContain("窓口で何を聞けばいいですか？");
      const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(request).toHaveProperty("persistence.consent.version", "conversation-2026-08-23");
      return new Response(JSON.stringify({
        reply: "窓口で確認してください。",
        persistence: { status: "saved", id: recordId },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SupportChat locale="ja" consent="accepted" />);

    await user.type(screen.getByRole("textbox", { name: "相談したいこと" }), "窓口で何を聞けばいいですか？");
    await user.click(screen.getByRole("button", { name: "送る" }));

    expect(await screen.findByText("この応答のマスキング済み会話を保存しました。")).toBeTruthy();
    expect(sessionStorage.getItem("staybridge.pending-conversation-request")).toBeNull();
    expect(sessionStorage.getItem("staybridge.saved-conversation-credentials")).toContain(recordId);
    expect(screen.getByText(recordId)).toBeTruthy();
  });

  it("does not send or store conversation credentials when storage is declined", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(request).not.toHaveProperty("persistence");
      return new Response(JSON.stringify({ reply: "窓口で確認してください。" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SupportChat locale="ja" consent="declined" />);

    await user.type(screen.getByRole("textbox", { name: "相談したいこと" }), "保存せず相談します");
    await user.click(screen.getByRole("button", { name: "送る" }));

    expect(await screen.findByText("窓口で確認してください。")).toBeTruthy();
    expect(sessionStorage.getItem("staybridge.pending-conversation-request")).toBeNull();
    expect(sessionStorage.getItem("staybridge.saved-conversation-credentials")).toBeNull();
  });

  it("restores an ambiguous request after reload and keeps its original secrets for recovery", async () => {
    const deletionToken = "A".repeat(43);
    sessionStorage.setItem("staybridge.pending-conversation-request", JSON.stringify({
      version: 1,
      locale: "ja",
      content: "応答を回収したい",
      idempotencyKey: "conversation_request_123",
      deletionToken,
    }));
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      reply: "回収しました。",
      persistence: { status: "saved", id: "con_22222222-2222-4222-8222-222222222222" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SupportChat locale="ja" consent="accepted" />);

    expect(await screen.findByDisplayValue("応答を回収したい")).toBeTruthy();
    expect(screen.getByText(/保存結果を確認できない会話/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "送る" }));

    await screen.findByText("回収しました。");
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      persistence: { idempotencyKey: string; deletionToken: string };
    };
    expect(request.persistence).toEqual({
      consent: { accepted: true, version: "conversation-2026-08-23" },
      idempotencyKey: "conversation_request_123",
      deletionToken,
    });
  });

  it("does not retry an ambiguous persisted request after consent is declined", async () => {
    const deletionToken = "A".repeat(43);
    sessionStorage.setItem("staybridge.pending-conversation-request", JSON.stringify({
      version: 1,
      locale: "ja",
      content: "保存せずに相談したい",
      idempotencyKey: "conversation_request_declined",
      deletionToken,
    }));
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(request).not.toHaveProperty("persistence");
      return new Response(JSON.stringify({ reply: "保存せず回答しました。" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const view = render(<SupportChat locale="ja" consent="accepted" />);

    expect(await screen.findByDisplayValue("保存せずに相談したい")).toBeTruthy();
    view.rerender(<SupportChat locale="ja" consent="declined" />);
    await user.click(screen.getByRole("button", { name: "送る" }));

    expect(await screen.findByText("保存せず回答しました。")).toBeTruthy();
    expect(sessionStorage.getItem("staybridge.pending-conversation-request")).toContain("conversation_request_declined");
    expect(sessionStorage.getItem("staybridge.saved-conversation-credentials")).toBeNull();
  });

  it("serializes save and delete mutations and keeps the newest deletion credentials", async () => {
    const oldRecordId = "con_33333333-3333-4333-8333-333333333333";
    const newRecordId = "con_44444444-4444-4444-8444-444444444444";
    const oldDeletionToken = "B".repeat(43);
    sessionStorage.setItem("staybridge.saved-conversation-credentials", JSON.stringify({
      version: 1,
      records: [{ id: oldRecordId, deletionToken: oldDeletionToken }],
    }));
    let resolveSave!: (response: Response) => void;
    let resolveDelete!: (response: Response) => void;
    const saveResponse = new Promise<Response>((resolve) => { resolveSave = resolve; });
    const deleteResponse = new Promise<Response>((resolve) => { resolveDelete = resolve; });
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      if (String(input) === "/api/support-chat") return saveResponse;
      if (String(input) === `/api/conversations/${oldRecordId}` && init?.method === "DELETE") return deleteResponse;
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SupportChat locale="ja" consent="accepted" />);

    const input = screen.getByRole("textbox", { name: "相談したいこと" }) as HTMLTextAreaElement;
    await user.type(input, "新しい会話を保存します");
    await user.click(screen.getByRole("button", { name: "送る" }));
    const oldDeleteButton = await screen.findByRole("button", { name: "保存済み会話を削除" }) as HTMLButtonElement;
    expect(oldDeleteButton.disabled).toBe(true);

    resolveSave(new Response(JSON.stringify({
      reply: "新しい回答です。",
      persistence: { status: "saved", id: newRecordId },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    await screen.findByText("新しい回答です。");
    await waitFor(() => expect((screen.getAllByRole("button", { name: "保存済み会話を削除" })[0] as HTMLButtonElement).disabled).toBe(false));

    await user.click(screen.getAllByRole("button", { name: "保存済み会話を削除" })[0]);
    expect(input.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "送る" }) as HTMLButtonElement).disabled).toBe(true);
    resolveDelete(new Response(JSON.stringify({ ok: true, data: { deleted: true } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    await waitFor(() => {
      const stored = String(sessionStorage.getItem("staybridge.saved-conversation-credentials"));
      expect(stored).toContain(newRecordId);
      expect(stored).not.toContain(oldRecordId);
    });
  });

  it("deletes a saved conversation while retaining credentials on deletion failure", async () => {
    const recordId = "con_33333333-3333-4333-8333-333333333333";
    const deletionToken = "B".repeat(43);
    sessionStorage.setItem("staybridge.saved-conversation-credentials", JSON.stringify({
      version: 1,
      records: [{ id: recordId, deletionToken }],
    }));
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE" },
    }), { status: 503, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SupportChat locale="ja" consent="accepted" />);

    await user.click(await screen.findByRole("button", { name: "保存済み会話を削除" }));

    expect(await screen.findByText(/削除できませんでした/)).toBeTruthy();
    expect(sessionStorage.getItem("staybridge.saved-conversation-credentials")).toContain(recordId);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/conversations/${recordId}`,
      expect.objectContaining({ method: "DELETE" }),
    ));
  });
});
