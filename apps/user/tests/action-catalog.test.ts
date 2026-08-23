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

    const highRiskSourceTypes = Object.values(actionCatalog)
      .filter((entry) => entry.riskLevel === "high")
      .flatMap((entry) => entry.sourceIds.map((sourceId) => sourceRegistry[sourceId]?.sourceType));
    expect(highRiskSourceTypes.every((sourceType) =>
      sourceType === "official_information" || sourceType === "official_public_list",
    )).toBe(true);
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
