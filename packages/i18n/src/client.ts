import type { UserLocale, UserMessages } from "./index";
export {
  actionNotices,
  getActionNotice,
  type ActionNoticeLocale,
} from "./action-notices";

export type PublicUserMessages = UserMessages & {
  ui: UserMessages["ui"] & {
    brandToSteps: string;
    backToTop: string;
    restart: string;
    restartPrompt: string;
    loading: string;
  };
  otherAnswers: Record<"area" | "nationality" | "visitPurpose" | "family", {
    label: string;
    placeholder: string;
    required: string;
    notice: string;
  }>;
};

export const selectableUserLocales = ["ja", "en", "my"] as const;
export type SelectableUserLocale = (typeof selectableUserLocales)[number];

const userLocaleNativeLabels = {
  ja: "日本語",
  en: "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  ko: "한국어",
  ne: "नेपाली",
  vi: "Tiếng Việt",
  my: "မြန်မာ",
  fil: "Filipino",
  id: "Bahasa Indonesia",
  bn: "বাংলা",
  th: "ไทย",
} as const satisfies Record<UserLocale, string>;

const jaMessagesWithoutDailyLife = {
  metadata: { label: "Japanese", nativeLabel: "日本語", contentStatus: "reviewed", updatedAt: "2026-08-24", internalReview: { status: "reviewed", reviewedAt: "2026-08-24", reviewedBy: "StayBridge team" }, expertReview: { status: "pending" } },
  ui: {
    skip: "本文へ移動", navSteps: "わたしのステップ", brandToSteps: "わたしのステップへ戻る", navLocal: "近くの支援", navHelp: "相談先", navChat: "AIに相談", navSettings: "保存設定", crisis: "行政・支援者向け Preparedness View",
    eyebrow: "東京で、予定外に生活を続けることになった方へ", hero: "見つけよう。\n東京での第一歩を。",
    intro: "帰国する予定だったのに、母国の状況が変わって帰ることが難しくなった方へ。今の状況に合わせて、東京で当面生活するために確認したいことを整理します。",
    start: "今の状況を確認する", demo: "デモの状況を読み込む", noLogin: "すぐに開始", noAddress: "自治体単位で回答", official: "公式情報へ案内",
    notDecision: "在留手続や法律上の判断は、専門相談窓口で確認してください。窓口では現在の書類と滞在期限を伝えます。", privacyTitle: "次の行動に必要な範囲だけ答えます",
    privacyText: "自治体、滞在状況、必要な支援など、次の案内に必要な範囲だけ答えます。氏名や旅券番号は入力せず、完了後にサーバーへ保存する最小項目を選べます。",
    back: "戻る", next: "次へ", finish: "状況を整理する", backToTop: "トップページへ戻る", restart: "最初からやり直す", restartPrompt: "気に入らないですか？", loading: "次のステップを準備しています", selectMany: "あてはまるものをすべて選べます", optional: "分かる範囲で大丈夫です",
    reviewed: "回答を確認して、次の行動へ進みましょう", reviewedIntro: "回答の要約を確認したら、滞在の公式確認と当面の生活準備を上から順に進めます。",
    seeRoadmap: "次のステップを見る", answerAgain: "回答を見直す", roadmapTitle: "あなたの次のステップ", roadmapIntro: "今日できる確認から順に進めます。まず最初のカードを開いてください。",
    why: "なぜこの案内？", source: "根拠となる情報", fetched: "取得日", changesMade: "東京都北区Open DataをStayBridge用に一部選定・正規化しています", human: "個別の確認が必要", localTitle: "この地域で確認できる場所",
    localIntro: "目的に合う場所を選び、公式サイトで利用条件・受付時間・連絡方法を確認してください。",
    localFallback: "選択した自治体の施設を表示しています。", all: "すべて", school: "学校・教育", medical: "医療", child_support: "子どもの居場所", public_facility: "公共施設",
    details: "公式サイトを見る", sourceLabel: "出典を見る", updated: "データ更新", unavailable: "公開日不明", backToRoadmap: "ステップへ戻る", continueToHelp: "相談先へ進む",
    schoolNote: "確認先: 自治体または教育機関。確認項目: 入学・就学、通学区域、言語支援。", noResources: "相談窓口の一覧から、この地域で利用できる支援を確認してください。",
    helpTitle: "人に相談する", helpIntro: "相談先を選び、まとめたサマリーと手元の書類を持って、確認したいことを伝えましょう。", chatTitle: "AIに相談", chatIntro: "AIは誤ることがあります。個人情報を入力せず、回答を確認してください。Situation Checkの回答は自動送信されません。", settingsTitle: "データ保存設定", settingsIntro: "Situation CheckとAI相談の保存は別々に選べます。", viewChat: "AIに相談する", viewSettings: "保存設定を見る", backToHelp: "相談先へ戻る", nearbySchoolsNote: "一覧は就学可否・学区・空き・日本語支援・受入可否を保証しません。自治体または学校に確認してください。", preparingHelp: "相談の準備", actionDetail: "ステップ詳細",
    prepare: "相談前に準備すること", prepareItems: ["パスポートなど、現在持っている書類", "もともとの帰国予定日", "相談したいことのメモ", "通訳が必要かどうか"],
    summary: "相談内容をまとめる", summaryTitle: "相談員に見せるサマリー", summaryIntro: "相談先で見せる内容を確認し、コピーまたは印刷して持参してください。",
    current: "現在の状況", questions: "確認したいこと", copy: "コピーする", copied: "コピーしました", print: "印刷する", showMode: "相談員に見せる", clear: "この端末のデータを消す",
    emergency: "生命や身体に差し迫った危険がある場合は、このサービスではなく110または119へ連絡してください。", footer: "情報ではなく、次の一歩。",
    principleTitles: ["状況を整理", "次のステップ", "地域で行動"], principleBodies: ["制度名を知らなくても、今の状況を一問ずつ整理。", "今日、今週、その先に確認することを順番に提示。", "Open Dataから、地域で確認する意味のある場所へ。"],
    ageLabel: "子どもの年齢", deadlineLabel: "滞在できる期限（任意）", noEnteredInfo: "まだ入力された情報はありません。", noSelectedNeeds: "まだ確認したいことは選択されていません。",
    storageError: "端末への保存ができませんでした。画面上では続けられますが、再読み込みすると回答が失われます。", copyError: "コピーできませんでした。画面の内容を選択してコピーしてください。",
    homeLabel: "StayBridge Tokyo ホーム", primaryNavLabel: "主要ナビゲーション", languageSelectTitle: "表示言語", languageSelectLabel: "言語",
    sectionSituationCheck: "状況確認", questionLabel: "質問", sectionSituationReview: "状況の確認", sectionPersonalRoadmap: "あなたのステップ", sectionLocalAction: "地域での行動 · オープンデータ", sectionHumanHandoff: "人への相談", sectionConsultationSummary: "相談内容のまとめ", sectionOfficialSupport: "公式相談", sectionHowItHelps: "できること", sectionPublicTeams: "行政・支援者向け",
    previewAriaLabel: "StayBridgeロードマップのプレビュー", previewTitle: "次のステップ", previewSafety: "安全・プライバシー", previewSteps: [{ time: "今日", title: "滞在を確認", detail: "公式情報" }, { time: "今週", title: "公式相談先に相談", detail: "人への相談" }, { time: "30日以内", title: "地域で生活を整える", detail: "学校 · 医療 · 子どもの居場所" }],
    localNavigationLabel: "地域での行動ナビゲーション", priorityLabel: "優先度", sourceTypeLabels: { openData: "オープンデータ", official: "公式" }, addressLabel: "住所", phoneLabel: "電話", publicDataLabel: "公開データ",
    supportFallback: "対応内容・言語・受付時間は公式ページで確認してください。", resourceIcons: { school: "学", medical: "+", child_support: "こ", public_facility: "公" }, localeOptions: userLocaleNativeLabels,
    summarySheetLabel: "相談内容のまとめ", summarySheetSections: ["01", "02"], areaLabel: "地域", nationalityLabel: "国籍・地域", ageValueLabel: "年齢", japaneseLabel: "日本語",
  },
  questions: [
    ["今、東京のどの地域に滞在していますか？", "正確な住所は必要ありません。", [["Kita", "北区"], ["Shinjuku", "新宿区"], ["Toshima", "豊島区"], ["Other", "その他"]]],
    ["国籍・地域を教えてください。", "この回答は地域の支援準備には送信されません。", [["MMR", "ミャンマー"], ["OTHER", "その他"], ["UNKNOWN", "答えたくない"]]],
    ["日本にはどのような予定で来ましたか？", "制度名ではなく、分かりやすい言葉で選べます。", [["tourism", "旅行"], ["visiting_family_or_friends", "家族・知人を訪ねるため"], ["work", "仕事"], ["study", "留学"], ["resident", "日本に住んでいる"], ["other", "その他"], ["unknown", "分からない / 答えたくない"]]],
    ["もともと日本をいつ出る予定でしたか？", "おおよその予定で大丈夫です。", [["within_7_days", "7日以内"], ["within_30_days", "30日以内"], ["within_3_months", "3か月以内"], ["no_departure_plan", "帰国予定はなかった"], ["unknown", "分からない"]]],
    ["今、予定どおり帰国できますか？", "ここでは、あなたの現在の認識を教えてください。", [["possible", "帰国できる"], ["difficult", "帰国することが難しい"], ["unknown", "分からない"]]],
    ["日本にいつまで滞在できるか分かりますか？", "在留資格の名前が分からなくても進められます。", [["known", "分かっている"], ["unknown", "分からない"], ["documents", "書類を確認したい"]]],
    ["一緒に日本にいる家族はいますか？", "子どもがいる場合は年齢も選びます。", [["none", "いない"], ["children", "子どもがいる"], ["spouse", "配偶者がいる"], ["other", "その他家族がいる"]]],
    ["今、どこに滞在していますか？", "番地までの入力は不要です。", [["hotel", "ホテル・宿泊施設"], ["family_or_friend", "家族・知人の家"], ["rental", "賃貸住宅"], ["temporary_facility", "一時的な施設"], ["unstable", "今後の滞在場所に不安がある"], ["prefer_not_to_say", "答えたくない"]]],
    ["現在困っていることは何ですか？", "あてはまるものをすべて選べます。", [["stay", "日本にいつまでいられるか"], ["consultation", "相談先"], ["accommodation", "今後の住む場所"], ["living_cost", "生活費"], ["employment", "仕事"], ["education", "子どもの学校・教育"], ["childcare", "子どもの生活"], ["medical", "医療"], ["language", "日本語"], ["none", "特になし"]]],
    ["日本語をどのくらい話せますか？", "相談時の言語サポートを考えるために使います。", [["none", "ほとんど話せない"], ["beginner", "少し話せる"], ["daily", "日常会話ができる"], ["advanced", "十分話せる"]]],
  ],
  otherAnswers: {
    area: { label: "滞在している区市町村を入力", placeholder: "例：世田谷区（正確な住所・施設名は不要）", required: "「その他」を選んだ場合は入力が必要です。", notice: "区市町村名のみで構いません。番地や施設名の入力は不要です。この内容は Workers AI には送信されません。" },
    nationality: { label: "国籍または地域を入力", placeholder: "例：タイ", required: "「その他」を選んだ場合は入力が必要です。", notice: "答えたくない場合は別の選択肢を使えます。この内容は Workers AI には送信されません。" },
    visitPurpose: { label: "その他の来日目的を入力", placeholder: "例：イベントへの参加、家族の手伝い", required: "「その他」を選んだ場合は入力が必要です。", notice: "次のカード候補を選ぶために、この内容のみ Cloudflare Workers AI へ送信します。氏名や連絡先、書類番号、正確な住所の入力は不要です。" },
    family: { label: "一緒にいるその他の家族を入力", placeholder: "例：親、きょうだい", required: "「その他家族がいる」を選んだ場合は入力が必要です。", notice: "家族の氏名の入力は不要です。この内容は Workers AI には送信されません。" },
  },
  actions: {
    CHECK_STAY_STATUS: { title: "日本に滞在できる期間を確認する", desc: "現在の滞在期限と、今確認すべき手続を公式窓口で確認します。", cta: "公式相談先を見る" }, CONTACT_OFFICIAL_SUPPORT: { title: "専門の相談窓口へ相談する", desc: "今後の滞在については、状況に応じた個別確認が必要です。", cta: "相談先を見る" }, PLAN_TEMPORARY_LIVING: { title: "今後の滞在場所を整理する", desc: "今の宿泊が終わる前に、当面の生活について相談できる先を確認します。", cta: "生活相談先を見る" }, CHECK_CHILD_EDUCATION: { title: "子どもの教育について相談する", desc: "滞在が長くなる場合、子どもの学習や学校について地域で確認できます。", cta: "近くの学校を見る" }, CHECK_CHILD_EDUCATION_GUIDANCE: { title: "学校の就学手続きの公式案内を確認する", desc: "外国人の子どもの就学について、東京都・教育委員会・文科省等の公式案内で手続きと相談先を確認します。", cta: "公式案内を見る" }, FIND_NEARBY_SCHOOLS: { title: "近くの学校を探す", desc: "お住まいの自治体のオープンデータで公開されている小学校の一覧を確認できます。", cta: "近くの学校を見る" }, CHECK_MEDICAL_OPTIONS: { title: "医療を受けられる場所を確認する", desc: "必要なときに相談できるよう、地域の医療機関を先に確認します。", cta: "近くの医療機関を見る" }, CHECK_CHILD_LOCAL_SUPPORT: { title: "子どもと利用できる地域資源を確認する", desc: "子どもが安心して過ごせる公共施設や地域資源を確認します。", cta: "子どもの居場所を見る" }, CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH: { title: "働ける条件を先に確認する", desc: "仕事を探す前に、現在の滞在状況で働けるかを公式窓口で確認します。", cta: "公式相談先を見る" }, CHECK_LIVING_COST_SUPPORT: { title: "当面の生活費について相談する", desc: "利用できる相談や支援があるかを、公式の相談窓口で個別に確認します。", cta: "相談先を見る" }, FIND_LANGUAGE_SUPPORT: { title: "通訳・やさしい日本語の支援を確認する", desc: "相談内容を正確に伝えるため、利用できる言語サポートを確認します。", cta: "相談先を見る" }, CHECK_BEFORE_STAY_DEADLINE: { title: "期限までに書類と相談予定を確認する", desc: "入力した期限より前に、手元の書類と公式窓口へ確認する時期を整理します。", cta: "公式相談先を見る" }, FIND_DAILY_LIFE_GUIDANCE: { title: "日々の生活の公式案内を確認する", desc: "東京での暮らしに必要な手続や生活情報を、公式の生活ガイドで整理します。", cta: "公式案内を見る" },
  },
  timing: { today: "今日", this_week: "今週", next_30_days: "今後30日", before_deadline: "期限まで", long_term: "長期化したら" },
  reasons: { RETURN_DIFFICULT_SHORT_TERM: "「旅行・短期の訪問で来た」「予定どおり帰ることが難しい」と回答したため表示しています。", RETURN_DIFFICULT: "予定どおり帰ることが難しいと回答したため、現在の状況を公式窓口で確認する案内を表示しています。", SITUATION_NEEDS_CONFIRMATION: "帰国や滞在の状況が分からない、または相談先を知りたいと回答したため表示しています。", SCHOOL_AGE_CHILD: "学齢期の子どもと一緒にいるため、教育相談と学校情報を表示しています。", CHILD_LOCAL_ROUTINE: "子どもと一緒に東京で生活を続ける可能性があるため、地域の居場所を表示しています。", TEMPORARY_HOTEL: "現在ホテルに滞在し、予定どおり帰ることが難しいため表示しています。", UNSTABLE_ACCOMMODATION: "今後の滞在場所に不安があり、予定どおり帰ることが難しいため表示しています。", CHILDCARE_NEED: "乳幼児と一緒に滞在し、子どもの生活について困っていると回答したため表示しています。", MEDICAL_NEED: "医療について困っていると回答したため表示しています。", EMPLOYMENT_NEED: "仕事または生活費について確認したいと回答したため、就労可否の確認を先に表示しています。", LIVING_COST_NEED: "当面の生活費について困っていると回答したため、公式相談先を表示しています。", DAILY_LIFE_NEED: "日々の生活について困っていると回答したため、公式の生活案内を表示しています。", LANGUAGE_BARRIER: "日本語での相談に言語サポートが役立つ可能性があるため表示しています。", KNOWN_STAY_DEADLINE: "滞在できる期限を入力したため、その日より前に公式確認できるよう表示しています。", STAY_DEADLINE_PASSED: "入力した滞在期限を過ぎているため、すぐに公式窓口へ状況を確認する案内を表示しています。" },
  needs: { stay: "日本にこれからどのくらい滞在できるか", consultation: "必要な手続と相談先", accommodation: "当面の宿泊・生活", living_cost: "生活費についての相談", employment: "働ける条件", education: "子どもの教育", childcare: "子どもの生活", medical: "医療を受けられる場所", language: "言語サポート", daily_life: "日々の生活", none: "特になし" },
} as const satisfies PublicUserMessages;

