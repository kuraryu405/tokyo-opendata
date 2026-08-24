import { describe, expect, it } from "vitest";
import { demoSituation } from "../src/demo";
import {
  mergeAiRecommendedActions,
  parseAiActionIds,
} from "../src/ai-actions";
import { generateActions } from "../src/rules";

const context = { asOfDate: "2026-08-24", stayAnswer: "unknown" } as const;

describe("Q3 AI action boundary", () => {
  it("accepts only unique allowlisted action IDs, up to three", () => {
    expect(parseAiActionIds([])).toEqual([]);
    expect(parseAiActionIds(["CHECK_MEDICAL_OPTIONS", "CONTACT_OFFICIAL_SUPPORT"])).toEqual([
      "CHECK_MEDICAL_OPTIONS",
      "CONTACT_OFFICIAL_SUPPORT",
    ]);
    expect(parseAiActionIds(["CHECK_MEDICAL_OPTIONS", "CHECK_MEDICAL_OPTIONS"])).toBeNull();
    expect(parseAiActionIds(["CHECK_MEDICAL_OPTIONS", "NOT_ALLOWED"])).toBeNull();
    expect(parseAiActionIds([
      "CHECK_STAY_STATUS",
      "CONTACT_OFFICIAL_SUPPORT",
      "CHECK_MEDICAL_OPTIONS",
      "FIND_LANGUAGE_SUPPORT",
    ])).toBeNull();
    expect(parseAiActionIds("CHECK_MEDICAL_OPTIONS")).toBeNull();
    expect(parseAiActionIds(new Array(1))).toBeNull();
  });

  it("unions AI cards without removing or replacing Rule Engine cards", () => {
    const ruleActions = generateActions(demoSituation, context);
    const ruleSnapshot = ruleActions.map(({ id, priority, ruleId }) => ({ id, priority, ruleId }));
    const merged = mergeAiRecommendedActions(
      ruleActions,
      ["CONTACT_OFFICIAL_SUPPORT", "CHECK_LIVING_COST_SUPPORT"],
      context.asOfDate,
    );

    expect(merged.filter(({ id }) => id === "CONTACT_OFFICIAL_SUPPORT")).toHaveLength(1);
    expect(merged.find(({ id }) => id === "CHECK_LIVING_COST_SUPPORT")).toMatchObject({
      selectionSource: "ai",
      ruleId: null,
      priority: 55,
    });
    expect(merged.filter(({ selectionSource }) => selectionSource === "rule").map(({ id, priority, ruleId }) => ({ id, priority, ruleId })))
      .toEqual(ruleSnapshot);
  });

  it("drops a catalogue card that is not publishable on the assessment date", () => {
    expect(mergeAiRecommendedActions([], ["CHECK_MEDICAL_OPTIONS"], "2028-01-01")).toEqual([]);
  });
});
