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
import { situationSubmissionAnswerCodes } from "@staybridge/domain/persistence-contracts";
import { createInitialOtherAnswers } from "./defaults";
import { normalizeAnsweredSteps } from "./progress";
import type {
  AiRecommendation,
  FamilyAnswer,
  FamilyAnswers,
  OtherAnswers,
  StayAnswer,
  StoredSession,
} from "./types";

const visitPurposes = new Set<VisitPurpose>(situationSubmissionAnswerCodes.visitPurpose);
const departureWindows = new Set<DepartureWindow>(situationSubmissionAnswerCodes.departureWindow);
const returnStatuses = new Set<ReturnStatus>(situationSubmissionAnswerCodes.returnStatus);
const accommodations = new Set<AccommodationType>(situationSubmissionAnswerCodes.accommodation);
const japaneseLevels = new Set<JapaneseLevel>(situationSubmissionAnswerCodes.japaneseLevel);
const childAgeGroups = new Set<ChildAgeGroup>(situationSubmissionAnswerCodes.childAgeGroup);
const needCategories = new Set<NeedCategory>(situationSubmissionAnswerCodes.needs);
const stayAnswers = new Set<StayAnswer>(["known", "unknown", "documents"]);
const familyAnswers = new Set<FamilyAnswer>(["none", "children", "spouse", "other"]);

export function migrateLegacyStoredSession(
  value: Record<string, unknown>,
  parseAiRecommendation: (
    recommendation: unknown,
    situation: Situation,
    otherAnswers: OtherAnswers,
  ) => AiRecommendation | null,
): StoredSession | null {
  if (value.version === 4 && isSituation(value.situation) && isLegacyOtherAnswers(value.otherAnswers)) {
    if (value.provenance !== "user" && value.provenance !== "demo") return null;
    if (!stayAnswers.has(value.stayAnswer as StayAnswer)) return null;
    if (!isFamilyAnswers(value.familyAnswers)) return null;
    if (!isAnsweredSteps(value.answeredSteps)) return null;
    const situation = normalizeLegacySituation(value.situation);
    const otherAnswers = { ...value.otherAnswers, accommodation: "", needs: "" };
    return {
      version: 5,
      provenance: value.provenance,
      situation,
      stayAnswer: value.stayAnswer as StayAnswer,
      familyAnswers: value.familyAnswers,
      answeredSteps: normalizeAnsweredSteps(situation, value.stayAnswer as StayAnswer, value.familyAnswers, otherAnswers, value.answeredSteps),
      otherAnswers,
      aiRecommendation: parseAiRecommendation(value.aiRecommendation, situation, otherAnswers),
    };
  }

  if (value.version === 3 && isSituation(value.situation)) {
    if (value.provenance !== "user" && value.provenance !== "demo") return null;
    if (!stayAnswers.has(value.stayAnswer as StayAnswer)) return null;
    if (!isFamilyAnswers(value.familyAnswers)) return null;
    if (!isAnsweredSteps(value.answeredSteps)) return null;
    const otherAnswers = createInitialOtherAnswers();
    const situation = normalizeLegacySituation(value.situation);
    return {
      version: 5,
      provenance: value.provenance,
      situation,
      stayAnswer: value.stayAnswer as StayAnswer,
      familyAnswers: value.familyAnswers,
      answeredSteps: normalizeAnsweredSteps(situation, value.stayAnswer as StayAnswer, value.familyAnswers, otherAnswers, value.answeredSteps),
      otherAnswers,
      aiRecommendation: null,
    };
  }

  // Older sessions have no trustworthy answer provenance. Treat them as
  // demo-derived so they remain usable locally but require a full re-answer
  // before the public persistence action can be enabled.
  if (value.version === 2 && isSituation(value.situation)) {
    if (!stayAnswers.has(value.stayAnswer as StayAnswer)) return null;
    if (!isFamilyAnswers(value.familyAnswers)) return null;
    if (!isAnsweredSteps(value.answeredSteps)) return null;
    const otherAnswers = createInitialOtherAnswers();
    const situation = normalizeLegacySituation(value.situation);
    return {
      version: 5,
      provenance: "demo",
      situation,
      stayAnswer: value.stayAnswer as StayAnswer,
      familyAnswers: value.familyAnswers,
      answeredSteps: normalizeAnsweredSteps(situation, value.stayAnswer as StayAnswer, value.familyAnswers, otherAnswers, value.answeredSteps),
      otherAnswers,
      aiRecommendation: null,
    };
  }

  if (value.version === 1 && isSituation(value.situation)) {
    if (!stayAnswers.has(value.stayAnswer as StayAnswer)) return null;
    if (!familyAnswers.has(value.familyAnswer as FamilyAnswer)) return null;
    if (!isAnsweredSteps(value.answeredSteps)) return null;
    const migratedFamilyAnswers = [value.familyAnswer as FamilyAnswer];
    const otherAnswers = createInitialOtherAnswers();
    const situation = normalizeLegacySituation(value.situation);
    return {
      version: 5,
      provenance: "demo",
      situation,
      stayAnswer: value.stayAnswer as StayAnswer,
      familyAnswers: migratedFamilyAnswers,
      answeredSteps: normalizeAnsweredSteps(situation, value.stayAnswer as StayAnswer, migratedFamilyAnswers, otherAnswers, value.answeredSteps),
      otherAnswers,
      aiRecommendation: null,
    };
  }

  // Safely migrate the original MVP shape. Only fields that are clearly
  // distinguishable from defaults count as answered.
  if (isSituation(value)) {
    const migratedFamilyAnswers: FamilyAnswers = value.familyMembers.children.length ? ["children"] : [];
    const otherAnswers = createInitialOtherAnswers();
    const situation = normalizeLegacySituation(value);
    const stayAnswer: StayAnswer = situation.stayDeadlineKnown ? "known" : "unknown";
    return {
      version: 5,
      provenance: "demo",
      situation,
      stayAnswer,
      familyAnswers: migratedFamilyAnswers,
      answeredSteps: normalizeAnsweredSteps(situation, stayAnswer, migratedFamilyAnswers, otherAnswers, inferLegacyAnsweredSteps(situation)),
      otherAnswers,
      aiRecommendation: null,
    };
  }

  return null;
}