const enMessagesWithoutDailyLife = {
  metadata: { label: "English", nativeLabel: "English", contentStatus: "reviewed", updatedAt: "2026-08-24", internalReview: { status: "reviewed", reviewedAt: "2026-08-24", reviewedBy: "StayBridge team" }, expertReview: { status: "pending" } },
  otherAnswers: {
    area: { label: "Enter the municipality where you are staying", placeholder: "Example: Setagaya City (no exact address or facility name)", required: "Enter a value when Other is selected.", notice: "Keep this to the municipality level. Do not enter an exact address or facility name. This text is not sent to Workers AI." },
    nationality: { label: "Enter your nationality or region", placeholder: "Example: Thailand", required: "Enter a value when Other is selected.", notice: "You can choose Prefer not to say instead. This text is not sent to Workers AI." },
    visitPurpose: { label: "Enter your other reason for coming to Japan", placeholder: "Example: attend an event or help family", required: "Enter a value when Other is selected.", notice: "Only this text is sent to Cloudflare Workers AI to select possible next-step cards. Do not enter names, contact details, document numbers, or an exact address." },
    family: { label: "Enter the other family member with you", placeholder: "Example: parent or sibling", required: "Enter a value when Other family is selected.", notice: "Do not enter anyone's name. This text is not sent to Workers AI." },
  },
  ui: {
    skip: "Skip to content", navSteps: "My steps", brandToSteps: "Go to my steps", navLocal: "Local support", navHelp: "Get help", navChat: "Ask AI", navSettings: "Data settings", crisis: "Preparedness View for public teams", eyebrow: "For people unexpectedly needing to stay in Tokyo", hero: "You cannot return home.\nBut you can find your next step in Tokyo.", intro: "If you planned to return home but a sudden change there has made that difficult, StayBridge organizes what to check so you can manage life in Tokyo for now.", start: "Check my situation", demo: "Load demo situation", noLogin: "No account", noAddress: "No exact address", official: "Links to official sources", notDecision: "Immigration procedures and legal decisions are handled by specialist consultation desks. Please use a desk near you.", privacyTitle: "Only answer what is needed for your next steps", privacyText: "You only answer the items needed to check your stay. Personal details such as your name or passport number are never required. Until you consent, answers stay in this browser session; after completion, optional minimum-data server storage is available.", back: "Back", next: "Next", finish: "Organize my situation", backToTop: "Back to home", restart: "Start over", restartPrompt: "If this guidance does not fit", loading: "Preparing your next steps", selectMany: "Select all that apply", optional: "Answer only what you know", reviewed: "We organized your situation", reviewedIntro: "This is a summary of what you self-reported. First, confirm your stay with an official source. Then work through the practical information you may need.", seeRoadmap: "See my next steps", answerAgain: "Review answers", roadmapTitle: "Your next steps", roadmapIntro: "Shown in priority order. You do not need to finish everything today.", why: "Why am I seeing this?", source: "Supporting source", fetched: "Fetched", changesMade: "Selected and normalized from Kita City Open Data for StayBridge.", human: "Individual review needed", localTitle: "Places to check in this area", localIntro: "Public resources relevant to your situation, drawn from open data. Ask each office about eligibility and availability.", localFallback: "Showing facilities by municipality without using precise location.", all: "All", school: "Schools & education", medical: "Medical", child_support: "Child spaces", public_facility: "Public facilities", details: "Open official website", sourceLabel: "See the source", updated: "Data updated", unavailable: "Not published", backToRoadmap: "Back to my steps", continueToHelp: "Continue to support", schoolNote: "Ask the municipality or education authority about enrollment and attendance.", noResources: "Support information for this area is not listed yet. Please use the consultation contacts.", helpTitle: "Talk to a person", helpIntro: "Bring this summary to an official support desk and explain your situation in your words. Procedures differ by stay status, so confirming the details there is your next step.", chatTitle: "Ask AI", chatIntro: "AI can make mistakes. Do not enter personal information. Your Situation Check answers are not sent automatically.", settingsTitle: "Data settings", settingsIntro: "Choose separately whether to save Situation Check answers and AI conversations.", viewChat: "Ask AI", viewSettings: "View data settings", backToHelp: "Back to help", nearbySchoolsNote: "Listings do not guarantee admission, catchment, vacancy, Japanese support, or acceptance. Ask the municipality or school.", preparingHelp: "Prepare for consultation", actionDetail: "Step detail", prepare: "Prepare before you talk", prepareItems: ["Documents you currently have, such as your passport", "Your original planned departure date", "A note of what you need to ask", "Whether you need an interpreter"], summary: "Create consultation summary", summaryTitle: "Summary to show a support worker", summaryIntro: "This includes only what you entered. Show this screen or copy the text.", current: "Current situation", questions: "What I need to confirm", copy: "Copy", copied: "Copied", print: "Print", showMode: "Show to a support worker", clear: "Clear data on this device", emergency: "If there is an immediate threat to life or safety, contact 110 or 119 instead of using this service.", footer: "Not just information. Your next step.", principleTitles: ["Situation", "Next steps", "Local action"], principleBodies: ["Organize your situation one question at a time without knowing official terms.", "See what to check today, this week, and after that in a clear order.", "Use open data to find relevant places to check in your municipality."], ageLabel: "Child age", deadlineLabel: "Stay deadline (optional)", noEnteredInfo: "No situation information has been entered yet.", noSelectedNeeds: "No questions or concerns have been selected yet.", storageError: "We could not save on this device. You can continue, but answers will be lost after reloading.", copyError: "We could not copy the summary. Please select and copy the text on this screen.", homeLabel: "StayBridge Tokyo home", primaryNavLabel: "Primary navigation", languageSelectTitle: "Display language", languageSelectLabel: "Language", sectionSituationCheck: "Situation check", questionLabel: "Question", sectionSituationReview: "Situation review", sectionPersonalRoadmap: "Personal roadmap", sectionLocalAction: "Local action · Open data", sectionHumanHandoff: "Human handoff", sectionConsultationSummary: "Consultation summary", sectionOfficialSupport: "Official support", sectionHowItHelps: "How it helps", sectionPublicTeams: "For public teams", previewAriaLabel: "StayBridge roadmap preview", previewTitle: "Your next steps", previewSafety: "Safe & private", previewSteps: [{ time: "Today", title: "Confirm your stay", detail: "Official information" }, { time: "This week", title: "Talk to official support", detail: "Human handoff" }, { time: "Next 30 days", title: "Build daily life locally", detail: "Schools · Medical · Child spaces" }], localNavigationLabel: "Local Action navigation", priorityLabel: "PRIORITY", sourceTypeLabels: { openData: "Open data", official: "Official" }, addressLabel: "Address", phoneLabel: "Phone", publicDataLabel: "Public data", supportFallback: "Check current services, languages and opening hours on the official page.", resourceIcons: { school: "S", medical: "+", child_support: "C", public_facility: "P" }, localeOptions: userLocaleNativeLabels, summarySheetLabel: "Consultation summary", summarySheetSections: ["01", "02"], areaLabel: "Area", nationalityLabel: "Nationality/region", ageValueLabel: "age", japaneseLabel: "Japanese" },
  questions: [["Where are you staying in Tokyo now?", "You do not need to give an exact address.", [["Kita", "Kita City"], ["Shinjuku", "Shinjuku City"], ["Toshima", "Toshima City"], ["Other", "Other"]]], ["What is your nationality or region?", "This answer is not sent to public agencies.", [["MMR", "Myanmar"], ["OTHER", "Other"], ["UNKNOWN", "Prefer not to say"]]], ["What was your plan when you came to Japan?", "Choose everyday words; you do not need to know an official status name.", [["tourism", "Travel"], ["visiting_family_or_friends", "Visit family or friends"], ["work", "Work"], ["study", "Study"], ["resident", "I live in Japan"], ["other", "Other"], ["unknown", "I do not know / prefer not to say"]]], ["When had you planned to leave Japan?", "An approximate answer is enough.", [["within_7_days", "Within 7 days"], ["within_30_days", "Within 30 days"], ["within_3_months", "Within 3 months"], ["no_departure_plan", "I had no departure plan"], ["unknown", "I do not know"]]], ["Can you return home as planned now?", "Tell us only how you understand your situation today.", [["possible", "I can return"], ["difficult", "It is difficult to return"], ["unknown", "I do not know"]]], ["Do you know how long you can stay in Japan?", "You can continue even if you do not know the name of your status.", [["known", "I know"], ["unknown", "I do not know"], ["documents", "I want to check my documents"]]], ["Is any family with you in Japan?", "If a child is with you, select their age too.", [["none", "No"], ["children", "A child is with me"], ["spouse", "My spouse is with me"], ["other", "Other family is with me"]]], ["Where are you staying now?", "We do not ask for the exact location.", [["hotel", "Hotel or accommodation"], ["family_or_friend", "Family or friend’s home"], ["rental", "Rental home"], ["temporary_facility", "Temporary facility"], ["unstable", "I am worried about where I can stay"], ["prefer_not_to_say", "Prefer not to say"]]], ["What are you worried about now?", "Select all that apply.", [["stay", "How long I can stay"], ["consultation", "Where to ask for help"], ["accommodation", "A place to stay"], ["living_cost", "Living costs"], ["employment", "Work"], ["education", "School and education"], ["childcare", "My child’s daily life"], ["medical", "Medical care"], ["language", "Japanese language"], ["none", "None of these"]]], ["How much Japanese can you speak?", "This helps us organize language support for consultations.", [["none", "Almost none"], ["beginner", "A little"], ["daily", "Everyday conversation"], ["advanced", "Comfortably"]]]],
  actions: {
    CHECK_STAY_STATUS: { title: "Confirm how long you can stay", desc: "Check your current period of stay and any steps you may need with an official service.", cta: "See official support" }, CONTACT_OFFICIAL_SUPPORT: { title: "Talk to an official support desk", desc: "Your next procedure may depend on your individual situation.", cta: "See support contacts" }, PLAN_TEMPORARY_LIVING: { title: "Plan where you can stay next", desc: "Before your current accommodation ends, find where to ask about day-to-day living.", cta: "See living support" }, CHECK_CHILD_EDUCATION: { title: "Ask about your child’s education", desc: "If your stay becomes longer, you can ask locally about learning and school.", cta: "See nearby schools" }, CHECK_CHILD_EDUCATION_GUIDANCE: { title: "Check official guidance on school enrollment", desc: "See where to ask about enrollment for your child at the municipality or board of education.", cta: "View official guidance" }, FIND_NEARBY_SCHOOLS: { title: "Find nearby schools", desc: "View elementary schools published as open data for your municipality.", cta: "View nearby schools" }, CHECK_MEDICAL_OPTIONS: { title: "Find where to get medical care", desc: "Check nearby medical facilities now so you know where to turn if needed.", cta: "See medical facilities" }, CHECK_CHILD_LOCAL_SUPPORT: { title: "Find local places for your child", desc: "Check public places and community resources where children can spend time.", cta: "See child spaces" }, CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH: { title: "Check if you may work first", desc: "Before job searching, ask an official service whether your current status allows work.", cta: "See official support" }, CHECK_LIVING_COST_SUPPORT: { title: "Ask about immediate living costs", desc: "Check with an official support service what consultations or support may be available for your circumstances.", cta: "See support contacts" }, FIND_LANGUAGE_SUPPORT: { title: "Check language support", desc: "Find interpretation or simple-language support so you can explain your situation accurately.", cta: "See support contacts" }, CHECK_BEFORE_STAY_DEADLINE: { title: "Check documents before your deadline", desc: "Plan when to review your documents and contact an official service before the date you entered.", cta: "See official support" }, FIND_DAILY_LIFE_GUIDANCE: { title: "Check official daily-life guidance", desc: "Use official living guides to organize the procedures and everyday information for life in Tokyo.", cta: "See official guidance" },
  },
  timing: { today: "Today", this_week: "This week", next_30_days: "Within 30 days", before_deadline: "Before the deadline", long_term: "If your stay becomes longer" },
  reasons: { RETURN_DIFFICULT_SHORT_TERM: "You said you came for a short visit and now find it difficult to return as planned.", RETURN_DIFFICULT: "You said it is difficult to return as planned, so an official check of your current situation is shown.", SITUATION_NEEDS_CONFIRMATION: "You said your return or stay is unclear, or that you need to find where to ask for help.", SCHOOL_AGE_CHILD: "You are with a school-age child, so education consultation and school information are shown.", CHILD_LOCAL_ROUTINE: "You may need to continue daily life in Tokyo with a child, so local child spaces are shown.", TEMPORARY_HOTEL: "You are staying in a hotel and find it difficult to return as planned.", UNSTABLE_ACCOMMODATION: "You said your accommodation is unstable and that it is difficult to return as planned.", CHILDCARE_NEED: "You are with a young child and selected childcare or daily-life support as a concern.", MEDICAL_NEED: "You selected medical care as a current concern.", EMPLOYMENT_NEED: "You selected work or living costs, so checking work eligibility comes before job search.", LIVING_COST_NEED: "You selected immediate living costs as a concern, so an official consultation route is shown.", DAILY_LIFE_NEED: "You selected a daily-life concern, so official living guidance is shown.", LANGUAGE_BARRIER: "Language support may help you explain your situation during official consultations.", KNOWN_STAY_DEADLINE: "You entered a stay deadline, so this is shown to help you confirm with an official service before that date.", STAY_DEADLINE_PASSED: "The stay deadline you entered has passed, so this directs you to confirm your situation with an official service now." },
  needs: { stay: "How long I can stay in Japan", consultation: "Procedures and official support", accommodation: "Accommodation and daily living", living_cost: "Help with living costs", employment: "Whether I may work", education: "My child’s education", childcare: "My child’s daily life", medical: "Where to get medical care", language: "Language support", daily_life: "Daily life", none: "None of these" },
} as const satisfies PublicUserMessages;

