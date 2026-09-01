"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  deleteSituationSubmission,
  parseSavedSituationCredentials,
  SAVED_SITUATION_CREDENTIALS_KEY,
  type SavedRecordCredentials,
} from "../consented-persistence";
import type { Locale } from "./staybridge-session";

type DeleteState = "idle" | "invalid" | "deleting" | "deleted" | "error";

const copy = {
  ja: {
    section: "保存済みデータ",
    title: "保存済み記録を削除",
    intro: "以前控えた記録IDと削除コードを入力すると、タブを閉じた後でもサーバー上の記録を削除できます。",
    recordId: "記録ID",
    deletionToken: "削除コード",
    submit: "このサーバー記録を削除",
    deleting: "削除しています…",
    deleted: "サーバー記録を削除しました。",
    invalid: "記録IDまたは削除コードの形式を確認してください。",
    error: "削除できませんでした。記録IDと削除コードを保管したまま、後でもう一度お試しください。",
    privacy: "削除コードはURLやCookieに保存しません。この画面で入力した値は削除リクエストにだけ使用します。",
    back: "StayBridge Tokyoへ戻る",
  },
  en: {
    section: "Saved data",
    title: "Delete a saved record",
    intro: "Enter the record ID and deletion code you saved earlier to delete the server record even after the original tab was closed.",
    recordId: "Record ID",
    deletionToken: "Deletion code",
    submit: "Delete this server record",
    deleting: "Deleting…",
    deleted: "The server record was deleted.",
    invalid: "Check the format of the record ID and deletion code.",
    error: "We could not delete the record. Keep the record ID and deletion code and try again later.",
    privacy: "The deletion code is never placed in the URL or stored in a cookie. Values entered here are used only for the deletion request.",
    back: "Back to StayBridge Tokyo",
  },
  my: {
    section: "သိမ်းထားသောဒေတာ",
    title: "သိမ်းထားသောမှတ်တမ်းကို ဖျက်ရန်",
    intro: "ယခင်က သိမ်းထားသော မှတ်တမ်း ID နှင့် ဖျက်ရန်ကုဒ်ကို ထည့်သွင်းပြီး မူလ tab ပိတ်ပြီးနောက်လည်း server မှတ်တမ်းကို ဖျက်နိုင်သည်။",
    recordId: "မှတ်တမ်း ID",
    deletionToken: "ဖျက်ရန်ကုဒ်",
    submit: "ဤ server မှတ်တမ်းကို ဖျက်ရန်",
    deleting: "ဖျက်နေသည်…",
    deleted: "Server မှတ်တမ်းကို ဖျက်ပြီးပါပြီ။",
    invalid: "မှတ်တမ်း ID သို့မဟုတ် ဖျက်ရန်ကုဒ်၏ ပုံစံကို စစ်ဆေးပါ။",
    error: "မှတ်တမ်းကို မဖျက်နိုင်ပါ။ မှတ်တမ်း ID နှင့် ဖျက်ရန်ကုဒ်ကို ထိန်းသိမ်းထားပြီး နောက်မှ ထပ်မံကြိုးစားပါ။",
    privacy: "ဖျက်ရန်ကုဒ်ကို URL သို့မဟုတ် Cookie တွင် မသိမ်းပါ။ ဤနေရာတွင် ထည့်သွင်းသည့်တန်ဖိုးများကို ဖျက်ရန် request အတွက်သာ အသုံးပြုသည်။",
    back: "StayBridge Tokyo သို့ ပြန်ရန်",
  },
} as const;

function sameCredentials(left: SavedRecordCredentials, right: SavedRecordCredentials) {
  return left.id === right.id && left.deletionToken === right.deletionToken;
}

export function DeleteSavedSituation({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const [recordId, setRecordId] = useState("");
  const [deletionToken, setDeletionToken] = useState("");
  const [state, setState] = useState<DeleteState>("idle");
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => () => activeRequest.current?.abort(), []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state === "deleting") return;

    const parsed = parseSavedSituationCredentials(JSON.stringify({
      id: recordId.trim(),
      deletionToken: deletionToken.trim(),
    }));
    if (parsed.status !== "valid") {
      setState("invalid");
      return;
    }

    const controller = new AbortController();
    activeRequest.current?.abort();
    activeRequest.current = controller;
    setState("deleting");

    try {
      await deleteSituationSubmission(parsed.credentials, controller.signal);
      try {
        const stored = parseSavedSituationCredentials(sessionStorage.getItem(SAVED_SITUATION_CREDENTIALS_KEY));
        if (stored.status === "valid" && sameCredentials(stored.credentials, parsed.credentials)) {
          sessionStorage.removeItem(SAVED_SITUATION_CREDENTIALS_KEY);
        }
      } catch {
        // Server deletion has already succeeded. Local storage cleanup is best-effort.
      }
      setRecordId("");
      setDeletionToken("");
      setState("deleted");
    } catch {
      if (!controller.signal.aborted) setState("error");
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  };

  return <main className="content-page narrow-page">
    <div className="page-heading">
      <span className="section-label">{t.section}</span>
      <h1>{t.title}</h1>
      <p>{t.intro}</p>
    </div>
    <form onSubmit={submit} className="safe-notice">
      <div>
        <label htmlFor="saved-record-id"><strong>{t.recordId}</strong></label>
        <input
          id="saved-record-id"
          name="recordId"
          value={recordId}
          onChange={(event) => {
            setRecordId(event.target.value);
            if (state !== "deleting") setState("idle");
          }}
          autoComplete="off"
          spellCheck={false}
          disabled={state === "deleting"}
          required
        />
      </div>
      <div>
        <label htmlFor="saved-deletion-token"><strong>{t.deletionToken}</strong></label>
        <input
          id="saved-deletion-token"
          name="deletionToken"
          type="password"
          value={deletionToken}
          onChange={(event) => {
            setDeletionToken(event.target.value);
            if (state !== "deleting") setState("idle");
          }}
          autoComplete="off"
          spellCheck={false}
          disabled={state === "deleting"}
          required
        />
      </div>
      <button
        className="primary-button wide"
        type="submit"
        disabled={state === "deleting" || !recordId.trim() || !deletionToken.trim()}
      >
        {state === "deleting" ? t.deleting : t.submit}
      </button>
      {state === "invalid" && <p className="inline-error" role="alert">{t.invalid}</p>}
      {state === "error" && <p className="inline-error" role="alert">{t.error}</p>}
      {state === "deleted" && <p role="status">{t.deleted}</p>}
    </form>
    <p className="chat-disclosure">{t.privacy}</p>
    <p><a href={`/${locale}`}>{t.back}</a></p>
  </main>;
}
