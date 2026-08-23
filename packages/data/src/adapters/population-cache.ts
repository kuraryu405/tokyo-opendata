import type { PopulationCache, PopulationCacheRecord } from "./types";

/** Returns a source-backed cache record, never a guessed population value. */
export function getPopulationCacheRecord(
  cache: PopulationCache,
  municipalityCode: string,
  targetNationality: string,
): PopulationCacheRecord {
  const record = cache.records.find((item) =>
    item.municipalityCode === municipalityCode && item.targetNationality === targetNationality,
  );
  if (!record) {
    throw new Error(`Population cache is missing ${municipalityCode}/${targetNationality}. Refresh or repair the cache.`);
  }
  return record;
}
