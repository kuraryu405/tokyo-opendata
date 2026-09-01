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
import type { SelectableUserLocale } from "@staybridge/i18n/client";
import {
  parseAiActionIds,
  type AiSelectableActionId,
} from "@staybridge/domain/ai-actions";

/** Locales that have passed review and may be used by the public client. */
export type Locale = SelectableUserLocale;
export type StayAnswer = "known" | "unknown" | "documents";
export type FamilyAnswer = "none" | "children" | "spouse" | "other";
export type FamilyAnswers = FamilyAnswer[];
export type SituationProvenance = "user" | "demo";
export type OtherAnswers = {
  area: string;
  nationality: string;
  visitPurpose: string;
  family: string;
};
export type AiRecommendation = {
  input: string;
  actionIds: AiSelectableActionId[];
};

export type StoredSession = {
  version: 4;
  provenance: SituationProvenance;
  situation: Situation;
  stayAnswer: StayAnswer;
  familyAnswers: FamilyAnswers;
  answeredSteps: number[];
  otherAnswers: OtherAnswers;
  aiRecommendation: AiRecommendation | null;
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
  "none",
]);
const stayAnswers = new Set<StayAnswer>(["known", "unknown", "documents"]);
const familyAnswers = new Set<FamilyAnswer>(["none", "children", "spouse", "other"]);
const assessmentSteps = Array.from({ length: 10 }, (_, index) => index);

export function createInitialSituation(): Situation {
  return {
    nationality: "",
    currentMunicipality: "",
    visitPurpose: "unknown",
    originalDepartureWindow: "unknown",
    returnStatus: "unknown",
    stayDeadlineKnown: false,
    accommodation: "prefer_not_to_say",
    japaneseLevel: "none",
    familyMembers: { children: [] },
    needs: [],
  };
}

export function createInitialOtherAnswers(): OtherAnswers {
  return { area: "", nationality: "", visitPurpose: "", family: "" };
}


export type StoredSessionReadResult =
  | { status: "absent" }
  | { status: "valid"; session: StoredSession }
  | { status: "corrupt" }
  | { status: "unsupported"; version: number };

/**
 * Distinguishes a missing session from one that exists but cannot be read.
 * A present-but-unreadable value may still hold answers, so callers must keep
 * the raw value intact and let the person decide when to discard it.
 */
export function readStoredSession(raw: string | null): StoredSessionReadResult {
  if (!raw) return { status: "absent" };
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return { status: "corrupt" };

    if (typeof value.version === "number" && Number.isInteger(value.version) && value.version > 4) {
      return { status: "unsupported", version: value.version };
    }

    if (value.version === 4 && isSituation(value.situation) && isOtherAnswers(value.otherAnswers)) {
      if (value.provenance !== "user" && value.provenance !== "demo") return { status: "corrupt" };
      if (!stayAnswers.has(value.stayAnswer as StayAnswer)) return { status: "corrupt" };
      if (!isFamilyAnswers(value.familyAnswers)) return { status: "corrupt" };
      if (!isAnsweredSteps(value.answeredSteps)) return { status: "corrupt" };
      return {
        status: "valid",
        session: {
          version: 4,
          provenance: value.provenance,
          situation: value.situation,
          stayAnswer: value.stayAnswer as StayAnswer,
          familyAnswers: value.familyAnswers,
          answeredSteps: normalizeAnsweredSteps(value.situation, value.familyAnswers, value.otherAnswers, value.answeredSteps),
          otherAnswers: value.otherAnswers,
          aiRecommendation: parseAiRecommendation(value.aiRecommendation, value.situation, value.otherAnswers),
        },
      };
    }

    if (value.version === 3 && isSituation(value.situation)) {
      if (value.provenance !== "user" && value.provenance !== "demo") return { status: "corrupt" };
      if (!stayAnswers.has(value.stayAnswer as StayAnswer)) return { status: "corrupt" };
      if (!isFamilyAnswers(value.familyAnswers)) return { status: "corrupt" };
      if (!isAnsweredSteps(value.answeredSteps)) return { status: "corrupt" };
      const otherAnswers = createInitialOtherAnswers();
      return {
        status: "valid",
        session: {
          version: 4,
          provenance: value.provenance,
          situation: value.situation,
          stayAnswer: value.stayAnswer as StayAnswer,
          familyAnswers: value.familyAnswers,
          answeredSteps: normalizeAnsweredSteps(value.situation, value.familyAnswers, otherAnswers, value.answeredSteps),
          otherAnswers,
          aiRecommendation: null,
        },
      };
    }

    // Older sessions have no trustworthy answer provenance. Treat them as
    // demo-derived so they remain usable locally but require a full re-answer
    // before the public persistence action can be enabled.
    if (value.version === 2 && isSituation(value.situation)) {
      if (!stayAnswers.has(value.stayAnswer as StayAnswer)) return { status: "corrupt" };
      if (!isFamilyAnswers(value.familyAnswers)) return { status: "corrupt" };
      if (!isAnsweredSteps(value.answeredSteps)) return { status: "corrupt" };
      const otherAnswers = createInitialOtherAnswers();
      return {
        status: "valid",
        session: {
          version: 4,
          provenance: "demo",
          situation: value.situation,
          stayAnswer: value.stayAnswer as StayAnswer,
          familyAnswers: value.familyAnswers,
          answeredSteps: normalizeAnsweredSteps(value.situation, value.familyAnswers, otherAnswers, value.answeredSteps),
          otherAnswers,
          aiRecommendation: null,
        },
      };
    }

    if (value.version === 1 && isSituation(value.situation)) {
      if (!stayAnswers.has(value.stayAnswer as StayAnswer)) return { status: "corrupt" };
      if (!familyAnswers.has(value.familyAnswer as FamilyAnswer)) return { status: "corrupt" };
      if (!isAnsweredSteps(value.answeredSteps)) return { status: "corrupt" };
      const migratedFamilyAnswers = [value.familyAnswer as FamilyAnswer];
      const otherAnswers = createInitialOtherAnswers();
      return {
        status: "valid",
        session: {
          version: 4,
          provenance: "demo",
          situation: value.situation,
          stayAnswer: value.stayAnswer as StayAnswer,
          familyAnswers: migratedFamilyAnswers,
          answeredSteps: normalizeAnsweredSteps(value.situation, migratedFamilyAnswers, otherAnswers, value.answeredSteps),
          otherAnswers,
          aiRecommendation: null,
        },
      };
    }

    // Safely migrate the original MVP shape. Only fields that are clearly
    // distinguishable from defaults count as answered.
    if (isSituation(value)) {
      const migratedFamilyAnswers: FamilyAnswers = value.familyMembers.children.length ? ["children"] : [];
      const otherAnswers = createInitialOtherAnswers();
      return {
        status: "valid",
        session: {
          version: 4,
          provenance: "demo",
          situation: value,
          stayAnswer: value.stayDeadlineKnown ? "known" : "unknown",
          familyAnswers: migratedFamilyAnswers,
          answeredSteps: normalizeAnsweredSteps(value, migratedFamilyAnswers, otherAnswers, inferLegacyAnsweredSteps(value)),
          otherAnswers,
          aiRecommendation: null,
        },
      };
    }
  } catch {
    return { status: "corrupt" };
  }
  return { status: "corrupt" };
}

