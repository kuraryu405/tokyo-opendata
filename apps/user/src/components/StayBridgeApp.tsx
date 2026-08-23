"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { generateActions } from "@staybridge/domain/rules";
import type { Action, NeedCategory, Situation } from "@staybridge/domain/types";
import {
  localResources,
  sourceRegistry,
  type LocalResource,
  type LocalResourceId,
} from "@staybridge/data";
import { getLocalResourceDisplay } from "@staybridge/i18n";
import {
  createInitialSituation,
  isAssessmentComplete,
  parseStoredSession,
  readStoredLocale,
  serializeStoredSession,
  type FamilyAnswer,
  type FamilyAnswers,
  type Locale,
  type StayAnswer,
} from "./staybridge-session";
import { resolveMunicipalityAppUrl } from "../municipality-url";

type Screen = "landing" | "check" | "status" | "roadmap" | "local" | "help" | "summary";
type CopyState = "idle" | "copied" | "error";
type LocalFilter = "all" | "school" | "medical" | "child_support" | "public_facility";
type AppRoute = { screen: Screen; step: number; filter?: LocalFilter; flowId?: string };
type AppHistoryState = { staybridge?: AppRoute };

const screenNames: Screen[] = ["landing", "check", "status", "roadmap", "local", "help", "summary"];
const localFilters: LocalFilter[] = ["all", "school", "medical", "child_support", "public_facility"];

function getHistoryScreen(state: unknown) {
  const route = (state as AppHistoryState | null)?.staybridge;
  if (!route || !screenNames.includes(route.screen)) return null;
  const filter = route.screen === "local" && localFilters.includes(route.filter as LocalFilter) ? route.filter as LocalFilter : undefined;
  const flowId = typeof route.flowId === "string" ? route.flowId : undefined;
  return { screen: route.screen, step: Number.isInteger(route.step) && route.step >= 0 && route.step <= 9 ? route.step : 0, filter, flowId };
}

function getUrlScreen(href: string): AppRoute | null {
  const url = new URL(href);
  const screen = url.searchParams.get("screen");
  if (!screen || !screenNames.includes(screen as Screen)) return null;
  const step = Number(url.searchParams.get("step"));
  const requestedFilter = url.searchParams.get("filter");
  const filter = screen === "local" && localFilters.includes(requestedFilter as LocalFilter) ? requestedFilter as LocalFilter : undefined;
  return { screen: screen as Screen, step: Number.isInteger(step) && step >= 0 && step <= 9 ? step : 0, filter };
}

function getFirstUnansweredStep(answeredSteps: number[]) {
  return Array.from({ length: 10 }, (_, index) => index).find((step) => !answeredSteps.includes(step)) ?? 0;
}

function normalizeRoute(route: AppRoute, answeredSteps: number[]): AppRoute {
  const complete = isAssessmentComplete(answeredSteps);
  const firstUnansweredStep = getFirstUnansweredStep(answeredSteps);
  if (route.screen === "check") {
    return { screen: "check", step: complete ? route.step : Math.min(route.step, firstUnansweredStep) };
  }
  if (!complete && route.screen !== "landing") return { screen: "check", step: firstUnansweredStep };
  if (route.screen === "local") return { ...route, filter: route.filter ?? "all" };
  return route;
}

