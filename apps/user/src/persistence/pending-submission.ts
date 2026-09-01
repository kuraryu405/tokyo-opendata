import {
  situationSubmissionAnswerCodes,
  tokyoMunicipalityCodes,
  type SituationSubmissionRequest as PersistenceContractRequest,
} from "@staybridge/domain/persistence-contracts";
export type { SituationSubmissionSecrets } from "@staybridge/domain/persistence-contracts";
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
import { SITUATION_CONSENT_VERSION } from "@staybridge/worker-runtime";

const visitPurposes = new Set<VisitPurpose>(situationSubmissionAnswerCodes.visitPurpose);
const departureWindows = new Set<DepartureWindow>(situationSubmissionAnswerCodes.departureWindow);
const returnStatuses = new Set<ReturnStatus>(situationSubmissionAnswerCodes.returnStatus);
const accommodations = new Set<AccommodationType>(situationSubmissionAnswerCodes.accommodation);
const needs = new Set<NeedCategory>(
  situationSubmissionAnswerCodes.needs.filter((need) => need !== "none"),
);
const japaneseLevels = new Set<JapaneseLevel>(situationSubmissionAnswerCodes.japaneseLevel);
const ageGroups = new Set<ChildAgeGroup>(situationSubmissionAnswerCodes.childAgeGroup);

const idempotencyKeyPattern = /^[A-Za-z0-9_-]{16,128}$/u;
const deletionTokenPattern = /^[A-Za-z0-9_-]{43}$/u;

export const PENDING_SITUATION_SUBMISSION_VERSION = 1 as const;

export type SituationSubmissionRequest = PersistenceContractRequest<typeof SITUATION_CONSENT_VERSION>;

export type PendingSituationSubmission = {
  version: typeof PENDING_SITUATION_SUBMISSION_VERSION;
  request: SituationSubmissionRequest;
};

export type PendingSituationSubmissionParseResult =
  | { status: "empty" }
  | { status: "retryable"; submission: PendingSituationSubmission }
  | { status: "incompatible" };

export function createPendingSituationSubmission(situation: Situation): PendingSituationSubmission {
  return {
    version: PENDING_SITUATION_SUBMISSION_VERSION,
    request: {
      consent: { accepted: true, version: SITUATION_CONSENT_VERSION },
      idempotencyKey: crypto.randomUUID(),
      deletionToken: createDeletionToken(),
      answers: {
        municipalityCode: (tokyoMunicipalityCodes as Readonly<Record<string, string>>)[situation.currentMunicipality] ?? null,
        visitPurpose: situation.visitPurpose,
        departureWindow: situation.originalDepartureWindow,
        returnStatus: situation.returnStatus,
        familyAgeGroups: situation.familyMembers.children.map((child) => child.ageGroup),
        accommodation: situation.accommodation,
        needs: [...situation.needs],
        japaneseLevel: situation.japaneseLevel,
      },
    },
  };
}

export function parsePendingSituationSubmission(value: string | null): PendingSituationSubmissionParseResult {
  if (value === null) return { status: "empty" };
  try {
    const submission = parsePendingSituationSubmissionValue(JSON.parse(value));
    return submission ? { status: "retryable", submission } : { status: "incompatible" };
  } catch {
    return { status: "incompatible" };
  }
}

function parsePendingSituationSubmissionValue(value: unknown): PendingSituationSubmission | null {
  if (!isRecordWithExactKeys(value, ["version", "request"]) || value.version !== PENDING_SITUATION_SUBMISSION_VERSION) return null;
  const request = value.request;
  if (!isRecordWithExactKeys(request, ["consent", "idempotencyKey", "deletionToken", "answers"])) return null;
  if (
    !isRecordWithExactKeys(request.consent, ["accepted", "version"])
    || request.consent.accepted !== true
    || request.consent.version !== SITUATION_CONSENT_VERSION
    || typeof request.idempotencyKey !== "string"
    || !idempotencyKeyPattern.test(request.idempotencyKey)
    || typeof request.deletionToken !== "string"
    || !deletionTokenPattern.test(request.deletionToken)
  ) return null;
  if (!isRecordWithExactKeys(request.answers, [
    "municipalityCode",
    "visitPurpose",
    "departureWindow",
    "returnStatus",
    "familyAgeGroups",
    "accommodation",
    "needs",
    "japaneseLevel",
  ])) return null;

  const answers = request.answers;
  if (answers.municipalityCode !== null && (typeof answers.municipalityCode !== "string" || !/^13\d{3}$/u.test(answers.municipalityCode))) return null;
  if (!isAllowedValue(answers.visitPurpose, visitPurposes)) return null;
  if (!isAllowedValue(answers.departureWindow, departureWindows)) return null;
  if (!isAllowedValue(answers.returnStatus, returnStatuses)) return null;
  if (!isAllowedValue(answers.accommodation, accommodations)) return null;
  if (!isAllowedValue(answers.japaneseLevel, japaneseLevels)) return null;
  const familyAgeGroups = parseAllowedArray(answers.familyAgeGroups, ageGroups, 6);
  const selectedNeeds = parseAllowedArray(answers.needs, needs, 10);
  if (!familyAgeGroups || !selectedNeeds) return null;

  return {
    version: PENDING_SITUATION_SUBMISSION_VERSION,
    request: {
      consent: { accepted: true, version: SITUATION_CONSENT_VERSION },
      idempotencyKey: request.idempotencyKey,
      deletionToken: request.deletionToken,
      answers: {
        municipalityCode: answers.municipalityCode,
        visitPurpose: answers.visitPurpose,
        departureWindow: answers.departureWindow,
        returnStatus: answers.returnStatus,
        familyAgeGroups,
        accommodation: answers.accommodation,
        needs: selectedNeeds,
        japaneseLevel: answers.japaneseLevel,
      },
    },
  };
}

function isRecordWithExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === keys.length && keys.every((key) => key in record);
}

function isAllowedValue<T extends string>(value: unknown, allowed: ReadonlySet<T>): value is T {
  return typeof value === "string" && allowed.has(value as T);
}

function parseAllowedArray<T extends string>(value: unknown, allowed: ReadonlySet<T>, max: number): T[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const result: T[] = [];
  for (const item of value) {
    if (!isAllowedValue(item, allowed) || result.includes(item)) return null;
    result.push(item);
  }
  return result;
}

function createDeletionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
