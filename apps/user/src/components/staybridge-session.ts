import type {
  AccommodationType,
  ChildAgeGroup,
  DepartureWindow,
  JapaneseLevel,
  NeedCategory,
  ReturnStatus,
  Situation,
  VisitPurpose,
} from "@staybridge/domain/types";
import {
  isAiSelectableActionId,
  type AiSelectableActionId,
} from "@staybridge/domain/rules";
import type { SelectableUserLocale } from "@staybridge/i18n/client";

/** Locales that have passed review and may be used by the public client. */
export type Locale = SelectableUserLocale;
export type StayAnswer = "known" | "unknown" | "documents";
export type FamilyAnswer = "none" | "children" | "spouse" | "other";
export type FamilyAnswers = FamilyAnswer[];

export type StoredSession = {
  version: 3;
  situation: Situation;
  stayAnswer: StayAnswer;
  familyAnswers: FamilyAnswers;
  answeredSteps: number[];
  recommendedActionIds: AiSelectableActionId[];
};

const visitPurposes = new Set<VisitPurpose>([
  "tourism",
  "visiting_family_or_friends",
  "work",
  "study",
  "resident",
  "other",
  "unknown",
]);
const departureWindows = new Set<DepartureWindow>([
  "within_7_days",
  "within_30_days",
  "within_3_months",
  "no_departure_plan",
  "unknown",
]);
const returnStatuses = new Set<ReturnStatus>(["possible", "difficult", "unknown"]);
const accommodations = new Set<AccommodationType>([
  "hotel",
  "family_or_friend",
  "rental",
  "temporary_facility",
  "unstable",
  "prefer_not_to_say",
]);
const japaneseLevels = new Set<JapaneseLevel>(["none", "beginner", "daily", "advanced"]);
const childAgeGroups = new Set<ChildAgeGroup>(["0-2", "3-5", "6-11", "12-14", "15-17", "18+"]);
const needCategories = new Set<NeedCategory>([
  "stay",
  "consultation",
  "accommodation",
  "living_cost",
  "education",
  "childcare",
  "medical",
  "employment",
  "language",
  "daily_life",
]);
const stayAnswers = new Set<StayAnswer>(["known", "unknown", "documents"]);
const familyAnswers = new Set<FamilyAnswer>(["none", "children", "spouse", "other"]);
const assessmentSteps = Array.from({ length: 10 }, (_, index) => index);

export function createInitialSituation(): Situation {
  return {
    nationality: "",
    nationalityOther: "",
    currentMunicipality: "",
    currentMunicipalityOther: "",
    visitPurpose: "unknown",
    visitPurposeOther: "",
    originalDepartureWindow: "unknown",
    returnStatus: "unknown",
    stayDeadlineKnown: false,
    accommodation: "prefer_not_to_say",
    japaneseLevel: "none",
    familyOther: "",
    familyMembers: { children: [] },
    needs: [],
  };
}