function getHistoryUrl(route: AppRoute, href: string) {
  const url = new URL(href);
  if (route.screen === "landing") {
    url.searchParams.delete("screen");
    url.searchParams.delete("step");
    url.searchParams.delete("filter");
  } else {
    url.searchParams.set("screen", route.screen);
    if (route.screen === "check") url.searchParams.set("step", String(route.step));
    else url.searchParams.delete("step");
    if (route.screen === "local") url.searchParams.set("filter", route.filter ?? "all");
    else url.searchParams.delete("filter");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function routesMatch(left: AppRoute | null, right: AppRoute) {
  return left?.screen === right.screen && left.step === right.step && left.filter === right.filter;
}

function createFlowId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const actionDestinations: Record<string, { screen: "local" | "help"; filter?: LocalFilter }> = {
  CHECK_CHILD_EDUCATION: { screen: "local", filter: "school" },
  CHECK_MEDICAL_OPTIONS: { screen: "local", filter: "medical" },
  CHECK_CHILD_LOCAL_SUPPORT: { screen: "local", filter: "child_support" },
};

function currentTokyoDate(): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

const copy = {
  ja: {
    skip: "本文へ移動",
    navSteps: "わたしのステップ",
    brandToSteps: "わたしのステップへ戻る",
    navLocal: "近くの支援",
    navHelp: "相談先",
    crisis: "行政・支援者向け Preparedness View",
    eyebrow: "東京で、予定外に生活を続けることになった方へ",
    hero: "国には帰れない。\nでも、東京での次の一歩は見つけられる。",
    intro: "帰国する予定だったのに、母国の状況が変わって帰ることが難しくなった方へ。今の状況に合わせて、東京で当面生活するために確認したいことを整理します。",
    start: "今の状況を確認する",
    demo: "デモの状況を読み込む",
    noLogin: "登録不要",
    noAddress: "正確な住所は不要",
    official: "公式情報につなぐ",
    notDecision: "在留資格や法律上の判断は行いません",
    privacyTitle: "答えるのは、次の行動に必要なことだけです",
    privacyText: "氏名、パスポート番号、在留カード番号、正確な住所、政治や迫害に関する事情は入力しません。回答はこの端末のセッション内だけに保存されます。",
    back: "戻る",
    backToTop: "トップページへ戻る",
    next: "次へ",
    finish: "状況を整理する",
    selectMany: "あてはまるものをすべて選べます",
    optional: "分かる範囲で大丈夫です",
    reviewed: "今の状況を整理しました",
    reviewedIntro: "まず、滞在についての公式な確認と、当面の生活に必要な情報を順番に見ていきます。",
    seeRoadmap: "次のステップを見る",
    answerAgain: "回答を見直す",
    restart: "最初からやり直す",
    restartPrompt: "気に入らないですか？",
    loading: "次のステップを準備しています",
    roadmapTitle: "あなたの次のステップ",
    why: "なぜこの案内？",
    source: "根拠となる情報",
    verified: "確認日",
    human: "個別の確認が必要",
    localTitle: "この地域で確認できる場所",
    all: "すべて",
    school: "学校・教育",
    medical: "医療",
    child_support: "子どもの居場所",
    public_facility: "公共施設",
    details: "公式サイトを見る",
    sourceLabel: "Open Data source",
    updated: "データ更新",
    unavailable: "公開日不明",
    schoolNote: "入学・就学については自治体または教育機関への確認が必要です。",
    noResources: "この地域は現在、StayBridgeのMVPでは詳細な地域データに対応していません。",
    helpTitle: "人に相談する",
    helpIntro: "この内容は、あなたの滞在状況によって手続が変わる可能性があります。StayBridgeでは最終的な判断はしません。公式の相談窓口へ確認してください。",
    prepare: "相談前に準備すること",
    prepareItems: ["パスポートなど、現在持っている書類", "もともとの帰国予定日", "相談したいことのメモ", "通訳が必要かどうか"],
    summary: "相談内容をまとめる",
    summaryTitle: "相談員に見せるサマリー",
    summaryIntro: "入力した内容だけをまとめています。画面を見せるか、コピーして利用できます。",
    current: "現在の状況",
    questions: "確認したいこと",
    copy: "コピーする",
    copied: "コピーしました",
    print: "印刷する",
    showMode: "相談員に見せる",
    emergency: "生命や身体に差し迫った危険がある場合は、このサービスではなく110または119へ連絡してください。",
    principleTitles: ["状況を整理", "次のステップ", "地域で行動"],
    principleBodies: ["制度名を知らなくても、今の状況を一問ずつ整理。", "今日、今週、その先に確認することを順番に提示。", "Open Dataから、地域で確認する意味のある場所へ。"],
    ageLabel: "子どもの年齢",
    deadlineLabel: "滞在できる期限（任意）",
    noEnteredInfo: "まだ入力された情報はありません。",
    noSelectedNeeds: "まだ確認したいことは選択されていません。",
    storageError: "端末への保存ができませんでした。画面上では続けられますが、再読み込みすると回答が失われます。",
    copyError: "コピーできませんでした。画面の内容を選択してコピーしてください。",
  },
  en: {
    skip: "Skip to content",
    navSteps: "My steps",
    brandToSteps: "Go to my steps",
    navLocal: "Local support",
    navHelp: "Get help",
    crisis: "Preparedness View for public teams",
    eyebrow: "For people unexpectedly needing to stay in Tokyo",
    hero: "You cannot return home.\nBut you can find your next step in Tokyo.",
    intro: "If you planned to return home but a sudden change there has made that difficult, StayBridge organizes what to check so you can manage life in Tokyo for now.",
    start: "Check my situation",
    demo: "Load demo situation",
    noLogin: "No account",
    noAddress: "No exact address",
    official: "Links to official sources",
    notDecision: "We do not decide immigration or legal status",
    privacyTitle: "Only answer what is needed for your next steps",
    privacyText: "We do not ask for your name, passport or residence card number, exact address, political views, or persecution history. Answers stay in this browser session.",
    back: "Back",
    backToTop: "Back to home",
    next: "Next",
    finish: "Organize my situation",
    selectMany: "Select all that apply",
    optional: "Answer only what you know",
    reviewed: "We organized your situation",
    reviewedIntro: "First, confirm your stay with an official source. Then work through the practical information you may need.",
    seeRoadmap: "See my next steps",
    answerAgain: "Review answers",
    restart: "Start over",
    restartPrompt: "If this guidance does not fit",
    loading: "Preparing your next steps",
    roadmapTitle: "Your next steps",
    why: "Why am I seeing this?",
    source: "Supporting source",
    verified: "Verified",
    human: "Individual review needed",
    localTitle: "Places to check in this area",
    all: "All",
    school: "Schools & education",
    medical: "Medical",
    child_support: "Child spaces",
    public_facility: "Public facilities",
    details: "Open official website",
    sourceLabel: "Open Data source",
    updated: "Data updated",
    unavailable: "Not published",
    schoolNote: "Ask the municipality or education authority about enrollment and attendance.",
    noResources: "Detailed local data for this area is not yet covered by the StayBridge MVP.",
    helpTitle: "Talk to a person",
    helpIntro: "Procedures may depend on your individual stay. StayBridge does not make the final decision. Please confirm with an official support desk.",
    prepare: "Prepare before you talk",
    prepareItems: ["Documents you currently have, such as your passport", "Your original planned departure date", "A note of what you need to ask", "Whether you need an interpreter"],
    summary: "Create consultation summary",
    summaryTitle: "Summary to show a support worker",
    summaryIntro: "This includes only what you entered. Show this screen or copy the text.",
    current: "Current situation",
    questions: "What I need to confirm",
    copy: "Copy",
    copied: "Copied",
    print: "Print",
    showMode: "Show to a support worker",
    emergency: "If there is an immediate threat to life or safety, contact 110 or 119 instead of using this service.",
    principleTitles: ["Situation", "Next steps", "Local action"],
    principleBodies: ["Organize your situation one question at a time without knowing official terms.", "See what to check today, this week, and after that in a clear order.", "Use open data to find relevant places to check in your municipality."],
    ageLabel: "Child age",
    deadlineLabel: "Stay deadline (optional)",
    noEnteredInfo: "No situation information has been entered yet.",
    noSelectedNeeds: "No questions or concerns have been selected yet.",
    storageError: "We could not save on this device. You can continue, but answers will be lost after reloading.",
    copyError: "We could not copy the summary. Please select and copy the text on this screen.",
  },
  my: {
    skip: "အကြောင်းအရာသို့ သွားရန်",
    navSteps: "ကျွန်ုပ်၏ အဆင့်များ",
    brandToSteps: "ကျွန်ုပ်၏ အဆင့်များသို့ ပြန်သွားရန်",
    navLocal: "အနီးအနား အကူအညီ",
    navHelp: "အကူအညီ",
    crisis: "အုပ်ချုပ်ရေးနှင့် ကူညီသူများအတွက် Preparedness View",
    eyebrow: "တိုကျိုတွင် မမျှော်လင့်ဘဲ ဆက်လက်နေထိုင်ရသူများအတွက်",
    hero: "အိမ်ကို မပြန်နိုင်သေးပါ။\nဒါပေမယ့် တိုကျိုမှာ နောက်တစ်ဆင့်ကို ရှာနိုင်ပါတယ်။",
    intro: "မိမိနိုင်ငံအခြေအနေ ပြောင်းလဲသွားလို့ စီစဉ်ထားသလို ပြန်ဖို့ခက်ခဲလာသူများအတွက်၊ တိုကျိုတွင် ယာယီဆက်နေထိုင်ရန် စစ်ဆေးရမည့်အချက်များကို စီစဉ်ပေးပါသည်။",
    start: "လက်ရှိအခြေအနေ စစ်ဆေးရန်",
    demo: "နမူနာအခြေအနေ ဖွင့်ရန်",
    noLogin: "အကောင့်မလို",
    noAddress: "လိပ်စာအတိအကျ မလို",
    official: "တရားဝင်အချက်အလက်သို့ ချိတ်ဆက်",
    notDecision: "နေထိုင်ခွင့်နှင့် ဥပဒေရေးရာကို မဆုံးဖြတ်ပါ",
    privacyTitle: "နောက်တစ်ဆင့်အတွက် လိုအပ်သလောက်သာ ဖြေပါ",
    privacyText: "အမည်၊ နိုင်ငံကူးလက်မှတ်နံပါတ်၊ နေထိုင်ခွင့်ကတ်နံပါတ်၊ လိပ်စာအတိအကျ၊ နိုင်ငံရေးအမြင် သို့မဟုတ် ဖိနှိပ်မှုအကြောင်း မမေးပါ။ အဖြေများကို ဤ browser session တွင်သာ သိမ်းထားပါသည်။",
    back: "နောက်သို့",
    backToTop: "ပင်မစာမျက်နှာသို့ ပြန်ရန်",
    next: "ရှေ့သို့",
    finish: "အခြေအနေ စီစဉ်ရန်",
    selectMany: "သက်ဆိုင်သမျှ ရွေးနိုင်သည်",
    optional: "သိသလောက် ဖြေနိုင်သည်",
    reviewed: "သင့်အခြေအနေကို စီစဉ်ပြီးပါပြီ",
    reviewedIntro: "ဦးစွာ နေထိုင်ခွင့်အခြေအနေကို တရားဝင်ဌာနတွင် အတည်ပြုပြီး နေ့စဉ်ဘဝအတွက် လိုအပ်ချက်များကို တစ်ဆင့်ချင်းကြည့်ပါ။",
    seeRoadmap: "နောက်အဆင့်များ ကြည့်ရန်",
    answerAgain: "အဖြေများ ပြန်ကြည့်ရန်",
    restart: "အစမှ ပြန်စရန်",
    restartPrompt: "ဤလမ်းညွှန်ချက် မကိုက်ညီပါက",
    loading: "သင့်နောက်အဆင့်များကို ပြင်ဆင်နေသည်",
    roadmapTitle: "သင့်နောက်အဆင့်များ",
    why: "ဘာကြောင့် ဒီအချက်ကို ပြတာလဲ",
    source: "အချက်အလက်ရင်းမြစ်",
    verified: "စစ်ဆေးသည့်ရက်",
    human: "တစ်ဦးချင်း စစ်ဆေးရန်လို",
    localTitle: "ဤဒေသတွင် စစ်ဆေးနိုင်သော နေရာများ",
    all: "အားလုံး",
    school: "ကျောင်းနှင့် ပညာရေး",
    medical: "ဆေးဘက်ဆိုင်ရာ",
    child_support: "ကလေးနေရာများ",
    public_facility: "အများပြည်သူနေရာ",
    details: "တရားဝင်ဝဘ်ဆိုက် ကြည့်ရန်",
    sourceLabel: "Open Data ရင်းမြစ်",
    updated: "ဒေတာအသစ်ပြင်ဆင်ချိန်",
    unavailable: "ထုတ်ပြန်ရက် မရှိပါ",
    schoolNote: "ကျောင်းတက်နိုင်မှုကို မြို့နယ် သို့မဟုတ် ပညာရေးဌာနသို့ အတည်ပြုပါ။",
    noResources: "StayBridge MVP တွင် ဤဒေသ၏ အသေးစိတ်ဒေတာ မပါသေးပါ။",
    helpTitle: "လူတစ်ဦးနှင့် တိုင်ပင်ရန်",
    helpIntro: "လုပ်ထုံးလုပ်နည်းများသည် တစ်ဦးချင်းအခြေအနေပေါ် မူတည်နိုင်ပါသည်။ StayBridge က နောက်ဆုံးဆုံးဖြတ်ချက် မချပေးပါ။ တရားဝင်တိုင်ပင်ရေးဌာနသို့ အတည်ပြုပါ။",
    prepare: "တိုင်ပင်မီ ပြင်ဆင်ရန်",
    prepareItems: ["နိုင်ငံကူးလက်မှတ်ကဲ့သို့ လက်ရှိစာရွက်စာတမ်းများ", "မူလပြန်ရန်စီစဉ်ထားသည့်ရက်", "မေးလိုသောအချက်များ", "စကားပြန်လို/မလို"],
    summary: "တိုင်ပင်ရန် အကျဉ်းချုပ် ပြုလုပ်ရန်",
    summaryTitle: "ကူညီသူအား ပြရန် အကျဉ်းချုပ်",
    summaryIntro: "သင်ထည့်သွင်းထားသည့် အချက်များသာ ပါဝင်ပါသည်။ ဤမျက်နှာပြင်ကိုပြနိုင်သလို စာသားကိုကူးယူနိုင်ပါသည်။",
    current: "လက်ရှိအခြေအနေ",
    questions: "အတည်ပြုလိုသည့်အချက်များ",
    copy: "ကူးယူရန်",
    copied: "ကူးယူပြီး",
    print: "ပုံနှိပ်ရန်",
    showMode: "ကူညီသူအား ပြရန်",
    emergency: "အသက် သို့မဟုတ် ကိုယ်ခန္ဓာအန္တရာယ် အရေးပေါ်ဖြစ်လျှင် ဤဝန်ဆောင်မှုအစား 110 သို့မဟုတ် 119 ကို ဆက်သွယ်ပါ။",
    principleTitles: ["အခြေအနေ", "နောက်အဆင့်များ", "ဒေသတွင်းလုပ်ဆောင်ချက်"],
    principleBodies: ["တရားဝင်အသုံးအနှုန်းများ မသိလည်း မေးခွန်းတစ်ခုချင်းဖြင့် အခြေအနေကို စီစဉ်နိုင်သည်။", "ယနေ့၊ ယခုအပတ်နှင့် နောက်ပိုင်း စစ်ဆေးရမည့်အချက်များကို အစဉ်လိုက်ကြည့်နိုင်သည်။", "Open Data ဖြင့် မိမိမြို့နယ်တွင် စစ်ဆေးသင့်သည့်နေရာများကို ရှာနိုင်သည်။"],
    ageLabel: "ကလေးအသက်",
    deadlineLabel: "နေထိုင်နိုင်သည့် နောက်ဆုံးရက် (မဖြစ်မနေမဟုတ်)",
    noEnteredInfo: "အခြေအနေအချက်အလက် မထည့်ရသေးပါ။",
    noSelectedNeeds: "စစ်ဆေးလိုသည့်အချက် မရွေးရသေးပါ။",
    storageError: "ဤစက်တွင် မသိမ်းဆည်းနိုင်ပါ။ ဆက်လက်အသုံးပြုနိုင်သော်လည်း ပြန်ဖွင့်ပါက အဖြေများ ပျောက်နိုင်ပါသည်။",
    copyError: "အကျဉ်းချုပ်ကို ကူးယူ၍မရပါ။ မျက်နှာပြင်ပေါ်ရှိ စာသားကို ရွေးချယ်ကူးယူပါ။",
  },
} as const;

const questionCopy = {
  ja: [
    ["今、東京のどの地域に滞在していますか？", "正確な住所は必要ありません。", [["Kita", "北区"], ["Shinjuku", "新宿区"], ["Toshima", "豊島区"], ["Other", "その他"]]],
    ["国籍・地域を教えてください。", "この回答は地域の支援準備には送信されません。", [["MMR", "ミャンマー"], ["OTHER", "その他"], ["UNKNOWN", "答えたくない"]]],
    ["日本にはどのような予定で来ましたか？", "制度名ではなく、分かりやすい言葉で選べます。", [["tourism", "旅行"], ["visiting_family_or_friends", "家族・知人を訪ねるため"], ["work", "仕事"], ["study", "留学"], ["resident", "日本に住んでいる"], ["other", "その他"], ["unknown", "分からない / 答えたくない"]]],
    ["もともと日本をいつ出る予定でしたか？", "おおよその予定で大丈夫です。", [["within_7_days", "7日以内"], ["within_30_days", "30日以内"], ["within_3_months", "3か月以内"], ["no_departure_plan", "帰国予定はなかった"], ["unknown", "分からない"]]],
    ["今、予定どおり帰国できますか？", "ここでは、あなたの現在の認識を教えてください。", [["possible", "帰国できる"], ["difficult", "帰国することが難しい"], ["unknown", "分からない"]]],
    ["日本にいつまで滞在できるか分かりますか？", "在留資格の名前が分からなくても進められます。", [["known", "分かっている"], ["unknown", "分からない"], ["documents", "書類を確認したい"]]],
    ["一緒に日本にいる家族はいますか？", "子どもがいる場合は年齢も選びます。", [["none", "いない"], ["children", "子どもがいる"], ["spouse", "配偶者がいる"], ["other", "その他家族がいる"]]],
    ["今、どこに滞在していますか？", "正確な場所は入力しません。", [["hotel", "ホテル・宿泊施設"], ["family_or_friend", "家族・知人の家"], ["rental", "賃貸住宅"], ["temporary_facility", "一時的な施設"], ["unstable", "今後の滞在場所に不安がある"], ["prefer_not_to_say", "答えたくない"]]],
    ["現在困っていることは何ですか？", "あてはまるものをすべて選べます。", [["stay", "日本にいつまでいられるか"], ["consultation", "相談先"], ["accommodation", "今後の住む場所"], ["living_cost", "生活費"], ["employment", "仕事"], ["education", "子どもの学校・教育"], ["childcare", "子どもの生活"], ["medical", "医療"], ["language", "日本語"]]],
    ["日本語をどのくらい話せますか？", "相談時の言語サポートを考えるために使います。", [["none", "ほとんど話せない"], ["beginner", "少し話せる"], ["daily", "日常会話ができる"], ["advanced", "十分話せる"]]],
  ],
  en: [
    ["Where are you staying in Tokyo now?", "You do not need to give an exact address.", [["Kita", "Kita City"], ["Shinjuku", "Shinjuku City"], ["Toshima", "Toshima City"], ["Other", "Other"]]],
    ["What is your nationality or region?", "This answer is not sent to public agencies.", [["MMR", "Myanmar"], ["OTHER", "Other"], ["UNKNOWN", "Prefer not to say"]]],
    ["What was your plan when you came to Japan?", "Choose everyday words; you do not need to know an official status name.", [["tourism", "Travel"], ["visiting_family_or_friends", "Visit family or friends"], ["work", "Work"], ["study", "Study"], ["resident", "I live in Japan"], ["other", "Other"], ["unknown", "I do not know / prefer not to say"]]],
    ["When had you planned to leave Japan?", "An approximate answer is enough.", [["within_7_days", "Within 7 days"], ["within_30_days", "Within 30 days"], ["within_3_months", "Within 3 months"], ["no_departure_plan", "I had no departure plan"], ["unknown", "I do not know"]]],
    ["Can you return home as planned now?", "Tell us only how you understand your situation today.", [["possible", "I can return"], ["difficult", "It is difficult to return"], ["unknown", "I do not know"]]],
    ["Do you know how long you can stay in Japan?", "You can continue even if you do not know the name of your status.", [["known", "I know"], ["unknown", "I do not know"], ["documents", "I want to check my documents"]]],
    ["Is any family with you in Japan?", "If a child is with you, select their age too.", [["none", "No"], ["children", "A child is with me"], ["spouse", "My spouse is with me"], ["other", "Other family is with me"]]],
    ["Where are you staying now?", "We do not ask for the exact location.", [["hotel", "Hotel or accommodation"], ["family_or_friend", "Family or friend’s home"], ["rental", "Rental home"], ["temporary_facility", "Temporary facility"], ["unstable", "I am worried about where I can stay"], ["prefer_not_to_say", "Prefer not to say"]]],
    ["What are you worried about now?", "Select all that apply.", [["stay", "How long I can stay"], ["consultation", "Where to ask for help"], ["accommodation", "A place to stay"], ["living_cost", "Living costs"], ["employment", "Work"], ["education", "School and education"], ["childcare", "My child’s daily life"], ["medical", "Medical care"], ["language", "Japanese language"]]],
    ["How much Japanese can you speak?", "This helps us organize language support for consultations.", [["none", "Almost none"], ["beginner", "A little"], ["daily", "Everyday conversation"], ["advanced", "Comfortably"]]],
  ],
  my: [
    ["ယခု တိုကျို၏ မည်သည့်ဒေသတွင် နေပါသလဲ။", "လိပ်စာအတိအကျ မလိုပါ။", [["Kita", "ကီတာမြို့နယ်"], ["Shinjuku", "ရှင်ဂျုကုမြို့နယ်"], ["Toshima", "တိုရှီမာမြို့နယ်"], ["Other", "အခြား"]]],
    ["နိုင်ငံသား/ဒေသကို ပြောပြပါ။", "ဤအဖြေကို အစိုးရဌာနသို့ မပို့ပါ။", [["MMR", "မြန်မာ"], ["OTHER", "အခြား"], ["UNKNOWN", "မဖြေလိုပါ"]]],
    ["ဂျပန်သို့ ဘာရည်ရွယ်ချက်ဖြင့် လာခဲ့ပါသလဲ။", "တရားဝင်အမည် မသိလည်း နားလည်လွယ်သည့်စကားဖြင့် ရွေးနိုင်သည်။", [["tourism", "ခရီးသွား"], ["visiting_family_or_friends", "မိသားစု/မိတ်ဆွေထံ လည်ပတ်"], ["work", "အလုပ်"], ["study", "ပညာသင်"], ["resident", "ဂျပန်တွင် နေထိုင်"], ["other", "အခြား"], ["unknown", "မသိ / မဖြေလို"]]],
    ["မူလက ဂျပန်မှ မည်သည့်အချိန် ထွက်ရန် စီစဉ်ထားသလဲ။", "ခန့်မှန်းခြေဖြင့် ဖြေနိုင်သည်။", [["within_7_days", "7 ရက်အတွင်း"], ["within_30_days", "30 ရက်အတွင်း"], ["within_3_months", "3 လအတွင်း"], ["no_departure_plan", "ထွက်ရန်အစီအစဉ်မရှိ"], ["unknown", "မသိ"]]],
    ["ယခု စီစဉ်ထားသလို ပြန်နိုင်ပါသလား။", "ယနေ့ သင်နားလည်ထားသည့် အခြေအနေကိုသာ ဖြေပါ။", [["possible", "ပြန်နိုင်သည်"], ["difficult", "ပြန်ရန်ခက်ခဲသည်"], ["unknown", "မသိ"]]],
    ["ဂျပန်တွင် မည်မျှကြာ နေနိုင်သည်ကို သိပါသလား။", "နေထိုင်ခွင့်အမည် မသိလည်း ဆက်လုပ်နိုင်သည်။", [["known", "သိသည်"], ["unknown", "မသိ"], ["documents", "စာရွက်စာတမ်း စစ်လိုသည်"]]],
    ["ဂျပန်တွင် သင်နှင့်အတူ မိသားစုရှိပါသလား။", "ကလေးရှိလျှင် အသက်ကိုလည်း ရွေးပါ။", [["none", "မရှိ"], ["children", "ကလေးရှိ"], ["spouse", "အိမ်ထောင်ဖက်ရှိ"], ["other", "အခြားမိသားစုရှိ"]]],
    ["ယခု မည်သည့်နေရာတွင် နေပါသလဲ။", "နေရာအတိအကျ မမေးပါ။", [["hotel", "ဟိုတယ်/တည်းခိုခန်း"], ["family_or_friend", "မိသားစု/မိတ်ဆွေအိမ်"], ["rental", "ငှားရမ်းအိမ်"], ["temporary_facility", "ယာယီနေရာ"], ["unstable", "နောက်နေရာအတွက် စိုးရိမ်"], ["prefer_not_to_say", "မဖြေလို"]]],
    ["ယခု ဘာများအတွက် စိုးရိမ်ပါသလဲ။", "သက်ဆိုင်သမျှ ရွေးပါ။", [["stay", "မည်မျှကြာ နေနိုင်မည်"], ["consultation", "ဘယ်မှာ မေးရမည်"], ["accommodation", "နေထိုင်ရာ"], ["living_cost", "နေထိုင်စရိတ်"], ["employment", "အလုပ်"], ["education", "ကျောင်းနှင့် ပညာရေး"], ["childcare", "ကလေးဘဝ"], ["medical", "ဆေးကုသမှု"], ["language", "ဂျပန်ဘာသာ"]]],
    ["ဂျပန်ဘာသာကို မည်မျှ ပြောနိုင်ပါသလဲ။", "တိုင်ပင်ချိန် ဘာသာစကားအကူအညီ စီစဉ်ရန် အသုံးပြုသည်။", [["none", "မပြောနိုင်သလောက်"], ["beginner", "အနည်းငယ်"], ["daily", "နေ့စဉ်စကားပြော"], ["advanced", "ကောင်းစွာ"]]],
  ],
} as const;

const actionCopy: Record<Locale, Record<string, { title: string; desc: string; cta: string }>> = {
  ja: {
    CHECK_STAY_STATUS: { title: "日本に滞在できる期間を確認する", desc: "現在の滞在期限と、今確認すべき手続を公式窓口で確認します。", cta: "公式相談先を見る" },
    CONTACT_OFFICIAL_SUPPORT: { title: "専門の相談窓口へ相談する", desc: "今後の滞在については、状況に応じた個別確認が必要です。", cta: "相談先を見る" },
    PLAN_TEMPORARY_LIVING: { title: "今後の滞在場所を整理する", desc: "今の宿泊が終わる前に、当面の生活について相談できる先を確認します。", cta: "生活相談先を見る" },
    CHECK_CHILD_EDUCATION: { title: "子どもの教育について相談する", desc: "滞在が長くなる場合、子どもの学習や学校について地域で確認できます。", cta: "近くの学校を見る" },
    CHECK_MEDICAL_OPTIONS: { title: "医療を受けられる場所を確認する", desc: "必要なときに相談できるよう、地域の医療機関を先に確認します。", cta: "近くの医療機関を見る" },
    CHECK_CHILD_LOCAL_SUPPORT: { title: "子どもと利用できる地域資源を確認する", desc: "子どもが安心して過ごせる公共施設や地域資源を確認します。", cta: "子どもの居場所を見る" },
    CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH: { title: "働ける条件を先に確認する", desc: "仕事を探す前に、現在の滞在状況で働けるかを公式窓口で確認します。", cta: "公式相談先を見る" },
    CHECK_LIVING_COST_SUPPORT: { title: "当面の生活費について相談する", desc: "利用できる相談や支援があるかを、公式の相談窓口で個別に確認します。", cta: "相談先を見る" },
    FIND_LANGUAGE_SUPPORT: { title: "通訳・やさしい日本語の支援を確認する", desc: "相談内容を正確に伝えるため、利用できる言語サポートを確認します。", cta: "相談先を見る" },
    CHECK_BEFORE_STAY_DEADLINE: { title: "期限までに書類と相談予定を確認する", desc: "入力した期限より前に、手元の書類と公式窓口へ確認する時期を整理します。", cta: "公式相談先を見る" },
  },
  en: {
    CHECK_STAY_STATUS: { title: "Confirm how long you can stay", desc: "Check your current period of stay and any steps you may need with an official service.", cta: "See official support" },
    CONTACT_OFFICIAL_SUPPORT: { title: "Talk to an official support desk", desc: "Your next procedure may depend on your individual situation.", cta: "See support contacts" },
    PLAN_TEMPORARY_LIVING: { title: "Plan where you can stay next", desc: "Before your current accommodation ends, find where to ask about day-to-day living.", cta: "See living support" },
    CHECK_CHILD_EDUCATION: { title: "Ask about your child’s education", desc: "If your stay becomes longer, you can ask locally about learning and school.", cta: "See nearby schools" },
    CHECK_MEDICAL_OPTIONS: { title: "Find where to get medical care", desc: "Check nearby medical facilities now so you know where to turn if needed.", cta: "See medical facilities" },
    CHECK_CHILD_LOCAL_SUPPORT: { title: "Find local places for your child", desc: "Check public places and community resources where children can spend time.", cta: "See child spaces" },
    CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH: { title: "Check if you may work first", desc: "Before job searching, ask an official service whether your current status allows work.", cta: "See official support" },
    CHECK_LIVING_COST_SUPPORT: { title: "Ask about immediate living costs", desc: "Check with an official support service what consultations or support may be available for your circumstances.", cta: "See support contacts" },
    FIND_LANGUAGE_SUPPORT: { title: "Check language support", desc: "Find interpretation or simple-language support so you can explain your situation accurately.", cta: "See support contacts" },
    CHECK_BEFORE_STAY_DEADLINE: { title: "Check documents before your deadline", desc: "Plan when to review your documents and contact an official service before the date you entered.", cta: "See official support" },
  },
  my: {
    CHECK_STAY_STATUS: { title: "ဂျပန်တွင် နေနိုင်မည့်ကာလ စစ်ဆေးရန်", desc: "လက်ရှိနေနိုင်သည့်ကာလနှင့် လိုအပ်နိုင်သည့် လုပ်ငန်းစဉ်ကို တရားဝင်ဌာနတွင် စစ်ဆေးပါ။", cta: "တရားဝင်အကူအညီ ကြည့်ရန်" },
    CONTACT_OFFICIAL_SUPPORT: { title: "တရားဝင်တိုင်ပင်ရေးဌာနနှင့် ဆွေးနွေးရန်", desc: "နောက်လုပ်ငန်းစဉ်သည် သင့်တစ်ဦးချင်းအခြေအနေပေါ် မူတည်နိုင်သည်။", cta: "တိုင်ပင်ရာနေရာ ကြည့်ရန်" },
    PLAN_TEMPORARY_LIVING: { title: "နောက်နေထိုင်ရာ စီစဉ်ရန်", desc: "လက်ရှိတည်းခိုရာ မပြီးမီ နေ့စဉ်ဘဝအတွက် ဘယ်မှာ တိုင်ပင်ရမည်ကို စစ်ဆေးပါ။", cta: "ဘဝအကူအညီ ကြည့်ရန်" },
    CHECK_CHILD_EDUCATION: { title: "ကလေးပညာရေးအကြောင်း တိုင်ပင်ရန်", desc: "နေထိုင်မှုရှည်လာလျှင် ကျောင်းနှင့် သင်ယူမှုအကြောင်း ဒေသတွင် မေးနိုင်သည်။", cta: "အနီးအနားကျောင်း ကြည့်ရန်" },
    CHECK_MEDICAL_OPTIONS: { title: "ဆေးကုသမှုရနိုင်သည့်နေရာ စစ်ဆေးရန်", desc: "လိုအပ်ချိန်သိရှိနိုင်ရန် အနီးအနားဆေးရုံ/ဆေးခန်းကို ကြိုစစ်ဆေးပါ။", cta: "ဆေးဘက်နေရာ ကြည့်ရန်" },
    CHECK_CHILD_LOCAL_SUPPORT: { title: "ကလေးအတွက် ဒေသဆိုင်ရာနေရာ စစ်ဆေးရန်", desc: "ကလေးနေနိုင်သော အများပြည်သူနေရာများကို စစ်ဆေးပါ။", cta: "ကလေးနေရာ ကြည့်ရန်" },
    CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH: { title: "အလုပ်လုပ်နိုင်မှုကို ဦးစွာစစ်ဆေးရန်", desc: "အလုပ်မရှာမီ လက်ရှိနေထိုင်မှုအခြေအနေဖြင့် အလုပ်လုပ်နိုင်မနိုင် တရားဝင်ဌာနကို မေးပါ။", cta: "တရားဝင်အကူအညီ ကြည့်ရန်" },
    CHECK_LIVING_COST_SUPPORT: { title: "လတ်တလော နေထိုင်စရိတ်အတွက် တိုင်ပင်ရန်", desc: "မိမိအခြေအနေတွင် အသုံးပြုနိုင်သည့် တိုင်ပင်မှု သို့မဟုတ် အကူအညီရှိမရှိ တရားဝင်ဌာနတွင် စစ်ဆေးပါ။", cta: "တိုင်ပင်ရာနေရာ ကြည့်ရန်" },
    FIND_LANGUAGE_SUPPORT: { title: "ဘာသာစကားအကူအညီ စစ်ဆေးရန်", desc: "မိမိအခြေအနေကို မှန်ကန်စွာရှင်းပြနိုင်ရန် စကားပြန်အကူအညီ စစ်ဆေးပါ။", cta: "တိုင်ပင်ရာနေရာ ကြည့်ရန်" },
    CHECK_BEFORE_STAY_DEADLINE: { title: "သတ်မှတ်ရက်မတိုင်မီ စာရွက်စာတမ်း စစ်ရန်", desc: "ထည့်ထားသောရက်မတိုင်မီ စာရွက်စာတမ်းနှင့် တရားဝင်တိုင်ပင်ချိန်ကို စီစဉ်ပါ။", cta: "တရားဝင်အကူအညီ ကြည့်ရန်" },
  },
};

const timingLabel: Record<Locale, Record<string, string>> = {
  ja: { today: "TODAY · 今日", this_week: "THIS WEEK · 今週", next_30_days: "NEXT 30 DAYS · 当面", before_deadline: "BEFORE DEADLINE · 期限まで", long_term: "LONG TERM · 長期化したら" },
  en: { today: "TODAY", this_week: "THIS WEEK", next_30_days: "NEXT 30 DAYS", before_deadline: "BEFORE DEADLINE", long_term: "LONG TERM" },
  my: { today: "TODAY · ယနေ့", this_week: "THIS WEEK · ယခုအပတ်", next_30_days: "NEXT 30 DAYS · လာမည့် ၃၀ ရက်", before_deadline: "BEFORE DEADLINE · သတ်မှတ်ရက်မတိုင်မီ", long_term: "LONG TERM · ရေရှည်" },
};

const reasonCopy: Record<Locale, Record<string, string>> = {
  ja: {
    RETURN_DIFFICULT_SHORT_TERM: "「旅行・短期の訪問で来た」「予定どおり帰ることが難しい」と回答したため表示しています。",
    RETURN_DIFFICULT: "予定どおり帰ることが難しいと回答したため、現在の状況を公式窓口で確認する案内を表示しています。",
    SITUATION_NEEDS_CONFIRMATION: "帰国や滞在の状況が分からない、または相談先を知りたいと回答したため表示しています。",
    SCHOOL_AGE_CHILD: "学齢期の子どもと一緒にいるため、教育相談と学校情報を表示しています。",
    CHILD_LOCAL_ROUTINE: "子どもと一緒に東京で生活を続ける可能性があるため、地域の居場所を表示しています。",
    TEMPORARY_HOTEL: "現在ホテルに滞在し、予定どおり帰ることが難しいため表示しています。",
    UNSTABLE_ACCOMMODATION: "今後の滞在場所に不安があり、予定どおり帰ることが難しいため表示しています。",
    CHILDCARE_NEED: "乳幼児と一緒に滞在し、子どもの生活について困っていると回答したため表示しています。",
    MEDICAL_NEED: "医療について困っていると回答したため表示しています。",
    EMPLOYMENT_NEED: "仕事または生活費について確認したいと回答したため、就労可否の確認を先に表示しています。",
    LIVING_COST_NEED: "当面の生活費について困っていると回答したため、公式相談先を表示しています。",
    LANGUAGE_BARRIER: "日本語での相談に言語サポートが役立つ可能性があるため表示しています。",
    KNOWN_STAY_DEADLINE: "滞在できる期限を入力したため、その日より前に公式確認できるよう表示しています。",
    STAY_DEADLINE_PASSED: "入力した滞在期限を過ぎているため、すぐに公式窓口へ状況を確認する案内を表示しています。",
  },
  en: {
    RETURN_DIFFICULT_SHORT_TERM: "You said you came for a short visit and now find it difficult to return as planned.",
    RETURN_DIFFICULT: "You said it is difficult to return as planned, so an official check of your current situation is shown.",
    SITUATION_NEEDS_CONFIRMATION: "You said your return or stay is unclear, or that you need to find where to ask for help.",
    SCHOOL_AGE_CHILD: "You are with a school-age child, so education consultation and school information are shown.",
    CHILD_LOCAL_ROUTINE: "You may need to continue daily life in Tokyo with a child, so local child spaces are shown.",
    TEMPORARY_HOTEL: "You are staying in a hotel and find it difficult to return as planned.",
    UNSTABLE_ACCOMMODATION: "You said your accommodation is unstable and that it is difficult to return as planned.",
    CHILDCARE_NEED: "You are with a young child and selected childcare or daily-life support as a concern.",
    MEDICAL_NEED: "You selected medical care as a current concern.",
    EMPLOYMENT_NEED: "You selected work or living costs, so checking work eligibility comes before job search.",
    LIVING_COST_NEED: "You selected immediate living costs as a concern, so an official consultation route is shown.",
    LANGUAGE_BARRIER: "Language support may help you explain your situation during official consultations.",
    KNOWN_STAY_DEADLINE: "You entered a stay deadline, so this is shown to help you confirm with an official service before that date.",
    STAY_DEADLINE_PASSED: "The stay deadline you entered has passed, so this directs you to confirm your situation with an official service now.",
  },
  my: {
    RETURN_DIFFICULT_SHORT_TERM: "ခရီးတိုအတွက် လာပြီး ယခု စီစဉ်ထားသလို ပြန်ရန်ခက်ခဲသည်ဟု ဖြေထားသောကြောင့် ပြထားပါသည်။",
    RETURN_DIFFICULT: "စီစဉ်ထားသလို ပြန်ရန်ခက်ခဲသည်ဟု ဖြေထားသောကြောင့် လက်ရှိအခြေအနေကို တရားဝင်ဌာနတွင် စစ်ဆေးရန် ပြထားပါသည်။",
    SITUATION_NEEDS_CONFIRMATION: "ပြန်ခြင်း/နေထိုင်ခြင်းအခြေအနေ မသေချာ သို့မဟုတ် တိုင်ပင်ရာနေရာလိုသည်ဟု ဖြေထားပါသည်။",
    SCHOOL_AGE_CHILD: "ကျောင်းနေအရွယ်ကလေးနှင့်အတူရှိသောကြောင့် ပညာရေးနှင့်ကျောင်းအချက်အလက် ပြထားပါသည်။",
    CHILD_LOCAL_ROUTINE: "ကလေးနှင့်အတူ တိုကျိုတွင် နေ့စဉ်ဘဝ ဆက်လက်တည်ဆောက်ရန် လိုနိုင်သောကြောင့် ပြထားပါသည်။",
    TEMPORARY_HOTEL: "ဟိုတယ်တွင် နေပြီး စီစဉ်ထားသလို ပြန်ရန်ခက်ခဲသောကြောင့် ပြထားပါသည်။",
    UNSTABLE_ACCOMMODATION: "နေထိုင်ရာမတည်ငြိမ်ဘဲ စီစဉ်ထားသလို ပြန်ရန်ခက်ခဲသောကြောင့် ပြထားပါသည်။",
    CHILDCARE_NEED: "ကလေးငယ်နှင့်အတူရှိပြီး ကလေး၏နေ့စဉ်ဘဝအကူအညီကို ရွေးထားသောကြောင့် ပြထားပါသည်။",
    MEDICAL_NEED: "ဆေးကုသမှုကို လက်ရှိစိုးရိမ်ချက်အဖြစ် ရွေးထားပါသည်။",
    EMPLOYMENT_NEED: "အလုပ် သို့မဟုတ် နေထိုင်စရိတ်ကို ရွေးထားသောကြောင့် အလုပ်မရှာမီ လုပ်ကိုင်ခွင့် စစ်ဆေးရန် ပြထားပါသည်။",
    LIVING_COST_NEED: "လတ်တလော နေထိုင်စရိတ်အတွက် စိုးရိမ်ကြောင်း ရွေးထားသောကြောင့် တရားဝင်တိုင်ပင်ရာနေရာကို ပြထားပါသည်။",
    LANGUAGE_BARRIER: "တရားဝင်တိုင်ပင်ရာတွင် ဘာသာစကားအကူအညီ အသုံးဝင်နိုင်သောကြောင့် ပြထားပါသည်။",
    KNOWN_STAY_DEADLINE: "နေထိုင်နိုင်သည့်ရက် ထည့်ထားသောကြောင့် ထိုရက်မတိုင်မီ တရားဝင်အတည်ပြုနိုင်ရန် ပြထားပါသည်။",
    STAY_DEADLINE_PASSED: "ထည့်ထားသော နေထိုင်ခွင့်နောက်ဆုံးရက် ကျော်လွန်နေသောကြောင့် တရားဝင်ဌာနသို့ ယခုချက်ချင်း အတည်ပြုရန် ပြထားပါသည်။",
  },
};

export function StayBridgeApp({ initialLocale = "ja", initialScreen = "landing", initialMunicipality }: { initialLocale?: Locale; initialScreen?: Screen; initialMunicipality?: string } = {}) {
  const isLocaleRoute = initialScreen === "local";
  const municipalityAppUrl = resolveMunicipalityAppUrl();
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [step, setStep] = useState(0);
  const [situation, setSituation] = useState<Situation>(() => initialMunicipality ? { ...createInitialSituation(), currentMunicipality: initialMunicipality } : createInitialSituation());
  const [stayAnswer, setStayAnswer] = useState<StayAnswer>("unknown");
  const [familyAnswers, setFamilyAnswers] = useState<FamilyAnswers>([]);
  const [answeredSteps, setAnsweredSteps] = useState<number[]>([]);
  const [storageReady, setStorageReady] = useState(isLocaleRoute);
  const [storageError, setStorageError] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [summaryDate, setSummaryDate] = useState("");
  const [localFilter, setLocalFilter] = useState<LocalFilter>("all");
  const [isPreparingResults, setIsPreparingResults] = useState(false);
  const [assessmentDate] = useState(currentTokyoDate);
  const skipNextSessionWrite = useRef(false);
  const completionTimer = useRef<number | undefined>(undefined);
  const answeredStepsRef = useRef(answeredSteps);
  const localeRef = useRef(locale);
  const screenRef = useRef(screen);
  const flowIdRef = useRef("");
  answeredStepsRef.current = answeredSteps;
  localeRef.current = locale;
  screenRef.current = screen;
  const t = copy[locale];

  useEffect(() => {
    try {
      if (!isLocaleRoute) {
        const storedLocale = readStoredLocale(localStorage.getItem("staybridge.locale"));
        if (storedLocale) setLocale(storedLocale);
        const storedSession = parseStoredSession(sessionStorage.getItem("staybridge.session"));
        if (storedSession) {
          setSituation(storedSession.situation);
          setStayAnswer(storedSession.stayAnswer);
          setFamilyAnswers(storedSession.familyAnswers);
          setAnsweredSteps(storedSession.answeredSteps);
        }
      }
    } catch {
      setStorageError(true);
    } finally {
      setStorageReady(true);
    }
  }, [isLocaleRoute]);

  useEffect(() => () => {
    if (completionTimer.current !== undefined) window.clearTimeout(completionTimer.current);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const restoreScreen = (state: unknown) => {
      const storedRoute = getHistoryScreen(state);
      const urlRoute = getUrlScreen(window.location.href) ?? (isLocaleRoute ? { screen: "local" as const, step: 0, filter: "all" as const } : null);
      if (!flowIdRef.current) flowIdRef.current = storedRoute?.flowId ?? createFlowId();
      const requestedRoute = urlRoute
        ? { ...urlRoute, flowId: storedRoute && routesMatch(storedRoute, urlRoute) ? storedRoute.flowId : undefined }
        : storedRoute ?? { screen: "landing" as const, step: 0 };
      const route = { ...(isLocaleRoute && requestedRoute.screen === "local" ? requestedRoute : normalizeRoute(requestedRoute, answeredStepsRef.current)), flowId: flowIdRef.current };
      const historyUrl = getHistoryUrl(route, window.location.href);
      if (!routesMatch(storedRoute, route) || storedRoute?.flowId !== route.flowId || `${window.location.pathname}${window.location.search}${window.location.hash}` !== historyUrl) {
        const baseState = state && typeof state === "object" ? state : {};
        window.history.replaceState({ ...baseState, staybridge: route }, "", historyUrl);
      }
      setScreen(route.screen);
      setStep(route.screen === "check" ? route.step : 0);
      if (route.screen === "local") setLocalFilter(route.filter ?? "all");
      if (route.screen === "summary") setSummaryDate(new Date().toLocaleDateString(localeRef.current === "my" ? "en" : localeRef.current));
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    restoreScreen(window.history.state);
    const handlePopState = (event: PopStateEvent) => {
      if (completionTimer.current !== undefined) {
        window.clearTimeout(completionTimer.current);
        completionTimer.current = undefined;
        setIsPreparingResults(false);
      }
      const storedRoute = getHistoryScreen(event.state);
      if (storedRoute?.flowId && storedRoute.flowId !== flowIdRef.current) {
        const route = { screen: "landing" as const, step: 0, flowId: flowIdRef.current };
        const baseState = event.state && typeof event.state === "object" ? event.state : {};
        window.history.replaceState({ ...baseState, staybridge: route }, "", getHistoryUrl(route, window.location.href));
        if (screenRef.current === "landing") {
          window.history.back();
          return;
        }
        setScreen("landing");
        setStep(0);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      restoreScreen(event.state);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isLocaleRoute, storageReady]);

  useEffect(() => {
    document.documentElement.lang = locale === "my" ? "my" : locale;
    if (!storageReady) return;
    try {
      localStorage.setItem("staybridge.locale", locale);
    } catch {
      window.setTimeout(() => setStorageError(true), 0);
    }
  }, [locale, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    if (skipNextSessionWrite.current) {
      skipNextSessionWrite.current = false;
      return;
    }
    try {
      sessionStorage.setItem("staybridge.session", serializeStoredSession({ situation, stayAnswer, familyAnswers, answeredSteps }));
    } catch {
      window.setTimeout(() => setStorageError(true), 0);
    }
  }, [answeredSteps, familyAnswers, situation, stayAnswer, storageReady]);

  const assessmentComplete = isAssessmentComplete(answeredSteps);
  const actions = useMemo(() => assessmentComplete ? generateActions(situation, { asOfDate: assessmentDate }) : [], [assessmentComplete, assessmentDate, situation]);
  const availableResources = useMemo<Array<LocalResource & { id: LocalResourceId }>>(() => {
    const municipality = situation.currentMunicipality;
    if (!municipality) return [];
    return localResources.filter((item) => {
      const sameArea = municipality !== "Other" && (municipality === "Kita" || municipality === "北区") && item.municipality === "Kita";
      return sameArea && (localFilter === "all" || item.category === localFilter);
    });
  }, [situation.currentMunicipality, localFilter]);

  const writeHistory = (next: Screen, nextStep: number, filter?: LocalFilter, mode?: "push" | "replace") => {
    if (!flowIdRef.current) flowIdRef.current = createFlowId();
    const currentState = window.history.state;
    const baseState = currentState && typeof currentState === "object" ? currentState : {};
    const route = { screen: next, step: nextStep, filter: next === "local" ? filter ?? "all" : undefined, flowId: flowIdRef.current };
    const currentRoute = getUrlScreen(window.location.href) ?? getHistoryScreen(currentState);
    const historyMode = mode ?? (routesMatch(currentRoute, route) ? "replace" : "push");
    window.history[`${historyMode}State`]({ ...baseState, staybridge: route }, "", getHistoryUrl(route, window.location.href));
  };

  const go = (next: Screen, nextStep = next === "check" ? step : 0, filter = next === "local" ? localFilter : undefined) => {
    if (next === "summary") setSummaryDate(new Date().toLocaleDateString(locale === "my" ? "en" : locale));
    writeHistory(next, nextStep, filter);
    setScreen(next);
    if (next === "check") setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goToQuestion = (nextStep: number) => {
    writeHistory("check", nextStep);
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const complete = () => {
    if (completionTimer.current !== undefined) return;
    if (!isAssessmentComplete(answeredSteps)) {
      go("check", getFirstUnansweredStep(answeredSteps));
      return;
    }
    setIsPreparingResults(true);
    completionTimer.current = window.setTimeout(() => {
      completionTimer.current = undefined;
      setIsPreparingResults(false);
      go("status");
    }, 650);
  };

  const restartAssessment = () => {
    try {
      sessionStorage.removeItem("staybridge.session");
      skipNextSessionWrite.current = true;
    } catch {
      skipNextSessionWrite.current = false;
      setStorageError(true);
    }
    setSituation(createInitialSituation());
    setStayAnswer("unknown");
    setFamilyAnswers([]);
    setAnsweredSteps([]);
    setLocalFilter("all");
    setCopyState("idle");
    setSummaryDate("");
    flowIdRef.current = createFlowId();
    go("check", 0);
  };

  const openAction = (actionId: string) => {
    const destination = actionDestinations[actionId] ?? { screen: "help" as const };
    if (destination.filter) setLocalFilter(destination.filter);
    go(destination.screen, 0, destination.filter);
  };

  const changeLocalFilter = (filter: LocalFilter) => {
    setLocalFilter(filter);
    writeHistory("local", 0, filter, "replace");
  };

  if (!storageReady) return <div className="app-shell session-restore" aria-busy="true"><span className="sr-only">Loading</span></div>;

  return (
    <div className={`app-shell locale-${locale} ${screen === "landing" ? "landing-screen" : ""}`}>
      <a className="skip-link" href="#main">{t.skip}</a>
      <Header locale={locale} setLocale={setLocale} isLocaleRoute={isLocaleRoute} screen={screen} hasCompletedAssessment={assessmentComplete} isPreparingResults={isPreparingResults} go={go} />
      {storageError && <output className="app-alert">{t.storageError}</output>}
      <main id="main">
        {isPreparingResults ? <LoadingState t={t} /> : <>
        {screen === "landing" && <Landing t={t} showStart={!assessmentComplete} start={() => go("check", 0)} municipalityAppUrl={municipalityAppUrl} />}
        {screen === "check" && (
          <SituationCheck locale={locale} t={t} step={step} goToQuestion={goToQuestion} situation={situation} setSituation={setSituation} stayAnswer={stayAnswer} setStayAnswer={setStayAnswer} familyAnswers={familyAnswers} setFamilyAnswers={setFamilyAnswers} answeredSteps={answeredSteps} setAnsweredSteps={setAnsweredSteps} assessmentDate={assessmentDate} backToLanding={() => go("landing")} restart={restartAssessment} finish={complete} />
        )}
        {screen === "status" && <ImmediateStatus locale={locale} t={t} situation={situation} stayAnswer={stayAnswer} familyAnswers={familyAnswers} answeredSteps={answeredSteps} roadmap={() => go("roadmap")} edit={() => go("check")} />}
        {screen === "roadmap" && <Roadmap locale={locale} t={t} actions={actions} restart={assessmentComplete ? restartAssessment : undefined} openAction={openAction} />}
        {screen === "local" && <LocalAction locale={locale} t={t} resources={availableResources} filter={localFilter} setFilter={changeLocalFilter} />}
        {screen === "help" && <HumanSupport t={t} locale={locale} summary={() => go("summary")} />}
        {screen === "summary" && <ConsultationSummary locale={locale} t={t} situation={situation} stayAnswer={stayAnswer} familyAnswers={familyAnswers} answeredSteps={answeredSteps} summaryDate={summaryDate} copyState={copyState} setCopyState={setCopyState} />}
        </>}
      </main>
    </div>
  );
}

function Header({ locale, setLocale, isLocaleRoute, screen, hasCompletedAssessment, isPreparingResults, go }: { locale: Locale; setLocale: (l: Locale) => void; isLocaleRoute: boolean; screen: Screen; hasCompletedAssessment: boolean; isPreparingResults: boolean; go: (s: Screen) => void }) {
  const t = copy[locale];
  const isAnswering = screen === "check" || isPreparingResults;
  const returnsToRoadmap = hasCompletedAssessment && !isAnswering;
  return <header className="site-header">
    <button className="brand" onClick={() => go(returnsToRoadmap ? "roadmap" : "landing")} aria-label={returnsToRoadmap ? t.brandToSteps : "StayBridge Tokyo home"} disabled={isPreparingResults}><span className="brand-mark">SB</span><span>StayBridge <b>Tokyo</b></span></button>
    {hasCompletedAssessment && !isAnswering && <nav aria-label="Primary">
      <button className={screen === "roadmap" ? "active" : ""} onClick={() => go("roadmap")}>{t.navSteps}</button>
      <button className={screen === "local" ? "active" : ""} onClick={() => go("local")}>{t.navLocal}</button>
      <button className={screen === "help" ? "active" : ""} onClick={() => go("help")}>{t.navHelp}</button>
    </nav>}
    <label className="language-select" title="MVP static translation preview"><span className="sr-only">Language · static translation preview</span><select value={locale} disabled={isLocaleRoute} onChange={(e) => setLocale(e.target.value as Locale)}><option value="ja">日本語</option><option value="en">English</option><option value="my">မြန်မာ</option></select></label>
  </header>;
}

function LoadingState({ t }: { t: typeof copy[Locale] }) {
  return <output className="loading-page" aria-live="polite"><div className="loading-card"><span className="loading-orbit" aria-hidden="true" /><p>{t.loading}</p></div></output>;
}

function Landing({ t, showStart, start, municipalityAppUrl }: { t: typeof copy[Locale]; showStart: boolean; start: () => void; municipalityAppUrl: string }) {
  return <section className={`landing-start${showStart ? "" : " landing-complete"}`}>
    <h1 className="sr-only">StayBridge Tokyo</h1>
    {showStart && <button className="primary-button" onClick={start}>{t.start}<span aria-hidden>→</span></button>}
    <a className="crisis-link" href={municipalityAppUrl}><span>PREPAREDNESS VIEW</span><strong>{t.crisis}</strong><b aria-hidden="true">↗</b></a>
  </section>;
}

function SituationCheck({ locale, t, step, goToQuestion, situation, setSituation, stayAnswer, setStayAnswer, familyAnswers, setFamilyAnswers, answeredSteps, setAnsweredSteps, assessmentDate, backToLanding, restart, finish }: {
  locale: Locale; t: typeof copy[Locale]; step: number; goToQuestion: (n: number) => void; situation: Situation; setSituation: (s: Situation) => void; stayAnswer: StayAnswer; setStayAnswer: (s: StayAnswer) => void; familyAnswers: FamilyAnswers; setFamilyAnswers: (s: FamilyAnswers) => void; answeredSteps: number[]; setAnsweredSteps: (steps: number[]) => void; assessmentDate: string; backToLanding: () => void; restart: () => void; finish: () => void;
}) {
  const question = questionCopy[locale][step];
  const [title, , options] = question;
  const current = getQuestionValue(step, situation, stayAnswer);
  const multi = step === 6 || step === 8;
  const markAnswered = (isAnswered = true) => {
    const next = isAnswered
      ? [...new Set([...answeredSteps, step])]
      : answeredSteps.filter((answeredStep) => answeredStep !== step);
    setAnsweredSteps(next);
  };
  const choose = (value: string) => {
    if (step === 0) setSituation({ ...situation, currentMunicipality: value });
    if (step === 1) setSituation({ ...situation, nationality: value });
    if (step === 2) setSituation({ ...situation, visitPurpose: value as Situation["visitPurpose"] });
    if (step === 3) setSituation({ ...situation, originalDepartureWindow: value as Situation["originalDepartureWindow"] });
    if (step === 4) setSituation({ ...situation, returnStatus: value as Situation["returnStatus"] });
    if (step === 5) { setStayAnswer(value as StayAnswer); setSituation({ ...situation, knownStayDeadline: value === "known" ? situation.knownStayDeadline : undefined, stayDeadlineKnown: value === "known" && Boolean(situation.knownStayDeadline) }); }
    if (step === 6) {
      const answer = value as FamilyAnswer;
      const nextAnswers = answer === "none"
        ? ["none" as const]
        : familyAnswers.includes(answer)
          ? familyAnswers.filter((item) => item !== answer && item !== "none")
          : [...familyAnswers.filter((item) => item !== "none"), answer];
      setFamilyAnswers(nextAnswers);
      const hasChildren = nextAnswers.includes("children");
      setSituation({
        ...situation,
        familyMembers: {
          children: hasChildren
            ? (situation.familyMembers.children.length ? situation.familyMembers.children : [{ ageGroup: "6-11" }])
            : [],
        },
      });
      markAnswered(nextAnswers.length > 0);
      return;
    }
    if (step === 7) setSituation({ ...situation, accommodation: value as Situation["accommodation"] });
    if (step === 8) {
      const nextNeeds = situation.needs.includes(value as NeedCategory) ? situation.needs.filter((n) => n !== value) : [...situation.needs, value as NeedCategory];
      setSituation({ ...situation, needs: nextNeeds });
      markAnswered(nextNeeds.length > 0);
      return;
    }
    if (step === 9) setSituation({ ...situation, japaneseLevel: value as Situation["japaneseLevel"] });
    markAnswered();
  };
  const enabled = answeredSteps.includes(step) && (step === 6 ? familyAnswers.length > 0 : step === 8 ? situation.needs.length > 0 : Boolean(current));
  return <section className="check-page">
    <div className="check-progress"><div className="progress-meta"><span>SITUATION CHECK</span><strong>{step + 1} / 10</strong></div><div className="progress-track"><span style={{ width: `${(step + 1) * 10}%` }} /></div></div>
    <div className="question-card">
      <span className="question-kicker">QUESTION {String(step + 1).padStart(2, "0")}</span>
      <h1>{title}</h1>
      <div className="option-grid" role={multi ? "group" : "radiogroup"} aria-label={title}>
        {options.map(([value, label]) => { const selected = step === 6 ? familyAnswers.includes(value as FamilyAnswer) : step === 8 ? situation.needs.includes(value as NeedCategory) : current === value; return <button key={value} className={`option-button ${selected ? "selected" : ""}`} onClick={() => choose(value)} role={multi ? "checkbox" : "radio"} aria-checked={selected}><span className="option-control">{selected ? "✓" : ""}</span><span>{label}</span></button>; })}
      </div>
      {step === 6 && familyAnswers.includes("children") && <div className="age-panel"><label>{t.ageLabel}</label><div className="age-options">{["0-2", "3-5", "6-11", "12-14", "15-17", "18+"].map((age) => <button key={age} className={situation.familyMembers.children[0]?.ageGroup === age ? "selected" : ""} onClick={() => setSituation({ ...situation, familyMembers: { children: [{ ageGroup: age as Situation["familyMembers"]["children"][number]["ageGroup"] }] } })}>{age}</button>)}</div></div>}
      {step === 5 && stayAnswer === "known" && <div className="age-panel"><label htmlFor="stay-deadline">{t.deadlineLabel}</label><input id="stay-deadline" className="date-input" type="date" min={assessmentDate} value={situation.knownStayDeadline || ""} onChange={(e) => setSituation({ ...situation, knownStayDeadline: e.target.value || undefined, stayDeadlineKnown: Boolean(e.target.value) })} /></div>}
      <div className="question-actions">{step === 0 ? <button className="back-button" onClick={backToLanding}><span aria-hidden="true">←</span> {t.backToTop}</button> : <button className="back-button" onClick={() => goToQuestion(step - 1)}><span aria-hidden="true">←</span> {t.back}</button>}<button className="primary-button" disabled={!enabled} onClick={() => step === 9 ? finish() : goToQuestion(step + 1)}>{step === 9 ? t.finish : t.next}<span aria-hidden>→</span></button></div>
      {answeredSteps.length > 0 && <div className="question-restart"><button className="text-button" onClick={restart}><span aria-hidden="true">↺</span> {t.restart}</button></div>}
    </div>
  </section>;
}

function getQuestionValue(step: number, s: Situation, stay: string) {
  return [s.currentMunicipality, s.nationality, s.visitPurpose, s.originalDepartureWindow, s.returnStatus, stay, "", s.accommodation, "", s.japaneseLevel][step];
}

function ImmediateStatus({ locale, t, situation, stayAnswer, familyAnswers, answeredSteps, roadmap, edit }: { locale: Locale; t: typeof copy[Locale]; situation: Situation; stayAnswer: StayAnswer; familyAnswers: FamilyAnswers; answeredSteps: number[]; roadmap: () => void; edit: () => void }) {
  const items = summarizeSituation(locale, situation, stayAnswer, familyAnswers, answeredSteps);
  return <section className="result-page narrow-page"><div className="success-mark">✓</div><span className="section-label">SITUATION REVIEW</span><h1>{t.reviewed}</h1><p className="page-intro">{t.reviewedIntro}</p><div className="status-list">{items.length ? items.map((item) => <div key={item}><span>✓</span>{item}</div>) : <p>{t.noEnteredInfo}</p>}</div><div className="stack-actions"><button className="primary-button wide" onClick={roadmap}>{t.seeRoadmap}<span>→</span></button><button className="text-button" onClick={edit}>{t.answerAgain}</button></div><div className="safe-notice"><strong>{t.notDecision}</strong><p>{t.helpIntro}</p></div></section>;
}

function Roadmap({ locale, t, actions, restart, openAction }: { locale: Locale; t: typeof copy[Locale]; actions: Action[]; restart?: () => void; openAction: (actionId: string) => void }) {
  const groups = ["today", "this_week", "next_30_days", "before_deadline", "long_term"].map((timing) => ({ timing, actions: actions.filter((a) => a.timing === timing) })).filter((g) => g.actions.length);
  return <section className="content-page"><div className="page-heading"><span className="section-label">PERSONAL ROADMAP</span><h1>{t.roadmapTitle}</h1></div><div className="roadmap-list">{groups.length ? groups.map((group) => <section className="roadmap-group" key={group.timing}><div className="timing-heading"><span className="timing-dot" /><h2>{timingLabel[locale][group.timing]}</h2></div>{group.actions.map((action, index) => <ActionCard key={action.id} locale={locale} t={t} action={action} number={index + 1} openAction={openAction} />)}</section>) : <div className="empty-state"><span>○</span><h2>{t.noEnteredInfo}</h2></div>}</div>{restart && <aside className="roadmap-restart"><p>{t.restartPrompt}</p><button className="text-button" onClick={restart}><span aria-hidden="true">↺</span> {t.restart}</button></aside>}</section>;
}

function ActionCard({ locale, t, action, number, openAction }: { locale: Locale; t: typeof copy[Locale]; action: Action; number: number; openAction: (actionId: string) => void }) {
  const ui = actionCopy[locale][action.id] || { title: action.title, desc: action.shortDescription, cta: locale === "en" ? "View details" : "詳しく見る" };
  const sources = action.sourceIds.flatMap((id) => sourceRegistry[id] ? [sourceRegistry[id]] : []);
  return <article className="action-card"><div className="action-number">{String(number).padStart(2, "0")}</div><div className="action-content"><div className="action-meta"><span className={`priority priority-${action.priority}`}>PRIORITY {action.priority}</span>{action.humanReviewRequired && <span className="review-chip">◎ {t.human}</span>}</div><h3>{ui.title}</h3><p>{ui.desc}</p><details><summary>{t.why}</summary><p>{reasonCopy[locale][action.reasonCode] || action.reasonText}</p></details><div className="action-footer">{sources.length > 0 && <div className="source-list">{sources.map((source) => <div className="source-mini" key={source.id}><span>{source.sourceType === "open_data" ? "OPEN DATA" : "OFFICIAL"}</span><a href={source.url} target="_blank" rel="noreferrer">{source.publisher} · {source.title}</a><small>{t.verified}: {source.fetchedAt}</small></div>)}</div>}<button onClick={() => openAction(action.id)}>{ui.cta} →</button></div></div></article>;
}

function LocalAction({ locale, t, resources, filter, setFilter }: { locale: Locale; t: typeof copy[Locale]; resources: Array<LocalResource & { id: LocalResourceId }>; filter: LocalFilter; setFilter: (s: LocalFilter) => void }) {
  const filters: LocalFilter[] = ["all", "school", "medical", "child_support", "public_facility"];
  return <section className="content-page"><div className="page-heading local-heading"><span className="section-label">LOCAL ACTION · OPEN DATA</span><h1>{t.localTitle}</h1></div><div className="filter-tabs" role="tablist">{filters.map((item) => <button role="tab" aria-selected={filter === item} className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{t[item as keyof typeof t] as string}</button>)}</div>{resources.length ? <div className="resource-grid">{resources.map((resource) => <ResourceCard key={resource.id} resource={resource} locale={locale} t={t} />)}</div> : <div className="empty-state"><span>⌖</span><h2>{t.noResources}</h2><button className="secondary-button" onClick={() => setFilter("all")}>{t.all}</button></div>}</section>;
}

function ResourceCard({ resource, locale, t }: { resource: LocalResource & { id: LocalResourceId }; locale: Locale; t: typeof copy[Locale] }) {
  const source = sourceRegistry[resource.sourceId];
  const updatedAt = resource.dataUpdatedAt ?? source?.dataUpdatedAt;
  const display = getLocalResourceDisplay(locale, resource.id);
  const icon = resource.category === "school" ? "S" : resource.category === "medical" ? "+" : resource.category === "child_support" ? "C" : "P";
  return <article className="resource-card"><div className={`resource-icon ${resource.category}`}>{icon}</div><div className="resource-main"><div className="resource-meta"><span>{t[resource.category as keyof typeof t] as string}</span><span>{display.municipality}</span></div><h2>{display.name}</h2><p>{display.description}</p><dl><div><dt>ADDRESS</dt><dd>{display.address}</dd></div>{resource.phone && <div><dt>PHONE</dt><dd><a href={`tel:${resource.phone}`}>{resource.phone}</a></dd></div>}</dl>{resource.category === "school" && <p className="resource-disclaimer">i {t.schoolNote}</p>}<div className="resource-source"><span>{t.sourceLabel}</span><a href={source?.url || resource.website || "#"} target="_blank" rel="noreferrer">{source?.publisher || "Public data"}</a><small>{t.updated}: {updatedAt ?? t.unavailable}</small><small>{t.verified}: {source?.fetchedAt ?? t.unavailable}</small></div>{resource.website && <a className="card-link" href={resource.website} target="_blank" rel="noreferrer">{t.details} ↗</a>}</div></article>;
}

function HumanSupport({ t, locale, summary }: { t: typeof copy[Locale]; locale: Locale; summary: () => void }) {
  const supportIds = ["FRESC", "ISA", "TOKYO_CONSULTATION"];
  const supportSources = supportIds.flatMap((id) => sourceRegistry[id] ? [sourceRegistry[id]] : []).filter((source, index, all) => all.findIndex((candidate) => candidate.url === source.url) === index);
  return <section className="content-page"><div className="page-heading"><span className="section-label">HUMAN HANDOFF</span><h1>{t.helpTitle}</h1></div><div className="handoff-grid"><div className="support-list">{supportSources.map((source, index) => <article className="support-card" key={source.id}><span className="support-index">0{index + 1}</span><div><small>OFFICIAL SUPPORT</small><h2>{source.title}</h2><p>{source.notes || (locale === "en" ? "Check current services, languages and opening hours on the official page." : "対応内容・言語・受付時間は公式ページで確認してください。")}</p><a href={source.url} target="_blank" rel="noreferrer">{t.details} ↗</a></div></article>)}</div><aside className="prepare-card"><span className="aside-icon">▤</span><h2>{t.prepare}</h2><ol>{t.prepareItems.map((item) => <li key={item}>{item}</li>)}</ol><button className="primary-button wide" onClick={summary}>{t.summary}<span aria-hidden>→</span></button></aside></div><div className="emergency-note">{t.emergency}</div></section>;
}

function ConsultationSummary({ locale, t, situation, stayAnswer, familyAnswers, answeredSteps, summaryDate, copyState, setCopyState }: { locale: Locale; t: typeof copy[Locale]; situation: Situation; stayAnswer: StayAnswer; familyAnswers: FamilyAnswers; answeredSteps: number[]; summaryDate: string; copyState: CopyState; setCopyState: (state: CopyState) => void }) {
  const items = summarizeSituation(locale, situation, stayAnswer, familyAnswers, answeredSteps);
  const asks = summarizeNeeds(locale, situation, answeredSteps);
  const text = `${t.summaryTitle}\n\n${t.current}\n${items.map((i) => `• ${i}`).join("\n")}\n\n${t.questions}\n${asks.map((i, n) => `${n + 1}. ${i}`).join("\n")}`;
  const copyText = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("error");
    }
  };
  return <section className="summary-page"><div className="page-heading"><span className="section-label">CONSULTATION SUMMARY</span><h1>{t.summaryTitle}</h1><p>{t.summaryIntro}</p></div><div className="summary-toolbar"><button className="secondary-button" onClick={copyText}>{copyState === "copied" ? `✓ ${t.copied}` : `▣ ${t.copy}`}</button><button className="secondary-button" onClick={() => window.print()}>⌑ {t.print}</button><span>◎ {t.showMode}</span>{copyState === "error" && <p className="inline-error" role="alert">{t.copyError}</p>}</div><article className="summary-sheet"><header><span className="brand-mark">SB</span><div><strong>StayBridge Tokyo</strong><small>CONSULTATION SUMMARY</small></div><time>{summaryDate}</time></header><section><span className="sheet-label">01</span><div><h2>{t.current}</h2>{items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{t.noEnteredInfo}</p>}</div></section><section><span className="sheet-label">02</span><div><h2>{t.questions}</h2>{asks.length ? <ol>{asks.map((item) => <li key={item}>{item}</li>)}</ol> : <p>{t.noSelectedNeeds}</p>}</div></section><footer><strong>{t.notDecision}</strong><p>{t.helpIntro}</p></footer></article></section>;
}

export function summarizeSituation(locale: Locale, s: Situation, stayAnswer: StayAnswer, familyAnswers: FamilyAnswers, answeredSteps: number[]) {
  const labels = questionCopy[locale];
  const find = (q: number, value: string) => labels[q][2].find(([v]) => v === value)?.[1] || value;
  const child = s.familyMembers.children[0];
  const byStep: Record<number, string | undefined> = {
    0: s.currentMunicipality ? `${locale === "en" ? "Area" : locale === "my" ? "ဒေသ" : "地域"}: ${find(0, s.currentMunicipality)}` : undefined,
    1: s.nationality ? `${locale === "en" ? "Nationality/region" : locale === "my" ? "နိုင်ငံသား/ဒေသ" : "国籍・地域"}: ${find(1, s.nationality)}` : undefined,
    2: find(2, s.visitPurpose),
    3: find(3, s.originalDepartureWindow),
    4: find(4, s.returnStatus),
    5: s.knownStayDeadline ? `${find(5, stayAnswer)}: ${s.knownStayDeadline}` : find(5, stayAnswer),
    6: familyAnswers.length
      ? familyAnswers.map((answer) => answer === "children" && child
        ? `${find(6, answer)} · ${locale === "en" ? "age" : locale === "my" ? "အသက်" : "年齢"}: ${child.ageGroup}`
        : find(6, answer)).join(" / ")
      : undefined,
    7: find(7, s.accommodation),
    9: `${locale === "en" ? "Japanese" : locale === "my" ? "ဂျပန်ဘာသာ" : "日本語"}: ${find(9, s.japaneseLevel)}`,
  };
  return answeredSteps.flatMap((step) => byStep[step] ? [byStep[step]] : []);
}

export function summarizeNeeds(locale: Locale, s: Situation, answeredSteps: number[]) {
  const needMap: Record<Locale, Record<string, string>> = {
    ja: { stay: "日本にこれからどのくらい滞在できるか", consultation: "必要な手続と相談先", accommodation: "当面の宿泊・生活", living_cost: "生活費についての相談", employment: "働ける条件", education: "子どもの教育", childcare: "子どもの生活", medical: "医療を受けられる場所", language: "言語サポート" },
    en: { stay: "How long I can stay in Japan", consultation: "Procedures and official support", accommodation: "Accommodation and daily living", living_cost: "Help with living costs", employment: "Whether I may work", education: "My child’s education", childcare: "My child’s daily life", medical: "Where to get medical care", language: "Language support" },
    my: { stay: "ဂျပန်တွင် မည်မျှကြာ နေနိုင်မည်", consultation: "လုပ်ငန်းစဉ်နှင့် တိုင်ပင်ရာနေရာ", accommodation: "နေထိုင်ရာနှင့် နေ့စဉ်ဘဝ", living_cost: "နေထိုင်စရိတ်", employment: "အလုပ်လုပ်နိုင်မှု", education: "ကလေးပညာရေး", childcare: "ကလေး၏ နေ့စဉ်ဘဝ", medical: "ဆေးကုသရာနေရာ", language: "ဘာသာစကားအကူအညီ" },
  };
  if (!answeredSteps.includes(8)) return [];
  return s.needs.map((need) => needMap[locale][need]).filter(Boolean);
}
