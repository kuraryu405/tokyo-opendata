import bundledJson from "./normalized/kita-earthquake-shelters.json";
import { KITA_EARTHQUAKE_SHELTER_SOURCE } from "./source-descriptors";

export const KITA_SHELTER_HEADERS = [
  "施設名",
  "カテゴリ",
  "都道府県名",
  "住所",
  "緯度",
  "経度",
  "説明(日本語)",
] as const;

export const KITA_SHELTER_MAX_BYTES = 1024 * 1024;
export const KITA_SHELTER_MIN_ROWS = 50;
export const KITA_SHELTER_MAX_ROWS = 200;
export const KITA_SHELTER_MAX_FIELD_BYTES = 1024;
export const KITA_SHELTER_TIMEOUT_MS = 30_000;
export const KITA_SHELTER_BOUNDS = {
  minLatitude: 35.70,
  maxLatitude: 35.85,
  minLongitude: 139.65,
  maxLongitude: 139.85,
} as const;

export type NormalizedKitaShelter = {
  id: string;
  name: string;
  category: "emergency_shelter";
  municipality: "Kita";
  address: string;
  latitude: number;
  longitude: number;
  description?: string;
  sourceId: typeof KITA_EARTHQUAKE_SHELTER_SOURCE.id;
  dataUpdatedAt: string;
};

export type VerifiedKitaShelterDataset = {
  sourceId: typeof KITA_EARTHQUAKE_SHELTER_SOURCE.id;
  datasetVersion: string;
  dataUpdatedAt: string;
  fetchedAt: string;
  etag?: string;
  resources: NormalizedKitaShelter[];
};

export type KitaShelterFetchResult =
  | { status: "not_modified"; etag?: string; fetchedAt: string }
  | { status: "validated"; dataset: VerifiedKitaShelterDataset };

const utf8Encoder = new TextEncoder();

export function assertAllowedKitaShelterSourceUrl(value: string): void {
  const url = new URL(value);
  const allowed = new URL(KITA_EARTHQUAKE_SHELTER_SOURCE.url);
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hostname !== allowed.hostname ||
    url.port !== "" ||
    url.pathname !== allowed.pathname ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("Kita shelter source URL is outside the allowlist");
  }
}

