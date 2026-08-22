"use client";

import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Locale } from "@/src/components/staybridge-session";
import type { SupportChatMessage } from "@/src/ai/support-chat";

const chatCopy = {
  ja: {
    title: "AIで相談内容を整理する",
    intro: "制度を判断するのではなく、窓口で何を確認するか・どう伝えるかを一緒に整理します。",
    disclosure: "返信の生成にはCloudflare Workers AIを使います。状況確認の回答は自動送信されず、この会話は再読み込みすると消えます。",
    privacy: "氏名、連絡先、旅券・在留カード番号、正確な住所、政治・宗教・迫害の事情は入力しないでください。",
    label: "相談したいこと",
    placeholder: "例：相談窓口で何を聞けばいいですか？",
    send: "送る",
    close: "閉じる",
    clear: "会話を消去",
    you: "あなた",
    assistant: "AI案内",
    pending: "回答を整理しています",
    error: "AI案内を利用できません。時間をおいて再試行するか、上の公式相談先を利用してください。",
  },
  en: {
    title: "Organize my questions with AI",
    intro: "This does not decide your status. It helps you organize what to explain and ask at an official support desk.",
    disclosure: "Cloudflare Workers AI generates replies. Your situation-check answers are not sent automatically, and this conversation disappears when you reload.",
    privacy: "Do not enter your name, contact details, passport or residence-card number, exact address, political or religious views, or persecution history.",
    label: "What do you want to ask?",
    placeholder: "Example: What should I ask at a support desk?",
    send: "Send",
    close: "Close",
    clear: "Clear conversation",
    you: "You",
    assistant: "AI guide",
    pending: "Organizing a response",
    error: "The AI guide is unavailable. Try again later or use an official support link above.",
  },
  my: {
    title: "AI ဖြင့် မေးလိုသောအချက်များ စီစဉ်ရန်",
    intro: "အခြေအနေကို ဆုံးဖြတ်ပေးခြင်းမဟုတ်ဘဲ တရားဝင်တိုင်ပင်ရာတွင် ရှင်းပြရန်နှင့် မေးရန်အချက်များကို စီစဉ်ပေးသည်။",
    disclosure: "အဖြေထုတ်ရန် Cloudflare Workers AI ကို အသုံးပြုသည်။ အခြေအနေစစ်ဆေးမှုအဖြေများကို အလိုအလျောက်မပို့ဘဲ စာမျက်နှာပြန်ဖွင့်လျှင် ဤစကားဝိုင်း ပျောက်သွားမည်။",
    privacy: "အမည်၊ ဆက်သွယ်ရန်အချက်အလက်၊ နိုင်ငံကူးလက်မှတ်/နေထိုင်ခွင့်ကတ်နံပါတ်၊ လိပ်စာအတိအကျ၊ နိုင်ငံရေး၊ ဘာသာရေး သို့မဟုတ် ဖိနှိပ်ခံရမှုအသေးစိတ် မထည့်ပါနှင့်။",
    label: "မေးလိုသောအချက်",
    placeholder: "ဥပမာ - တိုင်ပင်ရာမှာ ဘာတွေမေးသင့်သလဲ။",
    send: "ပို့ရန်",
    close: "ပိတ်ရန်",
    clear: "စကားဝိုင်းဖျက်ရန်",
    you: "သင်",
    assistant: "AI လမ်းညွှန်",
    pending: "အဖြေကို စီစဉ်နေသည်",
    error: "AI လမ်းညွှန်ကို ယခုမသုံးနိုင်ပါ။ နောက်မှ ထပ်ကြိုးစားပါ သို့မဟုတ် အပေါ်ရှိ တရားဝင်တိုင်ပင်ရာကို အသုံးပြုပါ။",
  },
} as const;

type ChatEntry = SupportChatMessage & { id: string };

export function SupportChat({ locale }: { locale: Locale }) {
  const t = chatCopy[locale];
  const panelId = useId();
  const nextMessageId = useRef(0);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  const createEntry = (role: SupportChatMessage["role"], content: string): ChatEntry => ({
    id: `${role}-${nextMessageId.current++}`,
    role,
    content,
  });

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    const content = input.trim();
    if (!content || pending) return;

    const userMessage = createEntry("user", content);
    const requestMessages = [...messages, userMessage].slice(-8).map(({ role, content: messageContent }) => ({ role, content: messageContent }));
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setPending(true);
    setError(false);

    try {
      const response = await fetch("/api/support-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale, messages: requestMessages }),
      });
      if (!response.ok) throw new Error(`Support chat failed: ${response.status}`);
      const body = await response.json() as { reply?: unknown };
      if (typeof body.reply !== "string" || !body.reply.trim()) throw new Error("Support chat returned no reply");
      const reply = body.reply.trim();
      setMessages((current) => [...current, createEntry("assistant", reply)]);
    } catch {
      setMessages((current) => current.filter((message) => message.id !== userMessage.id));
      setInput(content);
      setError(true);
    } finally {
      setPending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  return <section className={`support-chat${isOpen ? " open" : ""}`}>
    <div className="support-chat-heading">
      <div><span className="chat-status" aria-hidden="true" /><small>AI SUPPORT PREP</small><h2>{t.title}</h2><p>{t.intro}</p></div>
      <button className="secondary-button" type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setIsOpen((open) => !open)}>{isOpen ? t.close : t.title}</button>
    </div>
    {isOpen && <div className="support-chat-panel" id={panelId}>
      <div className="chat-disclosure"><strong>{t.disclosure}</strong><span>{t.privacy}</span></div>
      {messages.length > 0 && <div className="chat-log" aria-live="polite">{messages.map((message) => <article className={`chat-message ${message.role}`} key={message.id}><small>{message.role === "user" ? t.you : t.assistant}</small><p>{message.content}</p></article>)}</div>}
      {pending && <output className="chat-pending" aria-live="polite"><span aria-hidden="true" />{t.pending}</output>}
      {error && <p className="chat-error" role="alert">{t.error}</p>}
      <form className="chat-form" onSubmit={sendMessage}>
        <label htmlFor={`${panelId}-input`}>{t.label}</label>
        <textarea id={`${panelId}-input`} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} maxLength={800} placeholder={t.placeholder} rows={3} disabled={pending} />
        <div className="chat-actions">{messages.length > 0 && <button type="button" className="text-button" onClick={() => { setMessages([]); setError(false); }}>{t.clear}</button>}<button type="submit" className="primary-button" disabled={pending || !input.trim()}>{t.send}<span aria-hidden="true">→</span></button></div>
      </form>
    </div>}
  </section>;
}
