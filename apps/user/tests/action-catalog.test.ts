import { describe, expect, it } from "vitest";
import {
  actionCatalog,
  actionIds,
  isActionCatalogEntryPublishable,
} from "@staybridge/domain/action-catalog";
import { sourceRegistry } from "@staybridge/data";
import {
  actionNotices,
  getUserMessages,
  selectableUserLocales,
} from "@staybridge/i18n/client";

describe("production Action Card integration", () => {
  it("resolves every catalogue source to current Source Registry metadata", () => {
    for (const entry of Object.values(actionCatalog)) {
      expect(entry.sourceIds.length).toBeGreaterThan(0);
      for (const sourceId of entry.sourceIds) {
        const source = sourceRegistry[sourceId];
        expect(source).toBeDefined();
        expect(source.url).toMatch(/^https:\/\//);
        expect(source.publisher.trim()).not.toBe("");
        expect(source.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }

    const facilitySourceIds = new Set(["KITA_ELEMENTARY_SCHOOLS_OPEN_DATA", "KITA_MEDICAL_INSTITUTIONS_OPEN_DATA", "KITA_CHILDCARE_FACILITIES_OPEN_DATA", "KITA_PUBLIC_FACILITIES_OPEN_DATA"]);
    for (const sourceId of facilitySourceIds) {
      expect(sourceRegistry[sourceId]).toMatchObject({ sourceType: "open_data" });
      expect(sourceRegistry[sourceId]?.license).toContain("CC BY 4.0");
      expect(sourceRegistry[sourceId]?.licenseUrl).toBe("https://creativecommons.org/licenses/by/4.0/");
    }

    const resolvedFacilityIds = Object.values(actionCatalog)
      .flatMap((entry) => entry.sourceIds)
      .filter((sourceId) => facilitySourceIds.has(sourceId));
    expect(resolvedFacilityIds).toEqual(expect.arrayContaining([...facilitySourceIds]));
    expect(resolvedFacilityIds).not.toEqual(expect.arrayContaining(["KITA_SCHOOL_PAGES", "KITA_MEDICAL_LIST_2026_05", "KITA_CHILD_CENTER_LIST", "KITA_LIBRARY_LIST"]));
  });

  it("keeps card copy, notices, and CTA destinations complete for selectable locales", () => {
    for (const locale of selectableUserLocales) {
      const messages = getUserMessages(locale);
      for (const id of actionIds) {
        const copy = messages.actions[id];
        expect(copy.title.trim()).not.toBe("");
        expect(copy.desc.trim()).not.toBe("");
        expect(copy.cta.trim()).not.toBe("");
        expect(actionNotices[locale][id].trim()).not.toBe("");
        expect(["help", "local"]).toContain(actionCatalog[id].destination.screen);
      }
    }
  });

  it("keeps the reviewed catalogue publishable on its review date", () => {
    for (const entry of Object.values(actionCatalog)) {
      expect(isActionCatalogEntryPublishable(entry, "2026-08-23")).toBe(true);
    }
  });
});
