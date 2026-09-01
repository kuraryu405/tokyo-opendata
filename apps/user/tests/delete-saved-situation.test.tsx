// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteSavedSituation } from "../src/components/DeleteSavedSituation";
import {
  SAVED_SITUATION_CREDENTIALS_KEY,
  serializeSavedSituationCredentials,
} from "../src/consented-persistence";

const credentials = {
  id: "sit_11111111-1111-4111-8111-111111111111",
  deletionToken: "A".repeat(43),
};

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("saved Situation deletion recovery", () => {
  it("deletes a record from manually entered credentials without putting the token in the URL", async () => {
    sessionStorage.setItem(
      SAVED_SITUATION_CREDENTIALS_KEY,
      serializeSavedSituationCredentials(credentials),
    );
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      data: { deleted: true },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<DeleteSavedSituation locale="ja" />);

    await user.type(screen.getByLabelText("記録ID"), credentials.id);
    await user.type(screen.getByLabelText("削除コード"), credentials.deletionToken);
    await user.click(screen.getByRole("button", { name: "このサーバー記録を削除" }));

    expect((await screen.findByRole("status")).textContent).toContain("サーバー記録を削除しました。");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    expect(String(requestUrl)).toBe(`/api/situation-submissions/${credentials.id}`);
    expect(String(requestUrl)).not.toContain(credentials.deletionToken);
    expect(requestInit?.method).toBe("DELETE");
    expect(requestInit?.headers).toEqual({ authorization: `Bearer ${credentials.deletionToken}` });
    expect(sessionStorage.getItem(SAVED_SITUATION_CREDENTIALS_KEY)).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("rejects malformed credentials locally without sending a deletion request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<DeleteSavedSituation locale="ja" />);

    await user.type(screen.getByLabelText("記録ID"), "sit_invalid");
    await user.type(screen.getByLabelText("削除コード"), "too-short");
    await user.click(screen.getByRole("button", { name: "このサーバー記録を削除" }));

    expect((await screen.findByRole("alert")).textContent).toContain("形式を確認してください");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the entered credentials available after a failed deletion", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Invalid deletion token." },
    }), { status: 401, headers: { "content-type": "application/json" } })));
    const user = userEvent.setup();
    render(<DeleteSavedSituation locale="en" />);

    const recordInput = screen.getByLabelText("Record ID") as HTMLInputElement;
    const tokenInput = screen.getByLabelText("Deletion code") as HTMLInputElement;
    await user.type(recordInput, credentials.id);
    await user.type(tokenInput, credentials.deletionToken);
    await user.click(screen.getByRole("button", { name: "Delete this server record" }));

    expect((await screen.findByRole("alert")).textContent).toContain("could not delete");
    expect(recordInput.value).toBe(credentials.id);
    expect(tokenInput.value).toBe(credentials.deletionToken);
  });
});
