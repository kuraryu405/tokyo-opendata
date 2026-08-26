import {
  KITA_FACILITY_DATASET_KEY,
  KITA_FACILITY_EXPECTED_RESOURCE_COUNT,
  KITA_FACILITY_SOURCES,
  KITA_STANDARD_SELECTIONS,
  kitaLocalResourcesCache,
  schoolSelection,
  sourceRegistry,
  type LocalResource,
  type LocalResourceCategory,
} from "@staybridge/data";
import {
  fetchKitaFacilityDataset,
  type KitaFacilityFetchOptions,
  type VerifiedKitaFacilityDataset,
} from "@staybridge/data/kita-facility-connector";
import { createApiErrorResponse, createApiSuccessResponse, type BackendEnv } from "./index";

export interface OpenDataEnv extends BackendEnv {
  OPEN_DATA_SYNC_SECRET?: string;
}

type PublicCategory = Extract<LocalResourceCategory, "school" | "medical" | "child_support" | "public_facility">;
type ActiveVersion = {
  id: number;
  version_hash: string;
  source_updated_at: string;
  row_count: number;
  resource_count: number;
};
type VersionRow = { id: number; row_count: number; status: string };

export type OpenDataSourceMetadata = {
  sourceId: string;
  title: string;
  publisher: string;
  sourceUrl: string;
  catalogUrl: string;
  termsUrl: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  updateFrequency: string;
  coverageNote: string;
  dataUpdatedAt: string;
  fetchedAt: string;
};

export type OpenDataResourceResponse = {
  datasetKey: string;
  datasetVersion: string;
  sourceUpdatedAt: string;
  fetchedAt: string;
  origin: "d1" | "bundled";
  sources: OpenDataSourceMetadata[];
  resources: LocalResource[];
};

export type OpenDataSyncResult = {
  datasetKey: string;
  status: "validated" | "activated" | "not_modified";
  dryRun: boolean;
  changed: boolean;
  datasetVersion: string;
  rowCount: number;
  fetchedAt: string;
};

export const BUNDLED_KITA_FACILITY_DATASET_VERSION = "sha256:607f22756414b6f6508dea74e646685cb845c6106113318cac57b161af7374fd";
const PUBLIC_CATEGORIES = new Set<PublicCategory>(["school", "medical", "child_support", "public_facility"]);
const EXPECTED_RESOURCES = new Map(
  [...schoolSelection, ...Object.values(KITA_STANDARD_SELECTIONS).flat()].map((selection) => [selection.id, selection]),
);

