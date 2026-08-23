import type { Situation } from "@staybridge/domain/types";
import { CONVERSATION_CONSENT_VERSION, SITUATION_CONSENT_VERSION } from "@staybridge/worker-runtime";

const municipalityCodes: Record<string, string> = {
  Kita: "13117",
  Shinjuku: "13104",
  Toshima: "13116",
};

export const SAVED_SITUATION_CREDENTIALS_KEY = "staybridge.saved-situation-credentials";
export const PENDING_SITUATION_SUBMISSION_KEY = "staybridge.pending-situation-submission";
export const SAVED_CONVERSATION_CREDENTIALS_KEY = "staybridge.saved-conversation-credentials";

export type SavedRecordCredentials = {
  id: string;
  deletionToken: string;
};

export type SituationSubmissionSecrets = {
  idempotencyKey: string;
  deletionToken: string;
};

export type ConversationCredentials = SavedRecordCredentials;
export const createConversationSecrets = createSituationSubmissionSecrets;

export function parseSavedConversationCredentials(value: string | null): ConversationCredentials[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    const values = Array.isArray(parsed) ? parsed : [parsed];
    const credentials = values.flatMap((item) => {
      const credential = parseConversationCredential(item);
      return credential ? [credential] : [];
    });
    return credentials.filter((credential, index, all) => all.findIndex((candidate) => candidate.id === credential.id) === index);
  } catch {
    return [];
  }
}

export function serializeSavedConversationCredentials(credentials: ConversationCredentials[]): string {
  return JSON.stringify(credentials);
}

export function appendSavedConversationCredential(
  credentials: ConversationCredentials[],
  credential: ConversationCredentials,
): ConversationCredentials[] {
  return credentials.some((item) => item.id === credential.id) ? credentials : [...credentials, credential];
}

export async function deleteConversation(credentials: ConversationCredentials): Promise<void> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(credentials.id)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${credentials.deletionToken}` },
  });
  if (response.status === 404) return;
  const body = await readSuccessBody(response);
  if (!body || body.deleted !== true) throw new Error("CONVERSATION_DELETION_FAILED");
}

export { CONVERSATION_CONSENT_VERSION };

function parseConversationCredential(value: unknown): ConversationCredentials | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parsed = value as Record<string, unknown>;
  if (
    Object.keys(parsed).length !== 2
    || typeof parsed.id !== "string"
    || !/^con_[0-9a-f-]{36}$/u.test(parsed.id)
    || typeof parsed.deletionToken !== "string"
    || !/^[A-Za-z0-9_-]{43}$/u.test(parsed.deletionToken)
  ) return null;
  return { id: parsed.id, deletionToken: parsed.deletionToken };
}

export function createSituationSubmissionSecrets(): SituationSubmissionSecrets {
  return {
    idempotencyKey: crypto.randomUUID(),
    deletionToken: createDeletionToken(),
  };
}

export function parseSituationSubmissionSecrets(value: string | null): SituationSubmissionSecrets | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (
      Object.keys(parsed).length !== 2
      || typeof parsed.idempotencyKey !== "string"
      || !/^[A-Za-z0-9_-]{16,128}$/u.test(parsed.idempotencyKey)
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

export function parseSavedSituationCredentials(value: string | null): SavedRecordCredentials | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (
      Object.keys(parsed).length !== 2
      || typeof parsed.id !== "string"
      || !/^sit_[0-9a-f-]{36}$/u.test(parsed.id)
      || typeof parsed.deletionToken !== "string"
      || !/^[A-Za-z0-9_-]{43}$/u.test(parsed.deletionToken)
    ) return null;
    return { id: parsed.id, deletionToken: parsed.deletionToken };
  } catch {
    return null;
  }
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
  if (!body || typeof body.id !== "string" || !body.id.startsWith("sit_")) {
    throw new Error("SITUATION_PERSISTENCE_FAILED");
  }
  return { id: body.id, deletionToken: secrets.deletionToken };
}

export async function deleteSituationSubmission(
  credentials: SavedRecordCredentials,
): Promise<void> {
  const response = await fetch(`/api/situation-submissions/${encodeURIComponent(credentials.id)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${credentials.deletionToken}` },
  });
  // A prior DELETE may have succeeded even if its response was lost. Because
  // this call uses the exact locally-held random ID and token, 404 is a safe
  // idempotent completion for the client credential lifecycle.
  if (response.status === 404) return;
  const body = await readSuccessBody(response);
  if (!body || body.deleted !== true) throw new Error("SITUATION_DELETION_FAILED");
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
