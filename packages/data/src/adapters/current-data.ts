import { adaptResourceRecord, type RawResourceRecord } from "./open-data";
import type { LocalResource, LocalResourceCategory } from "./types";

export type SelectedResource = {
  id: string;
  name: string;
  category: LocalResourceCategory;
  sourceId: string;
  /** Validation-only expectation; it is never used to fabricate a cache field. */
  expectedAddress?: string;
};

/**
 * Current identity checks are deliberately stricter than a name lookup. The
 * values below are validation anchors from Kita's current school pages; the
 * generated resource still has to come from the machine-readable source row.
 */
export const schoolSelection = [
  { id: "kita-school-toyokawa", name: "豊川小学校", category: "school", sourceId: "KITA_ELEMENTARY_SCHOOLS_OPEN_DATA" },
  { id: "kita-school-ukima", name: "浮間小学校", category: "school", sourceId: "KITA_ELEMENTARY_SCHOOLS_OPEN_DATA" },
  { id: "kita-school-jujo", name: "十条小学校", category: "school", sourceId: "KITA_ELEMENTARY_SCHOOLS_OPEN_DATA", expectedAddress: "東京都北区中十条3-1-6" },
  { id: "kita-school-nishigaoka", name: "西が丘小学校", category: "school", sourceId: "KITA_ELEMENTARY_SCHOOLS_OPEN_DATA", expectedAddress: "東京都北区西が丘1-12-14" },
] as const satisfies readonly SelectedResource[];

/** Selects only source-backed rows and fails closed when a selected row disappears or drifts. */
export function selectResources(records: RawResourceRecord[], selected: readonly SelectedResource[]): LocalResource[] {
  return selected.map((selection) => {
    const record = records.find((candidate) => candidate["名称"] === selection.name || candidate["施設名"] === selection.name || candidate["学校名"] === selection.name);
    if (!record) throw new Error(`${selection.name} was not found in the selected Open Data dataset.`);
    const resource = adaptResourceRecord(record, { id: selection.id, category: selection.category, municipality: "Kita", sourceId: selection.sourceId });
    if (!resource) throw new Error(`${selection.name} has no usable source name and will not be fabricated.`);
    if (selection.expectedAddress && resource.address !== selection.expectedAddress) {
      throw new Error(`${selection.name} failed the current identity/address check: expected ${selection.expectedAddress}, source provided ${resource.address ?? "no address"}.`);
    }
    return resource;
  });
}
