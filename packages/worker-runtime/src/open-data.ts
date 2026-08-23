import {
  bundledKitaShelterDataset,
  fetchKitaEarthquakeShelters,
  KITA_EARTHQUAKE_SHELTER_SOURCE,
  KITA_SHELTER_BOUNDS,
  KITA_SHELTER_MIN_ROWS,
  type NormalizedKitaShelter,
  type VerifiedKitaShelterDataset,
} from "@staybridge/data";
import {
  createApiErrorResponse,
  createApiSuccessResponse,
  type BackendEnv,
} from "./index";

export interface OpenDataEnv extends BackendEnv {
  OPEN_DATA_SYNC_SECRET?: string;
}

export type OpenDataResourceResponse = {
  sourceId: string;
  datasetVersion: string;
  dataUpdatedAt: string;
  fetchedAt: string;
  license: string;
  licenseUrl: string;
  catalogUrl: string;
  attribution: string;
  origin: "d1" | "bundled";
  resources: NormalizedKitaShelter[];
};

export type OpenDataSyncResult = {
  sourceId: string;
  status: "validated" | "activated" | "not_modified";
  dryRun: boolean;
  changed: boolean;
  datasetVersion: string;
  rowCount: number;
  fetchedAt: string;
};

type ActiveVersion = {
  id: number;
  version_hash: string;
  etag: string | null;
  row_count: number;
};

type VersionRow = { id: number; row_count: number; status: string };

const MIN_ACTIVE_ROW_RATIO = 0.8;

