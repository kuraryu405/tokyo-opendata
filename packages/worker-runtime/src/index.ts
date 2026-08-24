export type StayBridgeService = "user" | "municipality";

export const BACKEND_DATABASE_BINDING = "STAYBRIDGE_DB" as const;

export interface RevisionEnv {
  APP_REVISION?: string;
}

export interface BackendEnv extends RevisionEnv {
  STAYBRIDGE_DB: D1Database;
}

export interface ApiError {
  code:
    | "CONSENT_REQUIRED"
    | "DUPLICATE_CONFLICT"
    | "HIGH_RISK_IDENTIFIER"
    | "INVALID_REQUEST"
    | "METHOD_NOT_ALLOWED"
    | "NOT_FOUND"
    | "PAYLOAD_TOO_LARGE"
    | "RATE_LIMITED"
    | "SERVICE_UNAVAILABLE"
    | "UNSUPPORTED_MEDIA_TYPE";
  message: string;
}

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

const API_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=UTF-8",
};

export function createApiSuccessResponse<T>(
  data: T,
  init: ResponseInit = {},
): Response {
  return Response.json(
    { ok: true, data } satisfies ApiResponse<T>,
    withApiHeaders(init),
  );
}

export function createApiErrorResponse(
  error: ApiError,
  status: 400 | 404 | 405 | 409 | 413 | 415 | 429 | 503,
  init: ResponseInit = {},
): Response {
  return Response.json(
    { ok: false, error } satisfies ApiResponse<never>,
    withApiHeaders({ ...init, status }),
  );
}

export function createMethodNotAllowedResponse(allowedMethod = "GET"): Response {
  return createApiErrorResponse(
    {
      code: "METHOD_NOT_ALLOWED",
      message: `Only ${allowedMethod} is supported for this endpoint.`,
    },
    405,
    { headers: { Allow: allowedMethod } },
  );
}

export function createHealthResponse(
  env: RevisionEnv | undefined,
  service: StayBridgeService,
): Response {
  const revision = env?.APP_REVISION?.trim() || "local";

  return Response.json(
    { status: "ok", service, revision },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export type ReadinessService = StayBridgeService;

type ReadinessSchema = Readonly<Record<string, readonly string[]>>;

const BACKEND_METADATA_COLUMNS = ["key", "value", "updated_at"] as const;
const SITUATION_SUBMISSIONS_COLUMNS = [
  "id",
  "consent_version",
  "consented_at",
  "municipality_code",
  "visit_purpose",
  "departure_window",
  "return_status",
  "family_age_groups_json",
  "accommodation",
  "needs_json",
  "japanese_level",
  "deletion_token_hash",
  "idempotency_key_hash",
  "payload_hash",
  "created_at",
] as const;
const CONVERSATIONS_COLUMNS = [
  "id",
  "consent_version",
  "consented_at",
  "model_id",
  "deletion_token_hash",
  "idempotency_key_hash",
  "payload_hash",
  "created_at",
] as const;
const CONVERSATION_MESSAGES_COLUMNS = [
  "id",
  "conversation_id",
  "message_index",
  "role",
  "masked_content",
  "source_ids_json",
  "created_at",
] as const;

const READINESS_REQUIRED_COLUMNS: Record<ReadinessService, ReadinessSchema> = {
  user: {
    backend_metadata: BACKEND_METADATA_COLUMNS,
    situation_submissions: SITUATION_SUBMISSIONS_COLUMNS,
    conversations: CONVERSATIONS_COLUMNS,
    conversation_messages: CONVERSATION_MESSAGES_COLUMNS,
  },
  municipality: {
    backend_metadata: BACKEND_METADATA_COLUMNS,
    situation_submissions: SITUATION_SUBMISSIONS_COLUMNS,
  },
};

export async function createReadinessResponse(
  env: Pick<BackendEnv, "STAYBRIDGE_DB"> | undefined,
  service: ReadinessService,
): Promise<Response> {
  try {
    const binding = env?.STAYBRIDGE_DB;
    if (!binding) {
      throw new Error("D1 binding is unavailable");
    }

    for (const [table, requiredColumns] of Object.entries(READINESS_REQUIRED_COLUMNS[service])) {
      // Table names come only from the closed, code-owned readiness contract.
      // PRAGMA table_info is read-only and detects partial migrations as well as missing tables.
      const { results } = await binding
        .prepare(`PRAGMA table_info('${table}')`)
        .all<{ name: string | null }>();
      const foundColumns = new Set(
        results
          .map((row) => row.name)
          .filter((name): name is string => typeof name === "string"),
      );
      if (requiredColumns.some((column) => !foundColumns.has(column))) {
        throw new Error("required D1 schema is missing");
      }
    }

    return createApiSuccessResponse({ status: "ready" as const });
  } catch {
    return createApiErrorResponse(
      {
        code: "SERVICE_UNAVAILABLE",
        message: "The service is temporarily unavailable.",
      },
      503,
    );
  }
}

function withApiHeaders(init: ResponseInit): ResponseInit {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(API_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return { ...init, headers };
}

export * from "./persistence";
export * from "./crisis-needs";
