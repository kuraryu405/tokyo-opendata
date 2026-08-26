import type { Locale } from "./components/staybridge-session";

export type PersistenceCopy = {
  situationTitle: string;
  situationPurpose: string;
  situationItems: string;
  conversationTitle: string;
  conversationPurpose: string;
  conversationItems: string;
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
  corruptCredentialsTitle: string;
  corruptCredentialsBody: string;
  corruptCredentialsDiscardWarning: string;
  corruptCredentialsPendingWarning: string;
  discardCorruptLocalData: string;
  discardOnlyCorruptCredentials: string;
  sessionUnreadableTitle: string;
  sessionUnreadableBody: string;
  startFreshSession: string;
};

const copy = {
  ja: {
    situationTitle: "Situation Check の回答を保存",
    situationPurpose: "自治体単位の支援ニーズ傾向を、個人を追跡せずに把握するためだけに使います。",
    situationItems: "保存するもの: 自治体コード、選択式の回答、子どもの年齢区分。国籍、正確な日付・住所、自由記述は保存しません。",
    conversationTitle: "AI相談の会話保存設定",
    conversationPurpose: "サービスの運用・安全確認のためだけに使います。Situation Check とは別の同意です。",
    conversationItems: "保存するもの: マスキング済みの会話、モデルID、参照した出典ID、作成日時。Crisis Viewには会話本文を出しません。",
    retention: "保持期間: マスキングまたは拒否を通過した内容だけを、期限を設けず保持します。従来の自動期限削除は行いません。",
    deletion: "削除方法: 保存後に表示する記録IDと削除コードを持つ人だけが削除できます。コードは再発行できません。",
    safeguards: "アカウント登録・恒久ユーザーIDなしで動作し、Cookieによる訪問横断追跡や入力内容の学習・二次利用はありません。",
    warning: "マスキングは完全ではありません。氏名、メール、電話、旅券・在留カード番号、正確な住所を入力しないでください。旅券・在留カードらしい番号は拒否し、検出できる連絡先・住所は伏せ字にします。",
    accept: "同意して保存",
    conversationAccept: "会話保存への同意を設定",
    decline: "保存しない",
    accepted: "この用途への保存に同意しました。",
    conversationAccepted: "会話保存への同意設定を選択しました。AI相談はまだ開始されておらず、会話も保存されていません。",
    declined: "保存しない設定です。主要な案内はそのまま利用できます。",
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
    corruptCredentialsTitle: "削除情報を確認できません",
    corruptCredentialsBody: "この端末の削除情報を読み取れません。サーバー記録が残っている可能性があるため、回答の変更・やり直し・端末データ消去を停止しました。",
    corruptCredentialsDiscardWarning: "この画面からは削除情報を復元できません。下の操作はサーバー記録を削除せず、この端末の回答と保存済み削除情報だけを破棄します。",
    corruptCredentialsPendingWarning: "別の未完了の保存情報も残っています。下の操作は壊れた削除情報だけを破棄し、回答と未完了の保存情報は保持します。",
    discardCorruptLocalData: "サーバー記録を残して端末データだけ破棄",
    discardOnlyCorruptCredentials: "壊れた削除情報だけ破棄",
    sessionUnreadableTitle: "前回の回答を読み取れません",
    sessionUnreadableBody: "この端末に残っていた回答データが、壊れているか現在の版より新しい形式のため読み取れません。誤って上書きしないよう、回答の保存とデモの読み込みを停止しています。「新しく始める」を選ぶと、このデータを破棄して最初からやり直せます。",
    startFreshSession: "新しく始める",
  },
  en: {
    situationTitle: "Save Situation Check answers",
    situationPurpose: "Used only to understand municipality-level support-need trends without tracking a person.",
    situationItems: "Saved: municipality code, selected answers, and child age bands. Nationality, exact dates or addresses, and free text are not saved.",
    conversationTitle: "AI conversation storage preference",
    conversationPurpose: "Used only for operational and safety review. This consent is separate from Situation Check.",
    conversationItems: "Saved: masked conversation text, model ID, cited source IDs, and timestamps. Conversation bodies are never shown in Crisis View.",
    retention: "Retention: only content that passes masking or rejection is kept indefinitely (no automatic-expiry rule is configured).",
    deletion: "Deletion: only someone holding the record ID and deletion code shown after saving can delete it. The code cannot be reissued.",
    safeguards: "Runs without an account or permanent user ID; no cross-visit cookie tracking, training, or secondary use of your answers.",
    warning: "Masking is not guaranteed. Do not enter names, email, phone, passport or residence-card numbers, or exact addresses. Document-like IDs are rejected; detectable contact details and addresses are redacted.",
    accept: "Consent and save",
    conversationAccept: "Set storage consent",
    decline: "Do not save",
    accepted: "You consented to this storage purpose.",
    conversationAccepted: "You selected a conversation-storage consent preference. No AI consultation has started and no conversation has been saved yet.",
    declined: "Not saved. The main guidance remains available.",
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
    corruptCredentialsTitle: "Deletion information cannot be verified",
    corruptCredentialsBody: "This device cannot read the deletion information. Answer changes, restarts, and device-data clearing are blocked because the server record may remain.",
    corruptCredentialsDiscardWarning: "This screen cannot recover the deletion information. The action below does not delete the server record; it only discards this device's answers and saved deletion information.",
    corruptCredentialsPendingWarning: "Another unfinished save is still recoverable. The action below discards only the corrupt deletion information and keeps the answers and pending save information.",
    discardCorruptLocalData: "Discard device data and leave server record",
    discardOnlyCorruptCredentials: "Discard only corrupt deletion information",
    sessionUnreadableTitle: "We cannot read your previous answers",
    sessionUnreadableBody: "The answer data left on this device is corrupt or written in a newer format than this version can read. To avoid overwriting it, saving answers and loading the demo are paused. Choose \u201cStart fresh\u201d to discard this data and begin again.",
    startFreshSession: "Start fresh",
  },
  my: {
    situationTitle: "Situation Check အဖြေများကို သိမ်းရန်",
    situationPurpose: "လူတစ်ဦးကို ခြေရာမခံဘဲ မြို့နယ်အလိုက် အကူအညီလိုအပ်ချက်ကို နားလည်ရန်သာ အသုံးပြုပါသည်။",
    situationItems: "သိမ်းမည့်အရာ: မြို့နယ်ကုဒ်၊ ရွေးချယ်ထားသောအဖြေများနှင့် ကလေးအသက်အုပ်စု။ နိုင်ငံသား၊ ရက်စွဲ/လိပ်စာအတိအကျနှင့် လွတ်လပ်စာသားကို မသိမ်းပါ။",
    conversationTitle: "AI စကားပြော သိမ်းဆည်းမှု ရွေးချယ်ရန်",
    conversationPurpose: "ဝန်ဆောင်မှုလည်ပတ်မှုနှင့် ဘေးကင်းရေးပြန်လည်စစ်ဆေးရန်သာ အသုံးပြုပါသည်။ Situation Check နှင့် သီးခြားသဘောတူညီချက် ဖြစ်သည်။",
    conversationItems: "သိမ်းမည့်အရာ: ဖုံးကွယ်ပြီးသော စကားပြောစာသား၊ model ID၊ ရင်းမြစ် ID နှင့် အချိန်။ Crisis View တွင် စကားပြောစာသား မပြပါ။",
    retention: "သိမ်းဆည်းကာလ: ဖုံးကွယ်ခြင်း သို့မဟုတ် ငြင်းပယ်ခြင်းကို ကျော်ဖြတ်သောအရာများကို ကာလမသတ်မှတ်ဘဲ သိမ်းထားပါသည် (အလိုအလျောက် သက်တမ်းကုန်ဆုံးစည်းမျဉ်း မရှိပါ)။",
    deletion: "ဖျက်ရန်: သိမ်းပြီးနောက် ပြသသည့် record ID နှင့် deletion code ရှိသူသာ ဖျက်နိုင်သည်။ code ကို ပြန်ထုတ်မပေးနိုင်ပါ။",
    safeguards: "အကောင့်၊ အမြဲတမ်း user ID၊ Cookie ဖြင့် အကြိမ်ကြိမ်လာရောက်မှုခြေရာခံခြင်း၊ လေ့ကျင့်ရေးနှင့် အခြားအသုံးပြုမှု မရှိပါ။",
    warning: "ဖုံးကွယ်မှုသည် အပြည့်အဝမဟုတ်နိုင်ပါ။ အမည်၊ email၊ ဖုန်း၊ နိုင်ငံကူးလက်မှတ်/နေထိုင်ခွင့်ကတ်နံပါတ်နှင့် လိပ်စာအတိအကျ မထည့်ပါနှင့်။ စာရွက်စာတမ်းနံပါတ်များကို ငြင်းပယ်ပြီး တွေ့နိုင်သော ဆက်သွယ်ရန်နှင့် လိပ်စာကို ဖုံးကွယ်ပါသည်။",
    accept: "သဘောတူပြီး သိမ်းရန်",
    conversationAccept: "စကားပြောသိမ်းဆည်းမှု သဘောတူညီချက် ရွေးရန်",
    decline: "မသိမ်းရန်",
    accepted: "ဤရည်ရွယ်ချက်အတွက် သိမ်းဆည်းရန် သဘောတူပြီးပါပြီ။",
    conversationAccepted: "စကားပြောသိမ်းဆည်းမှု သဘောတူညီချက်ကို ရွေးချယ်ထားသည်။ AI တိုင်ပင်မှု မစတင်သေးသဖြင့် စကားပြောကို မသိမ်းရသေးပါ။",
    declined: "မသိမ်းပါ။ အဓိကလမ်းညွှန်ကို ဆက်သုံးနိုင်ပါသည်။",
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
    corruptCredentialsTitle: "ဖျက်ရန်အချက်အလက်ကို အတည်မပြုနိုင်ပါ",
    corruptCredentialsBody: "ဤစက်ရှိ ဖျက်ရန်အချက်အလက်ကို ဖတ်မရပါ။ server record ကျန်နေနိုင်သောကြောင့် အဖြေပြင်ခြင်း၊ အစမှပြန်စခြင်းနှင့် စက်ဒေတာဖျက်ခြင်းကို ပိတ်ထားပါသည်။",
    corruptCredentialsDiscardWarning: "ဤမျက်နှာပြင်မှ ဖျက်ရန်အချက်အလက်ကို ပြန်မရနိုင်ပါ။ အောက်ပါလုပ်ဆောင်ချက်သည် server record ကို မဖျက်ဘဲ ဤစက်ရှိ အဖြေနှင့် သိမ်းထားသောဖျက်ရန်အချက်အလက်ကိုသာ စွန့်ပစ်ပါမည်။",
    corruptCredentialsPendingWarning: "မပြီးသေးသော အခြားသိမ်းဆည်းမှုအချက်အလက်ကို ပြန်လည်အသုံးပြုနိုင်ပါသေးသည်။ အောက်ပါလုပ်ဆောင်ချက်သည် ပျက်နေသော ဖျက်ရန်အချက်အလက်ကိုသာ စွန့်ပစ်ပြီး အဖြေနှင့် မပြီးသေးသောသိမ်းဆည်းမှုအချက်အလက်ကို ထိန်းထားပါမည်။",
    discardCorruptLocalData: "server record ကိုထားပြီး စက်ဒေတာသာ စွန့်ပစ်ရန်",
    discardOnlyCorruptCredentials: "ပျက်နေသော ဖျက်ရန်အချက်အလက်ကိုသာ စွန့်ပစ်ရန်",
    sessionUnreadableTitle: "ယခင်အဖြေများကို ဖတ်မရပါ",
    sessionUnreadableBody: "ဤစက်တွင်ကျန်ရှိသော အဖြေဒေတာသည် ပျက်နေသဖြင့် သို့မဟုတ် လက်ရှိဗားဇင်းထက် အသစ်ဖြစ်နေသဖြင့် ဖတ်မရပါ။ မှားယွင်းစွာရေးထပ်ခြင်းမရှိစေရန် အဖြေသိမ်းခြင်းနှင့် နမူနာဖွင့်ခြင်းကို ရပ်ထားပါသည်။ \u201cအသစ်မှစတင်ရန်\u201d ကို ရွေးပါက ဤဒေတာကို စွန့်ပစ်ပြီး အစမှပြန်စနိုင်ပါသည်။",
    startFreshSession: "အသစ်မှစတင်ရန်",
  },
} satisfies Record<Locale, PersistenceCopy>;

export function getPersistenceCopy(locale: Locale): PersistenceCopy {
  return copy[locale];
}