export async function syncKitaShelterOpenData(
  env: Pick<OpenDataEnv, "STAYBRIDGE_DB">,
  options: { dryRun?: boolean; fetchImpl?: typeof fetch; now?: Date; runId?: string } = {},
): Promise<OpenDataSyncResult> {
  const dryRun = options.dryRun ?? false;
  const startedAt = (options.now ?? new Date()).toISOString();
  const active = await readActiveVersion(env.STAYBRIDGE_DB);
  const runId = options.runId ?? crypto.randomUUID();

  if (!dryRun) {
    await env.STAYBRIDGE_DB.batch([
      sourceUpsertStatement(env.STAYBRIDGE_DB),
      env.STAYBRIDGE_DB.prepare(
        `INSERT INTO open_data_import_runs
          (run_id, source_id, started_at, status, dry_run)
         VALUES (?, ?, ?, 'running', 0)`,
      ).bind(runId, KITA_EARTHQUAKE_SHELTER_SOURCE.id, startedAt),
    ]);
  }

  try {
    const fetched = await fetchKitaEarthquakeShelters({
      fetchImpl: options.fetchImpl,
      etag: active?.etag ?? undefined,
      now: options.now,
    });

    if (fetched.status === "not_modified") {
      if (!active) throw new Error("Source returned 304 without an active dataset");
      if (!dryRun) {
        await env.STAYBRIDGE_DB.batch([
          env.STAYBRIDGE_DB.prepare(
            `UPDATE open_data_dataset_versions
             SET fetched_at = ?, etag = COALESCE(?, etag)
             WHERE id = ?`,
          ).bind(fetched.fetchedAt, fetched.etag ?? null, active.id),
          finishRunStatement(env.STAYBRIDGE_DB, runId, {
            status: "not_modified",
            finishedAt: fetched.fetchedAt,
            httpStatus: 304,
            versionHash: active.version_hash,
            etag: fetched.etag ?? active.etag,
            rowCount: active.row_count,
          }),
        ]);
      }
      return {
        sourceId: KITA_EARTHQUAKE_SHELTER_SOURCE.id,
        status: "not_modified",
        dryRun,
        changed: false,
        datasetVersion: active.version_hash,
        rowCount: active.row_count,
        fetchedAt: fetched.fetchedAt,
      };
    }

    const dataset = fetched.dataset;
    if (active) {
      const minimumRelativeRows = Math.max(
        KITA_SHELTER_MIN_ROWS,
        Math.ceil(active.row_count * MIN_ACTIVE_ROW_RATIO),
      );
      if (dataset.resources.length < minimumRelativeRows) {
        throw new Error("Validated dataset row count fell more than 20% below the active dataset");
      }
    }
    const changed = dataset.datasetVersion !== active?.version_hash;
    if (dryRun) {
      return syncResult(dataset, "validated", true, changed);
    }

    const existing = await env.STAYBRIDGE_DB.prepare(
      `SELECT id, row_count, status
       FROM open_data_dataset_versions
       WHERE source_id = ? AND version_hash = ?`,
    ).bind(dataset.sourceId, dataset.datasetVersion).first<VersionRow>();

    if (!existing) {
      await env.STAYBRIDGE_DB.batch([
        env.STAYBRIDGE_DB.prepare(
          `INSERT INTO open_data_dataset_versions
            (source_id, version_hash, data_updated_at, fetched_at, etag, row_count, status)
           VALUES (?, ?, ?, ?, ?, ?, 'staged')`,
        ).bind(
          dataset.sourceId,
          dataset.datasetVersion,
          dataset.dataUpdatedAt,
          dataset.fetchedAt,
          dataset.etag ?? null,
          dataset.resources.length,
        ),
        resourcesInsertStatement(env.STAYBRIDGE_DB, dataset),
      ]);
    } else {
      await env.STAYBRIDGE_DB.batch([
        env.STAYBRIDGE_DB.prepare(
          "DELETE FROM open_data_resources WHERE dataset_version_id = ?",
        ).bind(existing.id),
        resourcesInsertStatement(env.STAYBRIDGE_DB, dataset),
        env.STAYBRIDGE_DB.prepare(
          `UPDATE open_data_dataset_versions
           SET data_updated_at = ?, fetched_at = ?, etag = ?, row_count = ?,
               status = CASE WHEN status = 'active' THEN 'active' ELSE 'staged' END
           WHERE id = ?`,
        ).bind(dataset.dataUpdatedAt, dataset.fetchedAt, dataset.etag ?? null, dataset.resources.length, existing.id),
      ]);
    }

    const staged = await env.STAYBRIDGE_DB.prepare(
      `SELECT id, row_count, status
       FROM open_data_dataset_versions
       WHERE source_id = ? AND version_hash = ?`,
    ).bind(dataset.sourceId, dataset.datasetVersion).first<VersionRow>();
    const stagedResourceCount = staged
      ? await env.STAYBRIDGE_DB.prepare(
        "SELECT COUNT(*) AS count FROM open_data_resources WHERE dataset_version_id = ?",
      ).bind(staged.id).first<number>("count")
      : undefined;
    if (!staged || staged.row_count !== dataset.resources.length || stagedResourceCount !== dataset.resources.length) {
      throw new Error("Validated dataset staging did not complete");
    }

    // D1 batch is transactional: the LKG pointer cannot be left between versions.
    await env.STAYBRIDGE_DB.batch([
      env.STAYBRIDGE_DB.prepare(
        `UPDATE open_data_dataset_versions
         SET status = 'inactive'
         WHERE source_id = ? AND status = 'active' AND id <> ?`,
      ).bind(dataset.sourceId, staged.id),
      env.STAYBRIDGE_DB.prepare(
        "UPDATE open_data_dataset_versions SET status = 'active' WHERE id = ?",
      ).bind(staged.id),
      env.STAYBRIDGE_DB.prepare(
        `INSERT INTO open_data_active_datasets (source_id, dataset_version_id, activated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(source_id) DO UPDATE SET
           dataset_version_id = excluded.dataset_version_id,
           activated_at = excluded.activated_at`,
      ).bind(dataset.sourceId, staged.id, dataset.fetchedAt),
      finishRunStatement(env.STAYBRIDGE_DB, runId, {
        status: "succeeded",
        finishedAt: dataset.fetchedAt,
        httpStatus: 200,
        versionHash: dataset.datasetVersion,
        etag: dataset.etag ?? null,
        rowCount: dataset.resources.length,
      }),
    ]);

    return syncResult(dataset, "activated", false, changed);
  } catch (error) {
    if (!dryRun) {
      try {
        await env.STAYBRIDGE_DB.prepare(
          `UPDATE open_data_import_runs
           SET finished_at = ?, status = 'failed', error_code = 'FETCH_VALIDATE_OR_STORE_FAILED'
           WHERE run_id = ?`,
        ).bind(new Date().toISOString(), runId).run();
      } catch {
        // The original failure remains authoritative if D1 cannot record it.
      }
    }
    throw error;
  }
}

