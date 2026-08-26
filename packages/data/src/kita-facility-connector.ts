import { inflateSync } from "fflate";
import { schoolSelection, selectResources, type SelectedResource } from "./adapters/current-data";
import type { LocalResource } from "./adapters/types";
import {
  KITA_ELEMENTARY_SCHOOLS_URL,
  KITA_FACILITY_DATASET_KEY,
  KITA_FACILITY_EXPECTED_RESOURCE_COUNT,
  KITA_FACILITY_SOURCES,
  KITA_STANDARD_OPEN_DATA_URL,
  KITA_STANDARD_SELECTIONS,
} from "./kita-facility-source";

export const KITA_FACILITY_TIMEOUT_MS = 30_000;
export const KITA_SCHOOL_CSV_MAX_BYTES = 1024 * 1024;
export const KITA_STANDARD_ZIP_MAX_BYTES = 8 * 1024 * 1024;
export const KITA_FACILITY_MAX_FIELD_BYTES = 1024;

export type VerifiedKitaFacilityDataset = {
  datasetKey: typeof KITA_FACILITY_DATASET_KEY;
  datasetVersion: string;
  sourceUpdatedAt: string;
  sourceDates: Record<string, string>;
  fetchedAt: string;
  resources: LocalResource[];
};

export type KitaFacilityFetchOptions = {
  fetchImpl?: typeof fetch;
  now?: Date;
  extractZipImpl?: (bytes: Uint8Array) => Map<string, Uint8Array>;
  schoolEncoding?: "utf-8" | "shift_jis";
};

const utf8Encoder = new TextEncoder();
const crc32Table = Uint32Array.from({ length: 256 }, (_, value) => {
  let checksum = value;
  for (let bit = 0; bit < 8; bit += 1) checksum = checksum & 1 ? 0xedb88320 ^ (checksum >>> 1) : checksum >>> 1;
  return checksum >>> 0;
});
const allowedContentTypes = new Map([
  [KITA_ELEMENTARY_SCHOOLS_URL, new Set(["text/csv", "application/csv"])],
  [KITA_STANDARD_OPEN_DATA_URL, new Set(["application/zip", "application/x-zip-compressed", "application/octet-stream"])],
]);

export function assertAllowedKitaFacilityRequest(urlValue: string, method = "GET"): void {
  if (method !== "GET") throw new Error("Kita facility connector only allows GET");
  const url = new URL(urlValue);
  const allowed = [KITA_ELEMENTARY_SCHOOLS_URL, KITA_STANDARD_OPEN_DATA_URL]
    .map((value) => new URL(value))
    .some((candidate) =>
      url.protocol === "https:" && url.username === "" && url.password === "" && url.port === "" &&
      url.hostname === candidate.hostname && url.pathname === candidate.pathname && url.search === "" && url.hash === ""
    );
  if (!allowed) throw new Error("Kita facility source URL is outside the allowlist");
}

export async function fetchKitaFacilityDataset(
  options: KitaFacilityFetchOptions = {},
): Promise<VerifiedKitaFacilityDataset> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const fetchedAt = (options.now ?? new Date()).toISOString();
  const [schoolResponse, standardResponse] = await Promise.all([
    fetchBoundedSource(fetchImpl, KITA_ELEMENTARY_SCHOOLS_URL, KITA_SCHOOL_CSV_MAX_BYTES),
    fetchBoundedSource(fetchImpl, KITA_STANDARD_OPEN_DATA_URL, KITA_STANDARD_ZIP_MAX_BYTES),
  ]);
  const standardFiles = (options.extractZipImpl ?? extractZipFiles)(standardResponse.bytes);
  const sourceDates = new Map<string, string>();
  for (const source of KITA_FACILITY_SOURCES) {
    sourceDates.set(
      source.id,
      source.downloadUrl === KITA_ELEMENTARY_SCHOOLS_URL
        ? schoolResponse.dataUpdatedAt ?? source.dataUpdatedAt
        : standardResponse.dataUpdatedAt ?? source.dataUpdatedAt,
    );
  }
  return buildVerifiedKitaFacilityDataset({
    schoolCsvBytes: schoolResponse.bytes,
    standardArchiveBytes: standardResponse.bytes,
    standardFiles,
    fetchedAt,
    sourceDates,
    schoolEncoding: options.schoolEncoding,
  });
}

