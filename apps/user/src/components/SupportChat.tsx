"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { SupportChatMessage } from "../ai/support-chat";
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
    clear: "会話を消去",
    you: "あなた",
    assistant: "AI案内",
    pending: "回答を整理しています",
    error: "AI案内を利用できません。時間をおいて再試行するか、この画面の公式相談先を利用してください。",
  },
  en: {
    title: "AI consultation assistant",
    suggestions: ["What should I ask at a support desk?", "How can I explain my situation?", "Help me prepare what to bring"],
    disclosure: "AI can make mistakes. Do not enter personal information, and check its answers. Your situation-check answers are not sent automatically.",
    label: "What do you want to ask?",
    placeholder: "Example: What should I ask at a support desk?",
    send: "Send",
    clear: "Clear conversation",
    you: "You",
    assistant: "AI guide",
    pending: "Organizing a response",
    error: "The AI guide is unavailable. Try again later or use an official support link on this page.",
  },
  my: {
    title: "AI တိုင်ပင်ရေး အကူ",
    suggestions: ["တိုင်ပင်ရာမှာ ဘာတွေမေးသင့်သလဲ။", "အခြေအနေကို ဘယ်လိုရှင်းပြရမလဲ။", "ယူသွားရမည့်အရာများ စီစဉ်ပေးပါ"],
    disclosure: "AI သည် မှားနိုင်ပါသည်။ ကိုယ်ရေးအချက်အလက် မထည့်ဘဲ အဖြေကို စစ်ဆေးပါ။ အခြေအနေစစ်ဆေးမှုအဖြေများကို အလိုအလျောက်မပို့ပါ။",
    label: "မေးလိုသောအချက်",
    placeholder: "ဥပမာ - တိုင်ပင်ရာမှာ ဘာတွေမေးသင့်သလဲ။",
    send: "ပို့ရန်",
    clear: "စကားဝိုင်းဖျက်ရန်",
    you: "သင်",
    assistant: "AI လမ်းညွှန်",
    pending: "အဖြေကို စီစဉ်နေသည်",
    error: "AI လမ်းညွှန်ကို ယခုမသုံးနိုင်ပါ။ နောက်မှ ထပ်ကြိုးစားပါ သို့မဟုတ် ဤစာမျက်နှာရှိ တရားဝင်တိုင်ပင်ရာကို အသုံးပြုပါ။",
  },
} as const;

type ChatEntry = SupportChatMessage & { id: string };

export function SupportChat({ locale }: { locale: Locale }) {
  const t = chatCopy[locale];
  const panelId = useId();
  const nextMessageId = useRef(0);
  const activeRequestId = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => () => activeRequest.current?.abort(), []);

  const createEntry = (role: SupportChatMessage["role"], content: string): ChatEntry => ({
    id: `${role}-${nextMessageId.current++}`,
    role,
    content,
  });

  const sendMessage = async (event?: FormEvent, suggestedQuestion?: string) => {
    event?.preventDefault();
    const content = (suggestedQuestion ?? input).trim();
    if (!content || pending) return;

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
    setError(false);

    try {
      const response = await fetch("/api/support-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale, messages: requestMessages }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Support chat failed: ${response.status}`);
      const body = await response.json() as { reply?: unknown };
      if (typeof body.reply !== "string" || !body.reply.trim()) throw new Error("Support chat returned no reply");
      const reply = body.reply.trim();
      if (activeRequestId.current !== requestId) return;
      setMessages((current) => [...current, createEntry("assistant", reply)]);
    } catch {
      if (activeRequestId.current !== requestId) return;
      setMessages((current) => current.filter((message) => message.id !== userMessage.id));
      setInput(content);
      setError(true);
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
    setPending(false);
    setError(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const isComposing = event.nativeEvent.isComposing || event.keyCode === 229;
    if (event.key === "Enter" && !event.shiftKey && !isComposing) {
      event.preventDefault();
      void sendMessage();
    }
  };

  return <section className="support-chat">
    <div className="support-chat-heading">
      <div className="chat-title-row"><span className="chat-spark" aria-hidden="true">✦</span><div><h2>{t.title}</h2></div></div>
    </div>
    <div className="support-chat-panel" id={panelId}>
      <p className="chat-disclosure">{t.disclosure}</p>
      {messages.length === 0 && !pending && <div className="chat-suggestions">{t.suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => void sendMessage(undefined, suggestion)}>{suggestion}<span aria-hidden="true">→</span></button>)}</div>}
      {messages.length > 0 && <div className="chat-log" aria-live="polite">{messages.map((message) => <article className={`chat-message ${message.role}`} key={message.id}><small>{message.role === "user" ? t.you : t.assistant}</small><p>{message.content}</p></article>)}</div>}
      {pending && <output className="chat-pending" aria-live="polite"><span aria-hidden="true" />{t.pending}</output>}
      {error && <p className="chat-error" role="alert">{t.error}</p>}
      <form className="chat-form" onSubmit={sendMessage}>
        <label className="sr-only" htmlFor={`${panelId}-input`}>{t.label}</label>
        <div className="chat-compose"><textarea id={`${panelId}-input`} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} maxLength={800} placeholder={t.placeholder} rows={2} disabled={pending} /><button type="submit" className="primary-button" aria-label={t.send} disabled={pending || !input.trim()}><span aria-hidden="true">↑</span></button></div>
        {messages.length > 0 && <button type="button" className="text-button chat-clear" onClick={clearConversation}>{t.clear}</button>}
      </form>
    </div>
  </section>;
}