export async function createOpenDataResourcesResponse(
  env: Pick<OpenDataEnv, "STAYBRIDGE_DB">,
): Promise<Response> {
  let data: OpenDataResourceResponse;
  try {
    data = await readD1Resources(env.STAYBRIDGE_DB);
  } catch {
    data = bundledResourceResponse();
  }
  return createApiSuccessResponse(data);
}

export async function handleOpenDataResourcesRequest(
  request: Request,
  env: Pick<OpenDataEnv, "STAYBRIDGE_DB">,
): Promise<Response> {
  if (request.method !== "GET") {
    return createApiErrorResponse(
      { code: "METHOD_NOT_ALLOWED", message: "Only GET is supported for this endpoint." },
      405,
      { headers: { Allow: "GET" } },
    );
  }
  const params = new URL(request.url).searchParams;
  if (
    [...params.keys()].some((key) => key !== "municipality" && key !== "category") ||
    params.getAll("municipality").length !== 1 ||
    params.get("municipality") !== "Kita" ||
    params.getAll("category").length !== 1 ||
    params.get("category") !== "emergency_shelter"
  ) {
    return createApiErrorResponse(
      { code: "INVALID_REQUEST", message: "Use municipality=Kita and category=emergency_shelter." },
      400,
    );
  }
  return createOpenDataResourcesResponse(env);
}

export async function handleOpenDataSyncRequest(
  request: Request,
  env: OpenDataEnv | undefined,
  options: { fetchImpl?: typeof fetch; now?: Date; runId?: string } = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return createApiErrorResponse(
      { code: "METHOD_NOT_ALLOWED", message: "Only POST is supported for this endpoint." },
      405,
      { headers: { Allow: "POST" } },
    );
  }
  if (!env?.OPEN_DATA_SYNC_SECRET) {
    return createApiErrorResponse(
      { code: "SERVICE_UNAVAILABLE", message: "The service is temporarily unavailable." },
      503,
    );
  }
  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!(await constantTimeSecretEqual(env.OPEN_DATA_SYNC_SECRET, provided))) {
    return createApiErrorResponse(
      { code: "UNAUTHORIZED", message: "Authentication is required." },
      401,
    );
  }

  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => key !== "dry_run") || params.getAll("dry_run").length > 1) {
    return createApiErrorResponse(
      { code: "INVALID_REQUEST", message: "Only dry_run=true is supported." },
      400,
    );
  }
  const dryRunValue = params.get("dry_run");
  if (dryRunValue !== null && dryRunValue !== "true") {
    return createApiErrorResponse(
      { code: "INVALID_REQUEST", message: "dry_run must be true when provided." },
      400,
    );
  }
  if (await requestHasNonEmptyBody(request)) {
    return createApiErrorResponse(
      { code: "INVALID_REQUEST", message: "This endpoint does not accept a request body." },
      400,
    );
  }

  try {
    const result = await syncKitaShelterOpenData(env, {
      dryRun: dryRunValue === "true",
      fetchImpl: options.fetchImpl,
      now: options.now,
      runId: options.runId,
    });
    return createApiSuccessResponse(result);
  } catch {
    return createApiErrorResponse(
      { code: "SERVICE_UNAVAILABLE", message: "Open Data sync did not complete; the active dataset was preserved." },
      503,
    );
  }
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

async function readActiveVersion(db: D1Database): Promise<ActiveVersion | null> {
  return db.prepare(
    `SELECT v.id, v.version_hash, v.etag, v.row_count
     FROM open_data_active_datasets active
     JOIN open_data_dataset_versions v ON v.id = active.dataset_version_id
     WHERE active.source_id = ?`,
  ).bind(KITA_EARTHQUAKE_SHELTER_SOURCE.id).first<ActiveVersion>();
}

