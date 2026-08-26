import { describe, expect, it } from "vitest";
import { actionCatalog } from "@staybridge/domain/action-catalog";
import { actionRules } from "@staybridge/domain/rules";
import { assessmentOptionCodes, selectionCoverage } from "@staybridge/domain/selection-coverage";
import { sourceRegistry } from "@staybridge/data";

describe("public need -> rule -> action -> source coverage", () => {
  it.each(assessmentOptionCodes.needs)("defines a complete roadmap chain for need=%s", (need) => {
    const coverage = selectionCoverage.find((entry) => entry.question === "needs" && entry.code === need);
    expect(coverage, `missing selection coverage for needs=${need}`).toBeDefined();
    // 「特になし」is the one honest opt-out; every real need must drive a rule.
    expect(coverage?.use === "explicit_no_card").toBe(need === "none");
    if (coverage?.use !== "rule_input") return;
    expect(coverage?.ruleIds.length, `needs=${need} must reference at least one rule`).toBeGreaterThan(0);

    for (const ruleId of coverage?.ruleIds ?? []) {
      const rule = actionRules.find((candidate) => candidate.id === ruleId);
      expect(rule, `needs=${need} references missing rule ${ruleId}`).toBeDefined();
      const action = rule ? actionCatalog[rule.actionId] : undefined;
      expect(action, `rule ${ruleId} references a missing action`).toBeDefined();
      expect(action?.sourceIds.length, `action for ${ruleId} must cite at least one source`).toBeGreaterThan(0);
      for (const sourceId of action?.sourceIds ?? []) {
        expect(sourceRegistry[sourceId], `action for ${ruleId} references missing source ${sourceId}`).toBeDefined();
      }
    }
  });

  it("covers every public needs option exactly once", () => {
    const coveredNeeds = selectionCoverage
      .filter((entry) => entry.question === "needs")
      .map((entry) => entry.code)
      .sort();
    expect(coveredNeeds).toEqual([...assessmentOptionCodes.needs].sort());
    expect(new Set(coveredNeeds).size).toBe(coveredNeeds.length);
  });
});