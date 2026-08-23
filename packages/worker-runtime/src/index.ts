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

export async function createReadinessResponse(
  env: Pick<BackendEnv, "STAYBRIDGE_DB"> | undefined,
): Promise<Response> {
  try {
    const ready = await env?.STAYBRIDGE_DB.prepare("SELECT 1 AS ready").first<
      number
    >("ready");

    if (ready !== 1) {
      throw new Error("D1 readiness query returned an unexpected result");
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