export async function buildVerifiedKitaFacilityDataset(input: {
  schoolCsvBytes: Uint8Array;
  standardArchiveBytes: Uint8Array;
  standardFiles: ReadonlyMap<string, Uint8Array>;
  fetchedAt: string;
  sourceDates?: ReadonlyMap<string, string>;
  schoolEncoding?: "utf-8" | "shift_jis";
}): Promise<VerifiedKitaFacilityDataset> {
  const schoolRecords = csvRecords(decode(input.schoolCsvBytes, input.schoolEncoding ?? "shift_jis"));
  assertUniqueSelectedRows(schoolRecords, schoolSelection);
  const resources = selectResources(schoolRecords, schoolSelection);

  for (const [filename, selection] of Object.entries(KITA_STANDARD_SELECTIONS)) {
    const bytes = input.standardFiles.get(filename);
    if (!bytes) throw new Error(`${filename} was not found in the Kita standard Open Data ZIP`);
    const records = csvRecords(decode(bytes, "utf-8"));
    assertUniqueSelectedRows(records, selection);
    resources.push(...selectResources(records, selection));
  }
  if (resources.length !== KITA_FACILITY_EXPECTED_RESOURCE_COUNT) {
    throw new Error(`Kita facility dataset must contain exactly ${KITA_FACILITY_EXPECTED_RESOURCE_COUNT} selected resources`);
  }

  const sourceDates = input.sourceDates ?? new Map(KITA_FACILITY_SOURCES.map((source) => [source.id, source.dataUpdatedAt]));
  const ids = new Set<string>();
  const normalized = resources.map((resource) => {
    if (ids.has(resource.id)) throw new Error(`Kita facility dataset contains duplicate ID ${resource.id}`);
    ids.add(resource.id);
    const sourceDate = sourceDates.get(resource.sourceId);
    if (!sourceDate || !/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) throw new Error(`Missing source date for ${resource.sourceId}`);
    assertNormalizedResource(resource);
    return { ...resource, dataUpdatedAt: sourceDate };
  });

  const digestBytes = joinDigestInputs(input.schoolCsvBytes, input.standardArchiveBytes);
  const digestInput = Uint8Array.from(digestBytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput.buffer);
  return {
    datasetKey: KITA_FACILITY_DATASET_KEY,
    datasetVersion: `sha256:${toHex(new Uint8Array(digest))}`,
    sourceUpdatedAt: [...sourceDates.values()].sort().at(-1)!,
    sourceDates: Object.fromEntries(sourceDates),
    fetchedAt: input.fetchedAt,
    resources: normalized,
  };
}

export function extractZipFiles(archiveBytes: Uint8Array): Map<string, Uint8Array> {
  const archive = Buffer.from(archiveBytes);
  const eocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const eocdOffset = archive.lastIndexOf(eocdSignature);
  if (eocdOffset < 0 || eocdOffset + 22 > archive.length) throw new Error("ZIP end-of-central-directory record is invalid");
  const entries = archive.readUInt16LE(eocdOffset + 10);
  if (entries < 1 || entries > 512) throw new Error("ZIP entry count is outside the allowed range");
  let offset = archive.readUInt32LE(eocdOffset + 16);
  const wanted = new Set(Object.keys(KITA_STANDARD_SELECTIONS));
  const files = new Map<string, Uint8Array>();
  let totalExtractedBytes = 0;

  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > archive.length || archive.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`ZIP central-directory entry ${index} is invalid`);
    }
    const method = archive.readUInt16LE(offset + 10);
    const flags = archive.readUInt16LE(offset + 8);
    const expectedChecksum = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const filenameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const nextOffset = offset + 46 + filenameLength + extraLength + commentLength;
    if (nextOffset > archive.length || localOffset + 30 > archive.length) throw new Error("ZIP entry exceeds archive bounds");
    const filename = new TextDecoder(flags & 0x0800 ? "utf-8" : "shift_jis", { fatal: true })
      .decode(archive.subarray(offset + 46, offset + 46 + filenameLength));
    if (wanted.has(filename)) {
      if (files.has(filename)) throw new Error(`ZIP contains duplicate selected entry ${filename}`);
      if (uncompressedSize > KITA_STANDARD_ZIP_MAX_BYTES) throw new Error(`${filename} exceeds the extracted size limit`);
      totalExtractedBytes += uncompressedSize;
      if (totalExtractedBytes > KITA_STANDARD_ZIP_MAX_BYTES) {
        throw new Error("Selected ZIP contents exceed the total extracted size limit");
      }
      if (archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`ZIP local entry for ${filename} is invalid`);
      const localFilenameLength = archive.readUInt16LE(localOffset + 26);
      const localExtraLength = archive.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + localFilenameLength + localExtraLength;
      if (dataOffset + compressedSize > archive.length) throw new Error(`ZIP data for ${filename} exceeds archive bounds`);
      const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
      const contents = method === 0
        ? compressed
        : method === 8
          ? inflateSync(compressed, new Uint8Array(uncompressedSize))
          : undefined;
      if (!contents || contents.byteLength !== uncompressedSize) throw new Error(`ZIP contents for ${filename} are invalid`);
      if (crc32(contents) !== expectedChecksum) throw new Error(`ZIP checksum for ${filename} is invalid`);
      files.set(filename, Uint8Array.from(contents));
    }
    offset = nextOffset;
  }
  return files;
}

