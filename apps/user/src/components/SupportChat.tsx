"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { SupportChatMessage } from "../ai/support-chat";
import {
  CONVERSATION_CONSENT_VERSION,
  PENDING_CONVERSATION_REQUEST_KEY,
  SAVED_CONVERSATION_CREDENTIALS_KEY,
  appendSavedConversationCredentials,
  createConversationRequestSecrets,
  deleteConversation,
  parsePendingConversationRequest,
  parseSavedConversationCredentials,
  serializePendingConversationRequest,
  serializeSavedConversationCredentials,
  type ConversationConsentPreference,
  type PendingConversationRequest,
  type SavedRecordCredentials,
} from "../consented-persistence";
import { prefersReducedMotion } from "../motion";
import type { Locale } from "./staybridge-session";

const SUPPORT_CHAT_TIMEOUT_MS = 15_000;

const chatCopy = {
  ja: {
    title: "AI相談アシスタント",
    suggestions: ["相談窓口で何を聞けばいい？", "今の状況をどう説明すればいい？", "持っていくものを整理したい"],
    disclosure: "AIは誤ることがあります。個人情報は入力せず、回答内容をご確認ください。状況確認の回答は自動送信されません。",
    label: "相談したいこと",
    placeholder: "例：相談窓口で何を聞けばいいですか？",
    send: "送る",
    clear: "画面の会話を消去",
    you: "あなた",
    assistant: "AI案内",
    pending: "回答を整理しています",
    error: "AI案内を利用できません。時間をおいて再試行するか、この画面の公式相談先を利用してください。",
    identifierError: "旅券番号・在留カード番号が含まれているため送信できません。該当部分を消して再度送信してください。連絡先や住所は自動的に伏せ字で送られます。",
    persistencePending: "保存結果を確認できない会話があります。表示中の入力を変えずに再送すると、同じ記録を確認できます。",
    persistenceSaved: "この応答のマスキング済み会話を保存しました。",
    persistenceError: "会話を保存できませんでした。AI相談とこの画面の案内は引き続き利用できます。復旧情報はこのタブに保持しています。",
    persistenceCorrupt: "このタブの会話保存・削除情報を確認できません。既存情報を上書きせず、AI相談だけを利用できます。",
    savedRecords: "保存済み会話",
    recordId: "記録ID",
    deletionToken: "削除コード",
    deleteRecord: "保存済み会話を削除",
    deleting: "削除しています…",
    deleteFailed: "削除できませんでした。記録IDと削除コードを保持したまま、後でもう一度お試しください。",
  },
  en: {
    title: "AI consultation assistant",
    suggestions: ["What should I ask at a support desk?", "How can I explain my situation?", "Help me prepare what to bring"],
    disclosure: "AI can make mistakes. Do not enter personal information, and check its answers. Your situation-check answers are not sent automatically.",
    label: "What do you want to ask?",
    placeholder: "Example: What should I ask at a support desk?",
    send: "Send",
    clear: "Clear on-screen conversation",
    you: "You",
    assistant: "AI guide",
    pending: "Organizing a response",
    error: "The AI guide is unavailable. Try again later or use an official support link on this page.",
    identifierError: "This message cannot be sent because it contains a passport or residence card number. Please remove that part and send it again. Contact details and addresses are automatically masked.",
    persistencePending: "A conversation save has an unknown result. Resend the restored text unchanged to recover the same record.",
    persistenceSaved: "The masked conversation for this response was saved.",
    persistenceError: "We could not save the conversation. AI consultation and the page guidance still work. Recovery information remains in this tab.",
    persistenceCorrupt: "This tab cannot verify its conversation save or deletion information. Existing data will not be overwritten; you can still use the AI consultation without saving.",
    savedRecords: "Saved conversations",
    recordId: "Record ID",
    deletionToken: "Deletion code",
    deleteRecord: "Delete saved conversation",
    deleting: "Deleting…",
    deleteFailed: "We could not delete it. The record ID and deletion code are retained so you can try again later.",
  },
  my: {
    title: "AI တိုင်ပင်ရေး အကူ",
    suggestions: ["တိုင်ပင်ရာမှာ ဘာတွေမေးသင့်သလဲ။", "အခြေအနေကို ဘယ်လိုရှင်းပြရမလဲ။", "ယူသွားရမည့်အရာများ စီစဉ်ပေးပါ"],
    disclosure: "AI သည် မှားနိုင်ပါသည်။ ကိုယ်ရေးအချက်အလက် မထည့်ဘဲ အဖြေကို စစ်ဆေးပါ။ အခြေအနေစစ်ဆေးမှုအဖြေများကို အလိုအလျောက်မပို့ပါ။",
    label: "မေးလိုသောအချက်",
    placeholder: "ဥပမာ - တိုင်ပင်ရာမှာ ဘာတွေမေးသင့်သလဲ။",
    send: "ပို့ရန်",
    clear: "မျက်နှာပြင်ပေါ် စကားဝိုင်းကို ရှင်းရန်",
    you: "သင်",
    assistant: "AI လမ်းညွှန်",
    pending: "အဖြေကို စီစဉ်နေသည်",
    error: "AI လမ်းညွှန်ကို ယခုမသုံးနိုင်ပါ။ နောက်မှ ထပ်ကြိုးစားပါ သို့မဟုတ် ဤစာမျက်နှာရှိ တရားဝင်တိုင်ပင်ရာကို အသုံးပြုပါ။",
    identifierError: "နိုင်ငံကူးလက်မှတ် သို့မဟုတ် နေထိုင်ခွင့်ကတ်နံပါတ် ပါဝင်နေသောကြောင့် ပို့၍မရပါ။ ထိုအပိုင်းကို ဖျက်ပြီး ထပ်မံပို့ပါ။ ဆက်သွယ်ရန်အချက်အလက်နှင့် လိပ်စာများကို အလိုအလျောက် ဖုံးကွယ်ပေးပါသည်။",
    persistencePending: "သိမ်းဆည်းမှုရလဒ် မသေချာသေးပါ။ ပြထားသောစာကို မပြောင်းဘဲ ထပ်ပို့လျှင် တူညီသော record ကို ပြန်ရနိုင်ပါသည်။",
    persistenceSaved: "ဤအဖြေအတွက် ဖုံးကွယ်ထားသော စကားပြောကို သိမ်းပြီးပါပြီ။",
    persistenceError: "စကားပြောကို မသိမ်းနိုင်ပါ။ AI တိုင်ပင်မှုနှင့် အခြားလမ်းညွှန်ကို ဆက်သုံးနိုင်ပြီး ပြန်လည်ရယူရန်အချက်အလက်ကို ဤ tab တွင် ထိန်းထားပါသည်။",
    persistenceCorrupt: "ဤ tab ရှိ စကားပြောသိမ်းဆည်းမှု သို့မဟုတ် ဖျက်ရန်အချက်အလက်ကို အတည်မပြုနိုင်ပါ။ ရှိပြီးသားအချက်အလက်ကို မရေးထပ်ဘဲ AI တိုင်ပင်မှုကိုသာ ဆက်သုံးနိုင်ပါသည်။",
    savedRecords: "သိမ်းထားသော စကားပြောများ",
    recordId: "Record ID",
    deletionToken: "Deletion code",
    deleteRecord: "သိမ်းထားသော စကားပြောကို ဖျက်ရန်",
    deleting: "ဖျက်နေသည်…",
    deleteFailed: "မဖျက်နိုင်ပါ။ နောက်မှထပ်ကြိုးစားရန် record ID နှင့် deletion code ကို ဆက်လက်ထိန်းထားပါသည်။",
  },
} as const;