const myMessagesWithoutDailyLife = {
  metadata: { label: "Burmese", nativeLabel: "မြန်မာ", contentStatus: "reviewed", updatedAt: "2026-08-24", internalReview: { status: "reviewed", reviewedAt: "2026-08-24", reviewedBy: "StayBridge team" }, expertReview: { status: "pending" } },
  otherAnswers: {
    area: { label: "နေထိုင်နေသော မြို့နယ်ကို ရေးပါ", placeholder: "ဥပမာ - ဆေတာဂယမြို့နယ် (လိပ်စာအတိအကျ သို့မဟုတ် နေရာအမည် မလိုပါ)", required: "အခြားကို ရွေးထားပါက ဤအကွက်ကို ဖြည့်ရန် လိုအပ်ပါသည်။", notice: "မြို့နယ်အဆင့်အထိသာ ရေးပါ။ လိပ်စာအတိအကျ သို့မဟုတ် နေရာအမည် မရေးပါနှင့်။ ဤစာကို Workers AI သို့ မပို့ပါ။" },
    nationality: { label: "နိုင်ငံသား သို့မဟုတ် ဒေသကို ရေးပါ", placeholder: "ဥပမာ - ထိုင်း", required: "အခြားကို ရွေးထားပါက ဤအကွက်ကို ဖြည့်ရန် လိုအပ်ပါသည်။", notice: "မဖြေလိုပါက မဖြေလိုကို ရွေးနိုင်ပါသည်။ ဤစာကို Workers AI သို့ မပို့ပါ။" },
    visitPurpose: { label: "အခြားလာရောက်ရသည့် ရည်ရွယ်ချက်ကို ရေးပါ", placeholder: "ဥပမာ - ပွဲတစ်ခုတက်ရန် သို့မဟုတ် မိသားစုကို ကူညီရန်", required: "အခြားကို ရွေးထားပါက ဤအကွက်ကို ဖြည့်ရန် လိုအပ်ပါသည်။", notice: "နောက်အဆင့်ကတ်များကို ရွေးရန် ဤစာသားကိုသာ Cloudflare Workers AI သို့ ပို့ပါမည်။ အမည်၊ ဆက်သွယ်ရန်အချက်အလက်၊ စာရွက်စာတမ်းနံပါတ် သို့မဟုတ် လိပ်စာအတိအကျ မထည့်ပါနှင့်။" },
    family: { label: "အတူရှိသော အခြားမိသားစုကို ရေးပါ", placeholder: "ဥပမာ - မိဘ၊ အစ်ကို၊ အစ်မ", required: "အခြားမိသားစုကို ရွေးထားပါက ဤအကွက်ကို ဖြည့်ရန် လိုအပ်ပါသည်။", notice: "မိသားစုအမည်များ မရေးပါနှင့်။ ဤစာကို Workers AI သို့ မပို့ပါ။" },
  },
  ui: {
    skip: "အကြောင်းအရာသို့ သွားရန်", navSteps: "အဆင့်များ", brandToSteps: "အဆင့်များသို့ ပြန်သွားရန်", navLocal: "အနီးနား", navHelp: "အကူအညီ", navChat: "AI မေးရန်", navSettings: "သိမ်းဆည်းမှု ဆက်တင်", crisis: "အုပ်ချုပ်ရေးနှင့် ကူညီသူများအတွက် Preparedness View", eyebrow: "တိုကျိုတွင် မမျှော်လင့်ဘဲ ဆက်လက်နေထိုင်ရသူများအတွက်", hero: "အိမ်ကို မပြန်နိုင်သေးပါ။\nဒါပေမယ့် တိုကျိုမှာ နောက်တစ်ဆင့်ကို ရှာနိုင်ပါတယ်။", intro: "မိမိနိုင်ငံအခြေအနေ ပြောင်းလဲသွားလို့ စီစဉ်ထားသလို ပြန်ဖို့ခက်ခဲလာသူများအတွက်၊ တိုကျိုတွင် ယာယီဆက်နေထိုင်ရန် စစ်ဆေးရမည့်အချက်များကို စီစဉ်ပေးပါသည်။", start: "လက်ရှိအခြေအနေ စစ်ဆေးရန်", demo: "နမူနာအခြေအနေ ဖွင့်ရန်", noLogin: "အကောင့်မလို", noAddress: "လိပ်စာအတိအကျ မလို", official: "တရားဝင်အချက်အလက်သို့ ချိတ်ဆက်", notDecision: "နေထိုင်ခွင့်လုပ်ထုံးလုပ်နည်းနှင့် ဥပဒေရေးရာဆုံးဖြတ်ချက်များကို ကျွမ်းကျင်တိုင်ပင်ရေးဌာနများက ဆောင်ရွက်ပေးပါသည်။ အနီးဆုံးဌာနကို အသုံးပြုပါ", privacyTitle: "နောက်တစ်ဆင့်အတွက် လိုအပ်သလောက်သာ ဖြေပါ", privacyText: "ဖြေဆိုရမည့်အချက်များသည် နေထိုင်မှုအတည်ပြုရန် လိုအပ်သည့်အချက်များသာ ဖြစ်ပါသည်။ အမည် သို့မဟုတ် နိုင်ငံကူးလက်မှတ်နံပါတ်ကဲ့သို့သော ကိုယ်ရေးအချက်အလက်များ မလိုအပ်ပါ။ သဘောမတူမချင်း အဖြေများသည် browser session ထဲတွင်သာ ရှိပြီး၊ ပြီးဆုံးနောက် အနည်းဆုံးဒေတာကို server တွင် သိမ်းရန် ရွေးချယ်နိုင်သည်။", back: "နောက်သို့", next: "ရှေ့သို့", finish: "အခြေအနေ စီစဉ်ရန်", backToTop: "ပင်မစာမျက်နှာသို့ ပြန်ရန်", restart: "အစမှ ပြန်စရန်", restartPrompt: "ဤလမ်းညွှန်ချက် မကိုက်ညီပါက", loading: "သင့်နောက်အဆင့်များကို ပြင်ဆင်နေသည်", selectMany: "သက်ဆိုင်သမျှ ရွေးနိုင်သည်", optional: "သိသလောက် ဖြေနိုင်သည်", reviewed: "သင့်အခြေအနေကို စီစဉ်ပြီးပါပြီ", reviewedIntro: "ဤစာရင်းသည် ကိုယ်တိုင်ဖြေထားသောအဖြေများကို အကျဉ်းချုပ်ထားခြင်း ဖြစ်ပါသည်။ ဦးစွာ နေထိုင်ခွင့်အခြေအနေကို တရားဝင်ဌာနတွင် အတည်ပြုပြီး နေ့စဉ်ဘဝအတွက် လိုအပ်ချက်များကို တစ်ဆင့်ချင်းကြည့်ပါ။", seeRoadmap: "နောက်အဆင့်များ ကြည့်ရန်", answerAgain: "အဖြေများ ပြန်ကြည့်ရန်", roadmapTitle: "သင့်နောက်အဆင့်များ", roadmapIntro: "ဦးစားပေးအစဉ်အတိုင်း ပြထားပါသည်။ ယနေ့ အားလုံးပြီးရန် မလိုပါ။", why: "ဘာကြောင့် ဒီအချက်ကို ပြတာလဲ", source: "အချက်အလက်ရင်းမြစ်", fetched: "ရယူသည့်ရက်", changesMade: "Kita City Open Data မှ မှတ်တမ်းအချို့ကို ရွေးချယ်ပြီး StayBridge အတွက် စံပြုပြင်ဆင်ထားပါသည်", human: "တစ်ဦးချင်း စစ်ဆေးရန်လို", localTitle: "ဤဒေသတွင် စစ်ဆေးနိုင်သော နေရာများ", localIntro: "သင့်အခြေအနေနှင့် သက်ဆိုင်သည့် အများပြည်သူဆိုင်ရာအရင်းအမြစ်များကို open data မှ ပြထားပါသည်။ အသုံးပြုနိုင်မှုကို သက်ဆိုင်ရာဌာနသို့ မေးမြန်းပါ။", localFallback: "တည်နေရာအတိအကျ မသုံးဘဲ မြို့နယ်အလိုက် ပြထားပါသည်။", all: "အားလုံး", school: "ကျောင်းနှင့် ပညာရေး", medical: "ဆေးဘက်ဆိုင်ရာ", child_support: "ကလေးနေရာများ", public_facility: "အများပြည်သူနေရာ", details: "တရားဝင်ဝဘ်ဆိုက် ကြည့်ရန်", sourceLabel: "ရင်းမြစ်ကို ကြည့်ရန်", updated: "ဒေတာအသစ်ပြင်ဆင်ချိန်", unavailable: "ထုတ်ပြန်ရက် မရှိပါ", backToRoadmap: "အဆင့်များသို့ ပြန်ရန်", continueToHelp: "တိုင်ပင်ရာသို့ ဆက်သွားရန်", schoolNote: "ကျောင်းတက်နိုင်မှုကို မြို့နယ် သို့မဟုတ် ပညာရေးဌာနသို့ အတည်ပြုပါ။", noResources: "ဤဒေသ၏ အထောက်အကူပြုအချက်အလက်များကို မဖော်ပြရသေးပါ။ တိုင်ပင်ရာဌာန စာရင်းကို အသုံးပြုပါ။", helpTitle: "လူတစ်ဦးနှင့် တိုင်ပင်ရန်", helpIntro: "ဤစာရင်းချုပ်ကို ယူဆောင်သွားပြီး တရားဝင်တိုင်ပင်ရေးဌာနတွင် မိမိအခြေအနေကို ပြောပြပါ။ လုပ်ထုံးလုပ်နည်းသည် နေထိုင်မှုအခြေအနေအလိုက် ကွာခြားသဖြင့် ဌာန၌ အတည်ပြုခြင်းသည် နောက်တစ်ဆင့် ဖြစ်ပါသည်။", chatTitle: "AI ကို မေးရန်", chatIntro: "AI သည် မှားနိုင်ပါသည်။ ကိုယ်ရေးအချက်အလက် မထည့်ပါနှင့်။ Situation Check အဖြေများကို အလိုအလျောက် မပို့ပါ။", settingsTitle: "ဒေတာ သိမ်းဆည်းမှု ဆက်တင်", settingsIntro: "Situation Check နှင့် AI စကားပြောသိမ်းဆည်းမှုကို သီးခြားရွေးချယ်နိုင်သည်။", viewChat: "AI ကို မေးရန်", viewSettings: "သိမ်းဆည်းမှု ဆက်တင်ကို ကြည့်ရန်", backToHelp: "အကူအညီသို့ ပြန်ရန်", nearbySchoolsNote: "စာရင်းသည် ကျောင်းဝင်ခွင့်၊ ကျောင်းနယ်မြေ၊ လစ်လပ်မှု၊ ဂျပန်ဘာသာအကူအညီ သို့မဟုတ် လက်ခံမှုကို အာမမခံပါ။ မြို့နယ် သို့မဟုတ် ကျောင်းတွင် အတည်ပြုပါ။", preparingHelp: "တိုင်ပင်ရန် ပြင်ဆင်ခြင်း", actionDetail: "အဆင့် အသေးစိတ်", prepare: "တိုင်ပင်မီ ပြင်ဆင်ရန်", prepareItems: ["နိုင်ငံကူးလက်မှတ်ကဲ့သို့ လက်ရှိစာရွက်စာတမ်းများ", "မူလပြန်ရန်စီစဉ်ထားသည့်ရက်", "မေးလိုသောအချက်များ", "စကားပြန်လို/မလို"], summary: "တိုင်ပင်ရန် အကျဉ်းချုပ် ပြုလုပ်ရန်", summaryTitle: "ကူညီသူအား ပြရန် အကျဉ်းချုပ်", summaryIntro: "သင်ထည့်သွင်းထားသည့် အချက်များသာ ပါဝင်ပါသည်။ ဤမျက်နှာပြင်ကိုပြနိုင်သလို စာသားကိုကူးယူနိုင်ပါသည်။", current: "လက်ရှိအခြေအနေ", questions: "အတည်ပြုလိုသည့်အချက်များ", copy: "ကူးယူရန်", copied: "ကူးယူပြီး", print: "ပုံနှိပ်ရန်", showMode: "ကူညီသူအား ပြရန်", clear: "ဤစက်ရှိဒေတာ ဖျက်ရန်", emergency: "အသက် သို့မဟုတ် ကိုယ်ခန္ဓာအန္တရာယ် အရေးပေါ်ဖြစ်လျှင် ဤဝန်ဆောင်မှုအစား 110 သို့မဟုတ် 119 ကို ဆက်သွယ်ပါ။", footer: "အချက်အလက်ထက် နောက်တစ်ဆင့်။", principleTitles: ["အခြေအနေ", "နောက်အဆင့်များ", "ဒေသတွင်းလုပ်ဆောင်ချက်"], principleBodies: ["တရားဝင်အသုံးအနှုန်းများ မသိလည်း မေးခွန်းတစ်ခုချင်းဖြင့် အခြေအနေကို စီစဉ်နိုင်သည်။", "ယနေ့၊ ယခုအပတ်နှင့် နောက်ပိုင်း စစ်ဆေးရမည့်အချက်များကို အစဉ်လိုက်ကြည့်နိုင်သည်။", "Open Data ဖြင့် မိမိမြို့နယ်တွင် စစ်ဆေးသင့်သည့်နေရာများကို ရှာနိုင်သည်။"], ageLabel: "ကလေးအသက်", deadlineLabel: "နေထိုင်နိုင်သည့် နောက်ဆုံးရက် (မဖြစ်မနေမဟုတ်)", noEnteredInfo: "အခြေအနေအချက်အလက် မထည့်ရသေးပါ။", noSelectedNeeds: "စစ်ဆေးလိုသည့်အချက် မရွေးရသေးပါ။", storageError: "ဤစက်တွင် မသိမ်းဆည်းနိုင်ပါ။ ဆက်လက်အသုံးပြုနိုင်သော်လည်း ပြန်ဖွင့်ပါက အဖြေများ ပျောက်နိုင်ပါသည်။", copyError: "အကျဉ်းချုပ်ကို ကူးယူ၍မရပါ။ မျက်နှာပြင်ပေါ်ရှိ စာသားကို ရွေးချယ်ကူးယူပါ။", homeLabel: "StayBridge Tokyo ပင်မစာမျက်နှာ", primaryNavLabel: "အဓိက လမ်းညွှန်", languageSelectTitle: "ဘာသာစကား ရွေးရန်", languageSelectLabel: "ဘာသာစကား", sectionSituationCheck: "အခြေအနေစစ်ဆေးရန်", questionLabel: "မေးခွန်း", sectionSituationReview: "အခြေအနေပြန်လည်ကြည့်ရှုရန်", sectionPersonalRoadmap: "သင့်နောက်အဆင့်များ", sectionLocalAction: "ဒေသတွင်းလုပ်ဆောင်ချက် · Open Data", sectionHumanHandoff: "လူနှင့် တိုင်ပင်ရန်", sectionConsultationSummary: "တိုင်ပင်မှု အကျဉ်းချုပ်", sectionOfficialSupport: "တရားဝင်အကူအညီ", sectionHowItHelps: "မည်သို့ကူညီပေးသနည်း", sectionPublicTeams: "အုပ်ချုပ်ရေးနှင့် ကူညီသူများ", previewAriaLabel: "StayBridge နောက်အဆင့်များ အစမ်းကြည့်ရန်", previewTitle: "နောက်တစ်ဆင့်များ", previewSafety: "လုံခြုံပြီး ကိုယ်ရေးကိုယ်တာကာကွယ်ထားသည်", previewSteps: [{ time: "ယနေ့", title: "နေထိုင်မှုကို စစ်ဆေးရန်", detail: "တရားဝင်အချက်အလက်" }, { time: "ယခုအပတ်", title: "တရားဝင်တိုင်ပင်ရန်", detail: "လူနှင့် တိုင်ပင်ရန်" }, { time: "လာမည့် ၃၀ ရက်", title: "ဒေသတွင်းနေ့စဉ်ဘဝ စီစဉ်ရန်", detail: "ကျောင်း · ဆေးကုသမှု · ကလေးနေရာများ" }], localNavigationLabel: "ဒေသတွင်းလုပ်ဆောင်ချက် လမ်းညွှန်", priorityLabel: "ဦးစားပေး", sourceTypeLabels: { openData: "Open Data", official: "တရားဝင်" }, addressLabel: "လိပ်စာ", phoneLabel: "ဖုန်း", publicDataLabel: "အများပြည်သူဒေတာ", supportFallback: "ဝန်ဆောင်မှုအကြောင်းအရာ၊ ဘာသာစကားနှင့် ဖွင့်ချိန်များကို တရားဝင်စာမျက်နှာတွင် စစ်ဆေးပါ။", resourceIcons: { school: "ကျ", medical: "+", child_support: "က", public_facility: "အ" }, localeOptions: userLocaleNativeLabels, summarySheetLabel: "တိုင်ပင်မှု အကျဉ်းချုပ်", summarySheetSections: ["01", "02"], areaLabel: "ဒေသ", nationalityLabel: "နိုင်ငံသား/ဒေသ", ageValueLabel: "အသက်", japaneseLabel: "ဂျပန်ဘာသာ" },
  questions: [["ယခု တိုကျို၏ မည်သည့်ဒေသတွင် နေပါသလဲ။", "လိပ်စာအတိအကျ မလိုပါ။", [["Kita", "ကီတာမြို့နယ်"], ["Shinjuku", "ရှင်ဂျုကုမြို့နယ်"], ["Toshima", "တိုရှီမာမြို့နယ်"], ["Other", "အခြား"]]], ["နိုင်ငံသား/ဒေသကို ပြောပြပါ။", "ဤအဖြေကို အစိုးရဌာနသို့ မပို့ပါ။", [["MMR", "မြန်မာ"], ["OTHER", "အခြား"], ["UNKNOWN", "မဖြေလိုပါ"]]], ["ဂျပန်သို့ ဘာရည်ရွယ်ချက်ဖြင့် လာခဲ့ပါသလဲ။", "တရားဝင်အမည် မသိလည်း နားလည်လွယ်သည့်စကားဖြင့် ရွေးနိုင်သည်။", [["tourism", "ခရီးသွား"], ["visiting_family_or_friends", "မိသားစု/မိတ်ဆွေထံ လည်ပတ်"], ["work", "အလုပ်"], ["study", "ပညာသင်"], ["resident", "ဂျပန်တွင် နေထိုင်"], ["other", "အခြား"], ["unknown", "မသိ / မဖြေလို"]]], ["မူလက ဂျပန်မှ မည်သည့်အချိန် ထွက်ရန် စီစဉ်ထားသလဲ။", "ခန့်မှန်းခြေဖြင့် ဖြေနိုင်သည်။", [["within_7_days", "7 ရက်အတွင်း"], ["within_30_days", "30 ရက်အတွင်း"], ["within_3_months", "3 လအတွင်း"], ["no_departure_plan", "ထွက်ရန်အစီအစဉ်မရှိ"], ["unknown", "မသိ"]]], ["ယခု စီစဉ်ထားသလို ပြန်နိုင်ပါသလား။", "ယနေ့ သင်နားလည်ထားသည့် အခြေအနေကိုသာ ဖြေပါ။", [["possible", "ပြန်နိုင်သည်"], ["difficult", "ပြန်ရန်ခက်ခဲသည်"], ["unknown", "မသိ"]]], ["ဂျပန်တွင် မည်မျှကြာ နေနိုင်သည်ကို သိပါသလား။", "နေထိုင်ခွင့်အမည် မသိလည်း ဆက်လုပ်နိုင်သည်။", [["known", "သိသည်"], ["unknown", "မသိ"], ["documents", "စာရွက်စာတမ်း စစ်လိုသည်"]]], ["ဂျပန်တွင် သင်နှင့်အတူ မိသားစုရှိပါသလား။", "ကလေးရှိလျှင် အသက်ကိုလည်း ရွေးပါ။", [["none", "မရှိ"], ["children", "ကလေးရှိ"], ["spouse", "အိမ်ထောင်ဖက်ရှိ"], ["other", "အခြားမိသားစုရှိ"]]], ["ယခု မည်သည့်နေရာတွင် နေပါသလဲ။", "နေရာအတိအကျ မမေးပါ။", [["hotel", "ဟိုတယ်/တည်းခိုခန်း"], ["family_or_friend", "မိသားစု/မိတ်ဆွေအိမ်"], ["rental", "ငှားရမ်းအိမ်"], ["temporary_facility", "ယာယီနေရာ"], ["unstable", "နောက်နေရာအတွက် စိုးရိမ်"], ["prefer_not_to_say", "မဖြေလို"]]], ["ယခု ဘာများအတွက် စိုးရိမ်ပါသလဲ။", "သက်ဆိုင်သမျှ ရွေးပါ။", [["stay", "မည်မျှကြာ နေနိုင်မည်"], ["consultation", "ဘယ်မှာ မေးရမည်"], ["accommodation", "နေထိုင်ရာ"], ["living_cost", "နေထိုင်စရိတ်"], ["employment", "အလုပ်"], ["education", "ကျောင်းနှင့် ပညာရေး"], ["childcare", "ကလေးဘဝ"], ["medical", "ဆေးကုသမှု"], ["language", "ဂျပန်ဘာသာ"], ["none", "ထူးမရှိပါ"]]], ["ဂျပန်ဘာသာကို မည်မျှ ပြောနိုင်ပါသလဲ။", "တိုင်ပင်ချိန် ဘာသာစကားအကူအညီ စီစဉ်ရန် အသုံးပြုသည်။", [["none", "မပြောနိုင်သလောက်"], ["beginner", "အနည်းငယ်"], ["daily", "နေ့စဉ်စကားပြော"], ["advanced", "ကောင်းစွာ"]]]],
  actions: {
    CHECK_STAY_STATUS: { title: "ဂျပန်တွင် နေနိုင်မည့်ကာလ စစ်ဆေးရန်", desc: "လက်ရှိနေနိုင်သည့်ကာလနှင့် လိုအပ်နိုင်သည့် လုပ်ငန်းစဉ်ကို တရားဝင်ဌာနတွင် စစ်ဆေးပါ။", cta: "တရားဝင်အကူအညီ ကြည့်ရန်" }, CONTACT_OFFICIAL_SUPPORT: { title: "တရားဝင်တိုင်ပင်ရေးဌာနနှင့် ဆွေးနွေးရန်", desc: "နောက်လုပ်ငန်းစဉ်သည် သင့်တစ်ဦးချင်းအခြေအနေပေါ် မူတည်နိုင်သည်။", cta: "တိုင်ပင်ရာနေရာ ကြည့်ရန်" }, PLAN_TEMPORARY_LIVING: { title: "နောက်နေထိုင်ရာ စီစဉ်ရန်", desc: "လက်ရှိတည်းခိုရာ မပြီးမီ နေ့စဉ်ဘဝအတွက် ဘယ်မှာ တိုင်ပင်ရမည်ကို စစ်ဆေးပါ။", cta: "ဘဝအကူအညီ ကြည့်ရန်" }, CHECK_CHILD_EDUCATION: { title: "ကလေးပညာရေးအကြောင်း တိုင်ပင်ရန်", desc: "နေထိုင်မှုရှည်လာလျှင် ကျောင်းနှင့် သင်ယူမှုအကြောင်း ဒေသတွင် မေးနိုင်သည်။", cta: "အနီးအနားကျောင်း ကြည့်ရန်" }, CHECK_CHILD_EDUCATION_GUIDANCE: { title: "ကျောင်းဝင်ခွင့်ဆိုင်ရာ တရားဝင်လမ်းညွှန် စစ်ရန်", desc: "ကလေးကျောင်းတက်ရောက်ရေးအတွက် မြို့နယ် သို့မဟုတ် ပညာရေးဘုတ်အဖွဲ့တွင် ဘယ်မှာမေးရမည်ကို တရားဝင်လမ်းညွှန်တွင် ကြည့်ပါ။", cta: "တရားဝင်လမ်းညွှန် ကြည့်ရန်" }, FIND_NEARBY_SCHOOLS: { title: "အနီးအနားကျောင်း ရှာရန်", desc: "မိမိမြို့နယ်အတွက်公開ဒေတာအဖြစ် ထုတ်ပြန်ထားသော မူလတန်းကျောင်းများကို ကြည့်ပါ။", cta: "အနီးအနားကျောင်း ကြည့်ရန်" }, CHECK_MEDICAL_OPTIONS: { title: "ဆေးကုသမှုရနိုင်သည့်နေရာ စစ်ဆေးရန်", desc: "လိုအပ်ချိန်သိရှိနိုင်ရန် အနီးအနားဆေးရုံ/ဆေးခန်းကို ကြိုစစ်ဆေးပါ။", cta: "ဆေးဘက်နေရာ ကြည့်ရန်" }, CHECK_CHILD_LOCAL_SUPPORT: { title: "ကလေးအတွက် ဒေသဆိုင်ရာနေရာ စစ်ဆေးရန်", desc: "ကလေးနေနိုင်သော အများပြည်သူနေရာများကို စစ်ဆေးပါ။", cta: "ကလေးနေရာ ကြည့်ရန်" }, CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH: { title: "အလုပ်လုပ်နိုင်မှုကို ဦးစွာစစ်ဆေးရန်", desc: "အလုပ်မရှာမီ လက်ရှိနေထိုင်မှုအခြေအနေဖြင့် အလုပ်လုပ်နိုင်မနိုင် တရားဝင်ဌာနကို မေးပါ။", cta: "တရားဝင်အကူအညီ ကြည့်ရန်" }, CHECK_LIVING_COST_SUPPORT: { title: "လတ်တလော နေထိုင်စရိတ်အတွက် တိုင်ပင်ရန်", desc: "မိမိအခြေအနေတွင် အသုံးပြုနိုင်သည့် တိုင်ပင်မှု သို့မဟုတ် အကူအညီရှိမရှိ တရားဝင်ဌာနတွင် စစ်ဆေးပါ။", cta: "တိုင်ပင်ရာနေရာ ကြည့်ရန်" }, FIND_LANGUAGE_SUPPORT: { title: "ဘာသာစကားအကူအညီ စစ်ဆေးရန်", desc: "မိမိအခြေအနေကို မှန်ကန်စွာရှင်းပြနိုင်ရန် စကားပြန်အကူအညီ စစ်ဆေးပါ။", cta: "တိုင်ပင်ရာနေရာ ကြည့်ရန်" }, CHECK_BEFORE_STAY_DEADLINE: { title: "သတ်မှတ်ရက်မတိုင်မီ စာရွက်စာတမ်း စစ်ရန်", desc: "ထည့်ထားသောရက်မတိုင်မီ စာရွက်စာတမ်းနှင့် တရားဝင်တိုင်ပင်ချိန်ကို စီစဉ်ပါ။", cta: "တရားဝင်အကူအညီ ကြည့်ရန်" }, FIND_DAILY_LIFE_GUIDANCE: { title: "နေ့စဉ်ဘဝဆိုင်ရာ တရားဝင်လမ်းညွှန် စစ်ရန်", desc: "တိုကျို၌ နေထိုင်ရန် လိုအပ်သော လုပ်ထုံးလုပ်နည်းနှင့် နေ့စဉ်ဘဝအချက်အလက်များကို တရားဝင်လမ်းညွှန်ဖြင့် စီစဉ်ပါ။", cta: "တရားဝင်လမ်းညွှန် ကြည့်ရန်" },
  },
  timing: { today: "ယနေ့", this_week: "ယခုအပတ်", next_30_days: "လာမည့် ၃၀ ရက်", before_deadline: "သတ်မှတ်ရက်မတိုင်မီ", long_term: "ရေရှည်" },
  reasons: { RETURN_DIFFICULT_SHORT_TERM: "ခရီးတိုအတွက် လာပြီး ယခု စီစဉ်ထားသလို ပြန်ရန်ခက်ခဲသည်ဟု ဖြေထားသောကြောင့် ပြထားပါသည်။", RETURN_DIFFICULT: "စီစဉ်ထားသလို ပြန်ရန်ခက်ခဲသည်ဟု ဖြေထားသောကြောင့် လက်ရှိအခြေအနေကို တရားဝင်ဌာနတွင် စစ်ဆေးရန် ပြထားပါသည်။", SITUATION_NEEDS_CONFIRMATION: "ပြန်ခြင်း/နေထိုင်ခြင်းအခြေအနေ မသေချာ သို့မဟုတ် တိုင်ပင်ရာနေရာလိုသည်ဟု ဖြေထားပါသည်။", SCHOOL_AGE_CHILD: "ကျောင်းနေအရွယ်ကလေးနှင့်အတူရှိသောကြောင့် ပညာရေးနှင့်ကျောင်းအချက်အလက် ပြထားပါသည်။", CHILD_LOCAL_ROUTINE: "ကလေးနှင့်အတူ တိုကျိုတွင် နေ့စဉ်ဘဝ ဆက်လက်တည်ဆောက်ရန် လိုနိုင်သောကြောင့် ပြထားပါသည်။", TEMPORARY_HOTEL: "ဟိုတယ်တွင် နေပြီး စီစဉ်ထားသလို ပြန်ရန်ခက်ခဲသောကြောင့် ပြထားပါသည်။", UNSTABLE_ACCOMMODATION: "နေထိုင်ရာမတည်ငြိမ်ဘဲ စီစဉ်ထားသလို ပြန်ရန်ခက်ခဲသောကြောင့် ပြထားပါသည်။", CHILDCARE_NEED: "ကလေးငယ်နှင့်အတူရှိပြီး ကလေး၏နေ့စဉ်ဘဝအကူအညီကို ရွေးထားသောကြောင့် ပြထားပါသည်။", MEDICAL_NEED: "ဆေးကုသမှုကို လက်ရှိစိုးရိမ်ချက်အဖြစ် ရွေးထားပါသည်။", EMPLOYMENT_NEED: "အလုပ် သို့မဟုတ် နေထိုင်စရိတ်ကို ရွေးထားသောကြောင့် အလုပ်မရှာမီ လုပ်ကိုင်ခွင့် စစ်ဆေးရန် ပြထားပါသည်။", LIVING_COST_NEED: "လတ်တလော နေထိုင်စရိတ်အတွက် စိုးရိမ်ကြောင်း ရွေးထားသောကြောင့် တရားဝင်တိုင်ပင်ရာနေရာကို ပြထားပါသည်။", DAILY_LIFE_NEED: "နေ့စဉ်ဘဝအကြောင်း စိုးရိမ်ကြောင်း ရွေးထားသောကြောင့် တရားဝင်နေ့စဉ်ဘဝလမ်းညွှန်ကို ပြထားပါသည်။", LANGUAGE_BARRIER: "တရားဝင်တိုင်ပင်ရာတွင် ဘာသာစကားအကူအညီ အသုံးဝင်နိုင်သောကြောင့် ပြထားပါသည်။", KNOWN_STAY_DEADLINE: "နေထိုင်နိုင်သည့်ရက် ထည့်ထားသောကြောင့် ထိုရက်မတိုင်မီ တရားဝင်အတည်ပြုနိုင်ရန် ပြထားပါသည်။", STAY_DEADLINE_PASSED: "ထည့်ထားသော နေထိုင်ခွင့်နောက်ဆုံးရက် ကျော်လွန်နေသောကြောင့် တရားဝင်ဌာနသို့ ယခုချက်ချင်း အတည်ပြုရန် ပြထားပါသည်။" },
  needs: { stay: "ဂျပန်တွင် မည်မျှကြာ နေနိုင်မည်", consultation: "လုပ်ငန်းစဉ်နှင့် တိုင်ပင်ရာနေရာ", accommodation: "နေထိုင်ရာနှင့် နေ့စဉ်ဘဝ", living_cost: "နေထိုင်စရိတ်", employment: "အလုပ်လုပ်နိုင်မှု", education: "ကလေးပညာရေး", childcare: "ကလေး၏ နေ့စဉ်ဘဝ", medical: "ဆေးကုသရာနေရာ", language: "ဘာသာစကားအကူအညီ", daily_life: "နေ့စဉ်ဘဝ", none: "ထူးမရှိပါ" },
} as const satisfies PublicUserMessages;