export async function syncKitaFacilityOpenData(
  env: Pick<OpenDataEnv, "STAYBRIDGE_DB">,
  options: KitaFacilityFetchOptions & { dryRun?: boolean; runId?: string } = {},
): Promise<OpenDataSyncResult> {
  const dryRun = options.dryRun ?? false;
  const runId = options.runId ?? crypto.randomUUID();
  const startedAt = (options.now ?? new Date()).toISOString();
  const active = await readActiveVersion(env.STAYBRIDGE_DB);
  const activeIsComplete = active !== null && active.row_count === KITA_FACILITY_EXPECTED_RESOURCE_COUNT &&
    active.resource_count === KITA_FACILITY_EXPECTED_RESOURCE_COUNT;

  if (!dryRun) {
    await env.STAYBRIDGE_DB.prepare(
      `INSERT INTO open_data_import_runs (run_id, dataset_key, started_at, status, dry_run)
       VALUES (?, ?, ?, 'running', 0)`,
    ).bind(runId, KITA_FACILITY_DATASET_KEY, startedAt).run();
  }

  try {
    const dataset = await fetchKitaFacilityDataset(options);
    if (dataset.resources.length !== KITA_FACILITY_EXPECTED_RESOURCE_COUNT) {
      throw new Error("The complete selected facility set was not returned");
    }
    let activeSnapshot: OpenDataResourceResponse | undefined;
    if (activeIsComplete) {
      try {
        activeSnapshot = await readD1Resources(env.STAYBRIDGE_DB);
      } catch {
        // A count-complete but invalid active dataset must not block repair from a fully verified source.
      }
    }
    if (activeSnapshot && active) {
      if (dataset.sourceUpdatedAt < active.source_updated_at) {
        throw new Error("The facility source update date is older than the active dataset");
      }
      const activeSourceDates = await readActiveSourceDates(env.STAYBRIDGE_DB, active.id);
      for (const [sourceId, activeDate] of activeSourceDates) {
        if (dataset.sourceDates[sourceId] && dataset.sourceDates[sourceId] < activeDate) {
          throw new Error(`The ${sourceId} update date is older than the active dataset`);
        }
      }
    }
    const activeMatchesDatasetVersion = activeSnapshot !== undefined && active?.version_hash === dataset.datasetVersion &&
      activeSnapshot.resources.every((resource, index) => sameNormalizedResource(resource, dataset.resources[index]));
    const changed = !activeMatchesDatasetVersion;
    if (dryRun) return syncResult(dataset, "validated", true, changed);

    if (!changed && active) {
      await env.STAYBRIDGE_DB.batch([
        ...sourceUpsertStatements(env.STAYBRIDGE_DB, dataset, dataset.fetchedAt),
        ...resourceDateUpdateStatements(env.STAYBRIDGE_DB, active.id, dataset),
        env.STAYBRIDGE_DB.prepare(
          `UPDATE open_data_dataset_versions
           SET source_updated_at = MAX(source_updated_at, ?), fetched_at = MAX(fetched_at, ?)
           WHERE id = ? AND EXISTS (
             SELECT 1 FROM open_data_active_datasets WHERE dataset_key = ? AND dataset_version_id = ?
           )`,
        ).bind(dataset.sourceUpdatedAt, dataset.fetchedAt, active.id, dataset.datasetKey, active.id),
        finishNotModifiedRunStatement(env.STAYBRIDGE_DB, runId, active.id, dataset),
      ]);
      const confirmed = await readActiveVersion(env.STAYBRIDGE_DB);
      if (confirmed?.id !== active.id) throw new Error("A newer facility sync replaced the not-modified version");
      return syncResult(dataset, "not_modified", false, false);
    }

    const existing = await env.STAYBRIDGE_DB.prepare(
      `SELECT id, row_count, status FROM open_data_dataset_versions
       WHERE dataset_key = ? AND version_hash = ?`,
    ).bind(dataset.datasetKey, dataset.datasetVersion).first<VersionRow>();

    if (!existing) {
      await env.STAYBRIDGE_DB.batch([
        ...sourceUpsertStatements(env.STAYBRIDGE_DB, dataset, dataset.fetchedAt),
        env.STAYBRIDGE_DB.prepare(
          `INSERT INTO open_data_dataset_versions
            (dataset_key, version_hash, source_updated_at, fetched_at, row_count, status)
           VALUES (?, ?, ?, ?, ?, 'staged')`,
        ).bind(dataset.datasetKey, dataset.datasetVersion, dataset.sourceUpdatedAt, dataset.fetchedAt, dataset.resources.length),
        resourcesInsertStatement(env.STAYBRIDGE_DB, dataset),
      ]);
    } else {
      await env.STAYBRIDGE_DB.batch([
        ...sourceUpsertStatements(env.STAYBRIDGE_DB, dataset, dataset.fetchedAt),
        resourcesInsertStatement(env.STAYBRIDGE_DB, dataset),
        resourcesDeleteExtraneousStatement(env.STAYBRIDGE_DB, dataset),
        env.STAYBRIDGE_DB.prepare(
          `UPDATE open_data_dataset_versions
           SET source_updated_at = MAX(source_updated_at, ?), fetched_at = MAX(fetched_at, ?), row_count = ?,
               status = CASE WHEN EXISTS (
                 SELECT 1 FROM open_data_active_datasets WHERE dataset_key = ? AND dataset_version_id = ?
               ) THEN 'active' ELSE 'staged' END
           WHERE id = ?`,
        ).bind(
          dataset.sourceUpdatedAt,
          dataset.fetchedAt,
          dataset.resources.length,
          dataset.datasetKey,
          existing.id,
          existing.id,
        ),
      ]);
    }

    const staged = await env.STAYBRIDGE_DB.prepare(
      `SELECT id, row_count, status FROM open_data_dataset_versions
       WHERE dataset_key = ? AND version_hash = ?`,
    ).bind(dataset.datasetKey, dataset.datasetVersion).first<VersionRow>();
    const stagedCount = staged
      ? await env.STAYBRIDGE_DB.prepare(
        "SELECT COUNT(*) AS count FROM open_data_resources WHERE dataset_version_id = ?",
      ).bind(staged.id).first<number>("count")
      : undefined;
    if (!staged || staged.row_count !== KITA_FACILITY_EXPECTED_RESOURCE_COUNT ||
      stagedCount !== KITA_FACILITY_EXPECTED_RESOURCE_COUNT) {
      throw new Error("Validated facility dataset staging did not complete");
    }

    const pointerCondition = `EXISTS (
      SELECT 1 FROM open_data_active_datasets active
      WHERE active.dataset_key = ? AND active.dataset_version_id = ?
    )`;
    const compareAndSwap = active
      ? env.STAYBRIDGE_DB.prepare(
        `UPDATE open_data_active_datasets SET dataset_version_id = ?, activated_at = ?
         WHERE dataset_key = ? AND dataset_version_id = ?`,
      ).bind(staged.id, dataset.fetchedAt, dataset.datasetKey, active.id)
      : env.STAYBRIDGE_DB.prepare(
        `INSERT INTO open_data_active_datasets (dataset_key, dataset_version_id, activated_at)
         SELECT ?, ?, ? WHERE NOT EXISTS (
           SELECT 1 FROM open_data_active_datasets WHERE dataset_key = ?
         )`,
      ).bind(dataset.datasetKey, staged.id, dataset.fetchedAt, dataset.datasetKey);

    await env.STAYBRIDGE_DB.batch([
      compareAndSwap,
      env.STAYBRIDGE_DB.prepare(
        `UPDATE open_data_dataset_versions SET status = 'inactive'
         WHERE dataset_key = ? AND status = 'active' AND id <> ? AND ${pointerCondition}`,
      ).bind(dataset.datasetKey, staged.id, dataset.datasetKey, staged.id),
      env.STAYBRIDGE_DB.prepare(
        `UPDATE open_data_dataset_versions SET status = 'active'
         WHERE id = ? AND ${pointerCondition}`,
      ).bind(staged.id, dataset.datasetKey, staged.id),
      env.STAYBRIDGE_DB.prepare(
        `UPDATE open_data_import_runs
         SET finished_at = ?, status = CASE WHEN ${pointerCondition} THEN 'succeeded' ELSE 'failed' END,
             version_hash = ?, row_count = ?,
             error_code = CASE WHEN ${pointerCondition} THEN NULL ELSE 'STALE_SYNC' END
         WHERE run_id = ?`,
      ).bind(
        dataset.fetchedAt,
        dataset.datasetKey,
        staged.id,
        dataset.datasetVersion,
        dataset.resources.length,
        dataset.datasetKey,
        staged.id,
        runId,
      ),
    ]);

    const activated = await readActiveVersion(env.STAYBRIDGE_DB);
    if (activated?.id !== staged.id) throw new Error("A newer facility sync won the active-version comparison");
    return syncResult(dataset, "activated", false, true);
  } catch (error) {
    if (!dryRun) {
      try {
        await env.STAYBRIDGE_DB.prepare(
          `UPDATE open_data_import_runs
           SET finished_at = ?, status = 'failed', error_code = COALESCE(error_code, 'FETCH_VALIDATE_OR_STORE_FAILED')
           WHERE run_id = ? AND status = 'running'`,
        ).bind(new Date().toISOString(), runId).run();
      } catch {
        // Preserve the original failure when D1 cannot record the import result.
      }
    }
    throw error;
  }
}

