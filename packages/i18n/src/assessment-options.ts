import { isoCountryCodes, tokyoWardCodes } from "@staybridge/domain/assessment-options";

type Option = readonly [string, string];
type Question = readonly [string, string, readonly Option[]];
type Questions = readonly [Question, Question, Question, Question, Question, Question, Question, Question, Question, Question];

const japaneseWardLabels = {
  Chiyoda: "千代田区", Chuo: "中央区", Minato: "港区", Shinjuku: "新宿区", Bunkyo: "文京区", Taito: "台東区",
  Sumida: "墨田区", Koto: "江東区", Shinagawa: "品川区", Meguro: "目黒区", Ota: "大田区", Setagaya: "世田谷区",
  Shibuya: "渋谷区", Nakano: "中野区", Suginami: "杉並区", Toshima: "豊島区", Kita: "北区", Arakawa: "荒川区",
  Itabashi: "板橋区", Nerima: "練馬区", Adachi: "足立区", Katsushika: "葛飾区", Edogawa: "江戸川区",
} as const satisfies Record<(typeof tokyoWardCodes)[number], string>;

const englishWardLabels = {
  Chiyoda: "Chiyoda City", Chuo: "Chuo City", Minato: "Minato City", Shinjuku: "Shinjuku City", Bunkyo: "Bunkyo City", Taito: "Taito City",
  Sumida: "Sumida City", Koto: "Koto City", Shinagawa: "Shinagawa City", Meguro: "Meguro City", Ota: "Ota City", Setagaya: "Setagaya City",
  Shibuya: "Shibuya City", Nakano: "Nakano City", Suginami: "Suginami City", Toshima: "Toshima City", Kita: "Kita City", Arakawa: "Arakawa City",
  Itabashi: "Itabashi City", Nerima: "Nerima City", Adachi: "Adachi City", Katsushika: "Katsushika City", Edogawa: "Edogawa City",
} as const satisfies Record<(typeof tokyoWardCodes)[number], string>;

const afterThreeMonthsLabels: Record<string, string> = {
  ja: "3か月以降", en: "After 3 months", "zh-CN": "3个月以后", "zh-TW": "3個月以後", ko: "3개월 이후",
  ne: "३ महिनापछि", vi: "Sau 3 tháng", my: "၃ လနောက်ပိုင်း", fil: "Pagkalipas ng 3 buwan", id: "Setelah 3 bulan",
  bn: "৩ মাস পরে", th: "หลัง 3 เดือน",
};

function localizedCountries(locale: string): Option[] {
  const displayNames = new Intl.DisplayNames([locale], { type: "region" });
  const collator = new Intl.Collator(locale);
  return isoCountryCodes
    .map((code) => [code, displayNames.of(code) ?? code] as const)
    .sort((left, right) => collator.compare(left[1], right[1]));
}

function replaceOptions(question: Question, options: readonly Option[]): Question {
  return [question[0], question[1], options];
}

/** Align every locale with the production answer codes while preserving its reviewed copy. */
export function withAssessmentOptions<T extends { questions: Questions }>(locale: string, messages: T): T {
  const questions = messages.questions;
  const otherCountryLabel = questions[1][2].find(([value]) => value === "OTHER")?.[1]
    ?? questions[2][2].find(([value]) => value === "other")?.[1]
    ?? "Other";
  const genericOtherLabel = questions[2][2].find(([value]) => value === "other")?.[1] ?? otherCountryLabel;
  const departureOptions = questions[3][2].filter(([value]) => value !== "unknown" && value !== "after_3_months");
  const noPlanIndex = departureOptions.findIndex(([value]) => value === "no_departure_plan");
  departureOptions.splice(noPlanIndex < 0 ? departureOptions.length : noPlanIndex, 0, ["after_3_months", afterThreeMonthsLabels[locale] ?? afterThreeMonthsLabels.en]);
  const accommodationOptions = questions[7][2].filter(([value]) => !["unstable", "prefer_not_to_say", "other"].includes(value));
  accommodationOptions.push(["other", genericOtherLabel]);
  const needOptions = questions[8][2].filter(([value]) => value !== "other");
  const noNeedIndex = needOptions.findIndex(([value]) => value === "none");
  needOptions.splice(noNeedIndex < 0 ? needOptions.length : noNeedIndex, 0, ["other", genericOtherLabel]);
  const reviewedWardLabels = new Map(questions[0][2]);
  const fallbackWardLabels = locale === "ja" ? japaneseWardLabels : englishWardLabels;
  const normalizedQuestions: Questions = [
    replaceOptions(questions[0], tokyoWardCodes.map((code) => [code, reviewedWardLabels.get(code) ?? fallbackWardLabels[code]] as const)),
    replaceOptions(questions[1], [...localizedCountries(locale), ["OTHER", otherCountryLabel]]),
    replaceOptions(questions[2], questions[2][2].filter(([value]) => value !== "unknown")),
    replaceOptions(questions[3], departureOptions),
    questions[4],
    replaceOptions(questions[5], questions[5][2].filter(([value]) => value !== "documents")),
    questions[6],
    replaceOptions(questions[7], accommodationOptions),
    replaceOptions(questions[8], needOptions),
    questions[9],
  ];
  return { ...messages, questions: normalizedQuestions };
}
