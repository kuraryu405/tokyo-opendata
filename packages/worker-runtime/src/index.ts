export type StayBridgeService = "user" | "municipality";

export const BACKEND_DATABASE_BINDING = "STAYBRIDGE_DB" as const;

export interface RevisionEnv {
  APP_REVISION?: string;
}

export interface BackendEnv extends RevisionEnv {
  STAYBRIDGE_DB: D1Database;
  SITUATION_CAPABILITY_SECRET?: string;
}

export interface ApiError {
  code:
    | "CAPABILITY_REQUIRED"
    | "CONSENT_REQUIRED"
    | "DELETION_NOT_FOUND"
    | "DUPLICATE_CONFLICT"
    | "HIGH_RISK_IDENTIFIER"
    | "INVALID_REQUEST"
    | "INVALID_CAPABILITY"
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

type ReadinessColumnRow = { name: string | null };
type ReadinessIndexListRow = { name: string | null; unique: number | string | null };
type ReadinessIndexInfoRow = { seqno: number | string | null; name: string | null };
type ReadinessForeignKeyRow = { table: string | null; from: string | null; to: string | null };

type ReadinessInspection = {
  columnsByTable: Map<string, Set<string>>;
  uniqueIndexesByTable: Map<string, readonly (readonly string[])[]>;
  foreignKeysByTable: Map<string, readonly ReadinessForeignKeyRow[]>;
};

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
  "contribution_state",
  "capability_nonce_hash",
] as const;
const SITUATION_SUBMISSION_CAPABILITIES_COLUMNS = [
  "nonce_hash",
  "capability_version",
  "scope",
  "expires_at",
  "issued_at",
  "consumed_at",
  "consumed_idempotency_key_hash",
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
      uniqueConstraints: [["idempotency_key_hash"], ["capability_nonce_hash"]],
    },
    situation_submission_capabilities: {
      columns: SITUATION_SUBMISSION_CAPABILITIES_COLUMNS,
      uniqueConstraints: [["nonce_hash"]],
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
      uniqueConstraints: [["idempotency_key_hash"], ["capability_nonce_hash"]],
    },
  },
};

export async function createReadinessResponse(
  env: Pick<BackendEnv, "STAYBRIDGE_DB" | "SITUATION_CAPABILITY_SECRET"> | undefined,
  service: ReadinessService,
): Promise<Response> {
  try {
    if (
      service === "user"
      && (
        typeof env?.SITUATION_CAPABILITY_SECRET !== "string"
        || env.SITUATION_CAPABILITY_SECRET.length < 32
        || env.SITUATION_CAPABILITY_SECRET.length > 512
      )
    ) throw new Error("Situation capability signing is unavailable");
    const binding = env?.STAYBRIDGE_DB;
    if (!binding) {
      throw new Error("D1 binding is unavailable");
    }

    const requiredSchema = READINESS_REQUIRED_SCHEMA[service];
    const inspection = await inspectReadinessSchema(binding, requiredSchema);

    for (const [table, contract] of Object.entries(requiredSchema)) {
      const foundColumns = inspection.columnsByTable.get(table) ?? new Set();
      if (contract.columns.some((column) => !foundColumns.has(column))) {
        throw new Error("required D1 schema is missing");
      }

      for (const requiredColumns of contract.uniqueConstraints ?? []) {
        if (!hasUniqueConstraint(
          inspection.uniqueIndexesByTable.get(table) ?? [],
          requiredColumns,
        )) {
          throw new Error("required D1 uniqueness constraint is missing");
        }
      }
      for (const requiredForeignKey of contract.foreignKeys ?? []) {
        if (!hasForeignKey(
          inspection.foreignKeysByTable.get(table) ?? [],
          requiredForeignKey,
        )) {
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

async function inspectReadinessSchema(
  binding: D1Database,
  schema: ReadinessSchema,
): Promise<ReadinessInspection> {
  const initialQueries: {
    kind: "columns" | "indexes" | "foreignKeys";
    table: string;
    sql: string;
  }[] = [];
  for (const [table, contract] of Object.entries(schema)) {
    const escapedTable = escapePragmaString(table);
    // Names come only from the closed, code-owned readiness contract.
    initialQueries.push({ kind: "columns", table, sql: `PRAGMA table_info('${escapedTable}')` });
    if (contract.uniqueConstraints?.length) {
      initialQueries.push({ kind: "indexes", table, sql: `PRAGMA index_list('${escapedTable}')` });
    }
    if (contract.foreignKeys?.length) {
      initialQueries.push({ kind: "foreignKeys", table, sql: `PRAGMA foreign_key_list('${escapedTable}')` });
    }
  }

  const initialResults = await binding.batch(
    initialQueries.map(({ sql }) => binding.prepare(sql)),
  );
  if (initialResults.length !== initialQueries.length) {
    throw new Error("D1 readiness introspection returned an incomplete batch");
  }

  const columnsByTable = new Map<string, Set<string>>();
  const indexNamesByTable = new Map<string, string[]>();
  const foreignKeysByTable = new Map<string, readonly ReadinessForeignKeyRow[]>();
  initialQueries.forEach((query, index) => {
    const rows = initialResults[index]?.results ?? [];
    if (query.kind === "columns") {
      columnsByTable.set(
        query.table,
        new Set(
          (rows as ReadinessColumnRow[])
            .map((row) => row.name)
            .filter((name): name is string => typeof name === "string"),
        ),
      );
    } else if (query.kind === "indexes") {
      indexNamesByTable.set(
        query.table,
        (rows as ReadinessIndexListRow[])
          .filter((row) => Number(row.unique) === 1 && typeof row.name === "string")
          .map((row) => row.name as string),
      );
    } else {
      foreignKeysByTable.set(query.table, rows as ReadinessForeignKeyRow[]);
    }
  });

  const indexQueries = [...indexNamesByTable.entries()].flatMap(([table, names]) =>
    names.map((name) => ({
      table,
      sql: `PRAGMA index_info('${escapePragmaString(name)}')`,
    })),
  );
  const indexResults = indexQueries.length > 0
    ? await binding.batch(indexQueries.map(({ sql }) => binding.prepare(sql)))
    : [];
  if (indexResults.length !== indexQueries.length) {
    throw new Error("D1 readiness index introspection returned an incomplete batch");
  }

  const uniqueIndexesByTable = new Map<string, (readonly string[])[]>();
  indexQueries.forEach(({ table }, index) => {
    const columns = ((indexResults[index]?.results ?? []) as ReadinessIndexInfoRow[])
      .filter((row): row is { seqno: number | string; name: string } => row.name !== null && row.seqno !== null)
      .toSorted((left, right) => Number(left.seqno) - Number(right.seqno))
      .map((row) => row.name);
    const indexes = uniqueIndexesByTable.get(table) ?? [];
    indexes.push(columns);
    uniqueIndexesByTable.set(table, indexes);
  });

  return { columnsByTable, uniqueIndexesByTable, foreignKeysByTable };
}

function hasUniqueConstraint(
  indexes: readonly (readonly string[])[],
  requiredColumns: readonly string[],
): boolean {
  return indexes.some((columns) =>
    columns.length === requiredColumns.length
    && columns.every((column, index) => column === requiredColumns[index]),
  );
}

function hasForeignKey(
  foreignKeys: readonly ReadinessForeignKeyRow[],
  requiredForeignKey: ReadinessForeignKey,
): boolean {
  return foreignKeys.some((foreignKey) =>
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
export * from "./capability";
export * from "./open-data";
