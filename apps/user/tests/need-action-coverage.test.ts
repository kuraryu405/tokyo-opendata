import { describe, expect, it } from "vitest";
import { actionCatalog } from "@staybridge/domain/action-catalog";
import { actionRules } from "@staybridge/domain/rules";
import { assessmentOptionCodes, selectionCoverage } from "@staybridge/domain/selection-coverage";
import { sourceRegistry } from "@staybridge/data";

describe("public need -> rule -> action -> source coverage", () => {
  it.each(assessmentOptionCodes.needs)("defines an explicit roadmap contract for need=%s", (need) => {
    const coverage = selectionCoverage.find((entry) => entry.question === "needs" && entry.code === need);
    expect(coverage, `missing selection coverage for needs=${need}`).toBeDefined();
    if (!coverage) return;

    if (coverage.use !== "rule_input") {
      expect(coverage.reason.trim().length).toBeGreaterThan(0);
      expect(coverage.ruleIds).toHaveLength(0);
      return;
    }

    expect(coverage.ruleIds.length, `needs=${need} must reference at least one rule`).toBeGreaterThan(0);
    for (const ruleId of coverage.ruleIds) {
      const rule = actionRules.find((candidate) => candidate.id === ruleId);
      expect(rule, `needs=${need} references missing rule ${ruleId}`).toBeDefined();
      if (!rule) continue;

      const action = actionCatalog[rule.actionId];
      expect(action, `rule ${ruleId} references missing action ${rule.actionId}`).toBeDefined();
      expect(action.sourceIds.length, `action ${rule.actionId} must cite at least one source`).toBeGreaterThan(0);
      for (const sourceId of action.sourceIds) {
        expect(sourceRegistry[sourceId], `action ${rule.actionId} references missing source ${sourceId}`).toBeDefined();
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