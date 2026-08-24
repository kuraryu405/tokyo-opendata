import {
  actionIds,
  type ActionId,
} from "@staybridge/domain/action-catalog";

export const actionNoticeLocales = ["ja", "en", "my"] as const;
export type ActionNoticeLocale = (typeof actionNoticeLocales)[number];
export type ActionNoticeCatalog = Record<ActionNoticeLocale, Record<ActionId, string>>;

export const actionNotices = {
  ja: {
    CHECK_STAY_STATUS: "確認先: 出入国在留管理庁または専門相談窓口。確認項目: 現在の在留期間と次に必要な手続。",
    CONTACT_OFFICIAL_SUPPORT: "確認先: 各窓口の公式ページ。確認項目: 対応内容、言語、受付時間、連絡方法。",
    CHECK_CHILD_EDUCATION: "確認先: 自治体の教育窓口または学校。確認項目: 入学・就学、通学区域、空き状況、言語支援。",
    PLAN_TEMPORARY_LIVING: "確認先: 候補の宿泊先または生活相談窓口。確認項目: 空き状況、利用条件、入居時期。",
    CHECK_MEDICAL_OPTIONS: "確認先: 候補の医療機関。確認項目: 診療内容、受付時間、言語支援。",
    CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH: "確認先: 出入国在留管理庁または専門相談窓口。確認項目: 現在の在留資格で認められる就労の範囲。",
    FIND_LANGUAGE_SUPPORT: "確認先: 利用する相談窓口。確認項目: 対応言語、通訳方法、受付時間。",
    CHECK_BEFORE_STAY_DEADLINE: "確認先: パスポート、在留カード、その他の公式書類と専門相談窓口。確認項目: 滞在期限と期限前に必要な手続。",
    CHECK_CHILD_LOCAL_SUPPORT: "確認先: 候補の施設。確認項目: 受け入れ年齢、定員、利用時間。",
    CHECK_LIVING_COST_SUPPORT: "確認先: 公式の生活相談窓口。確認項目: 利用できる相談、支援内容、対象条件。",
  },
  en: {
    CHECK_STAY_STATUS: "Where to confirm: the Immigration Services Agency or a specialist support desk. What to ask: your current period of stay and the next required steps.",
    CONTACT_OFFICIAL_SUPPORT: "Where to confirm: each service's official page. What to ask: services, languages, hours, and contact arrangements.",
    CHECK_CHILD_EDUCATION: "Where to confirm: the municipality's education desk or the school. What to ask: enrolment, catchment area, vacancies, and language support.",
    PLAN_TEMPORARY_LIVING: "Where to confirm: the accommodation or a living-support desk. What to ask: vacancies, eligibility, and move-in timing.",
    CHECK_MEDICAL_OPTIONS: "Where to confirm: the medical facility. What to ask: treatment, opening hours, and language support.",
    CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH: "Where to confirm: the Immigration Services Agency or a specialist desk. What to ask: the work permitted under your current residence status.",
    FIND_LANGUAGE_SUPPORT: "Where to confirm: the support service you plan to use. What to ask: languages, interpretation methods, and hours.",
    CHECK_BEFORE_STAY_DEADLINE: "Where to confirm: your passport, residence card, or other official documents and a specialist desk. What to ask: your stay deadline and any steps required before it.",
    CHECK_CHILD_LOCAL_SUPPORT: "Where to confirm: the facility. What to ask: accepted ages, capacity, and opening hours.",
    CHECK_LIVING_COST_SUPPORT: "Where to confirm: an official living-support desk. What to ask: available consultations, support, and eligibility.",
  },
  my: {
    CHECK_STAY_STATUS: "အတည်ပြုရန်နေရာ: လူဝင်မှုကြီးကြပ်ရေးဌာန သို့မဟုတ် ကျွမ်းကျင်တိုင်ပင်ရေးဌာန။ မေးရန်: လက်ရှိနေနိုင်သည့်ကာလနှင့် နောက်လုပ်ငန်းစဉ်။",
    CONTACT_OFFICIAL_SUPPORT: "အတည်ပြုရန်နေရာ: ဝန်ဆောင်မှုတစ်ခုချင်း၏ တရားဝင်စာမျက်နှာ။ မေးရန်: ဝန်ဆောင်မှု၊ ဘာသာစကား၊ ဖွင့်ချိန်နှင့် ဆက်သွယ်နည်း။",
    CHECK_CHILD_EDUCATION: "အတည်ပြုရန်နေရာ: မြို့နယ်ပညာရေးဌာန သို့မဟုတ် ကျောင်း။ မေးရန်: ကျောင်းဝင်ခွင့်၊ ကျောင်းနယ်မြေ၊ နေရာလွတ်နှင့် ဘာသာစကားအကူအညီ။",
    PLAN_TEMPORARY_LIVING: "အတည်ပြုရန်နေရာ: တည်းခိုရာနေရာ သို့မဟုတ် နေထိုင်မှုတိုင်ပင်ရေးဌာန။ မေးရန်: နေရာလွတ်၊ အသုံးပြုခွင့်နှင့် ပြောင်းရွှေ့ချိန်။",
    CHECK_MEDICAL_OPTIONS: "အတည်ပြုရန်နေရာ: ဆေးဘက်ဌာန။ မေးရန်: ဆေးကုသမှု၊ ဖွင့်ချိန်နှင့် ဘာသာစကားအကူအညီ။",
    CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH: "အတည်ပြုရန်နေရာ: လူဝင်မှုကြီးကြပ်ရေးဌာန သို့မဟုတ် ကျွမ်းကျင်တိုင်ပင်ရေးဌာန။ မေးရန်: လက်ရှိနေထိုင်ခွင့်ဖြင့် လုပ်ကိုင်နိုင်သည့်အလုပ်။",
    FIND_LANGUAGE_SUPPORT: "အတည်ပြုရန်နေရာ: အသုံးပြုမည့်တိုင်ပင်ရေးဌာန။ မေးရန်: ဘာသာစကား၊ စကားပြန်နည်းနှင့် ဖွင့်ချိန်။",
    CHECK_BEFORE_STAY_DEADLINE: "အတည်ပြုရန်နေရာ: နိုင်ငံကူးလက်မှတ်၊ နေထိုင်ခွင့်ကတ် သို့မဟုတ် အခြားတရားဝင်စာရွက်စာတမ်းများနှင့် ကျွမ်းကျင်တိုင်ပင်ရေးဌာန။ မေးရန်: နောက်ဆုံးရက်နှင့် ထိုရက်မတိုင်မီ လိုအပ်သည့်လုပ်ငန်းစဉ်။",
    CHECK_CHILD_LOCAL_SUPPORT: "အတည်ပြုရန်နေရာ: သက်ဆိုင်ရာနေရာ။ မေးရန်: လက်ခံအသက်၊ လူအရေအတွက်နှင့် ဖွင့်ချိန်။",
    CHECK_LIVING_COST_SUPPORT: "အတည်ပြုရန်နေရာ: တရားဝင်နေထိုင်မှုအကူအညီဌာန။ မေးရန်: တိုင်ပင်နိုင်သည့်အကြောင်းအရာ၊ အကူအညီနှင့် သတ်မှတ်ချက်များ။",
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
