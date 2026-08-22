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

/** Adapts a row only when the required source fields are genuinely present. */
export function adaptResourceRecord(record: RawResourceRecord, options: {
  id: string; category: LocalResourceCategory; municipality: string; sourceId: string; dataUpdatedAt?: string;
}): LocalResource | undefined {
  const name = readText(record, "name", "名称", "施設名称", "学校名", "医療機関名");
  if (!name) return undefined;
  return {
    id: options.id, name, category: options.category, municipality: options.municipality,
    address: readText(record, "address", "住所", "所在地"), phone: readText(record, "phone", "電話", "電話番号"),
    website: readText(record, "website", "url", "URL", "ホームページ"),
    sourceId: options.sourceId, dataUpdatedAt: options.dataUpdatedAt,
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
