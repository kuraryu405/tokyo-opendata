export * from "./sources";
export * from "./adapters/types";
export * from "./adapters/open-data";
export * from "./adapters/population-cache";
export * from "./normalized/kita-resources";
export * from "./source-descriptors";
export * from "./kita-shelter-connector";
export { default as bundledKitaShelters } from "./normalized/kita-earthquake-shelters.json";

import { localResources } from "./normalized/kita-resources";
import type { LocalResource, LocalResourceCategory } from "./adapters/types";

export function filterLocalResources(options: { municipality?: string; category?: LocalResourceCategory; limit?: number } = {}): LocalResource[] {
  const municipality = options.municipality?.trim().toLowerCase();
  return localResources
    .filter((resource) => !municipality || resource.municipality.toLowerCase() === municipality)
    .filter((resource) => !options.category || resource.category === options.category)
    .slice(0, options.limit ?? Number.POSITIVE_INFINITY);
}
