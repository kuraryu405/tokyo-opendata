import { enMessages, jaMessages, myMessages, selectableUserLocales as clientSelectableUserLocales } from "./client";
import { koMessages, zhCNMessages, zhTWMessages } from "./locales/east-asia";
import { bnMessages, neMessages } from "./locales/south-asia";
import { thMessages, viMessages } from "./locales/southeast-asia-a";
import { filMessages, idMessages } from "./locales/southeast-asia-b";
import { assertValidLocalResourceCatalogs, localResourceCatalogs } from "./local-resource-catalog";
import { otherAnswerKeys, type OtherAnswerMessages } from "./other-answers";
import {
  actionIds,
  type ActionId,
} from "@staybridge/domain/action-catalog";

export { actionIds } from "@staybridge/domain/action-catalog";
export type { ActionId } from "@staybridge/domain/action-catalog";

export * from "./support-copy";
export * from "./other-answers";

export const supportedUserLocales = ["ja", "en", "zh-CN", "zh-TW", "ko", "ne", "vi", "my", "fil", "id", "bn", "th"] as const;

export type UserLocale = (typeof supportedUserLocales)[number];
export const reviewedUserLocales = ["ja", "en", "my"] as const satisfies readonly UserLocale[];
/** Preview allowlist for locales that passed internal review. */
export const selectableUserLocales = clientSelectableUserLocales satisfies readonly UserLocale[];
export type SelectableUserLocale = (typeof selectableUserLocales)[number];
export const userLocaleNativeLabels = {
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
export type ContentStatus = "draft" | "reviewed";
export type LocaleReviewStatus = "pending" | "reviewed";
export type LocaleReview = { status: LocaleReviewStatus; reviewedAt?: string; reviewedBy?: string };

export type LocaleMetadata = {
  label: string;
  nativeLabel: string;
  contentStatus: ContentStatus;
  updatedAt: string;
  internalReview: LocaleReview;
  expertReview: LocaleReview;
};

export const reasonCodes = [
  "RETURN_DIFFICULT_SHORT_TERM",
  "RETURN_DIFFICULT",
  "SITUATION_NEEDS_CONFIRMATION",
  "SCHOOL_AGE_CHILD",
  "CHILD_LOCAL_ROUTINE",
  "TEMPORARY_HOTEL",
  "UNSTABLE_ACCOMMODATION",
  "CHILDCARE_NEED",
  "MEDICAL_NEED",
  "EMPLOYMENT_NEED",
  "LIVING_COST_NEED",
  "LANGUAGE_BARRIER",
  "KNOWN_STAY_DEADLINE",
  "STAY_DEADLINE_PASSED",
  "OTHER_VISIT_PURPOSE",
] as const;

export type ReasonCode = (typeof reasonCodes)[number];

export const timingKeys = [
  "today",
  "this_week",
  "next_30_days",
  "before_deadline",
  "long_term",
] as const;

export type TimingKey = (typeof timingKeys)[number];

export const needKeys = [
  "stay",
  "consultation",
  "accommodation",
  "living_cost",
  "employment",
  "education",
  "childcare",
  "medical",
  "language",
  "daily_life",
] as const;

export type NeedKey = (typeof needKeys)[number];
export type LocalFilterKey = "all" | "school" | "medical" | "child_support" | "public_facility";

export type QuestionOption = readonly [value: string, label: string];
export type QuestionMessage = readonly [
  title: string,
  hint: string,
  options: readonly QuestionOption[],
];

export type ActionMessage = {
  title: string;
  desc: string;
  cta: string;
};

export type PreviewStep = {
  time: string;
  title: string;
  detail: string;
};

export type UserMessages = {
  metadata: LocaleMetadata;
  ui: {
    skip: string;
    navSteps: string;
    navLocal: string;
    navHelp: string;
    crisis: string;
    eyebrow: string;
    hero: string;
    intro: string;
    start: string;
    demo: string;
    noLogin: string;
    noAddress: string;
    official: string;
    notDecision: string;
    privacyTitle: string;
    privacyText: string;
    back: string;
    next: string;
    finish: string;
    selectMany: string;
    optional: string;
    reviewed: string;
    reviewedIntro: string;
    seeRoadmap: string;
    answerAgain: string;
    roadmapTitle: string;
    roadmapIntro: string;
    why: string;
    source: string;
    verified: string;
    human: string;
    localTitle: string;
    localIntro: string;
    localFallback: string;
    all: string;
    school: string;
    medical: string;
    child_support: string;
    public_facility: string;
    details: string;
    sourceLabel: string;
    updated: string;
    unavailable: string;
    backToRoadmap: string;
    continueToHelp: string;
    schoolNote: string;
    noResources: string;
    helpTitle: string;
    helpIntro: string;
    prepare: string;
    prepareItems: readonly string[];
    summary: string;
    summaryTitle: string;
    summaryIntro: string;
    current: string;
    questions: string;
    copy: string;
    copied: string;
    print: string;
    showMode: string;
    clear: string;
    emergency: string;
    footer: string;
    principleTitles: readonly [string, string, string];
    principleBodies: readonly [string, string, string];
    ageLabel: string;
    deadlineLabel: string;
    noEnteredInfo: string;
    noSelectedNeeds: string;
    storageError: string;
    copyError: string;
    homeLabel: string;
    primaryNavLabel: string;
    languageSelectTitle: string;
    languageSelectLabel: string;
    sectionSituationCheck: string;
    questionLabel: string;
    sectionSituationReview: string;
    sectionPersonalRoadmap: string;
    sectionLocalAction: string;
    sectionHumanHandoff: string;
    sectionConsultationSummary: string;
    sectionOfficialSupport: string;
    sectionHowItHelps: string;
    sectionPublicTeams: string;
    previewAriaLabel: string;
    previewTitle: string;
    previewSafety: string;
    previewSteps: readonly [PreviewStep, PreviewStep, PreviewStep];
    localNavigationLabel: string;
    priorityLabel: string;
    sourceTypeLabels: { openData: string; official: string };
    addressLabel: string;
    phoneLabel: string;
    publicDataLabel: string;
    supportFallback: string;
    resourceIcons: { school: string; medical: string; child_support: string; public_facility: string };
    localeOptions: Record<UserLocale, string>;
    summarySheetLabel: string;
    summarySheetSections: readonly [string, string];
    areaLabel: string;
    nationalityLabel: string;
    ageValueLabel: string;
    japaneseLabel: string;
  };
  questions: readonly [
    QuestionMessage,
    QuestionMessage,
    QuestionMessage,
    QuestionMessage,
    QuestionMessage,
    QuestionMessage,
    QuestionMessage,
    QuestionMessage,
    QuestionMessage,
    QuestionMessage,
  ];
  otherAnswers: OtherAnswerMessages;
  actions: Record<ActionId, ActionMessage>;
  timing: Record<TimingKey, string>;
  reasons: Record<ReasonCode, string>;
  needs: Record<NeedKey, string>;
};

export type UserMessagesByLocale = Record<UserLocale, UserMessages>;


export const userMessages = {
  ja: jaMessages,
  en: enMessages,
  "zh-CN": zhCNMessages,
  "zh-TW": zhTWMessages,
  ko: koMessages,
  ne: neMessages,
  vi: viMessages,
  my: myMessages,
  fil: filMessages,
  id: idMessages,
  bn: bnMessages,
  th: thMessages,
} satisfies UserMessagesByLocale;

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertNonEmpty(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Invalid user catalog value at ${path}`);
}

function assertNoEmptyStrings(value: unknown, path: string): void {
  if (typeof value === "string") {
    assertNonEmpty(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoEmptyStrings(item, `${path}.${index}`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) assertNoEmptyStrings(item, `${path}.${key}`);
  }
}

function assertExactKeys(value: object, expected: readonly string[], path: string): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new Error(`Invalid keys at ${path}`);
  }
}

export function assertValidUserMessages(value: unknown): asserts value is UserMessagesByLocale {
  if (!value || typeof value !== "object") throw new Error("User catalog must be an object");
  const localeRecord = value as Record<string, unknown>;
  const actualLocales = Object.keys(localeRecord).sort();
  const expectedLocales = [...supportedUserLocales].sort();
  if (actualLocales.length !== expectedLocales.length || actualLocales.some((locale, index) => locale !== expectedLocales[index])) {
    throw new Error("User catalog locales must exactly match the supported locale set");
  }
  for (const locale of supportedUserLocales) {
    if (!hasOwn(value, locale)) throw new Error(`Missing user locale catalog: ${locale}`);
    const messages = (value as Record<UserLocale, unknown>)[locale];
    if (!messages || typeof messages !== "object") throw new Error(`Invalid user locale catalog: ${locale}`);
    const catalog = messages as UserMessages;
    if (!catalog.metadata || typeof catalog.metadata !== "object") throw new Error(`Invalid metadata for ${locale}`);
    assertNonEmpty(catalog.metadata.label, `${locale}.metadata.label`);
    assertNonEmpty(catalog.metadata.nativeLabel, `${locale}.metadata.nativeLabel`);
    const shouldBeReviewed = (reviewedUserLocales as readonly UserLocale[]).includes(locale);
    const expectedContentStatus: ContentStatus = shouldBeReviewed ? "reviewed" : "draft";
    if (catalog.metadata.contentStatus !== expectedContentStatus) throw new Error(`Invalid content status at ${locale}.metadata.contentStatus`);
    assertNonEmpty(catalog.metadata.updatedAt, `${locale}.metadata.updatedAt`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(catalog.metadata.updatedAt)) throw new Error(`Invalid date at ${locale}.metadata.updatedAt`);
    assertExactKeys(catalog.metadata, ["label", "nativeLabel", "contentStatus", "updatedAt", "internalReview", "expertReview"], `${locale}.metadata`);
    for (const reviewKey of ["internalReview", "expertReview"] as const) {
      const review = catalog.metadata[reviewKey];
      if (!review || typeof review !== "object" || !["pending", "reviewed"].includes(review.status)) throw new Error(`Invalid ${reviewKey} review status at ${locale}.metadata`);
      if (review.status === "reviewed") {
        assertNonEmpty(review.reviewedAt, `${locale}.metadata.${reviewKey}.reviewedAt`);
        assertNonEmpty(review.reviewedBy, `${locale}.metadata.${reviewKey}.reviewedBy`);
      } else if (Object.keys(review).length !== 1) throw new Error(`Invalid ${reviewKey} review boundary at ${locale}.metadata`);
      if (reviewKey === "internalReview" && review.status !== (shouldBeReviewed ? "reviewed" : "pending")) {
        throw new Error(`Invalid ${reviewKey} review status at ${locale}.metadata`);
      }
      if (reviewKey === "expertReview" && !shouldBeReviewed && review.status !== "pending") {
        throw new Error(`Invalid ${reviewKey} review status at ${locale}.metadata`);
      }
    }
    if (!catalog.ui || typeof catalog.ui !== "object") throw new Error(`Invalid UI messages for ${locale}`);
    assertNoEmptyStrings(catalog.ui, `${locale}.ui`);
    if (!Array.isArray(catalog.questions) || catalog.questions.length !== 10) throw new Error(`Expected 10 questions for ${locale}`);
    catalog.questions.forEach((question, questionIndex) => {
      if (!Array.isArray(question) || question.length !== 3) throw new Error(`Malformed question ${locale}.${questionIndex}`);
      assertNonEmpty(question[0], `${locale}.questions.${questionIndex}.title`);
      assertNonEmpty(question[1], `${locale}.questions.${questionIndex}.hint`);
      if (!Array.isArray(question[2]) || question[2].length === 0) throw new Error(`Missing question options ${locale}.${questionIndex}`);
      question[2].forEach((option, optionIndex) => {
        if (!Array.isArray(option) || option.length !== 2) throw new Error(`Malformed option ${locale}.${questionIndex}.${optionIndex}`);
        assertNonEmpty(option[0], `${locale}.questions.${questionIndex}.${optionIndex}.value`);
        assertNonEmpty(option[1], `${locale}.questions.${questionIndex}.${optionIndex}.label`);
      });
    });
    if (!catalog.otherAnswers || typeof catalog.otherAnswers !== "object") throw new Error(`Invalid Other-answer messages for ${locale}`);
    assertExactKeys(catalog.otherAnswers, otherAnswerKeys, `${locale}.otherAnswers`);
    assertNoEmptyStrings(catalog.otherAnswers, `${locale}.otherAnswers`);
    for (const id of actionIds) {
      if (!hasOwn(catalog.actions, id)) throw new Error(`Missing action message ${locale}.${id}`);
      const action = catalog.actions[id];
      assertNonEmpty(action.title, `${locale}.actions.${id}.title`);
      assertNonEmpty(action.desc, `${locale}.actions.${id}.desc`);
      assertNonEmpty(action.cta, `${locale}.actions.${id}.cta`);
    }
    for (const code of reasonCodes) {
      assertNonEmpty(catalog.reasons[code], `${locale}.reasons.${code}`);
    }
    for (const key of timingKeys) assertNonEmpty(catalog.timing[key], `${locale}.timing.${key}`);
    for (const key of needKeys) assertNonEmpty(catalog.needs[key], `${locale}.needs.${key}`);
  }
  for (const locale of selectableUserLocales) {
    if ((value as UserMessagesByLocale)[locale].metadata.contentStatus !== "reviewed") {
      throw new Error(`Selectable locale must be reviewed: ${locale}`);
    }
  }
}

assertValidUserMessages(userMessages);
assertValidLocalResourceCatalogs(localResourceCatalogs);

/** A locale is publishable only after both internal and expert review are complete. */
export function getPublishedUserLocales(value: UserMessagesByLocale = userMessages): UserLocale[] {
  return supportedUserLocales.filter((locale) => {
    const metadata = value[locale].metadata;
    return metadata.contentStatus === "reviewed"
      && metadata.internalReview.status === "reviewed"
      && metadata.expertReview.status === "reviewed";
  });
}

export const publishedUserLocales = getPublishedUserLocales();

export function getUserMessages(locale: UserLocale): UserMessages {
  return userMessages[locale];
}

export {
  assertValidLocalResourceCatalogs,
  getLocalResourceDisplay,
  localResourceCatalogs,
  localResourceLocales,
  type LocalResourceCatalog,
  type LocalResourceCatalogByLocale,
  type LocalResourceDisplay,
  type LocalResourceLocale,
} from "./local-resource-catalog";
