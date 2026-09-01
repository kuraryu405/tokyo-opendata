import { CONVERSATION_CONSENT_VERSION } from "@staybridge/worker-runtime";

export const CONVERSATION_PERSISTENCE_PREFERENCE_KEY = "staybridge.conversation-persistence-preference";
export const SAVED_CONVERSATION_CREDENTIALS_KEY = "staybridge.saved-conversation-credentials";
export const PENDING_CONVERSATION_SUBMISSION_KEY = "staybridge.pending-conversation-submission";

export type ConversationPersistenceState =
  | { status: "idle" | "declined" | "saving" | "error" | "deleted" }
  | { status: "saved"; credentials: SavedConversationCredentials };

export type SavedConversationCredentials = {
  id: string;
  deletionToken: string;
};

const conversationRecordIdPattern = /^con_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const deletionTokenPattern = /^[A-Za-z0-9_-]{43}$/u;

export function readConversationPersistencePreference(value: string | null): "declined" | null {
  return value === "declined" ? "declined" : null;
}

export function parseSavedConversationCredentials(value: string | null): SavedConversationCredentials | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const rec = parsed as Record<string, unknown>;
    if (typeof rec.id !== "string" || !conversationRecordIdPattern.test(rec.id)) return null;
    if (typeof rec.deletionToken !== "string" || !deletionTokenPattern.test(rec.deletionToken)) return null;
    return { id: rec.id, deletionToken: rec.deletionToken };
  } catch {
    return null;
  }
}

export function serializeSavedConversationCredentials(creds: SavedConversationCredentials): string {
  return JSON.stringify(creds);
}

function createDeletionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function createIdempotencyKey(): string {
  return crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "").slice(0, 8);
}

export async function saveConversationSubmission(
  messages: { role: "user" | "assistant"; content: string; sourceIds: string[] }[],
  signal?: AbortSignal,
): Promise<SavedConversationCredentials> {
  const idempotencyKey = createIdempotencyKey();
  const deletionToken = createDeletionToken();
  const body = {
    consent: { accepted: true, version: CONVERSATION_CONSENT_VERSION },
    idempotencyKey,
    deletionToken,
    messages,
  };
  const response = await fetch("/api/conversations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const json = await response.json().catch(() => null) as unknown;
  if (!response.ok || !json || typeof json !== "object" || (json as Record<string, unknown>).ok !== true) {
    const errorCode = (json as Record<string, unknown>)?.error ? ((json as Record<string, unknown>).error as Record<string, unknown>).code : null;
    if (errorCode === "HIGH_RISK_IDENTIFIER") throw new Error("HIGH_RISK_IDENTIFIER");
    throw new Error("CONVERSATION_PERSISTENCE_FAILED");
  }
  const data = (json as Record<string, unknown>).data as Record<string, unknown>;
  const id = data.id;
  if (typeof id !== "string" || !conversationRecordIdPattern.test(id)) throw new Error("CONVERSATION_PERSISTENCE_FAILED");
  return { id, deletionToken };
}

export async function deleteConversationSubmission(
  credentials: SavedConversationCredentials,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(credentials.id)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${credentials.deletionToken}` },
    signal,
  });
  if (response.status === 404) {
    const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType === "application/json") {
      const value = await response.json().catch(() => null) as unknown;
      if (value && typeof value === "object" && (value as Record<string, unknown>).ok === false) {
        const err = (value as Record<string, unknown>).error as Record<string, unknown>;
        if (err?.code === "DELETION_NOT_FOUND") return;
      }
    }
  }
  if (!response.ok) {
    const json = await response.json().catch(() => null) as unknown;
    if (json && typeof json === "object" && (json as Record<string, unknown>).ok === true) {
      const data = (json as Record<string, unknown>).data as Record<string, unknown>;
      if (data.deleted === true) return;
    }
    throw new Error("CONVERSATION_DELETION_FAILED");
  }
  const json = await response.json().catch(() => null) as unknown;
  if (!json || typeof json !== "object" || (json as Record<string, unknown>).ok !== true) throw new Error("CONVERSATION_DELETION_FAILED");
}