type ChatEntry = SupportChatMessage & { id: string };

class ChatRequestError extends Error {
  constructor(readonly code: string) {
    super(code || "REQUEST_FAILED");
  }
}

const readErrorCode = async (response: Response): Promise<string> => {
  try {
    const body = await response.json() as { error?: unknown };
    return typeof body.error === "string" ? body.error : "";
  } catch {
    return "";
  }
};

type PersistenceUiState = "idle" | "pending" | "saved" | "error" | "corrupt" | "deleting" | "delete-error";

export function SupportChat({
  locale,
  consent,
}: {
  locale: Locale;
  consent: ConversationConsentPreference | "idle";
}) {
  const t = chatCopy[locale];
  const panelId = useId();
  const nextMessageId = useRef(0);
  const activeRequestId = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const pendingPersistence = useRef<PendingConversationRequest | null>(null);
  const conversationStorageCorrupt = useRef(false);
  const savedConversationsRef = useRef<SavedRecordCredentials[]>([]);
  const deletionInFlight = useRef(false);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [persistenceState, setPersistenceState] = useState<PersistenceUiState>("idle");
  const [savedConversations, setSavedConversations] = useState<SavedRecordCredentials[]>([]);
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => () => activeRequest.current?.abort(), []);

  useEffect(() => {
    try {
      const saved = parseSavedConversationCredentials(sessionStorage.getItem(SAVED_CONVERSATION_CREDENTIALS_KEY));
      const pendingRequest = parsePendingConversationRequest(sessionStorage.getItem(PENDING_CONVERSATION_REQUEST_KEY));
      if (saved.status === "valid") {
        savedConversationsRef.current = saved.value;
        // oxlint-disable-next-line react/set-state-in-effect -- Initializes browser-only recovery state after hydration.
        setSavedConversations(saved.value);
      }
      if (pendingRequest.status === "valid") {
        pendingPersistence.current = pendingRequest.value;
        setInput(pendingRequest.value.content);
      }
      if (saved.status === "corrupt" || pendingRequest.status === "corrupt") {
        conversationStorageCorrupt.current = true;
        setPersistenceState("corrupt");
        return;
      }
      if (pendingRequest.status === "valid") {
        setPersistenceState("pending");
      } else if (saved.status === "valid" && saved.value.length > 0) {
        setPersistenceState("saved");
      }
    } catch {
      setPersistenceState("corrupt");
    }
  }, []);

  useEffect(() => {
    const log = chatLogRef.current;
    if (!log) return;
    const behavior = prefersReducedMotion() ? "auto" as const : "smooth" as const;
    if (typeof log.scrollTo === "function") log.scrollTo({ top: log.scrollHeight, behavior });
    else log.scrollTop = log.scrollHeight;
  }, [messages.length, pending]);

  const createEntry = (role: SupportChatMessage["role"], content: string): ChatEntry => ({
    id: `${role}-${nextMessageId.current++}`,
    role,
    content,
  });

  const sendMessage = async (event?: FormEvent, suggestedQuestion?: string) => {
    event?.preventDefault();
    const content = (suggestedQuestion ?? input).trim();
    if (!content || pending || deletionInFlight.current) return;

    const requestId = ++activeRequestId.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), SUPPORT_CHAT_TIMEOUT_MS);
    const userMessage = createEntry("user", content);
    const requestMessages = [...messages, userMessage]
      .slice(-7)
      .map(({ role, content: messageContent }) => ({ role, content: messageContent }));
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setPending(true);
    setError("");

    let requestPersistence: PendingConversationRequest | null = null;
    const recoverablePending = pendingPersistence.current;
    if (consent === "accepted" && recoverablePending?.content === content) {
      requestPersistence = recoverablePending;
    } else if (consent === "accepted" && !recoverablePending && persistenceState !== "corrupt" && savedConversations.length < 20) {
      requestPersistence = {
        ...createConversationRequestSecrets(),
        locale,
        content,
      };
      try {
        sessionStorage.setItem(
          PENDING_CONVERSATION_REQUEST_KEY,
          serializePendingConversationRequest(requestPersistence),
        );
        pendingPersistence.current = requestPersistence;
        setPersistenceState("pending");
      } catch {
        requestPersistence = null;
        setPersistenceState("error");
      }
    } else if (consent === "accepted" && savedConversations.length >= 20) {
      setPersistenceState("error");
    }

    try {
      const response = await fetch("/api/support-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locale: requestPersistence?.locale ?? locale,
          messages: requestMessages,
          ...(requestPersistence ? {
            persistence: {
              consent: { accepted: true, version: CONVERSATION_CONSENT_VERSION },
              idempotencyKey: requestPersistence.idempotencyKey,
              deletionToken: requestPersistence.deletionToken,
            },
          } : {}),
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new ChatRequestError(await readErrorCode(response));
      const body = await response.json() as {
        reply?: unknown;
        persistence?: { status?: unknown; id?: unknown };
      };
      if (typeof body.reply !== "string" || !body.reply.trim()) throw new Error("Support chat returned no reply");
      const reply = body.reply.trim();
      if (activeRequestId.current !== requestId) return;
      setMessages((current) => [...current, createEntry("assistant", reply)]);
      if (requestPersistence) {
        if (body.persistence?.status === "saved" && typeof body.persistence.id === "string") {
          if (conversationStorageCorrupt.current) {
            setPersistenceState("corrupt");
            return;
          }
          try {
            const nextSaved = appendSavedConversationCredentials(savedConversationsRef.current, {
              id: body.persistence.id,
              deletionToken: requestPersistence.deletionToken,
            });
            sessionStorage.setItem(
              SAVED_CONVERSATION_CREDENTIALS_KEY,
              serializeSavedConversationCredentials(nextSaved),
            );
            sessionStorage.removeItem(PENDING_CONVERSATION_REQUEST_KEY);
            pendingPersistence.current = null;
            savedConversationsRef.current = nextSaved;
            setSavedConversations(nextSaved);
            setPersistenceState("saved");
          } catch {
            setPersistenceState("error");
          }
        } else {
          setPersistenceState("error");
        }
      }
    } catch (requestError) {
      if (activeRequestId.current !== requestId) return;
      setMessages((current) => current.filter((message) => message.id !== userMessage.id));
      setInput(content);
      setError(requestError instanceof ChatRequestError ? requestError.code : "REQUEST_FAILED");
    } finally {
      window.clearTimeout(timeout);
      if (activeRequestId.current === requestId) {
        activeRequest.current = null;
        setPending(false);
      }
    }
  };

  const clearConversation = () => {
    activeRequest.current?.abort();
    activeRequest.current = null;
    activeRequestId.current += 1;
    setMessages([]);
    setInput(pendingPersistence.current?.content ?? "");
    setPending(false);
    setError("");
    if (pendingPersistence.current) setPersistenceState("pending");
  };

  const deleteSavedConversation = async (credentials: SavedRecordCredentials) => {
    if (activeRequest.current || deletionInFlight.current) return;
    deletionInFlight.current = true;
    setDeletingId(credentials.id);
    setPersistenceState("deleting");
    try {
      await deleteConversation(credentials);
      const remaining = savedConversationsRef.current.filter((item) => item.id !== credentials.id);
      if (remaining.length > 0) {
        sessionStorage.setItem(
          SAVED_CONVERSATION_CREDENTIALS_KEY,
          serializeSavedConversationCredentials(remaining),
        );
      } else {
        sessionStorage.removeItem(SAVED_CONVERSATION_CREDENTIALS_KEY);
      }
      savedConversationsRef.current = remaining;
      setSavedConversations(remaining);
      setPersistenceState(pendingPersistence.current ? "pending" : remaining.length > 0 ? "saved" : "idle");
    } catch {
      setPersistenceState("delete-error");
    } finally {
      deletionInFlight.current = false;
      setDeletingId("");
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const isComposing = event.nativeEvent.isComposing || event.keyCode === 229;
    if (event.key === "Enter" && !event.shiftKey && !isComposing) {
      event.preventDefault();
      void sendMessage();
    }
  };

  return <section className="support-chat" id="conversation-storage" tabIndex={-1}>
    <div className="support-chat-heading">
      <div className="chat-title-row"><span className="chat-spark" aria-hidden="true">✦</span><div><h2>{t.title}</h2></div></div>
    </div>
    <div className="support-chat-panel" id={panelId}>
      <p className="chat-disclosure">{t.disclosure}</p>
      {messages.length === 0 && !pending && <div className="chat-suggestions">{t.suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => void sendMessage(undefined, suggestion)}>{suggestion}<span aria-hidden="true">→</span></button>)}</div>}
      {messages.length > 0 && <div className="chat-log" aria-live="polite" ref={chatLogRef}>{messages.map((message) => <article className={`chat-message ${message.role}`} key={message.id}><small>{message.role === "user" ? t.you : t.assistant}</small><p>{message.content}</p></article>)}</div>}
      {pending && <output className="chat-pending" aria-live="polite"><span aria-hidden="true" />{t.pending}</output>}
      {error && <p className="chat-error" role="alert">{error === "HIGH_RISK_IDENTIFIER" ? t.identifierError : t.error}</p>}
      {persistenceState === "pending" && <output className="consent-status" aria-live="polite">{t.persistencePending}</output>}
      {persistenceState === "saved" && <output className="consent-status" aria-live="polite">{t.persistenceSaved}</output>}
      {persistenceState === "error" && <output className="consent-status error" aria-live="polite">{t.persistenceError}</output>}
      {persistenceState === "corrupt" && <output className="consent-status error" aria-live="polite">{t.persistenceCorrupt}</output>}
      {persistenceState === "delete-error" && <output className="consent-status error" aria-live="polite">{t.deleteFailed}</output>}
      <form className="chat-form" onSubmit={sendMessage}>
        <label className="sr-only" htmlFor={`${panelId}-input`}>{t.label}</label>
        <div className="chat-compose"><textarea id={`${panelId}-input`} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} maxLength={800} placeholder={t.placeholder} rows={2} disabled={pending || Boolean(deletingId)} /><button type="submit" className="primary-button" aria-label={t.send} disabled={pending || Boolean(deletingId) || !input.trim()}><span aria-hidden="true">↑</span></button></div>
        {messages.length > 0 && <button type="button" className="text-button chat-clear" disabled={Boolean(deletingId)} onClick={clearConversation}>{t.clear}</button>}
      </form>
      {savedConversations.length > 0 && <div className="saved-conversations"><h3>{t.savedRecords} ({savedConversations.length})</h3>{savedConversations.map((credentials) => <details key={credentials.id}><summary>{t.recordId}: <code>{credentials.id}</code></summary><dl><div><dt>{t.deletionToken}</dt><dd><code>{credentials.deletionToken}</code></dd></div></dl><button type="button" className="secondary-button" disabled={pending || Boolean(deletingId)} onClick={() => void deleteSavedConversation(credentials)}>{deletingId === credentials.id ? t.deleting : t.deleteRecord}</button></details>)}</div>}
    </div>
  </section>;
}
