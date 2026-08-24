import type { Locale } from "./components/staybridge-session";

export type PersistenceCopy = {
  situationTitle: string;
  situationPurpose: string;
  situationItems: string;
  conversationTitle: string;
  conversationPurpose: string;
  conversationItems: string;
  detailsTitle: string;
  retention: string;
  deletion: string;
  safeguards: string;
  warning: string;
  accept: string;
  conversationAccept: string;
  decline: string;
  accepted: string;
  conversationAccepted: string;
  declined: string;
  saving: string;
  saveFailed: string;
  credentialsTitle: string;
  recordId: string;
  deletionToken: string;
  deleteNow: string;
  deleting: string;
  deleted: string;
  deleteFailed: string;
  demoNotSaved: string;
  savedSessionWarning: string;
  deleteBeforeReset: string;
  copyCredentials: string;
  credentialsCopied: string;
  credentialsCopyFailed: string;
};

const copy = {
  ja: {
    situationTitle: "回答の保存方法を選ぶ",
    situationPurpose: "任意で最小限の回答を保存すると、自治体単位の支援準備に活用されます。",
    situationItems: "保存するもの: 自治体コード、選択式の回答、子どもの年齢区分。国籍、正確な日付・住所、自由記述は保存しません。",
    conversationTitle: "AI相談の保存方法を選ぶ",
    conversationPurpose: "会話保存はSituation Checkとは別に選択し、サービスの運用・安全確認に使います。",
    conversationItems: "保存するもの: マスキング済みの会話、モデルID、参照した出典ID、作成日時。Crisis Viewには会話本文を出しません。",
    detailsTitle: "保存内容・保持期間・削除方法を確認",
    retention: "保持期間: マスキングまたは拒否を通過した内容だけを、期限を設けず保持します。従来の自動期限削除は行いません。",
    deletion: "削除方法: 保存後に表示する記録IDと削除コードを持つ人だけが削除できます。コードは再発行できません。",
    safeguards: "アカウント登録・恒久ユーザーIDなしで動作し、Cookieによる訪問横断追跡や入力内容の学習・二次利用はありません。",
    warning: "マスキングは完全ではありません。氏名、メール、電話、旅券・在留カード番号、正確な住所を入力しないでください。旅券・在留カードらしい番号は拒否し、検出できる連絡先・住所は伏せ字にします。",
    accept: "同意して保存",
    conversationAccept: "会話保存への同意を設定",
    decline: "このタブだけで続ける",
    accepted: "この用途への保存に同意しました。",
    conversationAccepted: "会話保存の設定を選択しました。現在は同意設定の確認のみです。",
    declined: "このタブだけで案内を続けます。",
    saving: "保存しています…",
    saveFailed: "保存できませんでした。回答と次の案内は引き続き利用できます。",
    credentialsTitle: "削除に必要な情報",
    recordId: "記録ID",
    deletionToken: "削除コード",
    deleteNow: "このサーバー記録を削除",
    deleting: "削除しています…",
    deleted: "サーバー記録を削除しました。",
    deleteFailed: "削除できませんでした。記録IDと削除コードを保管して、後でもう一度お試しください。",
    demoNotSaved: "デモ回答は支援ニーズデータへ保存できません。回答を見直して自分の回答に変更すると保存できます。",
    savedSessionWarning: "記録IDと削除コードはこのタブのsessionStorageにも保持します。タブを閉じる前に控えてください。Cookieや訪問横断追跡には使いません。",
    deleteBeforeReset: "削除コードを失わないよう、回答の見直し・最初からやり直す・端末データ消去は、先にこのサーバー記録を削除してから行えます。",
    copyCredentials: "記録IDと削除コードをコピー",
    credentialsCopied: "削除情報をコピーしました。",
    credentialsCopyFailed: "コピーできませんでした。表示された記録IDと削除コードを手動で控えてください。",
  },
  en: {
    situationTitle: "Choose how to save your answers",
    situationPurpose: "Optionally save a minimal set of answers to support municipality-level service preparation.",
    situationItems: "Saved: municipality code, selected answers, and child age bands. Nationality, exact dates or addresses, and free text are not saved.",
    conversationTitle: "Choose how to save AI conversations",
    conversationPurpose: "Choose conversation storage separately from Situation Check for operational and safety review.",
    conversationItems: "Saved: masked conversation text, model ID, cited source IDs, and timestamps. Conversation bodies are never shown in Crisis View.",
    detailsTitle: "Review saved data, retention, and deletion",
    retention: "Retention: only content that passes masking or rejection is kept indefinitely (no automatic-expiry rule is configured).",
    deletion: "Deletion: only someone holding the record ID and deletion code shown after saving can delete it. The code cannot be reissued.",
    safeguards: "Runs without an account or permanent user ID; no cross-visit cookie tracking, training, or secondary use of your answers.",
    warning: "Masking is not guaranteed. Do not enter names, email, phone, passport or residence-card numbers, or exact addresses. Document-like IDs are rejected; detectable contact details and addresses are redacted.",
    accept: "Consent and save",
    conversationAccept: "Set storage consent",
    decline: "Continue in this tab",
    accepted: "You consented to this storage purpose.",
    conversationAccepted: "You selected a conversation-storage preference. This currently records the preference only.",
    declined: "Continue with the guidance in this tab.",
    saving: "Saving…",
    saveFailed: "We could not save. Your answers and next-step guidance still work.",
    credentialsTitle: "Information required for deletion",
    recordId: "Record ID",
    deletionToken: "Deletion code",
    deleteNow: "Delete this server record",
    deleting: "Deleting…",
    deleted: "The server record was deleted.",
    deleteFailed: "We could not delete it. Keep the record ID and deletion code and try again later.",
    demoNotSaved: "Demo answers cannot be saved as support-need data. Review and replace them with your own answers first.",
    savedSessionWarning: "The record ID and deletion code also remain in this tab's sessionStorage. Save a copy before closing the tab. They are not used for cookies or cross-visit tracking.",
    deleteBeforeReset: "To avoid losing the deletion code, delete this server record before reviewing answers, starting over, or clearing device data.",
    copyCredentials: "Copy record ID and deletion code",
    credentialsCopied: "Deletion information copied.",
    credentialsCopyFailed: "We could not copy it. Manually save the record ID and deletion code shown above.",
  },
  my: {
    situationTitle: "အဖြေသိမ်းဆည်းနည်းကို ရွေးရန်",
    situationPurpose: "မြို့နယ်အလိုက် အကူအညီပြင်ဆင်ရေးအတွက် အနည်းဆုံးအဖြေများကို မိမိဆန္ဒဖြင့် သိမ်းနိုင်သည်။",
    situationItems: "သိမ်းမည့်အရာ: မြို့နယ်ကုဒ်၊ ရွေးချယ်ထားသောအဖြေများနှင့် ကလေးအသက်အုပ်စု။ နိုင်ငံသား၊ ရက်စွဲ/လိပ်စာအတိအကျနှင့် လွတ်လပ်စာသားကို မသိမ်းပါ။",
    conversationTitle: "AI စကားပြော သိမ်းဆည်းနည်းကို ရွေးရန်",
    conversationPurpose: "ဝန်ဆောင်မှုလည်ပတ်မှုနှင့် ဘေးကင်းရေးပြန်လည်စစ်ဆေးရန် Situation Check နှင့် သီးခြားရွေးချယ်ပါ။",
    conversationItems: "သိမ်းမည့်အရာ: ဖုံးကွယ်ပြီးသော စကားပြောစာသား၊ model ID၊ ရင်းမြစ် ID နှင့် အချိန်။ Crisis View တွင် စကားပြောစာသား မပြပါ။",
    detailsTitle: "သိမ်းမည့်အချက်၊ သိမ်းဆည်းကာလနှင့် ဖျက်နည်းကို စစ်ရန်",
    retention: "သိမ်းဆည်းကာလ: ဖုံးကွယ်ခြင်း သို့မဟုတ် ငြင်းပယ်ခြင်းကို ကျော်ဖြတ်သောအရာများကို ကာလမသတ်မှတ်ဘဲ သိမ်းထားပါသည် (အလိုအလျောက် သက်တမ်းကုန်ဆုံးစည်းမျဉ်း မရှိပါ)။",
    deletion: "ဖျက်ရန်: သိမ်းပြီးနောက် ပြသသည့် record ID နှင့် deletion code ရှိသူသာ ဖျက်နိုင်သည်။ code ကို ပြန်ထုတ်မပေးနိုင်ပါ။",
    safeguards: "အကောင့်၊ အမြဲတမ်း user ID၊ Cookie ဖြင့် အကြိမ်ကြိမ်လာရောက်မှုခြေရာခံခြင်း၊ လေ့ကျင့်ရေးနှင့် အခြားအသုံးပြုမှု မရှိပါ။",
    warning: "ဖုံးကွယ်မှုသည် အပြည့်အဝမဟုတ်နိုင်ပါ။ အမည်၊ email၊ ဖုန်း၊ နိုင်ငံကူးလက်မှတ်/နေထိုင်ခွင့်ကတ်နံပါတ်နှင့် လိပ်စာအတိအကျ မထည့်ပါနှင့်။ စာရွက်စာတမ်းနံပါတ်များကို ငြင်းပယ်ပြီး တွေ့နိုင်သော ဆက်သွယ်ရန်နှင့် လိပ်စာကို ဖုံးကွယ်ပါသည်။",
    accept: "သဘောတူပြီး သိမ်းရန်",
    conversationAccept: "စကားပြောသိမ်းဆည်းမှု သဘောတူညီချက် ရွေးရန်",
    decline: "ဤ tab ထဲတွင် ဆက်လုပ်ရန်",
    accepted: "ဤရည်ရွယ်ချက်အတွက် သိမ်းဆည်းရန် သဘောတူပြီးပါပြီ။",
    conversationAccepted: "စကားပြောသိမ်းဆည်းမှုကို ရွေးချယ်ထားသည်။ လက်ရှိတွင် သဘောတူညီချက်ရွေးချယ်မှုကိုသာ မှတ်တမ်းတင်သည်။",
    declined: "ဤ tab ထဲတွင် လမ်းညွှန်ချက်ကို ဆက်သုံးပါ။",
    saving: "သိမ်းနေသည်…",
    saveFailed: "မသိမ်းနိုင်ပါ။ အဖြေများနှင့် နောက်အဆင့်လမ်းညွှန်ကို ဆက်သုံးနိုင်ပါသည်။",
    credentialsTitle: "ဖျက်ရန်လိုအပ်သော အချက်အလက်",
    recordId: "Record ID",
    deletionToken: "Deletion code",
    deleteNow: "ဤ server record ကို ဖျက်ရန်",
    deleting: "ဖျက်နေသည်…",
    deleted: "Server record ကို ဖျက်ပြီးပါပြီ။",
    deleteFailed: "မဖျက်နိုင်ပါ။ record ID နှင့် deletion code ကို သိမ်းထားပြီး နောက်မှ ထပ်ကြိုးစားပါ။",
    demoNotSaved: "နမူနာအဖြေများကို အကူအညီလိုအပ်ချက်ဒေတာအဖြစ် မသိမ်းနိုင်ပါ။ မိမိအဖြေများဖြင့် ပြန်လည်ပြင်ဆင်ပြီးမှ သိမ်းပါ။",
    savedSessionWarning: "record ID နှင့် deletion code ကို ဤ tab ၏ sessionStorage တွင်လည်း ထိန်းထားမည်။ tab မပိတ်မီ မိတ္တူသိမ်းပါ။ Cookie သို့မဟုတ် အကြိမ်ကြိမ်လာရောက်မှုခြေရာခံရန် မသုံးပါ။",
    deleteBeforeReset: "deletion code မပျောက်စေရန် အဖြေပြန်ကြည့်ခြင်း၊ အစမှပြန်စခြင်း သို့မဟုတ် စက်ဒေတာဖျက်ခြင်းမပြုမီ ဤ server record ကို အရင်ဖျက်ပါ။",
    copyCredentials: "record ID နှင့် deletion code ကို ကူးယူရန်",
    credentialsCopied: "ဖျက်ရန်အချက်အလက်ကို ကူးယူပြီးပါပြီ။",
    credentialsCopyFailed: "မကူးယူနိုင်ပါ။ အပေါ်တွင်ပြထားသော record ID နှင့် deletion code ကို ကိုယ်တိုင်သိမ်းပါ။",
  },
} satisfies Record<Locale, PersistenceCopy>;

export function getPersistenceCopy(locale: Locale): PersistenceCopy {
  return copy[locale];
}
