export type SupportLocale = "ja" | "en" | "my";

export type LocalizedSupportText = Record<SupportLocale, string>;

export const supportSourceIds = [
  "TOKYO_CONSULTATION",
  "ISA",
  "FRESC",
  "TMC_NAVI",
  "TOKYO_FRAC",
  "TIPS_CONSULTATIONS",
  "TMG_CONSULTATION_KURASHI",
  "TOKYO_FRESC_STATUS_CONSULT",
  "TOKYO_HOUSING_SUPPORT",
  "TOKYO_SCHOOL_ENROLL_EN",
  "TOKYO_SCHOOL_ATTENDANCE_BOE",
  "MEXT_SCHOOL",
  "TIPS_SCHOOL",
  "TOKYO_CHILDCARE_SUPPORT",
  "TOKYO_CHILD_GUIDANCE",
  "TOKYO_MEDICAL_INFO",
  "TOKYO_MEDICAL_FLOW",
  "TOKYO_MEDICAL_HIMAWARI",
  "TOKYO_MEDICAL_TMCNAVI",
  "TOKYO_MEDICAL_GAIKOKUGO",
  "TOKYO_LABOR_CONSULT",
  "TOKYO_FOREIGN_WORKERS_HANDBOOK",
  "TOKYO_CAREER_CONSULT",
  "HELLO_WORK_TOKYO_FOREIGNER",
  "TIPS_JAPANESE",
  "TIPS_LIVING_GUIDE",
  "TIPS_PROCEDURES",
  "TIPS_LIFE_GUIDE_JP",
  "KEISHICHO_FOREIGN_RESIDENT_MANUAL",
] as const;

export type SupportSourceId = (typeof supportSourceIds)[number];

type SupportCopy = {
  answersInText: LocalizedSupportText;
  notes: LocalizedSupportText;
};

/**
 * App-authored summaries of what each official source covers. These are not
 * represented as publisher-provided translations; official metadata stays in
 * the source registry unchanged.
 */
