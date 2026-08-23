import type { LocalResource, LocalResourceCategory } from "./types";

export type RawResourceRecord = Record<string, unknown>;

const readText = (record: RawResourceRecord, ...keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
};

const readCoordinate = (record: RawResourceRecord, ...keys: string[]) => {
  const value = readText(record, ...keys);
  if (!value || !/^-?\d+(?:\.\d+)?$/.test(value)) return undefined;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : undefined;
};

/** Adapts a row only when the required source fields are genuinely present. */
export function adaptResourceRecord(record: RawResourceRecord, options: {
  id: string; category: LocalResourceCategory; municipality: string; sourceId: string; dataUpdatedAt?: string;
}): LocalResource | undefined {
  const name = readText(record, "name", "名称", "施設名", "学校名", "医療機関名");
  if (!name) return undefined;
  const address = readText(record, "address", "住所", "所在地", "所在地_連結表記");
  const phone = readText(record, "phone", "電話", "電話番号");
  const website = readText(record, "website", "url", "URL", "ホームページ");
  const latitude = readCoordinate(record, "latitude", "緯度");
  const longitude = readCoordinate(record, "longitude", "経度");
  return {
    id: options.id, name, category: options.category, municipality: options.municipality,
    ...(address ? { address } : {}),
    ...(latitude === undefined ? {} : { latitude }),
    ...(longitude === undefined ? {} : { longitude }),
    ...(phone ? { phone } : {}),
    ...(website ? { website } : {}),
    sourceId: options.sourceId,
    ...(options.dataUpdatedAt ? { dataUpdatedAt: options.dataUpdatedAt } : {}),
  };
}

/** Parses the Tokyo CSV value without confusing a blank/non-numeric field for zero. */
export function adaptTokyoForeignPopulation(record: RawResourceRecord, nationalityColumn = "ミャンマー") {
  const municipalityCode = readText(record, "地域コード");
  const municipalityName = readText(record, "国・地域(人)");
  const value = readText(record, nationalityColumn);
  if (!municipalityCode || !municipalityName || !value || !/^\d+$/.test(value)) return undefined;
  return { municipalityCode, municipalityName, targetNationality: nationalityColumn === "ミャンマー" ? "Myanmar" : nationalityColumn, residentPopulation: Number(value) };
}