function csvRecords(text: string): Record<string, unknown>[] {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const [header, ...body] = rows;
  if (!header?.length || new Set(header).size !== header.length || header.some((value) => !value.trim())) {
    throw new Error("CSV header is missing, blank, or duplicated");
  }
  if (header.some((field) => utf8Encoder.encode(field).byteLength > KITA_FACILITY_MAX_FIELD_BYTES)) {
    throw new Error("CSV header contains an oversized field");
  }
  return body.filter((row) => row.some((value) => value.trim())).map((row, index) => {
    if (row.length !== header.length) throw new Error(`CSV row ${index + 2} has an unexpected field count`);
    row.forEach((field) => {
      if (utf8Encoder.encode(field).byteLength > KITA_FACILITY_MAX_FIELD_BYTES) throw new Error(`CSV row ${index + 2} contains an oversized field`);
    });
    return Object.fromEntries(header.map((key, column) => [key.trim(), row[column]?.trim() ?? ""]));
  });
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let justClosedQuote = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"') {
        if (csv[index + 1] === '"') { field += '"'; index += 1; }
        else { quoted = false; justClosedQuote = true; }
      } else field += character;
      continue;
    }
    if (justClosedQuote) {
      if (character === ",") { row.push(field); field = ""; justClosedQuote = false; }
      else if (character === "\n") { row.push(field); rows.push(row); row = []; field = ""; justClosedQuote = false; }
      else if (character !== "\r" || csv[index + 1] !== "\n") throw new Error("CSV contains junk after a closing quote");
    } else if (character === '"') {
      if (field !== "") throw new Error("CSV contains malformed quoting");
      quoted = true;
    } else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rows.push(row); row = []; field = ""; }
    else field += character;
  }
  if (quoted) throw new Error("CSV contains an unclosed quote");
  if (field !== "" || row.length > 0) { row.push(field.endsWith("\r") ? field.slice(0, -1) : field); rows.push(row); }
  return rows;
}

function assertUniqueSelectedRows(records: Record<string, unknown>[], selections: readonly SelectedResource[]): void {
  for (const selection of selections) {
    const matches = records.filter((record) =>
      record["名称"] === selection.name || record["施設名"] === selection.name || record["学校名"] === selection.name
    );
    if (matches.length !== 1) throw new Error(`${selection.name} must appear exactly once in the selected Open Data dataset`);
  }
}

function assertNormalizedResource(resource: LocalResource): void {
  const bytes = [resource.name, resource.address, resource.phone, resource.website]
    .filter((value): value is string => value !== undefined)
    .map((value) => utf8Encoder.encode(value).byteLength);
  if (
    !resource.name || !resource.address?.startsWith("東京都北区") ||
    resource.latitude === undefined || resource.latitude < 35.70 || resource.latitude > 35.85 ||
    resource.longitude === undefined || resource.longitude < 139.65 || resource.longitude > 139.85 ||
    bytes.some((length) => length > KITA_FACILITY_MAX_FIELD_BYTES) ||
    (resource.website !== undefined && !/^https?:\/\//.test(resource.website))
  ) throw new Error(`${resource.id} failed normalized facility validation`);
}

async function fetchBoundedSource(fetchImpl: typeof fetch, url: string, maxBytes: number) {
  assertAllowedKitaFacilityRequest(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), KITA_FACILITY_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: url === KITA_ELEMENTARY_SCHOOLS_URL ? "text/csv" : "application/zip" },
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.redirected || (response.status >= 300 && response.status < 400)) throw new Error("Kita facility source redirects are not allowed");
    if (response.status !== 200) throw new Error(`Kita facility source request failed: ${response.status}`);
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (!contentType || !allowedContentTypes.get(url)?.has(contentType)) throw new Error(`Kita facility source has an invalid Content-Type: ${contentType ?? "missing"}`);
    const declaredLength = response.headers.get("content-length");
    if (declaredLength !== null && Number(declaredLength) > maxBytes) throw new Error("Kita facility source exceeds the response size limit");
    const bytes = await readLimitedBytes(response, maxBytes);
    const modified = response.headers.get("last-modified");
    const modifiedDate = modified ? new Date(modified) : undefined;
    return {
      bytes,
      dataUpdatedAt: modifiedDate && Number.isFinite(modifiedDate.getTime()) ? modifiedDate.toISOString().slice(0, 10) : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readLimitedBytes(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.body) throw new Error("Kita facility source response body is missing");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel(); throw new Error("Kita facility source exceeds the response size limit"); }
    chunks.push(value);
  }
  if (total === 0) throw new Error("Kita facility source response body is empty");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function decode(bytes: Uint8Array, encoding: "utf-8" | "shift_jis") {
  try { return new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { throw new Error(`Kita facility source is not valid ${encoding}`); }
}

function joinDigestInputs(school: Uint8Array, standard: Uint8Array): Uint8Array {
  const prefix = utf8Encoder.encode(`school:${school.byteLength}\nstandard:${standard.byteLength}\n`);
  const result = new Uint8Array(prefix.byteLength + school.byteLength + standard.byteLength);
  result.set(prefix);
  result.set(school, prefix.byteLength);
  result.set(standard, prefix.byteLength + school.byteLength);
  return result;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function crc32(bytes: Uint8Array): number {
  let checksum = 0xffffffff;
  for (const byte of bytes) checksum = crc32Table[(checksum ^ byte) & 0xff]! ^ (checksum >>> 8);
  return (checksum ^ 0xffffffff) >>> 0;
}
