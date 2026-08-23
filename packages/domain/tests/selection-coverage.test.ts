import { describe, expect, it } from "vitest";
import { assessmentOptionCodes, selectionCoverage } from "../src/selection-coverage";
import { ruleIds } from "../src/rules";

describe("assessment selection coverage", () => {
  it("documents every selectable code exactly once", () => {
    const expected = Object.entries(assessmentOptionCodes)
      .flatMap(([question, codes]) => codes.map((code) => `${question}:${code}`))
      .sort();
    const actual = selectionCoverage.map(({ question, code }) => `${question}:${code}`).sort();
    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(actual.length);
  });

  it("references only production Rule IDs", () => {
    const referenced = selectionCoverage.flatMap(({ ruleIds: referencedRuleIds }) => referencedRuleIds);
    expect(referenced.every((ruleId) => ruleIds.includes(ruleId))).toBe(true);
  });

  it("gives every code an explicit use/non-use reason", () => {
    expect(selectionCoverage.every(({ reason, use }) => reason.length > 0 && use.length > 0)).toBe(true);
  });
});
