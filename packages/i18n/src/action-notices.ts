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
    CHECK_CHILD_EDUCATION: "学校の掲載は、入学・就学、通学区域、空き、言語支援を保証するものではありません。自治体または学校へ確認してください。",
    PLAN_TEMPORARY_LIVING: "StayBridgeは宿泊先の空きや利用条件を確認しません。現在利用できる選択肢は相談窓口へ確認してください。",
    CHECK_MEDICAL_OPTIONS: "掲載情報は、現在の診療時間、受入、費用、診療内容、言語対応を保証しません。受診前に医療機関へ確認してください。",
    CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH: "StayBridgeは就労可否を判断しません。行動する前に、個別の在留状況を公式窓口へ確認してください。",
    FIND_LANGUAGE_SUPPORT: "対応言語、通訳方法、受付時間は窓口によって異なります。連絡前に確認してください。",
    CHECK_BEFORE_STAY_DEADLINE: "StayBridgeは滞在期限の計算・確認・延長を行いません。日付と手続は公式窓口へ確認してください。",
    CHECK_CHILD_LOCAL_SUPPORT: "施設の掲載は、利用条件、空き、現在のプログラム、言語対応を保証しません。各施設へ確認してください。",
    CHECK_LIVING_COST_SUPPORT: "利用できる相談や支援、対象条件は個別の状況によって異なります。公式相談窓口へ確認してください。",
  },
  en: {
    CHECK_STAY_STATUS: "Available procedures depend on your individual status. Confirm them with an official support service.",
    CONTACT_OFFICIAL_SUPPORT: "Services, languages, hours, and contact arrangements can change. Confirm them on the official page.",
    CHECK_CHILD_EDUCATION: "A school listing does not confirm enrolment, catchment, vacancy, or language support. Ask the municipality or school.",
    PLAN_TEMPORARY_LIVING: "StayBridge does not confirm accommodation availability or eligibility. Ask a support service about current options.",
    CHECK_MEDICAL_OPTIONS: "A listing does not confirm current hours, treatment, acceptance, cost, or language support. Contact the institution before visiting.",
    CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH: "StayBridge does not decide whether you may work. Confirm your individual status with an official service before acting.",
    FIND_LANGUAGE_SUPPORT: "Available languages, interpretation methods, and hours vary. Confirm them with the service before contacting it.",
    CHECK_BEFORE_STAY_DEADLINE: "StayBridge does not calculate, validate, or extend a stay deadline. Confirm the date and procedure with an official service.",
    CHECK_CHILD_LOCAL_SUPPORT: "Listings do not confirm eligibility, capacity, current programmes, or language support. Confirm details with each facility.",
    CHECK_LIVING_COST_SUPPORT: "Available support and eligibility depend on individual circumstances. Confirm them with an official support service.",
  },
  my: {
    CHECK_STAY_STATUS: "အသုံးပြုနိုင်သည့် လုပ်ငန်းစဉ်များသည် သင်၏တစ်ဦးချင်း နေထိုင်မှုအခြေအနေပေါ် မူတည်ပါသည်။ တရားဝင်အကူအညီဌာနတွင် အတည်ပြုပါ။",
    CONTACT_OFFICIAL_SUPPORT: "ဝန်ဆောင်မှု၊ ဘာသာစကား၊ ဖွင့်ချိန်နှင့် ဆက်သွယ်နည်းများ ပြောင်းလဲနိုင်ပါသည်။ တရားဝင်စာမျက်နှာတွင် အတည်ပြုပါ။",
    CHECK_CHILD_EDUCATION: "ကျောင်းစာရင်းသည် ကျောင်းဝင်ခွင့်၊ ကျောင်းနယ်မြေ၊ နေရာလွတ် သို့မဟုတ် ဘာသာစကားအကူအညီကို အာမခံခြင်းမရှိပါ။ မြို့နယ် သို့မဟုတ် ကျောင်းတွင် မေးမြန်းပါ။",
    PLAN_TEMPORARY_LIVING: "StayBridge သည် နေရာလွတ် သို့မဟုတ် အသုံးပြုခွင့်ကို အတည်မပြုပါ။ လက်ရှိရွေးချယ်စရာများကို အကူအညီဌာနတွင် မေးမြန်းပါ။",
    CHECK_MEDICAL_OPTIONS: "စာရင်းသည် လက်ရှိဖွင့်ချိန်၊ ကုသမှု၊ လူနာလက်ခံမှု၊ ကုန်ကျစရိတ် သို့မဟုတ် ဘာသာစကားအကူအညီကို အာမခံခြင်းမရှိပါ။ မသွားမီ ဆေးဘက်ဌာနသို့ ဆက်သွယ်ပါ။",
    CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH: "StayBridge သည် သင်အလုပ်လုပ်ခွင့်ရှိ/မရှိ မဆုံးဖြတ်ပါ။ လုပ်ဆောင်မီ သင်၏တစ်ဦးချင်းအခြေအနေကို တရားဝင်ဌာနတွင် အတည်ပြုပါ။",
    FIND_LANGUAGE_SUPPORT: "ရနိုင်သောဘာသာစကား၊ စကားပြန်နည်းနှင့် ဖွင့်ချိန်များ မတူနိုင်ပါသည်။ မဆက်သွယ်မီ ဝန်ဆောင်မှုတွင် အတည်ပြုပါ။",
    CHECK_BEFORE_STAY_DEADLINE: "StayBridge သည် နေထိုင်ခွင့်နောက်ဆုံးရက်ကို တွက်ချက်ခြင်း၊ အတည်ပြုခြင်း သို့မဟုတ် တိုးပေးခြင်း မလုပ်ပါ။ ရက်စွဲနှင့် လုပ်ငန်းစဉ်ကို တရားဝင်ဌာနတွင် အတည်ပြုပါ။",
    CHECK_CHILD_LOCAL_SUPPORT: "စာရင်းသည် အသုံးပြုခွင့်၊ နေရာလွတ်၊ လက်ရှိအစီအစဉ် သို့မဟုတ် ဘာသာစကားအကူအညီကို အာမခံခြင်းမရှိပါ။ သက်ဆိုင်ရာနေရာတွင် အတည်ပြုပါ။",
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
