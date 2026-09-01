import {
  createApiErrorResponse,
  createApiSuccessResponse,
  createMethodNotAllowedResponse,
  type BackendEnv,
} from "./index";
import {
  createCapabilityNonce,
  issueSignedCapability,
  verifySignedCapability,
  type SignedCapabilityClaims,
} from "./capability";

export const SITUATION_CONSENT_VERSION = "situation-2026-08-23" as const;
export const CONVERSATION_CONSENT_VERSION = "conversation-2026-08-23" as const;
export const SITUATION_CAPABILITY_VERSION = 1 as const;

const MAX_BODY_BYTES = 48_000;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_SOURCE_IDS = 12;
const SITUATION_CAPABILITY_TTL_SECONDS = 5 * 60;
const SITUATION_CAPABILITY_SCOPE = "situation:submit";

const situationPath = "/api/situation-submissions";
const situationCapabilityPath = "/api/situation-submission-capabilities";
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
  "after_3_months",
  "no_departure_plan",
  "unknown",
]);
const returnStatuses = new Set(["possible", "difficult", "unknown"]);
const accommodations = new Set([
  "hotel",
  "family_or_friend",
  "rental",
  "temporary_facility",
  "other",
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
  "other",
  // Honest "no current need" answers are stored but never aggregated: the
  // Crisis View whitelist simply has no such category.
  "none",
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

export type PersistenceOptions = {
  now?: Date;
};

export type SituationContributionState = "accepted" | "quarantined";

export type PersistencePolicy = {
  conversationModelId: string;
  trustedConversationSourceIds: ReadonlySet<string>;
};

export type MaskedConversationMessage = {
  role: "user" | "assistant";
  content: string;
  sourceIds: string[];
};

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
  capability: string;
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

type SituationCapabilityLedger = {
  capability_version: number;
  scope: string;
  expires_at: string;
  consumed_at: string | null;
  consumed_idempotency_key_hash: string | null;
};

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; highRisk?: boolean };

export async function handleConsentedPersistenceRequest(
  request: Request,
  env: PersistenceEnv | undefined,
  options: PersistenceOptions = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  const deletionRoute = parseDeletionRoute(url.pathname);
  const routeKind = url.pathname === situationCapabilityPath
    ? "situation-capability"
    : url.pathname === situationPath
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

  if (routeKind === "situation-capability") {
    if (request.method !== "POST") return createMethodNotAllowedResponse("POST");
    if (!hasExplicitSameOrigin(request) || await requestHasNonEmptyBody(request)) return invalidOriginResponse();
    const rateLimitResponse = await enforceRateLimit(request, env, "issue:situation-capability");
    if (rateLimitResponse) return rateLimitResponse;
    return issueSituationSubmissionCapability(env, options.now ?? new Date());
  }

  if (deletionRoute) {
    if (request.method !== "DELETE") return createMethodNotAllowedResponse("DELETE");
    const rateLimitResponse = await enforceRateLimit(request, env, `delete:${deletionRoute.kind}`);
    if (rateLimitResponse) return rateLimitResponse;
    return deleteRecord(request, env.STAYBRIDGE_DB, deletionRoute.kind, deletionRoute.id);
  }

  if (routeKind === "conversation") {
    if (request.method === "DELETE") return createMethodNotAllowedResponse("DELETE");
    if (request.method !== "POST") return createMethodNotAllowedResponse("POST");
    if (!hasExplicitSameOrigin(request)) return invalidOriginResponse();
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
      return createApiErrorResponse(
        { code: "UNSUPPORTED_MEDIA_TYPE", message: "Content-Type must be application/json." },
        415,
      );
    }
    {
      const convDeclaredLength = Number(request.headers.get("content-length"));
      if (Number.isFinite(convDeclaredLength) && convDeclaredLength > MAX_BODY_BYTES) {
        return payloadTooLargeResponse();
      }
      const convRateLimit = await enforceRateLimit(request, env, `create:${routeKind}`);
      if (convRateLimit) return convRateLimit;
      const convBody = await readJsonBody(request);
      if (convBody.kind === "too-large") return payloadTooLargeResponse();
      if (convBody.kind === "invalid") {
        return createApiErrorResponse(
          { code: "INVALID_REQUEST", message: "The JSON request is invalid." },
          400,
        );
      }
      const conversationPolicy: PersistencePolicy = {
        conversationModelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        trustedConversationSourceIds: new Set([
          "OFFICIAL_1","TOKYO_CONSULTATION","ISA","FRESC","TMC_NAVI","TOKYO_FRAC","TIPS_CONSULTATIONS","TMG_CONSULTATION_KURASHI","TOKYO_FRESC_STATUS_CONSULT","TOKYO_HOUSING_SUPPORT","TOKYO_SCHOOL_ENROLL_EN","TOKYO_SCHOOL_ATTENDANCE_BOE","MEXT_SCHOOL","TIPS_SCHOOL","TOKYO_CHILDCARE_SUPPORT","TOKYO_CHILD_GUIDANCE","TOKYO_MEDICAL_INFO","TOKYO_MEDICAL_FLOW","TOKYO_MEDICAL_HIMAWARI","TOKYO_MEDICAL_TMCNAVI","TOKYO_MEDICAL_GAIKOKUGO","TOKYO_LABOR_CONSULT","TOKYO_FOREIGN_WORKERS_HANDBOOK","TOKYO_CAREER_CONSULT","HELLO_WORK_TOKYO_FOREIGNER","TIPS_JAPANESE","TIPS_LIVING_GUIDE","TIPS_PROCEDURES","TIPS_LIFE_GUIDE_JP","KEISHICHO_FOREIGN_RESIDENT_MANUAL","KITA_ELEMENTARY_SCHOOLS_OPEN_DATA","KITA_MEDICAL_INSTITUTIONS_OPEN_DATA","KITA_CHILDCARE_FACILITIES_OPEN_DATA","KITA_PUBLIC_FACILITIES_OPEN_DATA",
        ]),
      };
      const parsed = parseConversation(convBody.value, conversationPolicy);
      if (!parsed.ok) return invalidSubmissionResponse(parsed.highRisk);
      return persistConversation(env.STAYBRIDGE_DB, parsed.value);
    }
  }

  if (request.method !== "POST") return createMethodNotAllowedResponse("POST");
  if (!hasExplicitSameOrigin(request)) return invalidOriginResponse();
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
    if (!isRecord(body.value) || typeof body.value.capability !== "string") {
      return capabilityRequiredResponse();
    }
    const parsed = parseSituationSubmission(body.value);
    if (!parsed.ok) return invalidSubmissionResponse(parsed.highRisk);
    let capabilityClaims: SignedCapabilityClaims | null;
    try {
      capabilityClaims = await verifySignedCapability(
        env.SITUATION_CAPABILITY_SECRET ?? "",
        parsed.value.capability,
      );
    } catch {
      return persistenceUnavailableResponse();
    }
    if (
      !capabilityClaims
      || capabilityClaims.version !== SITUATION_CAPABILITY_VERSION
      || capabilityClaims.scope !== SITUATION_CAPABILITY_SCOPE
    ) return invalidCapabilityResponse();
    return persistSituation(
      env.STAYBRIDGE_DB,
      parsed.value,
      capabilityClaims,
      options.now ?? new Date(),
    );
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
  if (!isRecord(value) || !hasOnlyKeys(value, ["consent", "idempotencyKey", "deletionToken", "capability", "answers"])) return { ok: false };
  if (!hasConsent(value.consent, SITUATION_CONSENT_VERSION)) return { ok: false };
  if (
    !isIdempotencyKey(value.idempotencyKey)
    || !isDeletionToken(value.deletionToken)
    || typeof value.capability !== "string"
    || value.capability.length > 1_024
  ) return { ok: false };
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
      capability: value.capability,
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

async function persistSituation(
  db: D1Database,
  submission: ParsedSituationSubmission,
  capability: SignedCapabilityClaims,
  now: Date,
): Promise<Response> {
  const createdAt = now.toISOString();
  const idempotencyHash = await sha256(submission.idempotencyKey);
  const deletionTokenHash = await sha256(submission.deletionToken);
  const payloadHash = await sha256(JSON.stringify(submission.answers));
  const capabilityNonceHash = await sha256(capability.nonce);
  const capabilityExpiresAt = new Date(capability.expiresAt * 1_000).toISOString();
  let duplicate: ExistingRecord | null;
  try {
    duplicate = await findExisting(db, "situation_submissions", idempotencyHash);
  } catch {
    return persistenceUnavailableResponse();
  }
  if (duplicate) {
    if (!isExactDuplicate(duplicate, payloadHash, deletionTokenHash)) {
      return duplicateResponse(duplicate, payloadHash, deletionTokenHash);
    }
    return authorizeSituationDuplicate(
      db,
      duplicate,
      capability,
      capabilityNonceHash,
      capabilityExpiresAt,
      idempotencyHash,
      createdAt,
    );
  }
  if (capability.expiresAt <= Math.floor(now.getTime() / 1_000)) return invalidCapabilityResponse();

  const id = `sit_${crypto.randomUUID()}`;
  try {
    const results = await db.batch([
      db.prepare(
      `INSERT INTO situation_submissions (
        id, consent_version, consented_at, municipality_code, visit_purpose,
        departure_window, return_status, family_age_groups_json, accommodation,
        needs_json, japanese_level, deletion_token_hash, idempotency_key_hash,
        payload_hash, created_at, contribution_state, capability_nonce_hash
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted', capability.nonce_hash
      FROM situation_submission_capabilities AS capability
      WHERE capability.nonce_hash = ?
        AND capability.capability_version = ?
        AND capability.scope = ?
        AND capability.expires_at = ?
        AND capability.consumed_at IS NULL
        AND capability.expires_at > ?`,
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
        capabilityNonceHash,
        SITUATION_CAPABILITY_VERSION,
        SITUATION_CAPABILITY_SCOPE,
        capabilityExpiresAt,
        createdAt,
      ),
      db.prepare(
        `UPDATE situation_submission_capabilities
         SET consumed_at = ?, consumed_idempotency_key_hash = ?
         WHERE nonce_hash = ?
           AND capability_version = ?
           AND scope = ?
           AND expires_at = ?
           AND consumed_at IS NULL
           AND consumed_idempotency_key_hash IS NULL
           AND expires_at > ?`,
      ).bind(
        createdAt,
        idempotencyHash,
        capabilityNonceHash,
        SITUATION_CAPABILITY_VERSION,
        SITUATION_CAPABILITY_SCOPE,
        capabilityExpiresAt,
        createdAt,
      ),
    ]);
    if ((results[0]?.meta.changes ?? 0) === 1 && (results[1]?.meta.changes ?? 0) === 1) {
      return createApiSuccessResponse({ id, created: true, consentVersion: SITUATION_CONSENT_VERSION }, { status: 201 });
    }
    const racedDuplicate = await findExisting(db, "situation_submissions", idempotencyHash).catch(() => null);
    if (racedDuplicate) {
      if (!isExactDuplicate(racedDuplicate, payloadHash, deletionTokenHash)) {
        return duplicateResponse(racedDuplicate, payloadHash, deletionTokenHash);
      }
      return authorizeSituationDuplicate(
        db,
        racedDuplicate,
        capability,
        capabilityNonceHash,
        capabilityExpiresAt,
        idempotencyHash,
        createdAt,
      );
    }
    return invalidCapabilityResponse();
  } catch {
    const racedDuplicate = await findExisting(db, "situation_submissions", idempotencyHash).catch(() => null);
    if (racedDuplicate) {
      if (!isExactDuplicate(racedDuplicate, payloadHash, deletionTokenHash)) {
        return duplicateResponse(racedDuplicate, payloadHash, deletionTokenHash);
      }
      return authorizeSituationDuplicate(
        db,
        racedDuplicate,
        capability,
        capabilityNonceHash,
        capabilityExpiresAt,
        idempotencyHash,
        createdAt,
      );
    }
    return persistenceUnavailableResponse();
  }
}

async function authorizeSituationDuplicate(
  db: D1Database,
  duplicate: ExistingRecord,
  capability: SignedCapabilityClaims,
  capabilityNonceHash: string,
  capabilityExpiresAt: string,
  idempotencyHash: string,
  now: string,
): Promise<Response> {
  let ledger: SituationCapabilityLedger | null;
  try {
    ledger = await findSituationCapability(db, capabilityNonceHash);
  } catch {
    return persistenceUnavailableResponse();
  }
  if (!matchesIssuedCapability(ledger, capability, capabilityExpiresAt)) {
    return invalidCapabilityResponse();
  }
  if (ledger.consumed_at !== null) {
    return ledger.consumed_idempotency_key_hash === idempotencyHash
      ? duplicateResponse(duplicate, duplicate.payload_hash, duplicate.deletion_token_hash)
      : invalidCapabilityResponse();
  }
  if (ledger.consumed_idempotency_key_hash !== null || ledger.expires_at <= now) {
    return invalidCapabilityResponse();
  }

  try {
    const result = await db.prepare(
      `UPDATE situation_submission_capabilities
       SET consumed_at = ?, consumed_idempotency_key_hash = ?
       WHERE nonce_hash = ?
         AND capability_version = ?
         AND scope = ?
         AND expires_at = ?
         AND consumed_at IS NULL
         AND consumed_idempotency_key_hash IS NULL
         AND expires_at > ?`,
    ).bind(
      now,
      idempotencyHash,
      capabilityNonceHash,
      capability.version,
      capability.scope,
      capabilityExpiresAt,
      now,
    ).run();
    if ((result.meta.changes ?? 0) === 1) {
      return duplicateResponse(duplicate, duplicate.payload_hash, duplicate.deletion_token_hash);
    }
    const racedLedger = await findSituationCapability(db, capabilityNonceHash);
    return matchesIssuedCapability(racedLedger, capability, capabilityExpiresAt)
      && racedLedger?.consumed_idempotency_key_hash === idempotencyHash
      ? duplicateResponse(duplicate, duplicate.payload_hash, duplicate.deletion_token_hash)
      : invalidCapabilityResponse();
  } catch {
    return persistenceUnavailableResponse();
  }
}

function matchesIssuedCapability(
  ledger: SituationCapabilityLedger | null,
  capability: SignedCapabilityClaims,
  capabilityExpiresAt: string,
): ledger is SituationCapabilityLedger {
  return ledger !== null
    && ledger.capability_version === capability.version
    && ledger.scope === capability.scope
    && ledger.expires_at === capabilityExpiresAt;
}

async function issueSituationSubmissionCapability(
  env: PersistenceEnv,
  now: Date,
): Promise<Response> {
  const secret = env.SITUATION_CAPABILITY_SECRET ?? "";
  const expiresAtSeconds = Math.floor(now.getTime() / 1_000) + SITUATION_CAPABILITY_TTL_SECONDS;
  const claims: SignedCapabilityClaims = {
    version: SITUATION_CAPABILITY_VERSION,
    expiresAt: expiresAtSeconds,
    nonce: createCapabilityNonce(),
    scope: SITUATION_CAPABILITY_SCOPE,
  };
  let capability: string;
  try {
    capability = await issueSignedCapability(secret, claims);
    const results = await env.STAYBRIDGE_DB.batch([
      env.STAYBRIDGE_DB.prepare(
        `DELETE FROM situation_submission_capabilities
         WHERE nonce_hash IN (
           SELECT nonce_hash FROM situation_submission_capabilities
           WHERE expires_at <= ?
           ORDER BY expires_at ASC
           LIMIT 100
         )`,
      ).bind(now.toISOString()),
      env.STAYBRIDGE_DB.prepare(
        `INSERT INTO situation_submission_capabilities (
          nonce_hash, capability_version, scope, expires_at, issued_at,
          consumed_at, consumed_idempotency_key_hash
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
      ).bind(
        await sha256(claims.nonce),
        claims.version,
        claims.scope,
        new Date(claims.expiresAt * 1_000).toISOString(),
        now.toISOString(),
      ),
    ]);
    if ((results[1]?.meta.changes ?? 0) !== 1) throw new Error("CAPABILITY_NOT_RECORDED");
  } catch {
    return persistenceUnavailableResponse();
  }
  return createApiSuccessResponse({
    capability,
    expiresAt: new Date(claims.expiresAt * 1_000).toISOString(),
  }, { status: 201 });
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
        { code: "DELETION_NOT_FOUND", message: "No matching record was found." },
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

async function findSituationCapability(
  db: D1Database,
  nonceHash: string,
): Promise<SituationCapabilityLedger | null> {
  return db.prepare(
    `SELECT capability_version, scope, expires_at, consumed_at, consumed_idempotency_key_hash
     FROM situation_submission_capabilities
     WHERE nonce_hash = ?`,
  ).bind(nonceHash).first<SituationCapabilityLedger>();
}

function isExactDuplicate(existing: ExistingRecord, payloadHash: string, deletionTokenHash: string): boolean {
  return existing.payload_hash === payloadHash && existing.deletion_token_hash === deletionTokenHash;
}

function duplicateResponse(existing: ExistingRecord, payloadHash: string, deletionTokenHash: string): Response {
  if (!isExactDuplicate(existing, payloadHash, deletionTokenHash)) {
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

function hasExplicitSameOrigin(request: Request): boolean {
  return request.headers.get("origin") === new URL(request.url).origin;
}

async function requestHasNonEmptyBody(request: Request): Promise<boolean> {
  if (!request.body) return false;
  const reader = request.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return false;
      if (value.byteLength > 0) {
        await reader.cancel("Request bodies are not accepted");
        return true;
      }
    }
  } finally {
    reader.releaseLock();
  }
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

function invalidOriginResponse(): Response {
  return createApiErrorResponse(
    { code: "INVALID_REQUEST", message: "The request origin is not allowed." },
    400,
  );
}

function capabilityRequiredResponse(): Response {
  return createApiErrorResponse(
    { code: "CAPABILITY_REQUIRED", message: "A valid submission capability is required." },
    400,
  );
}

function invalidCapabilityResponse(): Response {
  return createApiErrorResponse(
    { code: "INVALID_CAPABILITY", message: "The submission capability is invalid or expired." },
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