export function parseStoredSession(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return null;

    if (value.version === 3 && isSituation(value.situation)) {
      if (!stayAnswers.has(value.stayAnswer as StayAnswer)) return null;
      if (!isFamilyAnswers(value.familyAnswers)) return null;
      if (!isAnsweredSteps(value.answeredSteps)) return null;
      if (!isRecommendedActionIds(value.recommendedActionIds)) return null;
      return {
        version: 3,
        situation: value.situation,
        stayAnswer: value.stayAnswer as StayAnswer,
        familyAnswers: value.familyAnswers,
        answeredSteps: normalizeAnsweredSteps(value.situation, value.familyAnswers, value.answeredSteps),
        recommendedActionIds: value.situation.visitPurpose === "other" && value.situation.visitPurposeOther?.trim()
          ? value.recommendedActionIds
          : [],
      };
    }

    if (value.version === 2 && isSituation(value.situation)) {
      if (!stayAnswers.has(value.stayAnswer as StayAnswer)) return null;
      if (!isFamilyAnswers(value.familyAnswers)) return null;
      if (!isAnsweredSteps(value.answeredSteps)) return null;
      return {
        version: 3,
        situation: value.situation,
        stayAnswer: value.stayAnswer as StayAnswer,
        familyAnswers: value.familyAnswers,
        answeredSteps: normalizeAnsweredSteps(value.situation, value.familyAnswers, value.answeredSteps),
        recommendedActionIds: [],
      };
    }

    if (value.version === 1 && isSituation(value.situation)) {
      if (!stayAnswers.has(value.stayAnswer as StayAnswer)) return null;
      if (!familyAnswers.has(value.familyAnswer as FamilyAnswer)) return null;
      if (!isAnsweredSteps(value.answeredSteps)) return null;
      return {
        version: 3,
        situation: value.situation,
        stayAnswer: value.stayAnswer as StayAnswer,
        familyAnswers: [value.familyAnswer as FamilyAnswer],
        answeredSteps: normalizeAnsweredSteps(value.situation, [value.familyAnswer as FamilyAnswer], value.answeredSteps),
        recommendedActionIds: [],
      };
    }

    // Safely migrate the original MVP shape. Only fields that are clearly
    // distinguishable from defaults count as answered.
    if (isSituation(value)) {
      return {
        version: 3,
        situation: value,
        stayAnswer: value.stayDeadlineKnown ? "known" : "unknown",
        familyAnswers: value.familyMembers.children.length ? ["children"] : [],
        answeredSteps: inferLegacyAnsweredSteps(value),
        recommendedActionIds: [],
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function serializeStoredSession(
  session: Omit<StoredSession, "version" | "recommendedActionIds"> & { recommendedActionIds?: AiSelectableActionId[] },
): string {
  return JSON.stringify({ version: 3, ...session, recommendedActionIds: session.recommendedActionIds ?? [] } satisfies StoredSession);
}

export function isAssessmentComplete(answeredSteps: number[]): boolean {
  return assessmentSteps.every((step) => answeredSteps.includes(step));
}

export function firstUnansweredStep(answeredSteps: number[]): number | null {
  return assessmentSteps.find((step) => !answeredSteps.includes(step)) ?? null;
}

function isSituation(value: unknown): value is Situation {
  if (!isRecord(value) || !isRecord(value.familyMembers)) return false;
  const children = value.familyMembers.children;
  return (
    typeof value.nationality === "string" &&
    (value.nationalityOther === undefined || isFreeText(value.nationalityOther, 100)) &&
    typeof value.currentMunicipality === "string" &&
    (value.currentMunicipalityOther === undefined || isFreeText(value.currentMunicipalityOther, 100)) &&
    visitPurposes.has(value.visitPurpose as VisitPurpose) &&
    (value.visitPurposeOther === undefined || isFreeText(value.visitPurposeOther, 300)) &&
    departureWindows.has(value.originalDepartureWindow as DepartureWindow) &&
    returnStatuses.has(value.returnStatus as ReturnStatus) &&
    typeof value.stayDeadlineKnown === "boolean" &&
    (value.knownStayDeadline === undefined || typeof value.knownStayDeadline === "string") &&
    accommodations.has(value.accommodation as AccommodationType) &&
    japaneseLevels.has(value.japaneseLevel as JapaneseLevel) &&
    (value.familyOther === undefined || isFreeText(value.familyOther, 100)) &&
    Array.isArray(children) &&
    children.every((child) => isRecord(child) && childAgeGroups.has(child.ageGroup as ChildAgeGroup)) &&
    Array.isArray(value.needs) &&
    value.needs.every((need) => needCategories.has(need as NeedCategory))
  );
}

function isAnsweredSteps(value: unknown): value is number[] {
  return Array.isArray(value) && new Set(value).size === value.length && value.every((step) => Number.isInteger(step) && step >= 0 && step <= 9);
}

function isFamilyAnswers(value: unknown): value is FamilyAnswers {
  if (!Array.isArray(value) || new Set(value).size !== value.length) return false;
  if (!value.every((answer) => familyAnswers.has(answer as FamilyAnswer))) return false;
  return value.includes("none") ? value.length === 1 : true;
}

function isRecommendedActionIds(value: unknown): value is AiSelectableActionId[] {
  return Array.isArray(value) && new Set(value).size === value.length && value.length <= 3 && value.every(isAiSelectableActionId);
}

function normalizeAnsweredSteps(situation: Situation, selectedFamilyAnswers: FamilyAnswers, answeredSteps: number[]): number[] {
  const invalidOtherSteps = new Set<number>();
  if (situation.currentMunicipality === "Other" && !situation.currentMunicipalityOther?.trim()) invalidOtherSteps.add(0);
  if (situation.nationality === "OTHER" && !situation.nationalityOther?.trim()) invalidOtherSteps.add(1);
  if (situation.visitPurpose === "other" && !situation.visitPurposeOther?.trim()) invalidOtherSteps.add(2);
  if (selectedFamilyAnswers.includes("other") && !situation.familyOther?.trim()) invalidOtherSteps.add(6);
  return invalidOtherSteps.size ? answeredSteps.filter((step) => !invalidOtherSteps.has(step)) : answeredSteps;
}

function isFreeText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function inferLegacyAnsweredSteps(situation: Situation): number[] {
  const steps: number[] = [];
  if (situation.currentMunicipality) steps.push(0);
  if (situation.nationality) steps.push(1);
  if (situation.visitPurpose !== "unknown") steps.push(2);
  if (situation.originalDepartureWindow !== "unknown") steps.push(3);
  if (situation.returnStatus !== "unknown") steps.push(4);
  if (situation.stayDeadlineKnown || situation.knownStayDeadline) steps.push(5);
  if (situation.familyMembers.children.length) steps.push(6);
  if (situation.accommodation !== "prefer_not_to_say") steps.push(7);
  if (situation.needs.length) steps.push(8);
  if (situation.japaneseLevel !== "none") steps.push(9);
  return steps;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