export const supportCopy = {
  TOKYO_CONSULTATION: {
    answersInText: {
      ja: "FRESC（外国人在留支援センター）の相談窓口・予約方法・対応言語が書いてある。",
      en: "Explains the FRESC consultation desk, how to make an appointment, and available languages.",
      my: "FRESC တွင် တိုင်ပင်နိုင်သည့်ဌာန၊ ကြိုတင်ချိန်းဆိုနည်းနှင့် ရရှိနိုင်သည့်ဘာသာစကားများကို ရှင်းပြထားသည်။",
    },
    notes: {
      ja: "連絡方法や対応内容は変わることがあるため、訪問・電話前に直接確認してください。",
      en: "Contact arrangements and services may change; confirm directly before visiting or calling.",
      my: "ဆက်သွယ်ရန်အစီအစဉ်များနှင့် ဝန်ဆောင်မှုများ ပြောင်းလဲနိုင်သဖြင့် မသွားမီ သို့မဟုတ် မခေါ်မီ တိုက်ရိုက်အတည်ပြုပါ။",
    },
  },
  ISA: {
    answersInText: {
      ja: "在留手続き・相談窓口の一般的な情報が書いてある（個別の判断はしない）。",
      en: "Provides general information about residence procedures and consultation desks. It does not decide individual cases.",
      my: "နေထိုင်ခွင့်လုပ်ထုံးလုပ်နည်းများနှင့် တိုင်ပင်နိုင်သည့်ဌာနများအကြောင်း အထွေထွေသတင်းအချက်အလက်များကို ပေးထားသည်။ တစ်ဦးချင်းကိစ္စများကို ဆုံးဖြတ်ပေးခြင်းမရှိပါ။",
    },
    notes: {
      ja: "個別の在留可否や許可の見込みは判断しません。",
      en: "This source provides general information and does not decide individual cases or permission prospects.",
      my: "ဤအချက်အလက်သည် အထွေထွေလမ်းညွှန်သာဖြစ်ပြီး တစ်ဦးချင်းနေထိုင်ခွင့် သို့မဟုတ် ခွင့်ပြုချက်ရနိုင်မှုကို မဆုံးဖြတ်ပါ။",
    },
  },
  FRESC: {
    answersInText: {
      ja: "在留や生活の個別相談ができる窓口の連絡先と、対応言語が書いてある。",
      en: "Lists contact details and available languages for individual consultations about residence and daily life.",
      my: "နေထိုင်ခွင့်နှင့် နေ့စဉ်ဘဝအကြောင်း တစ်ဦးချင်းတိုင်ပင်နိုင်သည့်ဌာန၏ ဆက်သွယ်ရန်အချက်အလက်နှင့် ရရှိနိုင်သည့်ဘာသာစကားများကို ဖော်ပြထားသည်။",
    },
    notes: {
      ja: "連絡方法や対応内容は変わることがあるため、訪問・電話前に直接確認してください。",
      en: "Contact arrangements and services may change; confirm directly before visiting or calling.",
      my: "ဆက်သွယ်ရန်အစီအစဉ်များနှင့် ဝန်ဆောင်မှုများ ပြောင်းလဲနိုင်သဖြင့် မသွားမီ သို့မဟုတ် မခေါ်မီ တိုက်ရိုက်အတည်ပြုပါ။",
    },
  },
  TMC_NAVI: {
    answersInText: {
      ja: "生活で困ったことや知りたいことを、やさしい日本語・英語など14言語で電話相談できる（フリーダイヤル0120-142-142、月〜金10-16時）。",
      en: "You can ask about daily-life problems or questions by phone in 14 languages, including easy Japanese and English.",
      my: "နေ့စဉ်ဘဝအခက်အခဲများကို ရိုးရှင်းသောဂျပန်ဘာသာ၊ အင်္ဂလိပ်ဘာသာအပါအဝင် ဘာသာစကား ၁၄ မျိုးဖြင့် ဖုန်းမှတစ်ဆင့် တိုင်ပင်နိုင်သည်။",
    },
    notes: {
      ja: "公的機関への通訳支援も行う。個別の資格・給付の可否は窓口で確認。",
      en: "Interpretation support for public institutions is also available. Confirm individual eligibility for statuses or benefits with the relevant desk.",
      my: "အစိုးရအဖွဲ့အစည်းများအတွက် စကားပြန်အကူအညီလည်း ရရှိနိုင်သည်။ တစ်ဦးချင်းအရည်အချင်းနှင့် ထောက်ပံ့ကြေးရရှိနိုင်မှုကို သက်ဆိုင်ရာဌာနတွင် အတည်ပြုပါ။",
    },
  },
  TOKYO_FRAC: {
    answersInText: {
      ja: "入国・婚姻・国籍・仕事など日常生活の相談に、英語・中国語・韓国語で電話で応じる（相談は無料・秘密厳守）。",
      en: "Provides free and confidential telephone consultations in English, Chinese, and Korean about immigration, marriage, nationality, work, and daily life.",
      my: "ဝင်ရောက်နေထိုင်ခြင်း၊ လက်ထပ်ခြင်း၊ နိုင်ငံသားဖြစ်မှု၊ အလုပ်နှင့် နေ့စဉ်ဘဝအကြောင်းများကို အင်္ဂလိပ်၊ တရုတ်၊ ကိုရီးယားဘာသာများဖြင့် အခမဲ့နှင့် လျှို့ဝှက်စွာ ဖုန်းမှတစ်ဆင့် တိုင်ပင်နိုင်သည်။",
    },
    notes: {
      ja: "法的な相談はTSUNAGARIの多言語無料法律相談を案内。",
      en: "Legal matters are referred to TSUNAGARI's free multilingual legal consultation.",
      my: "ဥပဒေရေးရာကိစ္စများအတွက် TSUNAGARI ၏ အခမဲ့ဘာသာစကားမျိုးစုံ ဥပဒေရေးရာတိုင်ပင်မှုသို့ လမ်းညွှန်ပေးသည်။",
    },
  },
  TIPS_CONSULTATIONS: {
    answersInText: {
      ja: "悩み別の相談窓口（多言語相談ナビ・FRAC・自治体・教育相談など）がまとめて載っている。",
      en: "Collects consultation desks by topic, including multilingual consultation, FRAC, municipalities, and education support.",
      my: "ပြဿနာအမျိုးအစားအလိုက် တိုင်ပင်နိုင်သည့်ဌာနများကို စုစည်းဖော်ပြထားသည်။",
    },
    notes: {
      ja: "相談先を目的別に探せる。",
      en: "You can search for consultation desks by purpose.",
      my: "ရည်ရွယ်ချက်အလိုက် တိုင်ပင်နိုင်သည့်ဌာနများကို ရှာဖွေနိုင်သည်။",
    },
  },
  TMG_CONSULTATION_KURASHI: {
    answersInText: {
      ja: "都庁の暮らしに関する相談窓口一覧（外国人相談の曜日・言語・電話番号を含む）が載っている。",
      en: "Lists Tokyo Metropolitan Government consultation desks for daily life, including days, languages, and phone numbers for foreign-resident support.",
      my: "တိုကျိုမြို့တော်အစိုးရ၏ နေ့စဉ်ဘဝဆိုင်ရာ တိုင်ပင်ဌာနများ၊ နေ့ရက်၊ ဘာသာစကားနှင့် ဖုန်းနံပါတ်များကို ဖော်ပြထားသည်။",
    },
    notes: { ja: "", en: "", my: "" },
  },
  TOKYO_FRESC_STATUS_CONSULT: {
    answersInText: {
      ja: "在留資格・在留期間について、やさしい日本語など14言語で無料相談できる（要予約0120-142-142、在住/在勤/在学の外国人対象）。",
      en: "Free consultations about residence status and period are available in 14 languages. Reservations are required.",
      my: "နေထိုင်ခွင့်အမျိုးအစားနှင့် နေထိုင်ခွင့်ကာလအကြောင်းကို ဘာသာစကား ၁၄ မျိုးဖြင့် အခမဲ့တိုင်ပင်နိုင်သည်။ ကြိုတင်ချိန်းဆိုရန် လိုအပ်သည်။",
    },
    notes: {
      ja: "個別の在留可否は決定しない。",
      en: "This desk does not decide individual residence eligibility.",
      my: "တစ်ဦးချင်းနေထိုင်ခွင့်ရရှိနိုင်မှုကို ဤဌာနက ဆုံးဖြတ်ပေးခြင်းမရှိပါ။",
    },
  },
  TOKYO_HOUSING_SUPPORT: {
    answersInText: {
      ja: "住まいを失うおそれのある場合の支援（住居確保給付金・つなぎ資金・総合支援資金）の概要と対象が書いてある。",
      en: "Explains support for people at risk of losing housing, including housing security benefits and support funds.",
      my: "အိမ်ရာဆုံးရှုံးနိုင်သည့်အခြေအနေရှိသူများအတွက် အိမ်ရာထောက်ပံ့ကြေးနှင့် အခြားထောက်ပံ့ငွေများ၏ အကျဉ်းချုပ်နှင့် သတ်မှတ်ချက်များကို ရှင်းပြထားသည်။",
    },
    notes: {
      ja: "給付には住民登録や離職等の要件があり、資格はお住まいの自治体・自立相談支援機関で確認。",
      en: "Benefits have requirements such as resident registration or job loss. Confirm eligibility with your municipality or support organization.",
      my: "ထောက်ပံ့ကြေးများတွင် နေထိုင်သူမှတ်ပုံတင်ခြင်း သို့မဟုတ် အလုပ်ဆုံးရှုံးခြင်းကဲ့သို့ သတ်မှတ်ချက်များရှိသည်။ သက်ဆိုင်ရာမြို့နယ် သို့မဟုတ် အထောက်အပံ့ဌာနတွင် အတည်ပြုပါ။",
    },
  },
  TOKYO_SCHOOL_ENROLL_EN: {
    answersInText: {
      ja: "外国人の子どもも公立小中学校に就学できること、手続き、教育相談（金曜は通訳あり）が書いてある。",
      en: "Explains public elementary and junior-high school enrollment for foreign children, procedures, and education consultations.",
      my: "နိုင်ငံခြားသားကလေးများအတွက် အစိုးရမူလတန်းနှင့် အလယ်တန်းကျောင်းတက်ရောက်ခြင်း၊ လုပ်ထုံးလုပ်နည်းနှင့် ပညာရေးတိုင်ပင်မှုများကို ရှင်းပြထားသည်။",
    },
    notes: {
      ja: "入学可否は自治体・学校で確認。",
      en: "Confirm admission eligibility with the municipality or school.",
      my: "ကျောင်းလက်ခံနိုင်မှုကို မြို့နယ် သို့မဟုတ် ကျောင်းတွင် အတည်ပြုပါ။",
    },
  },
  TOKYO_SCHOOL_ATTENDANCE_BOE: {
    answersInText: {
      ja: "外国人の子どもも日本の子どもと同じように教育を受けられることと、就学ガイドブック（多言語）一覧が載っている。",
      en: "Explains that foreign children can receive education like children in Japan and lists multilingual school-attendance guides.",
      my: "နိုင်ငံခြားသားကလေးများလည်း ဂျပန်ကလေးများကဲ့သို့ ပညာသင်ယူနိုင်ကြောင်းနှင့် ဘာသာစကားမျိုးစုံဖြင့် ကျောင်းတက်ရောက်ရေးလမ်းညွှန်များကို ဖော်ပြထားသည်။",
    },
    notes: {
      ja: "就学手続きは住所地の教育委員会へ。",
      en: "Ask the board of education in your area about enrollment procedures.",
      my: "ကျောင်းတက်ရောက်ရေးလုပ်ထုံးလုပ်နည်းများကို မိမိနေထိုင်ရာဒေသ၏ ပညာရေးဘုတ်အဖွဲ့တွင် မေးမြန်းပါ။",
    },
  },
  MEXT_SCHOOL: {
    answersInText: {
      ja: "就学に関する法制度（義務ではないが公立義務教育校へ無償で受入れ）が書いてある。",
      en: "Explains the legal framework for schooling, including free admission to public compulsory-education schools even though enrollment is not compulsory.",
      my: "ကျောင်းတက်ရောက်ခြင်းဆိုင်ရာ ဥပဒေစနစ်နှင့် အစိုးရမသင်မနေရပညာရေးကျောင်းများတွင် အခမဲ့လက်ခံနိုင်ကြောင်းကို ရှင်းပြထားသည်။",
    },
    notes: { ja: "", en: "", my: "" },
  },
  TIPS_SCHOOL: {
    answersInText: {
      ja: "学年の目安や転入学の手続き、就学ガイドブック（8言語）へのリンクが載っている。",
      en: "Provides grade-level guidance, transfer procedures, and links to school guides in eight languages.",
      my: "အတန်းအဆင့်ခန့်မှန်းချက်၊ ကျောင်းပြောင်းတက်ရန်လုပ်ထုံးလုပ်နည်းနှင့် ဘာသာစကား ၈ မျိုးရှိ ကျောင်းတက်ရောက်ရေးလမ်းညွှန်များကို ပေးထားသည်။",
    },
    notes: { ja: "", en: "", my: "" },
  },
  TOKYO_CHILDCARE_SUPPORT: {
    answersInText: {
      ja: "子育て支援の入口（とうきょう子育てスイッチ、こども医療ガイド等）がまとめて載っている。",
      en: "Collects entry points for child-rearing support, including Tokyo Kosodate Switch and child medical guides.",
      my: "ကလေးပြုစုစောင့်ရှောက်ရေးအထောက်အပံ့များအတွက် အဓိကဝင်ပေါက်များကို စုစည်းဖော်ပြထားသည်။",
    },
    notes: {
      ja: "利用条件は各サービスで確認。",
      en: "Confirm the eligibility requirements for each service.",
      my: "ဝန်ဆောင်မှုတစ်ခုချင်းစီ၏ အသုံးပြုနိုင်သည့်သတ်မှတ်ချက်များကို အတည်ပြုပါ။",
    },
  },
  TOKYO_CHILD_GUIDANCE: {
    answersInText: {
      ja: "0〜18歳の子どもの育児・発達・虐待等の相談に、無料・秘密厳守で応じる（電話相談も可）。",
      en: "Provides free and confidential consultations about child-rearing, development, and abuse for children aged 0–18.",
      my: "အသက် ၀ မှ ၁၈ နှစ်အထိ ကလေးများ၏ ပြုစုစောင့်ရှောက်မှု၊ ဖွံ့ဖြိုးမှုနှင့် အနိုင်ကျင့်မှုဆိုင်ရာကိစ္စများကို အခမဲ့၊ လျှို့ဝှက်စွာ တိုင်ပင်နိုင်သည်။",
    },
    notes: {
      ja: "言語によってはFRACへ案内。",
      en: "Depending on the language, you may be referred to FRAC.",
      my: "ဘာသာစကားအလိုက် FRAC သို့ လမ်းညွှန်ပေးနိုင်သည်။",
    },
  },
  TOKYO_MEDICAL_INFO: {
    answersInText: {
      ja: "医療の受け方、日本の医療制度、医療機関の探し方が書いてある。",
      en: "Explains how to receive medical care, Japan's medical system, and how to find medical institutions.",
      my: "ဆေးကုသမှုခံယူနည်း၊ ဂျပန်နိုင်ငံ၏ ကျန်းမာရေးစနစ်နှင့် ဆေးရုံဆေးခန်းများရှာဖွေနည်းကို ရှင်းပြထားသည်။",
    },
    notes: {
      ja: "対応言語・予約は各医療機関へ確認。",
      en: "Confirm languages and appointments with each medical institution.",
      my: "ရရှိနိုင်သည့်ဘာသာစကားနှင့် ကြိုတင်ချိန်းဆိုမှုကို ဆေးရုံဆေးခန်းတစ်ခုချင်းစီတွင် အတည်ပြုပါ။",
    },
  },
  TOKYO_MEDICAL_FLOW: {
    answersInText: {
      ja: "受診の流れ（持ち物・受付・診察・会計・薬）が書いてある。",
      en: "Explains the process of visiting a medical institution, from what to bring through payment and medicine.",
      my: "ဆေးရုံဆေးခန်းသွားရောက်သည့် လုပ်ငန်းစဉ်၊ ယူဆောင်ရမည့်ပစ္စည်း၊ လက်ခံစာရင်း၊ စစ်ဆေးမှု၊ ငွေပေးချေမှုနှင့် ဆေးဝါးများကို ရှင်းပြထားသည်။",
    },
    notes: { ja: "", en: "", my: "" },
  },
  TOKYO_MEDICAL_HIMAWARI: {
    answersInText: {
      ja: "外国語で受診できる医療機関や日本の医療制度を案内する電話相談（03-5285-8181、毎日9-20時）が書いてある。",
      en: "Provides telephone guidance on medical institutions offering foreign-language care and Japan's medical system.",
      my: "နိုင်ငံခြားဘာသာစကားဖြင့် ဆေးကုသနိုင်သည့် ဆေးရုံဆေးခန်းများနှင့် ဂျပန်ကျန်းမာရေးစနစ်အကြောင်း ဖုန်းမှတစ်ဆင့် လမ်းညွှန်ပေးသည်။",
    },
    notes: { ja: "", en: "", my: "" },
  },
  TOKYO_MEDICAL_TMCNAVI: {
    answersInText: {
      ja: "生活の困りごとを多言語で電話相談できる（TMC Navi、フリーダイヤル0120-142-142）。",
      en: "TMC Navi provides multilingual telephone consultations about daily-life problems.",
      my: "TMC Navi မှ နေ့စဉ်ဘဝအခက်အခဲများကို ဘာသာစကားမျိုးစုံဖြင့် ဖုန်းမှတစ်ဆင့် တိုင်ပင်နိုင်သည်။",
    },
    notes: { ja: "", en: "", my: "" },
  },
  TOKYO_MEDICAL_GAIKOKUGO: {
    answersInText: {
      ja: "外国語で受診できる医療機関案内テレホン（03-5285-8181）と救急通訳サービスの言語・時間が書いてある。",
      en: "Lists the medical institution guidance telephone service and the languages and hours of emergency interpretation.",
      my: "နိုင်ငံခြားဘာသာစကားဖြင့် ဆေးကုသနိုင်သည့် ဆေးရုံဆေးခန်းလမ်းညွှန်ဖုန်းနှင့် အရေးပေါ်စကားပြန်ဝန်ဆောင်မှု၏ ဘာသာစကားနှင့် အချိန်များကို ဖော်ပြထားသည်။",
    },
    notes: { ja: "", en: "", my: "" },
  },
  TOKYO_LABOR_CONSULT: {
    answersInText: {
      ja: "外国人労働者の労働問題について、通訳（英・中）付きで相談できる窓口と時間が書いてある。",
      en: "Lists consultation desks and hours for foreign workers' labor issues, with English and Chinese interpretation.",
      my: "နိုင်ငံခြားသားအလုပ်သမားများ၏ အလုပ်သမားရေးရာပြဿနာများကို အင်္ဂလိပ်နှင့် တရုတ်စကားပြန်အကူအညီဖြင့် တိုင်ပင်နိုင်သည့်ဌာနများနှင့် အချိန်များကို ဖော်ပြထားသည်။",
    },
    notes: {
      ja: "働けるかどうかの可否は決定しない。",
      en: "This desk does not decide whether you are permitted to work.",
      my: "အလုပ်လုပ်ခွင့်ရှိ၊ မရှိကို ဤဌာနက ဆုံးဖြတ်ပေးခြင်းမရှိပါ။",
    },
  },
  TOKYO_FOREIGN_WORKERS_HANDBOOK: {
    answersInText: {
      ja: "日本で働く上での労働法・在留手続き・税金などが英語でまとめて書いてある。",
      en: "Summarizes labor law, residence procedures, taxes, and related topics for working in Japan.",
      my: "ဂျပန်နိုင်ငံတွင် အလုပ်လုပ်ရန် အလုပ်သမားဥပဒေ၊ နေထိုင်ခွင့်လုပ်ထုံးလုပ်နည်းနှင့် အခွန်များကို စုစည်းဖော်ပြထားသည်။",
    },
    notes: { ja: "", en: "", my: "" },
  },
  TOKYO_CAREER_CONSULT: {
    answersInText: {
      ja: "東京で働くための相談（キャリアコンサルタントが電話・メール・オンラインで対応）が書いてある。",
      en: "Explains career consultations for working in Tokyo by phone, email, or online.",
      my: "တိုကျိုတွင် အလုပ်လုပ်ရန် အသက်မွေးဝမ်းကျောင်းဆိုင်ရာ တိုင်ပင်မှုများကို ဖုန်း၊ အီးမေးလ် သို့မဟုတ် အွန်လိုင်းမှ ပြုလုပ်နိုင်ကြောင်း ရှင်းပြထားသည်။",
    },
    notes: {
      ja: "求人の紹介は行わない。",
      en: "This service does not introduce specific job openings.",
      my: "သီးခြားအလုပ်နေရာများကို မိတ်ဆက်ပေးခြင်းမရှိပါ။",
    },
  },
  HELLO_WORK_TOKYO_FOREIGNER: {
    answersInText: {
      ja: "就職のための相談や、就労可能な在留資格・労働関連法令について書いてある。",
      en: "Provides information about job-seeking consultations, work-authorized residence statuses, and labor-related laws.",
      my: "အလုပ်ရှာဖွေရေးတိုင်ပင်မှု၊ အလုပ်လုပ်ခွင့်ရှိသည့် နေထိုင်ခွင့်အမျိုးအစားများနှင့် အလုပ်သမားဆိုင်ရာဥပဒေများကို ဖော်ပြထားသည်။",
    },
    notes: { ja: "", en: "", my: "" },
  },
  TIPS_JAPANESE: {
    answersInText: {
      ja: "日本語学習や多言語相談などの情報がまとめて載っている。",
      en: "Collects information about Japanese-language learning and multilingual consultations.",
      my: "ဂျပန်ဘာသာလေ့လာရေးနှင့် ဘာသာစကားမျိုးစုံတိုင်ပင်ရေးအချက်အလက်များကို စုစည်းဖော်ပြထားသည်။",
    },
    notes: { ja: "", en: "", my: "" },
  },
  TIPS_LIVING_GUIDE: {
    answersInText: {
      ja: "東京で初めて暮らす人向けの手続きや生活情報（金融・防災・病気等）のガイドブック（10言語）への案内。",
      en: "Introduces a 10-language guide to procedures and daily life in Tokyo, including finance, disaster preparedness, and illness.",
      my: "တိုကျိုတွင် ပထမဆုံးနေထိုင်မည့်သူများအတွက် လုပ်ထုံးလုပ်နည်းနှင့် နေ့စဉ်ဘဝအချက်အလက်များပါဝင်သည့် ဘာသာစကား ၁၀ မျိုးလမ်းညွှန်ကို မိတ်ဆက်ပေးသည်။",
    },
    notes: { ja: "", en: "", my: "" },
  },
  TIPS_PROCEDURES: {
    answersInText: {
      ja: "在留カード・住民登録・マイナンバーなど、日本で暮らすときの必要な手続きが書いてある。",
      en: "Explains necessary procedures for living in Japan, including residence cards, resident registration, and My Number.",
      my: "ဂျပန်တွင်နေထိုင်ရန် လိုအပ်သည့် နေထိုင်ခွင့်ကတ်၊ နေထိုင်သူမှတ်ပုံတင်နှင့် My Number ဆိုင်ရာလုပ်ထုံးလုပ်နည်းများကို ရှင်းပြထားသည်။",
    },
    notes: { ja: "", en: "", my: "" },
  },
  TIPS_LIFE_GUIDE_JP: {
    answersInText: {
      ja: "日本で暮らすときの手続きや、住む・生活するための情報がまとめて載っている。",
      en: "Collects procedures and practical information for living in Japan.",
      my: "ဂျပန်တွင်နေထိုင်ရန် လိုအပ်သည့် လုပ်ထုံးလုပ်နည်းနှင့် နေ့စဉ်ဘဝအချက်အလက်များကို စုစည်းဖော်ပြထားသည်။",
    },
    notes: { ja: "", en: "", my: "" },
  },
  KEISHICHO_FOREIGN_RESIDENT_MANUAL: {
    answersInText: {
      ja: "日本の決まり・マナー・在留カードの携帯義務など、安全に暮らすための基礎が多言語で書いてある。",
      en: "Explains basic rules, manners, and residence-card carrying requirements for living safely in Japan.",
      my: "ဂျပန်နိုင်ငံ၏ စည်းမျဉ်းများ၊ အမူအကျင့်များနှင့် နေထိုင်ခွင့်ကတ်ကို ကိုင်ဆောင်ရမည့်တာဝန်များကို ဘာသာစကားမျိုးစုံဖြင့် ရှင်းပြထားသည်။",
    },
    notes: { ja: "", en: "", my: "" },
  },
} satisfies Record<SupportSourceId, SupportCopy>;
