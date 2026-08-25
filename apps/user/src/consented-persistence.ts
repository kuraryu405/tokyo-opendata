import type { Situation } from "@staybridge/domain/types";
import { CONVERSATION_CONSENT_VERSION, SITUATION_CONSENT_VERSION } from "@staybridge/worker-runtime";

const municipalityCodes: Record<string, string> = {
  Kita: "13117",
  Shinjuku: "13104",
  Toshima: "13116",
};

const situationRecordIdPattern = /^sit_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const conversationRecordIdPattern = /^con_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const deletionTokenPattern = /^[A-Za-z0-9_-]{43}$/u;
const idempotencyKeyPattern = /^[A-Za-z0-9_-]{16,128}$/u;

export const SAVED_SITUATION_CREDENTIALS_KEY = "staybridge.saved-situation-credentials";
export const PENDING_SITUATION_SUBMISSION_KEY = "staybridge.pending-situation-submission";
export const CONVERSATION_CONSENT_KEY = "staybridge.conversation-consent";
export const PENDING_CONVERSATION_REQUEST_KEY = "staybridge.pending-conversation-request";
export const SAVED_CONVERSATION_CREDENTIALS_KEY = "staybridge.saved-conversation-credentials";
export const SAVED_SITUATION_CREDENTIALS_VERSION = 1;
export const CONVERSATION_STORAGE_VERSION = 1;

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

export type ConversationConsentPreference = "accepted" | "declined";
export type ConversationLocale = "ja" | "en" | "my";
export type PendingConversationRequest = SituationSubmissionSecrets & {
  locale: ConversationLocale;
  content: string;
};

export type StoredValueParseResult<T> =
  | { status: "absent" }
  | { status: "valid"; value: T }
  | { status: "corrupt" };

export function createSituationSubmissionSecrets(): SituationSubmissionSecrets {
  return {
    idempotencyKey: crypto.randomUUID(),
    deletionToken: createDeletionToken(),
  };
}

export const createConversationRequestSecrets = createSituationSubmissionSecrets;

export function parseConversationConsentPreference(
  value: string | null,
): StoredValueParseResult<ConversationConsentPreference> {
  if (value === null) return { status: "absent" };
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { status: "corrupt" };
    const record = parsed as Record<string, unknown>;
    if (
      Object.keys(record).length !== 2
      || record.version !== CONVERSATION_STORAGE_VERSION
      || (record.preference !== "accepted" && record.preference !== "declined")
    ) return { status: "corrupt" };
    return { status: "valid", value: record.preference };
  } catch {
    return { status: "corrupt" };
  }
}

export function serializeConversationConsentPreference(preference: ConversationConsentPreference): string {
  return JSON.stringify({ version: CONVERSATION_STORAGE_VERSION, preference });
}

export function parsePendingConversationRequest(
  value: string | null,
): StoredValueParseResult<PendingConversationRequest> {
  if (value === null) return { status: "absent" };
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { status: "corrupt" };
    const record = parsed as Record<string, unknown>;
    if (
      Object.keys(record).length !== 5
      || record.version !== CONVERSATION_STORAGE_VERSION
      || (record.locale !== "ja" && record.locale !== "en" && record.locale !== "my")
      || typeof record.content !== "string"
      || !record.content.trim()
      || record.content !== record.content.trim()
      || record.content.length > 800
      || typeof record.idempotencyKey !== "string"
      || !idempotencyKeyPattern.test(record.idempotencyKey)
      || typeof record.deletionToken !== "string"
      || !deletionTokenPattern.test(record.deletionToken)
    ) return { status: "corrupt" };
    return {
      status: "valid",
      value: {
        locale: record.locale,
        content: record.content,
        idempotencyKey: record.idempotencyKey,
        deletionToken: record.deletionToken,
      },
    };
  } catch {
    return { status: "corrupt" };
  }
}

export function serializePendingConversationRequest(request: PendingConversationRequest): string {
  const parsed = parsePendingConversationRequest(JSON.stringify({
    version: CONVERSATION_STORAGE_VERSION,
    ...request,
  }));
  if (parsed.status !== "valid") throw new Error("INVALID_PENDING_CONVERSATION_REQUEST");
  return JSON.stringify({ version: CONVERSATION_STORAGE_VERSION, ...parsed.value });
}

export function parseSavedConversationCredentials(
  value: string | null,
): StoredValueParseResult<SavedRecordCredentials[]> {
  if (value === null) return { status: "absent" };
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { status: "corrupt" };
    const record = parsed as Record<string, unknown>;
    if (
      Object.keys(record).length !== 2
      || record.version !== CONVERSATION_STORAGE_VERSION
      || !Array.isArray(record.records)
      || record.records.length > 20
    ) return { status: "corrupt" };
    const credentials = record.records.map(parseSavedConversationCredentialsValue);
    if (credentials.some((item) => item === null)) return { status: "corrupt" };
    const values = credentials as SavedRecordCredentials[];
    if (new Set(values.map((item) => item.id)).size !== values.length) return { status: "corrupt" };
    return { status: "valid", value: values };
  } catch {
    return { status: "corrupt" };
  }
}

