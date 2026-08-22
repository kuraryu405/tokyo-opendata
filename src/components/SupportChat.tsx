"use client";

import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Locale } from "@/src/components/staybridge-session";
import type { SupportChatMessage } from "@/src/ai/support-chat";

const chatCopy = {
  ja: {
    title: "AI相談アシスタント",
    intro: "相談窓口で何を確認するか、一緒に考えられます。",
    question: "何を相談したいですか？",
    suggestions: ["相談窓口で何を聞けばいい？", "今の状況をどう説明すればいい？", "持っていくものを整理したい"],
    disclosure: "AIは誤ることがあります。回答内容をご確認ください。状況確認の回答は自動送信されません。",
    provider: "返信にはCloudflare Workers AIを使い、会話は再読み込みすると消えます。",
    privacy: "氏名、連絡先、旅券・在留カード番号、正確な住所、政治・宗教・迫害の事情は入力しないでください。",
    label: "相談したいこと",
    placeholder: "例：相談窓口で何を聞けばいいですか？",
    send: "送る",
    clear: "会話を消去",
    you: "あなた",
    assistant: "AI案内",
    pending: "回答を整理しています",
    error: "AI案内を利用できません。時間をおいて再試行するか、上の公式相談先を利用してください。",
  },
  en: {
    title: "AI consultation assistant",
    intro: "Think through what to explain and ask at a support desk.",
    question: "What would you like help with?",
    suggestions: ["What should I ask at a support desk?", "How can I explain my situation?", "Help me prepare what to bring"],
    disclosure: "AI can make mistakes. Check its answers. Your situation-check answers are not sent automatically.",
    provider: "Replies use Cloudflare Workers AI, and the conversation disappears when you reload.",
    privacy: "Do not enter your name, contact details, passport or residence-card number, exact address, political or religious views, or persecution history.",
    label: "What do you want to ask?",
    placeholder: "Example: What should I ask at a support desk?",
    send: "Send",
    clear: "Clear conversation",
    you: "You",
    assistant: "AI guide",
    pending: "Organizing a response",
    error: "The AI guide is unavailable. Try again later or use an official support link above.",
  },
  my: {
    title: "AI တိုင်ပင်ရေး အကူ",
    intro: "တိုင်ပင်ရာတွင် ရှင်းပြရန်နှင့် မေးရန်အချက်များကို အတူစဉ်းစားနိုင်သည်။",
    question: "ဘာကို ကူညီစေချင်ပါသလဲ။",
    suggestions: ["တိုင်ပင်ရာမှာ ဘာတွေမေးသင့်သလဲ။", "အခြေအနေကို ဘယ်လိုရှင်းပြရမလဲ။", "ယူသွားရမည့်အရာများ စီစဉ်ပေးပါ"],
    disclosure: "AI သည် မှားနိုင်ပါသည်။ အဖြေကို စစ်ဆေးပါ။ အခြေအနေစစ်ဆေးမှုအဖြေများကို အလိုအလျောက်မပို့ပါ။",
    provider: "အဖြေထုတ်ရန် Cloudflare Workers AI ကို အသုံးပြုပြီး စာမျက်နှာပြန်ဖွင့်လျှင် စကားဝိုင်းပျောက်သွားမည်။",
    privacy: "အမည်၊ ဆက်သွယ်ရန်အချက်အလက်၊ နိုင်ငံကူးလက်မှတ်/နေထိုင်ခွင့်ကတ်နံပါတ်၊ လိပ်စာအတိအကျ၊ နိုင်ငံရေး၊ ဘာသာရေး သို့မဟုတ် ဖိနှိပ်ခံရမှုအသေးစိတ် မထည့်ပါနှင့်။",
    label: "မေးလိုသောအချက်",
    placeholder: "ဥပမာ - တိုင်ပင်ရာမှာ ဘာတွေမေးသင့်သလဲ။",
    send: "ပို့ရန်",
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
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  const createEntry = (role: SupportChatMessage["role"], content: string): ChatEntry => ({
    id: `${role}-${nextMessageId.current++}`,
    role,
    content,
  });

  const sendMessage = async (event?: FormEvent, suggestedQuestion?: string) => {
    event?.preventDefault();
    const content = (suggestedQuestion ?? input).trim();
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

  return <section className="support-chat">
    <div className="support-chat-heading">
      <div className="chat-title-row"><span className="chat-spark" aria-hidden="true">✦</span><div><small>AI SUPPORT</small><h2>{t.title}</h2></div></div>
      <p>{t.intro}</p>
    </div>
    <div className="support-chat-panel" id={panelId}>
      <h3>{t.question}</h3>
      <p className="chat-disclosure">{t.disclosure}</p>
      {messages.length === 0 && !pending && <div className="chat-suggestions">{t.suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => void sendMessage(undefined, suggestion)}>{suggestion}<span aria-hidden="true">→</span></button>)}</div>}
      {messages.length > 0 && <div className="chat-log" aria-live="polite">{messages.map((message) => <article className={`chat-message ${message.role}`} key={message.id}><small>{message.role === "user" ? t.you : t.assistant}</small><p>{message.content}</p></article>)}</div>}
      {pending && <output className="chat-pending" aria-live="polite"><span aria-hidden="true" />{t.pending}</output>}
      {error && <p className="chat-error" role="alert">{t.error}</p>}
      <form className="chat-form" onSubmit={sendMessage}>
        <label className="sr-only" htmlFor={`${panelId}-input`}>{t.label}</label>
        <div className="chat-compose"><textarea id={`${panelId}-input`} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} maxLength={800} placeholder={t.placeholder} rows={2} disabled={pending} /><button type="submit" className="primary-button" aria-label={t.send} disabled={pending || !input.trim()}><span aria-hidden="true">↑</span></button></div>
        {messages.length > 0 && <button type="button" className="text-button chat-clear" onClick={() => { setMessages([]); setError(false); }}>{t.clear}</button>}
      </form>
      <p className="chat-footnote"><span>{t.provider}</span><span>{t.privacy}</span></p>
    </div>
  </section>;
}
