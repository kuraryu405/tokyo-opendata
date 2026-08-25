import {
  createApiErrorResponse,
  createApiSuccessResponse,
  createMethodNotAllowedResponse,
  type BackendEnv,
} from "./index";

export const SITUATION_CONSENT_VERSION = "situation-2026-08-23" as const;
export const CONVERSATION_CONSENT_VERSION = "conversation-2026-08-23" as const;

const MAX_BODY_BYTES = 48_000;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_SOURCE_IDS = 12;

const situationPath = "/api/situation-submissions";
const conversationPath = "/api/conversations";

const visitPurposes = new Set([
  "tourism",
  "visiting_family_or_friends",
  "work",
  "study",
  "resident",
  "other",
  "unknown",
]);
const departureWindows = new Set([
  "within_7_days",
  "within_30_days",
  "within_3_months",
  "no_departure_plan",
  "unknown",
]);
const returnStatuses = new Set(["possible", "difficult", "unknown"]);
const accommodations = new Set([
  "hotel",
  "family_or_friend",
  "rental",
  "temporary_facility",
  "unstable",
  "prefer_not_to_say",
]);
const needs = new Set([
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
const japaneseLevels = new Set(["none", "beginner", "daily", "advanced"]);
const ageGroups = new Set(["0-2", "3-5", "6-11", "12-14", "15-17", "18+"]);

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const phonePattern = /(?<![A-Z0-9])(?:\+?81[-\s()]?|0)\d(?:[-\s()]?\d){8,10}(?![A-Z0-9])/giu;
const internationalPhonePattern = /(?<![A-Z0-9])\+(?:\d[-\s().]?){8,14}\d(?![A-Z0-9])/gu;
const postalCodePattern = /〒?\s*\d{3}[-ー−]\d{4}/gu;
const japaneseAddressPattern = /(?:東京都|道府県|都|道|府|県|市|区|町|村)[^\n,，。]{0,32}(?:丁目|番地?|号)(?:[-ー−]?\d+){0,3}/gu;
const japaneseBlockAddressPattern = /(?:東京都|北海道|(?:京都|大阪)府|.{2,3}県|.{1,8}[市区町村])[^\n,，。]{0,40}\d{1,4}(?:[-ー−]\d{1,4}){1,3}/gu;
const englishAddressPattern = /\b\d{1,5}\s+[\p{L}\d.'-]+(?:\s+[\p{L}\d.'-]+){0,4}\s+(?:street|st\.?|avenue|ave\.?|road|rd\.?|lane|ln\.?|drive|dr\.?|boulevard|blvd\.?|parkway|pkwy\.?|highway|hwy\.?|court|ct\.?|place|pl\.?|terrace|ter\.?)\b/giu;
const passportLabelPattern = /(?:passport|旅券|パスポート)\s*(?:number|no\.?|番号|#|：|:)?\s*(?:[A-Z0-9][\s-]*){6,16}/iu;
const residenceLabelPattern = /(?:residence\s*card|在留カード)\s*(?:number|no\.?|番号|#|：|:)?\s*(?:[A-Z0-9][\s-]*){8,18}/iu;
const residenceCardLikePattern = /\b[A-Z]{2}(?:[\s-]*\d){8}[\s-]*[A-Z]{2}\b/iu;
const passportLikePattern = /\b[A-Z]{1,2}(?:[\s-]*\d){7,8}\b/iu;

export interface PersistenceRateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface PersistenceEnv extends BackendEnv {
  PERSISTENCE_RATE_LIMITER?: PersistenceRateLimiter;
}

export type PersistencePolicy = {
  conversationModelId: string;
  trustedConversationSourceIds: ReadonlySet<string>;
};

export type MaskedConversationMessage = {
  role: "user" | "assistant";
  content: string;
  sourceIds: string[];
};

export type ConversationRecoveryResult =
  | { status: "absent" }
  | { status: "recovered"; id: string; reply: string }
  | { status: "invalid" | "conflict" | "unavailable" };

type SituationAnswers = {
  municipalityCode: string | null;
  visitPurpose: string;
  departureWindow: string;
  returnStatus: string;
  familyAgeGroups: string[];
  accommodation: string;
  needs: string[];
  japaneseLevel: string;
};

type ParsedSituationSubmission = {
  idempotencyKey: string;
  deletionToken: string;
  answers: SituationAnswers;
};

type ParsedConversation = {
  idempotencyKey: string;
  deletionToken: string;
  modelId: string;
  messages: MaskedConversationMessage[];
};

type ExistingRecord = {
  id: string;
  payload_hash: string;
  deletion_token_hash: string;
};

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; highRisk?: boolean };

export async function handleConsentedPersistenceRequest(
  request: Request,
  env: PersistenceEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  const deletionRoute = parseDeletionRoute(url.pathname);
  const routeKind = url.pathname === situationPath
    ? "situation"
    : url.pathname === conversationPath
      ? "conversation"
      : deletionRoute?.kind;

  if (!routeKind) return null;
  if (!env) return persistenceUnavailableResponse();

  if (!isSameOrigin(request)) {
    return createApiErrorResponse(
      { code: "INVALID_REQUEST", message: "The request origin is not allowed." },
      400,
    );
  }

  if (deletionRoute) {
    if (request.method !== "DELETE") return createMethodNotAllowedResponse("DELETE");
    const rateLimitResponse = await enforceRateLimit(request, env, `delete:${deletionRoute.kind}`);
    if (rateLimitResponse) return rateLimitResponse;
    return deleteRecord(request, env.STAYBRIDGE_DB, deletionRoute.kind, deletionRoute.id);
  }

  // Conversation creation remains server-internal until #62 owns assistant
  // generation and provenance. Browser-authored assistant/model/source content
  // must never be promoted to trusted conversation records.
  if (routeKind === "conversation") return createMethodNotAllowedResponse("DELETE");

  if (request.method !== "POST") return createMethodNotAllowedResponse("POST");
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return createApiErrorResponse(
      { code: "UNSUPPORTED_MEDIA_TYPE", message: "Content-Type must be application/json." },
      415,
    );
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return payloadTooLargeResponse();
  }

  const rateLimitResponse = await enforceRateLimit(request, env, `create:${routeKind}`);
  if (rateLimitResponse) return rateLimitResponse;

  const body = await readJsonBody(request);
  if (body.kind === "too-large") return payloadTooLargeResponse();
  if (body.kind === "invalid") {
    return createApiErrorResponse(
      { code: "INVALID_REQUEST", message: "The JSON request is invalid." },
      400,
    );
  }

  if (routeKind === "situation") {
    const parsed = parseSituationSubmission(body.value);
    if (!parsed.ok) return invalidSubmissionResponse(parsed.highRisk);
    return persistSituation(env.STAYBRIDGE_DB, parsed.value);
  }

  return null;
}

/**
 * Server-only persistence boundary for #62's verified, server-generated
 * assistant response. It is intentionally not exposed by a public creation
 * route and still validates, normalizes, and masks every message.
 */
export async function persistVerifiedConversation(
  db: D1Database,
  value: unknown,
  policy: PersistencePolicy,
): Promise<Response> {
  const parsed = parseConversation(value, policy);
  if (!parsed.ok) return invalidSubmissionResponse(parsed.highRisk);
  return persistConversation(db, parsed.value);
}

/**
 * Recovers a prior support-chat turn after the HTTP response was lost. The
 * browser never supplies a trusted assistant message: the reply comes back
 * only from the server-written conversation_messages row.
 */
export async function recoverVerifiedConversation(
  db: D1Database,
  value: unknown,
  policy: Pick<PersistencePolicy, "conversationModelId">,
): Promise<ConversationRecoveryResult> {
  const parsed = parseConversationRecovery(value, policy);
  if (!parsed) return { status: "invalid" };
  const idempotencyHash = await sha256(parsed.idempotencyKey);
  const deletionTokenHash = await sha256(parsed.deletionToken);

  try {
    const existing = await db.prepare(
      `SELECT id, deletion_token_hash, model_id
       FROM conversations WHERE idempotency_key_hash = ?`,
    ).bind(idempotencyHash).first<{
      id: string;
      deletion_token_hash: string;
      model_id: string;
    }>();
    if (!existing) return { status: "absent" };
    if (
      existing.deletion_token_hash !== deletionTokenHash
      || existing.model_id !== policy.conversationModelId
      || !/^con_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(existing.id)
    ) return { status: "conflict" };

    const [storedUser, storedAssistant] = await Promise.all([
      db.prepare(
        `SELECT role, masked_content FROM conversation_messages
         WHERE conversation_id = ? AND message_index = 0`,
      ).bind(existing.id).first<{ role: string; masked_content: string }>(),
      db.prepare(
        `SELECT role, masked_content FROM conversation_messages
         WHERE conversation_id = ? AND message_index = 1`,
      ).bind(existing.id).first<{ role: string; masked_content: string }>(),
    ]);
    if (
      storedUser?.role !== "user"
      || storedUser.masked_content !== parsed.maskedUserContent
      || storedAssistant?.role !== "assistant"
      || !storedAssistant.masked_content
    ) return { status: "conflict" };
    return { status: "recovered", id: existing.id, reply: storedAssistant.masked_content };
  } catch {
    return { status: "unavailable" };
  }
}

export function prepareLlmBoundMessages(
  value: unknown,
  trustedSourceIds: ReadonlySet<string>,
): ParseResult<MaskedConversationMessage[]> {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_MESSAGES) return { ok: false };

  const messages: MaskedConversationMessage[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isRecord(item) || !hasOnlyKeys(item, ["role", "content", "sourceIds"])) return { ok: false };
    const expectedRole: "user" | "assistant" = index % 2 === 0 ? "user" : "assistant";
    if (item.role !== expectedRole || typeof item.content !== "string") return { ok: false };
    const content = item.content.normalize("NFKC").trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH) return { ok: false };
    if (containsRejectedIdentifier(content)) return { ok: false, highRisk: true };

    const sourceIds = item.sourceIds === undefined ? [] : parseSourceIds(item.sourceIds, trustedSourceIds);
    if (!sourceIds || (item.role === "user" && sourceIds.length > 0)) return { ok: false };
    messages.push({ role: expectedRole, content: maskDetectableContactData(content), sourceIds });
  }
  return { ok: true, value: messages };
}