async function readD1Resources(db: D1Database): Promise<OpenDataResourceResponse> {
  const metadata = await db.prepare(
    `SELECT s.source_id, s.license, s.license_url, s.catalog_url, s.attribution,
            v.id AS version_id, v.version_hash, v.data_updated_at, v.fetched_at, v.row_count
     FROM open_data_active_datasets active
     JOIN open_data_sources s ON s.source_id = active.source_id
     JOIN open_data_dataset_versions v ON v.id = active.dataset_version_id
     WHERE active.source_id = ? AND v.status = 'active'`,
  ).bind(KITA_EARTHQUAKE_SHELTER_SOURCE.id).first<{
    source_id: string;
    license: string;
    license_url: string;
    catalog_url: string;
    attribution: string;
    version_id: number;
    version_hash: string;
    data_updated_at: string;
    fetched_at: string;
    row_count: number;
  }>();
  if (!metadata) throw new Error("No active Open Data dataset");
  if (
    !/^sha256:[0-9a-f]{64}$/.test(metadata.version_hash) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(metadata.data_updated_at) ||
    !Number.isFinite(new Date(metadata.fetched_at).getTime()) ||
    metadata.row_count < KITA_SHELTER_MIN_ROWS ||
    metadata.license !== KITA_EARTHQUAKE_SHELTER_SOURCE.license ||
    metadata.license_url !== KITA_EARTHQUAKE_SHELTER_SOURCE.licenseUrl ||
    metadata.catalog_url !== KITA_EARTHQUAKE_SHELTER_SOURCE.catalogUrl ||
    metadata.attribution !== KITA_EARTHQUAKE_SHELTER_SOURCE.attribution
  ) {
    throw new Error("Active Open Data metadata is invalid");
  }

  const result = await db.prepare(
    `SELECT resource_id, category, municipality, name, address, latitude, longitude, description
     FROM open_data_resources
     WHERE dataset_version_id = ? AND municipality = 'Kita' AND category = 'emergency_shelter'
     ORDER BY ordinal`,
  ).bind(metadata.version_id).all<{
    resource_id: string;
    category: string;
    municipality: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    description: string | null;
  }>();
  if (result.results.length !== metadata.row_count) throw new Error("Active Open Data row count mismatch");
  const names = new Set<string>();
  const locations = new Set<string>();
  const encoder = new TextEncoder();
  const resources = result.results.map((row): NormalizedKitaShelter => {
    const locationKey = `${row.address}\u0000${row.latitude}\u0000${row.longitude}`;
    if (
      row.category !== "emergency_shelter" || row.municipality !== "Kita" || !row.name ||
      !/^北区\S/.test(row.address) || !Number.isFinite(row.latitude) ||
      row.latitude < KITA_SHELTER_BOUNDS.minLatitude || row.latitude > KITA_SHELTER_BOUNDS.maxLatitude ||
      !Number.isFinite(row.longitude) ||
      row.longitude < KITA_SHELTER_BOUNDS.minLongitude || row.longitude > KITA_SHELTER_BOUNDS.maxLongitude ||
      encoder.encode(row.name).byteLength > 1024 || encoder.encode(row.address).byteLength > 1024 ||
      (row.description !== null && encoder.encode(row.description).byteLength > 1024) ||
      names.has(row.name) || locations.has(locationKey)
    ) {
      throw new Error("Active Open Data contains an invalid normalized row");
    }
    names.add(row.name);
    locations.add(locationKey);
    return {
      id: row.resource_id,
      name: row.name,
      category: "emergency_shelter",
      municipality: "Kita",
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      ...(row.description ? { description: row.description } : {}),
      sourceId: KITA_EARTHQUAKE_SHELTER_SOURCE.id,
      dataUpdatedAt: metadata.data_updated_at,
    };
  });

  return {
    sourceId: metadata.source_id,
    datasetVersion: metadata.version_hash,
    dataUpdatedAt: metadata.data_updated_at,
    fetchedAt: metadata.fetched_at,
    license: metadata.license,
    licenseUrl: metadata.license_url,
    catalogUrl: metadata.catalog_url,
    attribution: metadata.attribution,
    origin: "d1",
    resources,
  };
}