export function isSituation(value: unknown): value is Situation {
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

export function isAnsweredSteps(value: unknown): value is number[] {
  return Array.isArray(value) && new Set(value).size === value.length && value.every((step) => Number.isInteger(step) && step >= 0 && step <= 9);
}

export function isFamilyAnswers(value: unknown): value is FamilyAnswers {
  if (!Array.isArray(value) || new Set(value).size !== value.length) return false;
  if (!value.every((answer) => familyAnswers.has(answer as FamilyAnswer))) return false;
  return value.includes("none") ? value.length === 1 : true;
}

export function isOtherAnswers(value: unknown): value is OtherAnswers {
  if (!isRecord(value) || Object.keys(value).length !== 6) return false;
  return isFreeText(value.area, 100)
    && isFreeText(value.nationality, 100)
    && isFreeText(value.visitPurpose, 300)
    && isFreeText(value.family, 100)
    && isFreeText(value.accommodation, 100)
    && isFreeText(value.needs, 100);
}

function isLegacyOtherAnswers(value: unknown): value is Omit<OtherAnswers, "accommodation" | "needs"> {
  if (!isRecord(value) || Object.keys(value).length !== 4) return false;
  return isFreeText(value.area, 100)
    && isFreeText(value.nationality, 100)
    && isFreeText(value.visitPurpose, 300)
    && isFreeText(value.family, 100);
}

function isFreeText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function normalizeLegacySituation(situation: Situation): Situation {
  return situation.nationality === "MMR" ? { ...situation, nationality: "MM" } : situation;
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