function withDailyLifeNeed(messages: PublicUserMessages, label: string): PublicUserMessages {
  const questions = messages.questions.map((question, index) => {
    if (index !== 8 || question[2].some(([value]) => value === "daily_life")) return question;
    const languageIndex = question[2].findIndex(([value]) => value === "language");
    const options = [...question[2]];
    options.splice(languageIndex < 0 ? options.length : languageIndex, 0, ["daily_life", label]);
    return [question[0], question[1], options];
  }) as unknown as PublicUserMessages["questions"];
  return { ...messages, questions };
}

type PublicCopyOverrides = {
  crisis: string;
  principleBody: string;
  sectionLocalAction: string;
  openDataLabel: string;
  localIntro?: string;
  actionFirstUi?: Partial<Pick<PublicUserMessages["ui"],
    | "hero"
    | "noLogin"
    | "noAddress"
    | "official"
    | "notDecision"
    | "privacyTitle"
    | "privacyText"
    | "reviewed"
    | "reviewedIntro"
    | "roadmapIntro"
    | "localIntro"
    | "localFallback"
    | "schoolNote"
    | "noResources"
    | "helpIntro"
    | "summaryIntro"
    | "footer"
  >>;
};

function withPublicCopy(messages: PublicUserMessages, overrides: PublicCopyOverrides): PublicUserMessages {
  return {
    ...messages,
    ui: {
      ...messages.ui,
      crisis: overrides.crisis,
      principleBodies: [messages.ui.principleBodies[0], messages.ui.principleBodies[1], overrides.principleBody],
      sectionLocalAction: overrides.sectionLocalAction,
      localIntro: overrides.localIntro ?? messages.ui.localIntro,
      sourceTypeLabels: { ...messages.ui.sourceTypeLabels, openData: overrides.openDataLabel },
      ...overrides.actionFirstUi,
    },
  };
}