export async function handleOpenDataResourcesRequest(
  request: Request,
  env: Pick<OpenDataEnv, "STAYBRIDGE_DB"> | undefined,
): Promise<Response> {
  if (request.method !== "GET") {
    return createApiErrorResponse(
      { code: "METHOD_NOT_ALLOWED", message: "Only GET is supported for this endpoint." },
      405,
      { headers: { Allow: "GET" } },
    );
  }
  const params = new URL(request.url).searchParams;
  const categoryValue = params.get("category");
  if (
    [...params.keys()].some((key) => key !== "municipality" && key !== "category") ||
    params.getAll("municipality").length !== 1 || params.get("municipality") !== "Kita" ||
    params.getAll("category").length > 1 ||
    (categoryValue !== null && !PUBLIC_CATEGORIES.has(categoryValue as PublicCategory))
  ) {
    return createApiErrorResponse(
      { code: "INVALID_REQUEST", message: "Use municipality=Kita and an optional allowlisted facility category." },
      400,
    );
  }
  return createOpenDataResourcesResponse(env, categoryValue as PublicCategory | null);
}

export async function createOpenDataResourcesResponse(
  env: Pick<OpenDataEnv, "STAYBRIDGE_DB"> | undefined,
  category: PublicCategory | null = null,
): Promise<Response> {
  let data: OpenDataResourceResponse;
  try {
    if (!env?.STAYBRIDGE_DB) throw new Error("D1 binding is unavailable");
    data = await readD1Resources(env.STAYBRIDGE_DB);
  } catch {
    data = bundledResourceResponse();
  }
  return createApiSuccessResponse({
    ...data,
    resources: category ? data.resources.filter((resource) => resource.category === category) : data.resources,
  });
}

