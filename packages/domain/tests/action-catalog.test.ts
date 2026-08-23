import { describe, expect, it } from "vitest";
import {
  actionCatalog,
  actionIds,
  assertValidActionCatalog,
  getActionCatalogEntry,
  getPublishableActionCatalogEntry,
  isActionCatalogEntryPublishable,
  type ActionCatalog,
} from "../src/action-catalog";

describe("actionCatalog", () => {
  it("keeps one complete static entry for every stable action ID", () => {
    expect(Object.keys(actionCatalog).sort()).toEqual([...actionIds].sort());
    expect(() => assertValidActionCatalog(actionCatalog)).not.toThrow();
  });

  it("requires high-risk entries to carry human review and safety copy", () => {
    for (const entry of Object.values(actionCatalog)) {
      expect(entry.fallback.title.trim()).not.toBe("");
      expect(entry.fallback.description.trim()).not.toBe("");
      expect(entry.fallback.cta.trim()).not.toBe("");
      expect(entry.fallback.notice.trim()).not.toBe("");
    }
    expect(Object.values(actionCatalog).filter((entry) => entry.riskLevel === "high").every((entry) => entry.humanReviewRequired)).toBe(true);
  });

  it("publishes reviewed entries only until their review deadline", () => {
    const entry = actionCatalog.CHECK_STAY_STATUS;
    expect(isActionCatalogEntryPublishable(entry, "2026-08-23")).toBe(true);
    expect(isActionCatalogEntryPublishable(entry, "2026-11-23")).toBe(true);
    expect(isActionCatalogEntryPublishable(entry, "2026-11-24")).toBe(false);
    expect(getPublishableActionCatalogEntry(entry.id, "2026-11-24")).toBeUndefined();
  });

  it("does not publish draft entries or accept unknown IDs", () => {
    const draft = { ...actionCatalog.CHECK_STAY_STATUS, review: { status: "draft" as const } };
    expect(isActionCatalogEntryPublishable(draft, "2026-08-23")).toBe(false);
    expect(getActionCatalogEntry("NOT_A_REAL_ACTION")).toBeUndefined();
  });

  it("rejects missing sources and unsafe high-risk metadata", () => {
    const missingSources = {
      ...actionCatalog,
      CHECK_STAY_STATUS: { ...actionCatalog.CHECK_STAY_STATUS, sourceIds: [] },
    } as unknown as ActionCatalog;
    const unsafeReview = {
      ...actionCatalog,
      CHECK_STAY_STATUS: { ...actionCatalog.CHECK_STAY_STATUS, humanReviewRequired: false },
    } as unknown as ActionCatalog;

    expect(() => assertValidActionCatalog(missingSources)).toThrow(/Missing source IDs/);
    expect(() => assertValidActionCatalog(unsafeReview)).toThrow(/High-risk action/);
  });
});
