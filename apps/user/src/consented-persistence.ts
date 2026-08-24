import type { Situation } from "@staybridge/domain/types";
import { SITUATION_CONSENT_VERSION } from "@staybridge/worker-runtime";

const municipalityCodes: Record<string, string> = {
  Kita: "13117",
  Shinjuku: "13104",
  Toshima: "13116",
};

const situationRecordIdPattern = /^sit_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const deletionTokenPattern = /^[A-Za-z0-9_-]{43}$/u;

export const SAVED_SITUATION_CREDENTIALS_KEY = "staybridge.saved-situation-credentials";
export const PENDING_SITUATION_SUBMISSION_KEY = "staybridge.pending-situation-submission";

export type SavedRecordCredentials = {
  id: string;
  deletionToken: string;
};

export type SituationSubmissionSecrets = {
  idempotencyKey: string;
  deletionToken: string;
};

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
    return parseSavedSituationCredentialsValue(JSON.parse(value));
  } catch {
    return null;
  }
}

export async function saveSituationSubmission(
  situation: Situation,
  secrets: SituationSubmissionSecrets,
): Promise<SavedRecordCredentials> {
  const capability = await issueSituationSubmissionCapability();
  const response = await fetch("/api/situation-submissions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      consent: { accepted: true, version: SITUATION_CONSENT_VERSION },
      idempotencyKey: secrets.idempotencyKey,
      deletionToken: secrets.deletionToken,
      capability,
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
