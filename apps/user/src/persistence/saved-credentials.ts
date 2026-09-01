const situationRecordIdPattern = /^sit_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const deletionTokenPattern = /^[A-Za-z0-9_-]{43}$/u;

export const SAVED_SITUATION_CREDENTIALS_VERSION = 1;

export type SavedRecordCredentials = {
  id: string;
  deletionToken: string;
};

export type SavedSituationCredentialsParseResult =
  | { status: "absent" }
  | { status: "valid"; credentials: SavedRecordCredentials; needsMigration: boolean }
  | { status: "corrupt" };

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

export function parseSavedSituationCredentialsValue(value: unknown): SavedRecordCredentials | null {
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
