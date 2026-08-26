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

const municipalityCodes: Record<string, string> = {
  Kita: "13117",
  Shinjuku: "13104",
  Toshima: "13116",
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
const needs = new Set<NeedCategory>([
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
]);
const japaneseLevels = new Set<JapaneseLevel>(["none", "beginner", "daily", "advanced"]);
const ageGroups = new Set<ChildAgeGroup>(["0-2", "3-5", "6-11", "12-14", "15-17", "18+"]);

const situationRecordIdPattern = /^sit_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const idempotencyKeyPattern = /^[A-Za-z0-9_-]{16,128}$/u;
const deletionTokenPattern = /^[A-Za-z0-9_-]{43}$/u;

export const SAVED_SITUATION_CREDENTIALS_KEY = "staybridge.saved-situation-credentials";
export const PENDING_SITUATION_SUBMISSION_KEY = "staybridge.pending-situation-submission";
export const PENDING_SITUATION_SUBMISSION_VERSION = 1 as const;
export const SAVED_SITUATION_CREDENTIALS_VERSION = 1;
export const SITUATION_PERSISTENCE_PREFERENCE_KEY = "staybridge.situation-persistence-preference";

/**
 * An explicit decline is honored for the lifetime of the answer session it
 * belongs to, so reloading does not re-ask the same consent question.
 * Anything unreadable simply means "no remembered preference": the worst case
 * is one repeated consent prompt, never a saved record.
 */
export function readSituationPersistencePreference(value: string | null): "declined" | null {
  return value === "declined" ? "declined" : null;
}

export type SavedRecordCredentials = {
  id: string;
  deletionToken: string;
};

export type SavedSituationCredentialsParseResult =
  | { status: "absent" }
  | { status: "valid"; credentials: SavedRecordCredentials; needsMigration: boolean }
  | { status: "corrupt" };

export type SituationSubmissionSecrets = {
  idempotencyKey: string;
  deletionToken: string;
};

export type SituationSubmissionRequest = {
  consent: { accepted: true, version: typeof SITUATION_CONSENT_VERSION };
  idempotencyKey: string;
  deletionToken: string;
  answers: {
    municipalityCode: string | null;
    visitPurpose: VisitPurpose;
    departureWindow: DepartureWindow;
    returnStatus: ReturnStatus;
    familyAgeGroups: ChildAgeGroup[];
    accommodation: AccommodationType;
    needs: NeedCategory[];
    japaneseLevel: JapaneseLevel;
  };
};

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
        municipalityCode: municipalityCodes[situation.currentMunicipality] ?? null,
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

export function parseSavedSituationCredentials(value: string | null): SavedSituationCredentialsParseResult {
  if (value === null) return { status: "absent" };
  try {
    const parsed = JSON.parse(value) as unknown;
    const legacyCredentials = parseSavedSituationCredentialsValue(parsed);
    if (legacyCredentials) {
      return { status: "valid", credentials: legacyCredentials, needsMigration: true };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { status: "corrupt" };
    const stored = parsed as Record<string, unknown>;
    if (
      Object.keys(stored).length !== 3
      || stored.version !== SAVED_SITUATION_CREDENTIALS_VERSION
    ) return { status: "corrupt" };
    const credentials = parseSavedSituationCredentialsValue({
      id: stored.id,
      deletionToken: stored.deletionToken,
    });
    return credentials
      ? { status: "valid", credentials, needsMigration: false }
      : { status: "corrupt" };
  } catch {
    return { status: "corrupt" };
  }
}

export function serializeSavedSituationCredentials(credentials: SavedRecordCredentials): string {
  const validatedCredentials = parseSavedSituationCredentialsValue(credentials);
  if (!validatedCredentials) throw new Error("INVALID_SAVED_SITUATION_CREDENTIALS");
  return JSON.stringify({
    version: SAVED_SITUATION_CREDENTIALS_VERSION,
    ...validatedCredentials,
  });
}

export async function saveSituationSubmission(
  submission: PendingSituationSubmission,
): Promise<SavedRecordCredentials> {
  // The one-time capability is acquired per attempt and never stored with the
  // versioned pending request.
  const capability = await issueSituationSubmissionCapability();
  const response = await fetch("/api/situation-submissions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...submission.request, capability }),
  });
  const body = await readSuccessBody(response);
  const credentials = parseSavedSituationCredentialsValue({
    id: body?.id,
    deletionToken: submission.request.deletionToken,
  });
  if (!credentials) throw new Error("SITUATION_PERSISTENCE_FAILED");
  return credentials;
}

async function issueSituationSubmissionCapability(): Promise<string> {
  const response = await fetch("/api/situation-submission-capabilities", { method: "POST" });
  const body = await readSuccessBody(response);
  if (
    typeof body?.capability !== "string"
    || body.capability.length < 32
    || body.capability.length > 1_024
  ) throw new Error("SITUATION_CAPABILITY_FAILED");
  return body.capability;
}

export async function deleteSituationSubmission(
  credentials: SavedRecordCredentials,
): Promise<void> {
  const validatedCredentials = parseSavedSituationCredentialsValue(credentials);
  if (!validatedCredentials) throw new Error("SITUATION_DELETION_FAILED");
  const response = await fetch(`/api/situation-submissions/${encodeURIComponent(validatedCredentials.id)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${validatedCredentials.deletionToken}` },
  });
  // A prior DELETE may have succeeded even if its response was lost. Only the
  // Worker's deletion-specific not-found envelope proves idempotent completion;
  // routing, proxy, and malformed 404 responses must preserve the credentials.
  if (response.status === 404 && await isCanonicalNotFoundResponse(response)) return;
  const body = await readSuccessBody(response);
  if (!body || body.deleted !== true) throw new Error("SITUATION_DELETION_FAILED");
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

function parseSavedSituationCredentialsValue(value: unknown): SavedRecordCredentials | null {
  if (!isRecordWithExactKeys(value, ["id", "deletionToken"])) return null;
  if (
    typeof value.id !== "string"
    || !situationRecordIdPattern.test(value.id)
    || typeof value.deletionToken !== "string"
    || !deletionTokenPattern.test(value.deletionToken)
  ) return null;
  return { id: value.id, deletionToken: value.deletionToken };
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

async function readSuccessBody(response: Response): Promise<Record<string, unknown> | null> {
  if (!response.ok) return null;
  const value = await response.json().catch(() => null);
  if (!value || typeof value !== "object") return null;
  const envelope = value as Record<string, unknown>;
  if (envelope.ok !== true || !envelope.data || typeof envelope.data !== "object") return null;
  return envelope.data as Record<string, unknown>;
}

async function isCanonicalNotFoundResponse(response: Response): Promise<boolean> {
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") return false;

  const value = await response.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const envelope = value as Record<string, unknown>;
  if (Object.keys(envelope).length !== 2 || envelope.ok !== false) return false;
  if (!envelope.error || typeof envelope.error !== "object" || Array.isArray(envelope.error)) return false;

  const error = envelope.error as Record<string, unknown>;
  return Object.keys(error).length === 2
    && error.code === "DELETION_NOT_FOUND"
    && typeof error.message === "string";
}