export async function handleOpenDataSyncRequest(
  request: Request,
  env: OpenDataEnv | undefined,
  options: KitaFacilityFetchOptions & { runId?: string } = {},
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
    return createApiErrorResponse({ code: "UNAUTHORIZED", message: "Authentication is required." }, 401);
  }
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => key !== "dry_run") || params.getAll("dry_run").length > 1 ||
    (params.has("dry_run") && params.get("dry_run") !== "true")) {
    return createApiErrorResponse({ code: "INVALID_REQUEST", message: "Only dry_run=true is supported." }, 400);
  }
  if (await requestHasNonEmptyBody(request)) {
    return createApiErrorResponse({ code: "INVALID_REQUEST", message: "This endpoint does not accept a request body." }, 400);
  }
  try {
    const result = await syncKitaFacilityOpenData(env, {
      ...options,
      dryRun: params.get("dry_run") === "true",
    });
    return createApiSuccessResponse(result);
  } catch {
    return createApiErrorResponse(
      { code: "SERVICE_UNAVAILABLE", message: "Open Data sync did not complete; the active dataset was preserved." },
      503,
    );
  }
}

async function readActiveVersion(db: D1Database): Promise<ActiveVersion | null> {
  return db.prepare(
    `SELECT version.id, version.version_hash, version.source_updated_at, version.row_count,
            (SELECT COUNT(*) FROM open_data_resources resource WHERE resource.dataset_version_id = version.id) AS resource_count
     FROM open_data_active_datasets active
     JOIN open_data_dataset_versions version ON version.id = active.dataset_version_id
     WHERE active.dataset_key = ?`,
  ).bind(KITA_FACILITY_DATASET_KEY).first<ActiveVersion>();
}

async function readActiveSourceDates(db: D1Database, versionId: number): Promise<Map<string, string>> {
  const result = await db.prepare(
    `SELECT source_id, MAX(data_updated_at) AS data_updated_at
     FROM open_data_resources WHERE dataset_version_id = ? GROUP BY source_id`,
  ).bind(versionId).all<{ source_id: string; data_updated_at: string }>();
  return new Map(result.results.map((row) => [row.source_id, row.data_updated_at]));
}