export function maskDetectableContactData(value: string): string {
  return value
    .normalize("NFKC")
    .replace(emailPattern, "[REDACTED_EMAIL]")
    .replace(phonePattern, "[REDACTED_PHONE]")
    .replace(internationalPhonePattern, "[REDACTED_PHONE]")
    .replace(postalCodePattern, "[REDACTED_ADDRESS]")
    .replace(japaneseAddressPattern, "[REDACTED_ADDRESS]")
    .replace(japaneseBlockAddressPattern, "[REDACTED_ADDRESS]")
    .replace(englishAddressPattern, "[REDACTED_ADDRESS]");
}

function parseSituationSubmission(value: unknown): ParseResult<ParsedSituationSubmission> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["consent", "idempotencyKey", "deletionToken", "answers"])) return { ok: false };
  if (!hasConsent(value.consent, SITUATION_CONSENT_VERSION)) return { ok: false };
  if (!isIdempotencyKey(value.idempotencyKey) || !isDeletionToken(value.deletionToken)) return { ok: false };
  if (!isRecord(value.answers) || !hasOnlyKeys(value.answers, [
    "municipalityCode",
    "visitPurpose",
    "departureWindow",
    "returnStatus",
    "familyAgeGroups",
    "accommodation",
    "needs",
    "japaneseLevel",
  ])) return { ok: false };

  const answers = value.answers;
  const municipalityCode = answers.municipalityCode;
  if (municipalityCode !== null && (typeof municipalityCode !== "string" || !/^13\d{3}$/.test(municipalityCode))) return { ok: false };
  if (!isSetValue(answers.visitPurpose, visitPurposes)) return { ok: false };
  if (!isSetValue(answers.departureWindow, departureWindows)) return { ok: false };
  if (!isSetValue(answers.returnStatus, returnStatuses)) return { ok: false };
  if (!isSetValue(answers.accommodation, accommodations)) return { ok: false };
  if (!isSetValue(answers.japaneseLevel, japaneseLevels)) return { ok: false };
  const familyAgeGroups = parseSetArray(answers.familyAgeGroups, ageGroups, 6);
  const selectedNeeds = parseSetArray(answers.needs, needs, 10);
  if (!familyAgeGroups || !selectedNeeds) return { ok: false };

  return {
    ok: true,
    value: {
      idempotencyKey: value.idempotencyKey,
      deletionToken: value.deletionToken,
      answers: {
        municipalityCode,
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

function parseConversation(value: unknown, policy: PersistencePolicy): ParseResult<ParsedConversation> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["consent", "idempotencyKey", "deletionToken", "messages"])) return { ok: false };
  if (!hasConsent(value.consent, CONVERSATION_CONSENT_VERSION)) return { ok: false };
  if (!isIdempotencyKey(value.idempotencyKey) || !isDeletionToken(value.deletionToken)) return { ok: false };
  if (!/^[A-Za-z0-9@._:/-]{1,120}$/.test(policy.conversationModelId)) return { ok: false };
  const messages = prepareLlmBoundMessages(value.messages, policy.trustedConversationSourceIds);
  if (!messages.ok) return messages;
  return {
    ok: true,
    value: {
      idempotencyKey: value.idempotencyKey,
      deletionToken: value.deletionToken,
      modelId: policy.conversationModelId,
      messages: messages.value,
    },
  };
}

