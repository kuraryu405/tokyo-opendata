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
    | "UNAUTHORIZED"
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
  status: 400 | 401 | 404 | 405 | 409 | 413 | 415 | 429 | 503,
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

type ReadinessForeignKey = {
  column: string;
  referencedTable: string;
  referencedColumn: string;
};

type ReadinessTableContract = {
  columns: readonly string[];
  uniqueConstraints?: readonly (readonly string[])[];
  foreignKeys?: readonly ReadinessForeignKey[];
};

type ReadinessSchema = Readonly<Record<string, ReadinessTableContract>>;

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
const OPEN_DATA_SOURCES_COLUMNS = [
  "source_id",
  "title",
  "publisher",
  "source_url",
  "catalog_url",
  "license",
  "license_url",
  "terms_url",
  "attribution",
  "update_frequency",
  "coverage_note",
  "data_updated_at",
  "fetched_at",
  "created_at",
  "updated_at",
] as const;
const OPEN_DATA_DATASET_VERSIONS_COLUMNS = [
  "id",
  "dataset_key",
  "version_hash",
  "source_updated_at",
  "fetched_at",
  "row_count",
  "status",
  "created_at",
] as const;
const OPEN_DATA_RESOURCES_COLUMNS = [
  "dataset_version_id",
  "resource_id",
  "ordinal",
  "category",
  "municipality",
  "name",
  "address",
  "latitude",
  "longitude",
  "phone",
  "website",
  "source_id",
  "data_updated_at",
] as const;
const OPEN_DATA_ACTIVE_DATASETS_COLUMNS = [
  "dataset_key",
  "dataset_version_id",
  "activated_at",
] as const;
const OPEN_DATA_IMPORT_RUNS_COLUMNS = [
  "run_id",
  "dataset_key",
  "started_at",
  "finished_at",
  "status",
  "dry_run",
  "version_hash",
  "row_count",
  "error_code",
] as const;

const OPEN_DATA_READINESS_SCHEMA: ReadinessSchema = {
  open_data_sources: {
    columns: OPEN_DATA_SOURCES_COLUMNS,
    uniqueConstraints: [["source_id"]],
  },
  open_data_dataset_versions: {
    columns: OPEN_DATA_DATASET_VERSIONS_COLUMNS,
    uniqueConstraints: [["dataset_key", "version_hash"], ["dataset_key", "id"]],
  },
  open_data_resources: {
    columns: OPEN_DATA_RESOURCES_COLUMNS,
    uniqueConstraints: [["dataset_version_id", "resource_id"], ["dataset_version_id", "ordinal"]],
    foreignKeys: [
      { column: "dataset_version_id", referencedTable: "open_data_dataset_versions", referencedColumn: "id" },
      { column: "source_id", referencedTable: "open_data_sources", referencedColumn: "source_id" },
    ],
  },
  open_data_active_datasets: {
    columns: OPEN_DATA_ACTIVE_DATASETS_COLUMNS,
    uniqueConstraints: [["dataset_key"]],
    foreignKeys: [
      { column: "dataset_key", referencedTable: "open_data_dataset_versions", referencedColumn: "dataset_key" },
      { column: "dataset_version_id", referencedTable: "open_data_dataset_versions", referencedColumn: "id" },
    ],
  },
  open_data_import_runs: {
    columns: OPEN_DATA_IMPORT_RUNS_COLUMNS,
    uniqueConstraints: [["run_id"]],
  },
};

const READINESS_REQUIRED_SCHEMA: Record<ReadinessService, ReadinessSchema> = {
  user: {
    ...OPEN_DATA_READINESS_SCHEMA,
    backend_metadata: { columns: BACKEND_METADATA_COLUMNS },
    situation_submissions: {
      columns: SITUATION_SUBMISSIONS_COLUMNS,
      uniqueConstraints: [["idempotency_key_hash"]],
    },
    conversations: {
      columns: CONVERSATIONS_COLUMNS,
      uniqueConstraints: [["idempotency_key_hash"]],
    },
    conversation_messages: {
      columns: CONVERSATION_MESSAGES_COLUMNS,
      uniqueConstraints: [["conversation_id", "message_index"]],
      foreignKeys: [{ column: "conversation_id", referencedTable: "conversations", referencedColumn: "id" }],
    },
  },
  municipality: {
    ...OPEN_DATA_READINESS_SCHEMA,
    backend_metadata: { columns: BACKEND_METADATA_COLUMNS },
    situation_submissions: {
      columns: SITUATION_SUBMISSIONS_COLUMNS,
      uniqueConstraints: [["idempotency_key_hash"]],
    },
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

    for (const [table, contract] of Object.entries(READINESS_REQUIRED_SCHEMA[service])) {
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
      if (contract.columns.some((column) => !foundColumns.has(column))) {
        throw new Error("required D1 schema is missing");
      }

      for (const requiredColumns of contract.uniqueConstraints ?? []) {
        if (!(await hasUniqueConstraint(binding, table, requiredColumns))) {
          throw new Error("required D1 uniqueness constraint is missing");
        }
      }
      for (const requiredForeignKey of contract.foreignKeys ?? []) {
        if (!(await hasForeignKey(binding, table, requiredForeignKey))) {
          throw new Error("required D1 foreign key is missing");
        }
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

async function hasUniqueConstraint(
  binding: D1Database,
  table: string,
  requiredColumns: readonly string[],
): Promise<boolean> {
  const { results } = await binding
    .prepare(`PRAGMA index_list('${escapePragmaString(table)}')`)
    .all<{ name: string | null; unique: number | string | null }>();
  for (const index of results ?? []) {
    if (Number(index.unique) !== 1 || typeof index.name !== "string") continue;
    const indexInfo = await binding
      .prepare(`PRAGMA index_info('${escapePragmaString(index.name)}')`)
      .all<{ seqno: number | string | null; name: string | null }>();
    const columns = (indexInfo.results ?? [])
      .filter((row): row is { seqno: number | string; name: string } => row.name !== null && row.seqno !== null)
      .toSorted((a, b) => Number(a.seqno) - Number(b.seqno))
      .map((row) => row.name);
    if (columns.length === requiredColumns.length && columns.every((column, index) => column === requiredColumns[index])) {
      return true;
    }
  }
  return false;
}

async function hasForeignKey(
  binding: D1Database,
  table: string,
  requiredForeignKey: ReadinessForeignKey,
): Promise<boolean> {
  const { results } = await binding
    .prepare(`PRAGMA foreign_key_list('${escapePragmaString(table)}')`)
    .all<{ table: string | null; from: string | null; to: string | null }>();
  return (results ?? []).some((foreignKey) =>
    foreignKey.table === requiredForeignKey.referencedTable &&
    foreignKey.from === requiredForeignKey.column &&
    foreignKey.to === requiredForeignKey.referencedColumn,
  );
}

function escapePragmaString(value: string): string {
  return value.replaceAll("'", "''");
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
export * from "./open-data";
