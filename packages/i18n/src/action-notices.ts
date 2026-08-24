import {
  actionIds,
  type ActionId,
} from "@staybridge/domain/action-catalog";

export const actionNoticeLocales = ["ja", "en", "my"] as const;
export type ActionNoticeLocale = (typeof actionNoticeLocales)[number];
export type ActionNoticeCatalog = Record<ActionNoticeLocale, Record<ActionId, string>>;

export const actionNotices = {
  ja: {
    CHECK_STAY_STATUS: "利用できる手続は個別の在留状況によって異なります。必ず公式窓口で確認してください。",
    CONTACT_OFFICIAL_SUPPORT: "対応内容・言語・受付時間・連絡方法は変わる場合があります。公式ページで最新情報を確認してください。",
    CHECK_CHILD_EDUCATION: "入学・就学の可否や通学区域、空き状況、言語支援は各校で異なります。自治体または学校へ確認してください。",
    PLAN_TEMPORARY_LIVING: "空き状況や利用条件は変化します。入居前に必ず宿泊先へ直接確認しましょう。",
    CHECK_MEDICAL_OPTIONS: "診療対応・言語支援は施設ごとに異なります。訪問前に電話やウェブサイトで確認しましょう。",
    CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH: "就労できる活動は在留資格によって異なります。応募前に出入国在留管理庁や専門窓口で資格の範囲を確認しましょう。",
    FIND_LANGUAGE_SUPPORT: "対応言語、通訳方法、受付時間は窓口によって異なります。連絡前に確認してください。",
    CHECK_BEFORE_STAY_DEADLINE: "滞在期限は在留カード等で自身でも確認しましょう。更新手続きは期限前に入国管理局等への相談が必要です。",
    CHECK_CHILD_LOCAL_SUPPORT: "受け入れ年齢や定員は施設ごとに異なります。訪問前に各施設へ確認しましょう。",
    CHECK_LIVING_COST_SUPPORT: "利用できる相談や支援、対象条件は個別の状況によって異なります。公式相談窓口へ確認してください。",
  },
  en: {
    CHECK_STAY_STATUS: "Available procedures depend on your individual status. Confirm them with an official support service.",
    CONTACT_OFFICIAL_SUPPORT: "Services, languages, hours, and contact arrangements can change. Confirm them on the official page.",
    CHECK_CHILD_EDUCATION: "Enrolment, catchment areas, vacancies, and language support differ by school. Ask the municipality or school.",
    PLAN_TEMPORARY_LIVING: "Vacancies and eligibility change over time. Always confirm directly with the accommodation before moving in.",
    CHECK_MEDICAL_OPTIONS: "Treatment availability and language support differ by facility. Call or check the website before visiting.",
    CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH: "Permitted work activities depend on your residence status. Before applying, confirm the scope of your status with the Immigration Services Agency or a specialist desk.",
    FIND_LANGUAGE_SUPPORT: "Available languages, interpretation methods, and hours vary. Confirm them with the service before contacting it.",
    CHECK_BEFORE_STAY_DEADLINE: "Check your stay deadline yourself on your residence card. Renewal procedures require consulting the immigration bureau before the deadline.",
    CHECK_CHILD_LOCAL_SUPPORT: "Accepted ages and capacity differ by facility. Check with each facility before visiting.",
    CHECK_LIVING_COST_SUPPORT: "Available support and eligibility depend on individual circumstances. Confirm them with an official support service.",
  },
  my: {
    CHECK_STAY_STATUS: "အသုံးပြုနိုင်သည့် လုပ်ငန်းစဉ်များသည် သင်၏တစ်ဦးချင်း နေထိုင်မှုအခြေအနေပေါ် မူတည်ပါသည်။ တရားဝင်အကူအညီဌာနတွင် အတည်ပြုပါ။",
    CONTACT_OFFICIAL_SUPPORT: "ဝန်ဆောင်မှု၊ ဘာသာစကား၊ ဖွင့်ချိန်နှင့် ဆက်သွယ်နည်းများ ပြောင်းလဲနိုင်ပါသည်။ တရားဝင်စာမျက်နှာတွင် အတည်ပြုပါ။",
    CHECK_CHILD_EDUCATION: "ကျောင်းဝင်ခွင့်၊ ကျောင်းနယ်မြေ၊ နေရာလွတ်နှင့် ဘာသာစကားအကူအညီတို့သည် ကျောင်းအလိုက် ကွာခြားပါသည်။ မြို့နယ် သို့မဟုတ် ကျောင်းတွင် မေးမြန်းပါ။",
    PLAN_TEMPORARY_LIVING: "နေရာလွတ်နှင့် အသုံးပြုခွင့်တို့သည် ပြောင်းလဲနိုင်ပါသည်။ ရွှေ့နေမီ တည်းခိုရာနေရာကို ကိုယ်တိုင် အတည်ပြုပါ။",
    CHECK_MEDICAL_OPTIONS: "ဆေးကုသမှုလက်ခံမှုနှင့် ဘာသာစကားအကူအညီတို့သည် ဆေးဘက်ဌာနအလိုက် ကွာခြားပါသည်။ မသွားမီ ဖုန်း သို့မဟုတ် ဝဘ်ဆိုက်ဖြင့် စစ်ဆေးပါ။",
    CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH: "လုပ်ကိုင်ခွင့်ရှိသော အလုပ်များသည် နေထိုင်ခွင့်အခြေအနေပေါ် မူတည်ပါသည်။ လျှောက်ထားမီ နိုင်ငံဝင်ခွင့်ရုံး သို့မဟုတ် ကျွမ်းကျင်အကူအညီဌာနတွင် ခွင့်ပြုစာရင်းကို အတည်ပြုပါ။",
    FIND_LANGUAGE_SUPPORT: "ရနိုင်သောဘာသာစကား၊ စကားပြန်နည်းနှင့် ဖွင့်ချိန်များ မတူနိုင်ပါသည်။ မဆက်သွယ်မီ ဝန်ဆောင်မှုတွင် အတည်ပြုပါ။",
    CHECK_BEFORE_STAY_DEADLINE: "နေထိုင်ခွင့်နောက်ဆုံးရက်ကို နေထိုင်ခွင့်ကတ်စသည်ဖြင့် ကိုယ်တိုင်လည်း စစ်ဆေးပါ။ သက်တမ်းတိုးလုပ်ငန်းစဉ်အတွက် နောက်ဆုံးရက်မတိုင်မီ နိုင်ငံဝင်ခွင့်ရုံးစသည့်ဌာနတွင် တိုင်ပင်ရန် လိုအပ်ပါသည်။",
    CHECK_CHILD_LOCAL_SUPPORT: "လက်ခံအသက်နှင့် လူအရေအတွက်သည် နေရာအလိုက် ကွာခြားပါသည်။ မသွားမီ နေရာတစ်ခုချင်းစီတွင် အတည်ပြုပါ။",
    CHECK_LIVING_COST_SUPPORT: "ရနိုင်သောအကူအညီနှင့် သတ်မှတ်ချက်များသည် တစ်ဦးချင်းအခြေအနေပေါ် မူတည်ပါသည်။ တရားဝင်အကူအညီဌာနတွင် အတည်ပြုပါ။",
  },
} as const satisfies ActionNoticeCatalog;

export function assertValidActionNotices(value: unknown): asserts value is ActionNoticeCatalog {
  if (!value || typeof value !== "object") throw new Error("Action notice catalog must be an object");
  const catalog = value as Record<string, unknown>;
  for (const locale of actionNoticeLocales) {
    const notices = catalog[locale];
    if (!notices || typeof notices !== "object") throw new Error(`Missing action notices for locale: ${locale}`);
    const record = notices as Record<string, unknown>;
    const actualIds = Object.keys(record).sort();
    const expectedIds = [...actionIds].sort();
    if (actualIds.length !== expectedIds.length || actualIds.some((id, index) => id !== expectedIds[index])) {
      throw new Error(`Invalid action notice IDs for locale: ${locale}`);
    }
    for (const id of actionIds) {
      if (typeof record[id] !== "string" || record[id].trim() === "") {
        throw new Error(`Missing action notice: ${locale}.${id}`);
      }
    }
  }
}

export function getActionNotice(locale: ActionNoticeLocale, id: ActionId): string {
  return actionNotices[locale][id];
}

assertValidActionNotices(actionNotices);