function parseConversationRecovery(
  value: unknown,
  policy: Pick<PersistencePolicy, "conversationModelId">,
): { idempotencyKey: string; deletionToken: string; maskedUserContent: string } | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["consent", "idempotencyKey", "deletionToken", "userContent"])) return null;
  if (!hasConsent(value.consent, CONVERSATION_CONSENT_VERSION)) return null;
  if (!isIdempotencyKey(value.idempotencyKey) || !isDeletionToken(value.deletionToken)) return null;
  if (!/^[A-Za-z0-9@._:/-]{1,120}$/.test(policy.conversationModelId)) return null;
  if (typeof value.userContent !== "string") return null;
  const userContent = value.userContent.normalize("NFKC").trim();
  if (!userContent || userContent.length > MAX_MESSAGE_LENGTH || containsRejectedIdentifier(userContent)) return null;
  return {
    idempotencyKey: value.idempotencyKey,
    deletionToken: value.deletionToken,
    maskedUserContent: maskDetectableContactData(userContent),
  };
}

async function persistSituation(db: D1Database, submission: ParsedSituationSubmission): Promise<Response> {
  const createdAt = new Date().toISOString();
  const idempotencyHash = await sha256(submission.idempotencyKey);
  const deletionTokenHash = await sha256(submission.deletionToken);
  const payloadHash = await sha256(JSON.stringify(submission.answers));
  let duplicate: ExistingRecord | null;
  try {
    duplicate = await findExisting(db, "situation_submissions", idempotencyHash);
  } catch {
    return persistenceUnavailableResponse();
  }
  if (duplicate) return duplicateResponse(duplicate, payloadHash, deletionTokenHash);

  const id = `sit_${crypto.randomUUID()}`;
  try {
    await db.prepare(
      `INSERT INTO situation_submissions (
        id, consent_version, consented_at, municipality_code, visit_purpose,
        departure_window, return_status, family_age_groups_json, accommodation,
        needs_json, japanese_level, deletion_token_hash, idempotency_key_hash,
        payload_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      SITUATION_CONSENT_VERSION,
      createdAt,
      submission.answers.municipalityCode,
      submission.answers.visitPurpose,
      submission.answers.departureWindow,
      submission.answers.returnStatus,
      JSON.stringify(submission.answers.familyAgeGroups),
      submission.answers.accommodation,
      JSON.stringify(submission.answers.needs),
      submission.answers.japaneseLevel,
      deletionTokenHash,
      idempotencyHash,
      payloadHash,
      createdAt,
    ).run();
    return createApiSuccessResponse({ id, created: true, consentVersion: SITUATION_CONSENT_VERSION }, { status: 201 });
  } catch {
    const racedDuplicate = await findExisting(db, "situation_submissions", idempotencyHash).catch(() => null);
    if (racedDuplicate) return duplicateResponse(racedDuplicate, payloadHash, deletionTokenHash);
    return persistenceUnavailableResponse();
  }
}

async function persistConversation(db: D1Database, conversation: ParsedConversation): Promise<Response> {
  const createdAt = new Date().toISOString();
  const idempotencyHash = await sha256(conversation.idempotencyKey);
  const deletionTokenHash = await sha256(conversation.deletionToken);
  const payloadHash = await sha256(JSON.stringify({ modelId: conversation.modelId, messages: conversation.messages }));
  let duplicate: ExistingRecord | null;
  try {
    duplicate = await findExisting(db, "conversations", idempotencyHash);
  } catch {
    return persistenceUnavailableResponse();
  }
  if (duplicate) return duplicateResponse(duplicate, payloadHash, deletionTokenHash);

  const id = `con_${crypto.randomUUID()}`;
  const statements = [
    db.prepare(
      `INSERT INTO conversations (
        id, consent_version, consented_at, model_id, deletion_token_hash,
        idempotency_key_hash, payload_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      CONVERSATION_CONSENT_VERSION,
      createdAt,
      conversation.modelId,
      deletionTokenHash,
      idempotencyHash,
      payloadHash,
      createdAt,
    ),
    ...conversation.messages.map((message, index) => db.prepare(
      `INSERT INTO conversation_messages (
        id, conversation_id, message_index, role, masked_content,
        source_ids_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      `msg_${crypto.randomUUID()}`,
      id,
      index,
      message.role,
      message.content,
      JSON.stringify(message.sourceIds),
      createdAt,
    )),
  ];

  try {
    await db.batch(statements);
    return createApiSuccessResponse({ id, created: true, consentVersion: CONVERSATION_CONSENT_VERSION }, { status: 201 });
  } catch {
    const racedDuplicate = await findExisting(db, "conversations", idempotencyHash).catch(() => null);
    if (racedDuplicate) return duplicateResponse(racedDuplicate, payloadHash, deletionTokenHash);
    return persistenceUnavailableResponse();
  }
}

async function deleteRecord(
  request: Request,
  db: D1Database,
  kind: "situation" | "conversation",
  id: string,
): Promise<Response> {
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) {
    return createApiErrorResponse(
      { code: "INVALID_REQUEST", message: "A deletion token is required." },
      400,
    );
  }

  const tokenHash = await sha256(token);
  try {
    let result: D1Result;
    if (kind === "conversation") {
      const results = await db.batch([
        db.prepare(
          `DELETE FROM conversation_messages
           WHERE conversation_id IN (
             SELECT id FROM conversations WHERE id = ? AND deletion_token_hash = ?
           )`,
        ).bind(id, tokenHash),
        db.prepare("DELETE FROM conversations WHERE id = ? AND deletion_token_hash = ?").bind(id, tokenHash),
      ]);
      result = results[1];
    } else {
      result = await db.prepare(
        "DELETE FROM situation_submissions WHERE id = ? AND deletion_token_hash = ?",
      ).bind(id, tokenHash).run();
    }
    if ((result.meta.changes ?? 0) < 1) {
      return createApiErrorResponse(
        { code: "NOT_FOUND", message: "No matching record was found." },
        404,
      );
    }
    return createApiSuccessResponse({ deleted: true });
  } catch {
    return persistenceUnavailableResponse();
  }
}

async function findExisting(db: D1Database, table: "situation_submissions" | "conversations", idempotencyHash: string): Promise<ExistingRecord | null> {
  return db.prepare(
    `SELECT id, payload_hash, deletion_token_hash FROM ${table} WHERE idempotency_key_hash = ?`,
  ).bind(idempotencyHash).first<ExistingRecord>();
}

function duplicateResponse(existing: ExistingRecord, payloadHash: string, deletionTokenHash: string): Response {
  if (existing.payload_hash !== payloadHash || existing.deletion_token_hash !== deletionTokenHash) {
    return createApiErrorResponse(
      { code: "DUPLICATE_CONFLICT", message: "The idempotency key was already used for a different request." },
      409,
    );
  }
  return createApiSuccessResponse({ id: existing.id, created: false });
}

async function enforceRateLimit(request: Request, env: PersistenceEnv, route: string): Promise<Response | null> {
  if (!env.PERSISTENCE_RATE_LIMITER) return persistenceUnavailableResponse();
  const actor = request.headers.get("cf-connecting-ip") ?? "local";
  try {
    const result = await env.PERSISTENCE_RATE_LIMITER.limit({ key: `consented-persistence:${route}:${actor}` });
    if (result.success) return null;
    return createApiErrorResponse(
      { code: "RATE_LIMITED", message: "Too many requests. Please try again later." },
      429,
      { headers: { "Retry-After": "60" } },
    );
  } catch {
    return persistenceUnavailableResponse();
  }
}

function parseDeletionRoute(pathname: string): { kind: "situation" | "conversation"; id: string } | null {
  const match = pathname.match(/^\/api\/(situation-submissions|conversations)\/((?:sit|con)_[0-9a-f-]{36})$/i);
  if (!match) return null;
  const kind = match[1] === "situation-submissions" ? "situation" : "conversation";
  if ((kind === "situation" && !match[2].startsWith("sit_")) || (kind === "conversation" && !match[2].startsWith("con_"))) return null;
  return { kind, id: match[2] };
}

export function containsRejectedIdentifier(value: string): boolean {
  return passportLabelPattern.test(value)
    || residenceLabelPattern.test(value)
    || residenceCardLikePattern.test(value)
    || passportLikePattern.test(value);
}

function hasConsent(value: unknown, expectedVersion: string): boolean {
  return isRecord(value)
    && hasOnlyKeys(value, ["accepted", "version"])
    && value.accepted === true
    && value.version === expectedVersion;
}

function parseSourceIds(value: unknown, trustedSourceIds: ReadonlySet<string>): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_SOURCE_IDS) return null;
  const result: string[] = [];
  for (const item of value) {
    if (
      typeof item !== "string"
      || !/^[A-Za-z0-9_:/.-]{1,80}$/.test(item)
      || result.includes(item)
      || !trustedSourceIds.has(item)
    ) return null;
    result.push(item);
  }
  return result;
}

function parseSetArray(value: unknown, allowed: Set<string>, max: number): string[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const result: string[] = [];
  for (const item of value) {
    if (!isSetValue(item, allowed) || result.includes(item)) return null;
    result.push(item);
  }
  return result;
}

function isSetValue(value: unknown, allowed: Set<string>): value is string {
  return typeof value === "string" && allowed.has(value);
}

function isIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

function isDeletionToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key)) && keys.every((key) => key in value || key === "sourceIds");
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function readJsonBody(request: Request): Promise<
  | { kind: "valid"; value: unknown }
  | { kind: "invalid" }
  | { kind: "too-large" }
> {
  if (!request.body) return { kind: "invalid" };
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_BODY_BYTES) {
        await reader.cancel("PAYLOAD_TOO_LARGE");
        return { kind: "too-large" };
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } catch {
    return { kind: "invalid" };
  } finally {
    reader.releaseLock();
  }
  try {
    return { kind: "valid", value: JSON.parse(body) };
  } catch {
    return { kind: "invalid" };
  }
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function invalidSubmissionResponse(highRisk = false): Response {
  return createApiErrorResponse(
    highRisk
      ? { code: "HIGH_RISK_IDENTIFIER", message: "Remove passport or residence-card identifiers before continuing." }
      : { code: "CONSENT_REQUIRED", message: "Valid consent and a valid request are required." },
    400,
  );
}

function payloadTooLargeResponse(): Response {
  return createApiErrorResponse(
    { code: "PAYLOAD_TOO_LARGE", message: "The request is too large." },
    413,
  );
}

function persistenceUnavailableResponse(): Response {
  return createApiErrorResponse(
    { code: "SERVICE_UNAVAILABLE", message: "The service is temporarily unavailable." },
    503,
  );
}