async function readD1Resources(db: D1Database): Promise<OpenDataResourceResponse> {
  const metadata = await db.prepare(
    `SELECT version.id, version.version_hash, version.source_updated_at, version.fetched_at, version.row_count
     FROM open_data_active_datasets active
     JOIN open_data_dataset_versions version ON version.id = active.dataset_version_id
     WHERE active.dataset_key = ? AND version.status = 'active'`,
  ).bind(KITA_FACILITY_DATASET_KEY).first<{
    id: number; version_hash: string; source_updated_at: string; fetched_at: string; row_count: number;
  }>();
  if (!metadata || !/^sha256:[0-9a-f]{64}$/.test(metadata.version_hash) ||
    metadata.row_count !== KITA_FACILITY_EXPECTED_RESOURCE_COUNT ||
    !/^\d{4}-\d{2}-\d{2}$/.test(metadata.source_updated_at) ||
    !Number.isFinite(new Date(metadata.fetched_at).getTime())) {
    throw new Error("Active facility dataset metadata is invalid");
  }
  const result = await db.prepare(
    `SELECT resource_id, category, municipality, name, address, latitude, longitude,
            phone, website, source_id, data_updated_at
     FROM open_data_resources WHERE dataset_version_id = ? ORDER BY ordinal`,
  ).bind(metadata.id).all<{
    resource_id: string; category: string; municipality: string; name: string; address: string;
    latitude: number; longitude: number; phone: string | null; website: string | null;
    source_id: string; data_updated_at: string;
  }>();
  if (result.results.length !== KITA_FACILITY_EXPECTED_RESOURCE_COUNT) throw new Error("Active facility row count is incomplete");
  const resources = result.results.map((row): LocalResource => {
    const expected = EXPECTED_RESOURCES.get(row.resource_id);
    if (!expected || row.name !== expected.name || row.category !== expected.category || row.source_id !== expected.sourceId ||
      row.municipality !== "Kita" || !row.address.startsWith("東京都北区") ||
      !Number.isFinite(row.latitude) || row.latitude < 35.70 || row.latitude > 35.85 ||
      !Number.isFinite(row.longitude) || row.longitude < 139.65 || row.longitude > 139.85 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.data_updated_at) ||
      [row.name, row.address, row.phone, row.website].some((value) => value !== null && new TextEncoder().encode(value).byteLength > 1024) ||
      (row.website !== null && !/^https?:\/\//.test(row.website))) {
      throw new Error("Active facility dataset contains an invalid normalized row");
    }
    return {
      id: row.resource_id,
      name: row.name,
      category: row.category as PublicCategory,
      municipality: "Kita",
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      ...(row.phone ? { phone: row.phone } : {}),
      ...(row.website ? { website: row.website } : {}),
      sourceId: row.source_id,
      dataUpdatedAt: row.data_updated_at,
    };
  });
  if (new Set(resources.map((resource) => resource.id)).size !== KITA_FACILITY_EXPECTED_RESOURCE_COUNT) {
    throw new Error("Active facility dataset contains duplicate records");
  }

  const sourceDates = new Map<string, string>();
  for (const resource of resources) {
    const current = sourceDates.get(resource.sourceId);
    if (current && current !== resource.dataUpdatedAt) {
      throw new Error("Active facility source dates are inconsistent");
    }
    sourceDates.set(resource.sourceId, resource.dataUpdatedAt!);
  }
  if ([...sourceDates.values()].sort().at(-1) !== metadata.source_updated_at) {
    throw new Error("Active facility source date does not match its dataset version");
  }

  const sources = await readD1Sources(db, sourceDates, metadata.fetched_at);
  return {
    datasetKey: KITA_FACILITY_DATASET_KEY,
    datasetVersion: metadata.version_hash,
    sourceUpdatedAt: metadata.source_updated_at,
    fetchedAt: metadata.fetched_at,
    origin: "d1",
    sources,
    resources,
  };
}

async function readD1Sources(
  db: D1Database,
  sourceDates: ReadonlyMap<string, string>,
  datasetFetchedAt: string,
): Promise<OpenDataSourceMetadata[]> {
  const result = await db.prepare(
    `SELECT source_id, title, publisher, source_url, catalog_url, terms_url, license, license_url,
            attribution, update_frequency, coverage_note, data_updated_at, fetched_at
     FROM open_data_sources ORDER BY source_id`,
  ).all<{
    source_id: string; title: string; publisher: string; source_url: string; catalog_url: string;
    terms_url: string; license: string; license_url: string; attribution: string; update_frequency: string;
    coverage_note: string; data_updated_at: string; fetched_at: string;
  }>();
  const rows = result.results.filter((row) => sourceDates.has(row.source_id));
  if (rows.length !== sourceDates.size) throw new Error("Active facility source metadata is incomplete");
  return rows.map((row) => {
    const expected = KITA_FACILITY_SOURCES.find((source) => source.id === row.source_id);
    if (!expected || row.title !== expected.title || row.publisher !== expected.publisher ||
      row.source_url !== expected.downloadUrl || row.catalog_url !== expected.catalogUrl ||
      row.terms_url !== expected.termsUrl || row.update_frequency !== expected.updateFrequency ||
      row.coverage_note !== expected.coverageNote ||
      row.license !== expected.license || row.license_url !== expected.licenseUrl ||
      row.attribution !== expected.attribution || !/^\d{4}-\d{2}-\d{2}$/.test(row.data_updated_at) ||
      !Number.isFinite(new Date(row.fetched_at).getTime())) {
      throw new Error("Active facility source metadata is invalid");
    }
    return {
      sourceId: row.source_id,
      title: row.title,
      publisher: row.publisher,
      sourceUrl: row.source_url,
      catalogUrl: row.catalog_url,
      termsUrl: row.terms_url,
      license: row.license,
      licenseUrl: row.license_url,
      attribution: row.attribution,
      updateFrequency: row.update_frequency,
      coverageNote: row.coverage_note,
      dataUpdatedAt: sourceDates.get(row.source_id)!,
      fetchedAt: datasetFetchedAt,
    };
  });
}