export function serializeSavedConversationCredentials(credentials: SavedRecordCredentials[]): string {
  const values = credentials.map((item) => {
    const parsed = parseSavedConversationCredentialsValue(item);
    if (!parsed) throw new Error("INVALID_SAVED_CONVERSATION_CREDENTIALS");
    return parsed;
  });
  if (values.length > 20 || new Set(values.map((item) => item.id)).size !== values.length) {
    throw new Error("INVALID_SAVED_CONVERSATION_CREDENTIALS");
  }
  return JSON.stringify({ version: CONVERSATION_STORAGE_VERSION, records: values });
}

export function appendSavedConversationCredentials(
  credentials: SavedRecordCredentials[],
  next: SavedRecordCredentials,
): SavedRecordCredentials[] {
  const parsed = parseSavedConversationCredentialsValue(next);
  if (!parsed) throw new Error("INVALID_SAVED_CONVERSATION_CREDENTIALS");
  return credentials.some((item) => item.id === parsed.id) ? credentials : [...credentials, parsed];
}

export async function deleteConversation(credentials: SavedRecordCredentials): Promise<void> {
  const validatedCredentials = parseSavedConversationCredentialsValue(credentials);
  if (!validatedCredentials) throw new Error("CONVERSATION_DELETION_FAILED");
  const response = await fetch(`/api/conversations/${encodeURIComponent(validatedCredentials.id)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${validatedCredentials.deletionToken}` },
  });
  const body = await readSuccessBody(response);
  if (!body || body.deleted !== true) throw new Error("CONVERSATION_DELETION_FAILED");
}

export { CONVERSATION_CONSENT_VERSION };

export function parseSituationSubmissionSecrets(value: string | null): SituationSubmissionSecrets | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (
      Object.keys(parsed).length !== 2
      || typeof parsed.idempotencyKey !== "string"
      || !idempotencyKeyPattern.test(parsed.idempotencyKey)
      || typeof parsed.deletionToken !== "string"
      || !/^[A-Za-z0-9_-]{43}$/u.test(parsed.deletionToken)
    ) return null;
    return {
      idempotencyKey: parsed.idempotencyKey,
      deletionToken: parsed.deletionToken,
    };
  } catch {
    return null;
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
  situation: Situation,
  secrets: SituationSubmissionSecrets,
): Promise<SavedRecordCredentials> {
  const response = await fetch("/api/situation-submissions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      consent: { accepted: true, version: SITUATION_CONSENT_VERSION },
      idempotencyKey: secrets.idempotencyKey,
      deletionToken: secrets.deletionToken,
      answers: {
        municipalityCode: municipalityCodes[situation.currentMunicipality] ?? null,
        visitPurpose: situation.visitPurpose,
        departureWindow: situation.originalDepartureWindow,
        returnStatus: situation.returnStatus,
        familyAgeGroups: situation.familyMembers.children.map((child) => child.ageGroup),
        accommodation: situation.accommodation,
        needs: situation.needs,
        japaneseLevel: situation.japaneseLevel,
      },
    }),
  });
  const body = await readSuccessBody(response);
  const credentials = parseSavedSituationCredentialsValue({
    id: body?.id,
    deletionToken: secrets.deletionToken,
  });
  if (!credentials) throw new Error("SITUATION_PERSISTENCE_FAILED");
  return credentials;
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
  // A prior DELETE may have succeeded even if its response was lost. Because
  // this call uses the exact locally-held random ID and token, 404 is a safe
  // idempotent completion for the client credential lifecycle.
  if (response.status === 404) return;
  const body = await readSuccessBody(response);
  if (!body || body.deleted !== true) throw new Error("SITUATION_DELETION_FAILED");
}

function parseSavedSituationCredentialsValue(value: unknown): SavedRecordCredentials | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parsed = value as Record<string, unknown>;
  if (
    Object.keys(parsed).length !== 2
    || typeof parsed.id !== "string"
    || !situationRecordIdPattern.test(parsed.id)
    || typeof parsed.deletionToken !== "string"
    || !deletionTokenPattern.test(parsed.deletionToken)
  ) return null;
  return { id: parsed.id, deletionToken: parsed.deletionToken };
}

function parseSavedConversationCredentialsValue(value: unknown): SavedRecordCredentials | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parsed = value as Record<string, unknown>;
  if (
    Object.keys(parsed).length !== 2
    || typeof parsed.id !== "string"
    || !conversationRecordIdPattern.test(parsed.id)
    || typeof parsed.deletionToken !== "string"
    || !deletionTokenPattern.test(parsed.deletionToken)
  ) return null;
  return { id: parsed.id, deletionToken: parsed.deletionToken };
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