/** RFC 4180-style parsing with explicit rejection of malformed quoting. */
export function parseKitaShelterCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let justClosedQuote = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"') {
        if (csv[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          justClosedQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (justClosedQuote) {
      if (character === ",") {
        row.push(field);
        field = "";
        justClosedQuote = false;
      } else if (character === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        justClosedQuote = false;
      } else if (character !== "\r" || csv[index + 1] !== "\n") {
        throw new Error("Kita shelter CSV contains junk after a closing quote");
      }
    } else if (character === '"') {
      if (field !== "") throw new Error("Kita shelter CSV contains malformed quoting");
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("Kita shelter CSV contains an unclosed quote");
  if (field !== "" || row.length > 0) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  return rows;
}

export async function buildVerifiedKitaShelterDataset(
  bytes: Uint8Array,
  options: { fetchedAt: string; dataUpdatedAt?: string; etag?: string },
): Promise<VerifiedKitaShelterDataset> {
  if (bytes.byteLength === 0 || bytes.byteLength > KITA_SHELTER_MAX_BYTES) {
    throw new Error("Kita shelter CSV must be between 1 byte and 1 MiB");
  }

  let csv: string;
  try {
    csv = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Kita shelter CSV is not valid UTF-8 text");
  }

  const parsed = parseKitaShelterCsv(csv.replace(/^\uFEFF/, ""));
  if (parsed.length < 2) throw new Error("Kita shelter CSV has no data rows");
  const [headers, ...rows] = parsed;
  if (headers.length !== KITA_SHELTER_HEADERS.length || headers.some((header, index) => header !== KITA_SHELTER_HEADERS[index])) {
    throw new Error(`Kita shelter CSV headers must exactly equal: ${KITA_SHELTER_HEADERS.join(",")}`);
  }
  if (rows.length < KITA_SHELTER_MIN_ROWS || rows.length > KITA_SHELTER_MAX_ROWS) {
    throw new Error(`Kita shelter CSV must contain between ${KITA_SHELTER_MIN_ROWS} and ${KITA_SHELTER_MAX_ROWS} data rows`);
  }

  const dataUpdatedAt = options.dataUpdatedAt ?? KITA_EARTHQUAKE_SHELTER_SOURCE.dataUpdatedAt;
  const duplicateNames = new Set<string>();
  const duplicateLocations = new Set<string>();
  const resources = rows.map((fields, rowIndex): NormalizedKitaShelter => {
    if (fields.length !== KITA_SHELTER_HEADERS.length) {
      throw new Error(`Kita shelter CSV row ${rowIndex + 2} has ${fields.length} fields; expected ${KITA_SHELTER_HEADERS.length}`);
    }
    fields.forEach((value, fieldIndex) => {
      if (utf8Encoder.encode(value).byteLength > KITA_SHELTER_MAX_FIELD_BYTES) {
        throw new Error(`Kita shelter CSV row ${rowIndex + 2} field ${fieldIndex + 1} exceeds 1 KiB`);
      }
    });
    const [name, sourceCategory, prefecture, address, latitudeText, longitudeText, description] = fields.map((field) => field.trim());
    if (!name || sourceCategory !== "避難所" || prefecture !== "東京都" || !/^北区\S/.test(address)) {
      throw new Error(`Kita shelter CSV row ${rowIndex + 2} has invalid required values`);
    }
    const latitude = Number(latitudeText);
    const longitude = Number(longitudeText);
    if (
      !latitudeText || !longitudeText || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < KITA_SHELTER_BOUNDS.minLatitude || latitude > KITA_SHELTER_BOUNDS.maxLatitude ||
      longitude < KITA_SHELTER_BOUNDS.minLongitude || longitude > KITA_SHELTER_BOUNDS.maxLongitude
    ) {
      throw new Error(`Kita shelter CSV row ${rowIndex + 2} has invalid coordinates`);
    }
    const locationKey = `${address}\u0000${latitude}\u0000${longitude}`;
    if (duplicateNames.has(name) || duplicateLocations.has(locationKey)) {
      throw new Error(`Kita shelter CSV row ${rowIndex + 2} is a duplicate`);
    }
    duplicateNames.add(name);
    duplicateLocations.add(locationKey);
    return {
      id: `kita-earthquake-shelter-${stableIdentifier(`${name}\u0000${address}`)}`,
      name,
      category: "emergency_shelter",
      municipality: "Kita",
      address,
      latitude,
      longitude,
      ...(description ? { description } : {}),
      sourceId: KITA_EARTHQUAKE_SHELTER_SOURCE.id,
      dataUpdatedAt,
    };
  });

  const digestInput = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput.buffer);
  return {
    sourceId: KITA_EARTHQUAKE_SHELTER_SOURCE.id,
    datasetVersion: `sha256:${toHex(new Uint8Array(digest))}`,
    dataUpdatedAt,
    fetchedAt: options.fetchedAt,
    ...(options.etag ? { etag: options.etag } : {}),
    resources,
  };
}

export async function fetchKitaEarthquakeShelters(options: {
  fetchImpl?: typeof fetch;
  etag?: string;
  now?: Date;
} = {}): Promise<KitaShelterFetchResult> {
  assertAllowedKitaShelterSourceUrl(KITA_EARTHQUAKE_SHELTER_SOURCE.url);
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), KITA_SHELTER_TIMEOUT_MS);
  const fetchedAt = (options.now ?? new Date()).toISOString();

  try {
    const headers = new Headers({ Accept: "text/csv" });
    if (options.etag) headers.set("If-None-Match", options.etag);
    const response = await fetchImpl(KITA_EARTHQUAKE_SHELTER_SOURCE.url, {
      method: "GET",
      headers,
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.redirected || (response.status >= 300 && response.status < 400 && response.status !== 304)) {
      throw new Error("Kita shelter CSV redirects are not allowed");
    }
    if (response.status === 304) {
      return { status: "not_modified", fetchedAt, ...(response.headers.get("etag") ? { etag: response.headers.get("etag")! } : {}) };
    }
    if (response.status !== 200) throw new Error(`Kita shelter CSV request failed: ${response.status}`);
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "text/csv") throw new Error("Kita shelter CSV response must use text/csv");
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > KITA_SHELTER_MAX_BYTES) {
      throw new Error("Kita shelter CSV response exceeds 1 MiB");
    }
    const bytes = await readLimitedBytes(response, KITA_SHELTER_MAX_BYTES);
    const lastModified = response.headers.get("last-modified");
    const parsedModified = lastModified ? new Date(lastModified) : undefined;
    const dataUpdatedAt = parsedModified && Number.isFinite(parsedModified.getTime())
      ? parsedModified.toISOString().slice(0, 10)
      : KITA_EARTHQUAKE_SHELTER_SOURCE.dataUpdatedAt;
    const etag = response.headers.get("etag") ?? undefined;
    return {
      status: "validated",
      dataset: await buildVerifiedKitaShelterDataset(bytes, { fetchedAt, dataUpdatedAt, etag }),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export const bundledKitaShelterDataset = bundledJson as VerifiedKitaShelterDataset;

async function readLimitedBytes(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error("Kita shelter CSV response exceeds 1 MiB");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function stableIdentifier(value: string): string {
  let hash = 0x811c9dc5;
  for (const byte of utf8Encoder.encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