function bundledResourceResponse(): OpenDataResourceResponse {
  return {
    sourceId: bundledKitaShelterDataset.sourceId,
    datasetVersion: bundledKitaShelterDataset.datasetVersion,
    dataUpdatedAt: bundledKitaShelterDataset.dataUpdatedAt,
    fetchedAt: bundledKitaShelterDataset.fetchedAt,
    license: KITA_EARTHQUAKE_SHELTER_SOURCE.license,
    licenseUrl: KITA_EARTHQUAKE_SHELTER_SOURCE.licenseUrl,
    catalogUrl: KITA_EARTHQUAKE_SHELTER_SOURCE.catalogUrl,
    attribution: KITA_EARTHQUAKE_SHELTER_SOURCE.attribution,
    origin: "bundled",
    resources: bundledKitaShelterDataset.resources,
  };
}

function sourceUpsertStatement(db: D1Database): D1PreparedStatement {
  const source = KITA_EARTHQUAKE_SHELTER_SOURCE;
  return db.prepare(
    `INSERT INTO open_data_sources
      (source_id, title, publisher, source_url, landing_page_url, landing_page_updated_at, catalog_url, license, license_url, terms_url, attribution, update_frequency, coverage_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_id) DO UPDATE SET
       title = excluded.title, publisher = excluded.publisher, source_url = excluded.source_url,
       landing_page_url = excluded.landing_page_url,
       landing_page_updated_at = excluded.landing_page_updated_at,
       catalog_url = excluded.catalog_url, license = excluded.license, license_url = excluded.license_url,
       terms_url = excluded.terms_url, attribution = excluded.attribution,
       update_frequency = excluded.update_frequency, coverage_note = excluded.coverage_note,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    source.id,
    source.title,
    source.publisher,
    source.url,
    source.landingPageUrl,
    source.landingPageUpdatedAt,
    source.catalogUrl,
    source.license,
    source.licenseUrl,
    source.termsUrl,
    source.attribution,
    source.updateFrequency,
    source.coverageNote,
  );
}

function resourcesInsertStatement(
  db: D1Database,
  dataset: VerifiedKitaShelterDataset,
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO open_data_resources
      (dataset_version_id, resource_id, ordinal, category, municipality, name, address, latitude, longitude, description)
     SELECT version.id,
            json_extract(item.value, '$.id'),
            CAST(item.key AS INTEGER),
            json_extract(item.value, '$.category'),
            json_extract(item.value, '$.municipality'),
            json_extract(item.value, '$.name'),
            json_extract(item.value, '$.address'),
            json_extract(item.value, '$.latitude'),
            json_extract(item.value, '$.longitude'),
            json_extract(item.value, '$.description')
     FROM json_each(?) AS item
     JOIN open_data_dataset_versions AS version
       ON version.source_id = ? AND version.version_hash = ?`,
  ).bind(JSON.stringify(dataset.resources), dataset.sourceId, dataset.datasetVersion);
}

function finishRunStatement(db: D1Database, runId: string, values: {
  status: "succeeded" | "not_modified";
  finishedAt: string;
  httpStatus: number;
  versionHash: string;
  etag: string | null;
  rowCount: number;
}): D1PreparedStatement {
  return db.prepare(
    `UPDATE open_data_import_runs
     SET finished_at = ?, status = ?, http_status = ?, version_hash = ?, etag = ?, row_count = ?
     WHERE run_id = ?`,
  ).bind(values.finishedAt, values.status, values.httpStatus, values.versionHash, values.etag, values.rowCount, runId);
}

function syncResult(
  dataset: VerifiedKitaShelterDataset,
  status: "validated" | "activated",
  dryRun: boolean,
  changed: boolean,
): OpenDataSyncResult {
  return {
    sourceId: dataset.sourceId,
    status,
    dryRun,
    changed,
    datasetVersion: dataset.datasetVersion,
    rowCount: dataset.resources.length,
    fetchedAt: dataset.fetchedAt,
  };
}

async function constantTimeSecretEqual(expected: string, provided: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [expectedHash, providedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
  ]);
  const left = new Uint8Array(expectedHash);
  const right = new Uint8Array(providedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}