function bundledResourceResponse(): OpenDataResourceResponse {
  const sourceIds = new Set(kitaLocalResourcesCache.resources.map((resource) => resource.sourceId));
  const sources = KITA_FACILITY_SOURCES.filter((source) => sourceIds.has(source.id)).map((source) => ({
    sourceId: source.id,
    title: source.title,
    publisher: source.publisher,
    sourceUrl: source.downloadUrl,
    catalogUrl: source.catalogUrl,
    termsUrl: source.termsUrl,
    license: source.license,
    licenseUrl: source.licenseUrl,
    attribution: source.attribution,
    updateFrequency: source.updateFrequency,
    coverageNote: source.coverageNote,
    dataUpdatedAt: sourceRegistry[source.id].dataUpdatedAt!,
    fetchedAt: sourceRegistry[source.id].fetchedAt,
  }));
  return {
    datasetKey: KITA_FACILITY_DATASET_KEY,
    datasetVersion: BUNDLED_KITA_FACILITY_DATASET_VERSION,
    sourceUpdatedAt: sources.map((source) => source.dataUpdatedAt).sort().at(-1)!,
    fetchedAt: kitaLocalResourcesCache.fetchedAt,
    origin: "bundled",
    sources,
    resources: kitaLocalResourcesCache.resources,
  };
}