export const reviewedUserMessages = {
  ja: withDailyLifeNeed(withPublicCopy(jaMessagesWithoutDailyLife, {
    crisis: "行政・支援者向けの確認画面",
    principleBody: "公開データから、地域で確認する意味のある場所へ。",
    sectionLocalAction: "地域での行動",
    openDataLabel: "公開データ",
  }), "日々の生活"),
  en: withDailyLifeNeed(withPublicCopy(enMessagesWithoutDailyLife, {
    crisis: "Information for public teams",
    principleBody: "Use publicly available data to find relevant places to check in your municipality.",
    sectionLocalAction: "Local action",
    openDataLabel: "Public data",
    actionFirstUi: {
      hero: "Find your next step for staying in Tokyo.",
      noLogin: "Start now",
      noAddress: "Answer by municipality",
      official: "Go to official sources",
      notDecision: "Confirm immigration procedures and legal decisions with a specialist support desk. Bring your current documents and stay deadline.",
      privacyTitle: "Answer only what you need for your next step",
      privacyText: "Answer at municipality level about your stay and support needs. Keep names and passport numbers out, then choose whether to save a minimal set of answers on the server.",
      reviewed: "Review your answers, then take the next step",
      reviewedIntro: "Check the summary, then work from the official stay check through the practical steps in order.",
      roadmapIntro: "Start with the first card and work through today's checks in order.",
      localIntro: "Choose a relevant place, then use its official website to confirm eligibility, opening hours, and contact details.",
      localFallback: "Showing facilities in the municipality you selected.",
      schoolNote: "Where to confirm: the municipality or education authority. What to ask: enrolment, catchment area, and language support.",
      noResources: "Use the consultation contacts to ask what support is available in this area.",
      helpIntro: "Choose a support desk and bring your summary and current documents. Tell them what you need to confirm.",
      summaryIntro: "Review what you will show the support worker, then copy or print it for your consultation.",
      footer: "Information for your next step.",
    },
  }), "Daily life"),
  my: withDailyLifeNeed(withPublicCopy(myMessagesWithoutDailyLife, {
    crisis: "အုပ်ချုပ်ရေးနှင့် ကူညီသူများအတွက် အချက်အလက်",
    principleBody: "အများပြည်သူဒေတာမှ မိမိမြို့နယ်တွင် စစ်ဆေးသင့်သည့်နေရာများကို ရှာနိုင်သည်။",
    sectionLocalAction: "ဒေသတွင်းလုပ်ဆောင်ချက်",
    openDataLabel: "အများပြည်သူဒေတာ",
    actionFirstUi: {
      hero: "တိုကျိုတွင် နေထိုင်ရန် နောက်တစ်ဆင့်ကို ရှာပါ။",
      noLogin: "ယခုစတင်ရန်",
      noAddress: "မြို့နယ်အလိုက် ဖြေရန်",
      official: "တရားဝင်အချက်အလက်သို့ သွားရန်",
      notDecision: "နေထိုင်ခွင့်လုပ်ငန်းစဉ်နှင့် ဥပဒေရေးရာဆုံးဖြတ်ချက်များကို ကျွမ်းကျင်တိုင်ပင်ရေးဌာနတွင် အတည်ပြုပါ။ လက်ရှိစာရွက်စာတမ်းနှင့် နောက်ဆုံးရက်ကို ယူသွားပါ။",
      privacyTitle: "နောက်တစ်ဆင့်အတွက် လိုအပ်သလောက်သာ ဖြေပါ",
      privacyText: "မြို့နယ်၊ နေထိုင်မှုနှင့် အကူအညီလိုအပ်ချက်ကိုသာ ဖြေပါ။ အမည်နှင့် နိုင်ငံကူးလက်မှတ်နံပါတ်ကို ချန်ထားပြီး၊ ပြီးဆုံးနောက် server တွင် အနည်းဆုံးအဖြေများ သိမ်းရန် ရွေးချယ်နိုင်သည်။",
      reviewed: "အဖြေများကို စစ်ပြီး နောက်တစ်ဆင့်သို့ သွားပါ",
      reviewedIntro: "အကျဉ်းချုပ်ကို စစ်ပြီး နေထိုင်မှုတရားဝင်အတည်ပြုချက်မှ နေ့စဉ်ဘဝအဆင့်များအထိ အစဉ်လိုက် ဆက်လုပ်ပါ။",
      roadmapIntro: "ပထမကတ်မှ စတင်ပြီး ယနေ့စစ်ဆေးနိုင်သည့်အချက်များကို အစဉ်လိုက် ဆက်လုပ်ပါ။",
      localIntro: "သက်ဆိုင်သည့်နေရာကို ရွေးပြီး အသုံးပြုခွင့်၊ ဖွင့်ချိန်နှင့် ဆက်သွယ်နည်းကို တရားဝင်ဝဘ်ဆိုက်တွင် အတည်ပြုပါ။",
      localFallback: "ရွေးထားသော မြို့နယ်ရှိ နေရာများကို ပြထားပါသည်။",
      schoolNote: "အတည်ပြုရန်နေရာ: မြို့နယ် သို့မဟုတ် ပညာရေးဌာန။ မေးရန်: ကျောင်းဝင်ခွင့်၊ ကျောင်းနယ်မြေနှင့် ဘာသာစကားအကူအညီ။",
      noResources: "ဤဒေသတွင် ရနိုင်သောအကူအညီကို တိုင်ပင်ရာဌာနစာရင်းမှ မေးမြန်းပါ။",
      helpIntro: "တိုင်ပင်ရာဌာနကို ရွေးပြီး အကျဉ်းချုပ်နှင့် လက်ရှိစာရွက်စာတမ်းများ ယူသွားပါ။ အတည်ပြုလိုသည့်အချက်ကို ပြောပါ။",
      summaryIntro: "ကူညီသူအား ပြမည့်အချက်ကို စစ်ပြီး တိုင်ပင်ရန် ကူးယူပါ သို့မဟုတ် ပုံနှိပ်ပါ။",
      footer: "နောက်တစ်ဆင့်အတွက် အချက်အလက်။",
    },
  }), "နေ့စဉ်ဘဝ"),
} satisfies Record<SelectableUserLocale, PublicUserMessages>;

export const { ja: jaMessages, en: enMessages, my: myMessages } = reviewedUserMessages;

export function getUserMessages(locale: SelectableUserLocale): PublicUserMessages {
  return reviewedUserMessages[locale];
}

export { getLocalResourceDisplay } from "./local-resource-catalog";