export function parseStoredSession(raw: string | null): StoredSession | null {
  const result = readStoredSession(raw);
  return result.status === "valid" ? result.session : null;
}

export function serializeStoredSession(
  session: Omit<StoredSession, "version" | "otherAnswers" | "aiRecommendation"> & {
    otherAnswers?: OtherAnswers;
    aiRecommendation?: AiRecommendation | null;
  },
): string {
  return JSON.stringify({
    version: 4,
    ...session,
    otherAnswers: session.otherAnswers ?? createInitialOtherAnswers(),
    aiRecommendation: session.aiRecommendation ?? null,
  } satisfies StoredSession);
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
    typeof value.currentMunicipality === "string" &&
    visitPurposes.has(value.visitPurpose as VisitPurpose) &&
    departureWindows.has(value.originalDepartureWindow as DepartureWindow) &&
    returnStatuses.has(value.returnStatus as ReturnStatus) &&
    typeof value.stayDeadlineKnown === "boolean" &&
    (value.knownStayDeadline === undefined || typeof value.knownStayDeadline === "string") &&
    accommodations.has(value.accommodation as AccommodationType) &&
    japaneseLevels.has(value.japaneseLevel as JapaneseLevel) &&
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

function isOtherAnswers(value: unknown): value is OtherAnswers {
  if (!isRecord(value) || Object.keys(value).length !== 4) return false;
  return isFreeText(value.area, 100)
    && isFreeText(value.nationality, 100)
    && isFreeText(value.visitPurpose, 300)
    && isFreeText(value.family, 100);
}

function isFreeText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function parseAiRecommendation(
  value: unknown,
  situation: Situation,
  otherAnswers: OtherAnswers,
): AiRecommendation | null {
  if (!isRecord(value) || Object.keys(value).length !== 2 || typeof value.input !== "string") return null;
  const input = value.input.trim();
  const actionIds = parseAiActionIds(value.actionIds);
  if (
    !input
    || input.length > 300
    || actionIds === null
    || situation.visitPurpose !== "other"
    || input !== otherAnswers.visitPurpose.trim()
  ) return null;
  return { input, actionIds };
}

function normalizeAnsweredSteps(
  situation: Situation,
  selectedFamilyAnswers: FamilyAnswers,
  otherAnswers: OtherAnswers,
  answeredSteps: number[],
): number[] {
  const incomplete = new Set<number>();
  if (situation.currentMunicipality === "Other" && !otherAnswers.area.trim()) incomplete.add(0);
  if (situation.nationality === "OTHER" && !otherAnswers.nationality.trim()) incomplete.add(1);
  if (situation.visitPurpose === "other" && !otherAnswers.visitPurpose.trim()) incomplete.add(2);
  if (selectedFamilyAnswers.includes("other") && !otherAnswers.family.trim()) incomplete.add(6);
  return incomplete.size ? answeredSteps.filter((step) => !incomplete.has(step)) : answeredSteps;
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