function sourceUpsertStatements(
  db: D1Database,
  dataset: VerifiedKitaFacilityDataset | undefined,
  fetchedAt: string,
): D1PreparedStatement[] {
  return KITA_FACILITY_SOURCES.map((source) => db.prepare(
    `INSERT INTO open_data_sources
      (source_id, title, publisher, source_url, catalog_url, license, license_url, terms_url,
       attribution, update_frequency, coverage_note, data_updated_at, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_id) DO UPDATE SET
       title = excluded.title, publisher = excluded.publisher, source_url = excluded.source_url,
       catalog_url = excluded.catalog_url, license = excluded.license, license_url = excluded.license_url,
       terms_url = excluded.terms_url, attribution = excluded.attribution,
       update_frequency = excluded.update_frequency, coverage_note = excluded.coverage_note,
       data_updated_at = MAX(open_data_sources.data_updated_at, excluded.data_updated_at),
       fetched_at = MAX(open_data_sources.fetched_at, excluded.fetched_at),
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    source.id, source.title, source.publisher, source.downloadUrl, source.catalogUrl,
    source.license, source.licenseUrl, source.termsUrl, source.attribution, source.updateFrequency,
    source.coverageNote, dataset?.sourceDates[source.id] ?? source.dataUpdatedAt, fetchedAt,
  ));
}

function resourcesInsertStatement(db: D1Database, dataset: VerifiedKitaFacilityDataset): D1PreparedStatement {
  return db.prepare(
    `INSERT OR REPLACE INTO open_data_resources
      (dataset_version_id, resource_id, ordinal, category, municipality, name, address,
       latitude, longitude, phone, website, source_id, data_updated_at)
     SELECT version.id, json_extract(item.value, '$.id'), CAST(item.key AS INTEGER),
            json_extract(item.value, '$.category'), json_extract(item.value, '$.municipality'),
            json_extract(item.value, '$.name'), json_extract(item.value, '$.address'),
            json_extract(item.value, '$.latitude'), json_extract(item.value, '$.longitude'),
            json_extract(item.value, '$.phone'), json_extract(item.value, '$.website'),
            json_extract(item.value, '$.sourceId'),
            MAX(
              COALESCE((
                SELECT existing.data_updated_at FROM open_data_resources existing
                WHERE existing.dataset_version_id = version.id
                  AND existing.resource_id = json_extract(item.value, '$.id')
              ), json_extract(item.value, '$.dataUpdatedAt')),
              json_extract(item.value, '$.dataUpdatedAt')
            )
     FROM json_each(?) item
     JOIN open_data_dataset_versions version ON version.dataset_key = ? AND version.version_hash = ?`,
  ).bind(JSON.stringify(dataset.resources), dataset.datasetKey, dataset.datasetVersion);
}

function resourcesDeleteExtraneousStatement(
  db: D1Database,
  dataset: VerifiedKitaFacilityDataset,
): D1PreparedStatement {
  return db.prepare(
    `DELETE FROM open_data_resources
     WHERE dataset_version_id = (
       SELECT id FROM open_data_dataset_versions WHERE dataset_key = ? AND version_hash = ?
     ) AND resource_id NOT IN (SELECT json_extract(value, '$.id') FROM json_each(?))`,
  ).bind(dataset.datasetKey, dataset.datasetVersion, JSON.stringify(dataset.resources));
}

function resourceDateUpdateStatements(
  db: D1Database,
  versionId: number,
  dataset: VerifiedKitaFacilityDataset,
): D1PreparedStatement[] {
  return KITA_FACILITY_SOURCES.map((source) => db.prepare(
    `UPDATE open_data_resources SET data_updated_at = MAX(data_updated_at, ?)
     WHERE dataset_version_id = ? AND source_id = ? AND EXISTS (
       SELECT 1 FROM open_data_active_datasets WHERE dataset_key = ? AND dataset_version_id = ?
     )`,
  ).bind(dataset.sourceDates[source.id], versionId, source.id, dataset.datasetKey, versionId));
}

function finishNotModifiedRunStatement(
  db: D1Database,
  runId: string,
  activeVersionId: number,
  dataset: VerifiedKitaFacilityDataset,
): D1PreparedStatement {
  return db.prepare(
    `UPDATE open_data_import_runs
     SET finished_at = ?,
         status = CASE WHEN EXISTS (
           SELECT 1 FROM open_data_active_datasets WHERE dataset_key = ? AND dataset_version_id = ?
         ) THEN 'not_modified' ELSE 'failed' END,
         version_hash = ?, row_count = ?,
         error_code = CASE WHEN EXISTS (
           SELECT 1 FROM open_data_active_datasets WHERE dataset_key = ? AND dataset_version_id = ?
         ) THEN NULL ELSE 'STALE_SYNC' END
     WHERE run_id = ?`,
  ).bind(
    dataset.fetchedAt,
    dataset.datasetKey,
    activeVersionId,
    dataset.datasetVersion,
    dataset.resources.length,
    dataset.datasetKey,
    activeVersionId,
    runId,
  );
}

function syncResult(
  dataset: VerifiedKitaFacilityDataset,
  status: "validated" | "activated" | "not_modified",
  dryRun: boolean,
  changed: boolean,
): OpenDataSyncResult {
  return {
    datasetKey: dataset.datasetKey,
    status,
    dryRun,
    changed,
    datasetVersion: dataset.datasetVersion,
    rowCount: dataset.resources.length,
    fetchedAt: dataset.fetchedAt,
  };
}

function sameNormalizedResource(left: LocalResource, right: LocalResource | undefined): boolean {
  return right !== undefined &&
    left.id === right.id && left.name === right.name && left.category === right.category &&
    left.municipality === right.municipality && left.address === right.address &&
    left.latitude === right.latitude && left.longitude === right.longitude &&
    left.phone === right.phone && left.website === right.website && left.sourceId === right.sourceId;
}

async function requestHasNonEmptyBody(request: Request): Promise<boolean> {
  if (!request.body) return false;
  const reader = request.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return false;
      if (value.byteLength > 0) { await reader.cancel("Request bodies are not accepted"); return true; }
    }
  } finally {
    reader.releaseLock();
  }
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
