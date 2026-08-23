import { describe, expect, it } from "vitest";
import { demoSituation } from "../src/demo";
import { actionRules, generateActions, ruleIds, type RuleContext } from "../src/rules";
import type { Situation } from "../src/types";

const fixedContext: RuleContext = { asOfDate: "2026-08-23", stayAnswer: "known" };
const situation = (overrides: Partial<Situation> = {}): Situation => ({
  ...demoSituation,
  familyMembers: { children: [...demoSituation.familyMembers.children] },
  needs: [...demoSituation.needs],
  ...overrides,
});
const quietSituation = (overrides: Partial<Situation> = {}): Situation => situation({
  nationality: "UNKNOWN",
  currentMunicipality: "",
  visitPurpose: "other",
  originalDepartureWindow: "unknown",
  returnStatus: "possible",
  stayDeadlineKnown: false,
  knownStayDeadline: undefined,
  accommodation: "prefer_not_to_say",
  japaneseLevel: "advanced",
  familyMembers: { children: [] },
  needs: [],
  ...overrides,
});
const actions = (input: Situation, context: RuleContext = fixedContext) => generateActions(input, context);
const ids = (input: Situation, context: RuleContext = fixedContext) => actions(input, context).map((action) => action.id);

describe("production action rule table", () => {
  it("has unique stable Rule IDs with complete management metadata", () => {
    expect(actionRules.map((candidate) => candidate.id)).toEqual(ruleIds);
    expect(new Set(ruleIds).size).toBe(ruleIds.length);
    expect(actionRules.every((candidate) => candidate.conditions && candidate.exclusions && candidate.reasonCode && candidate.sourcePolicy === "catalog_sources_required")).toBe(true);
  });

  it("does not use display labels or nationality in predicates", () => {
    const left = actions(situation({ nationality: "MMR" }));
    const right = actions(situation({ nationality: "UNKNOWN" }));
    expect(left).toEqual(right);
    expect(left.flatMap((action) => action.answerCodes).some((code) => code.startsWith("nationality="))).toBe(false);
  });

  it("matches every production Rule ID in the branch fixture set", () => {
    const branchResults = [
      actions(quietSituation({ stayDeadlineKnown: true, knownStayDeadline: "2026-08-22" })),
      actions(quietSituation({ stayDeadlineKnown: true, knownStayDeadline: "2026-08-23" })),
      actions(quietSituation({ stayDeadlineKnown: true, knownStayDeadline: "2026-08-24" })),
      actions(demoSituation, { ...fixedContext, stayAnswer: "unknown" }),
      actions(situation({ originalDepartureWindow: "within_3_months" })),
      actions(quietSituation({ returnStatus: "difficult", visitPurpose: "resident" })),
      actions(quietSituation({ returnStatus: "unknown" })),
      actions(quietSituation(), { ...fixedContext, stayAnswer: "documents" }),
      actions(quietSituation({
        returnStatus: "difficult",
        accommodation: "unstable",
        familyMembers: { children: [{ ageGroup: "6-11" }] },
        needs: ["accommodation", "living_cost", "employment", "education", "childcare", "medical", "language"],
      })),
    ];
    const matched = new Set(branchResults.flatMap((result) => result.flatMap((action) => action.matchedRuleIds)));
    expect([...matched].sort()).toEqual([...ruleIds].sort());
  });
});

describe("generateActions", () => {
  it("returns an explicit empty fallback when no rule matches", () => {
    expect(actions(quietSituation())).toEqual([]);
  });

  it("uses safe consultation fallbacks for unknown return and stay answers", () => {
    const returnUnknown = actions(quietSituation({ returnStatus: "unknown" }));
    const stayUnknown = actions(quietSituation(), { ...fixedContext, stayAnswer: "unknown" });
    expect(returnUnknown.find((action) => action.id === "CONTACT_OFFICIAL_SUPPORT")?.ruleId).toBe("R-CONSULT-RETURN-UNKNOWN");
    expect(stayUnknown.find((action) => action.id === "CONTACT_OFFICIAL_SUPPORT")?.ruleId).toBe("R-CONSULT-STAY-UNKNOWN");
  });

  it("routes document uncertainty to official consultation", () => {
    expect(actions(quietSituation(), { ...fixedContext, stayAnswer: "documents" })[0]?.ruleId).toBe("R-CONSULT-STAY-DOCUMENTS");
  });

  it("raises short-visit stay priority when departure is near", () => {
    const near = actions(situation({ originalDepartureWindow: "within_7_days" })).find((action) => action.id === "CHECK_STAY_STATUS");
    const later = actions(situation({ originalDepartureWindow: "within_3_months" })).find((action) => action.id === "CHECK_STAY_STATUS");
    expect(near?.priority).toBe(100);
    expect(near?.ruleId).toBe("R-STAY-RETURN-DIFFICULT-SHORT-NEAR");
    expect(later?.priority).toBe(90);
    expect(later?.ruleId).toBe("R-STAY-RETURN-DIFFICULT-SHORT-LATER");
  });

  it.each(["resident", "work", "study", "other", "unknown"] as const)("uses the safe non-short branch for a difficult-return %s answer", (visitPurpose) => {
    expect(ids(quietSituation({ returnStatus: "difficult", visitPurpose }))).toEqual(["CHECK_STAY_STATUS", "CONTACT_OFFICIAL_SUPPORT"]);
  });

  it("deduplicates an Action ID and resolves priority, reason, timing, and Rule ID from one winner", () => {
    const result = actions(situation({ needs: ["stay"] }));
    const stayCards = result.filter((action) => action.id === "CHECK_STAY_STATUS");
    expect(stayCards).toHaveLength(1);
    expect(stayCards[0]).toMatchObject({ priority: 100, ruleId: "R-STAY-RETURN-DIFFICULT-SHORT-NEAR", reasonCode: "RETURN_DIFFICULT_SHORT_TERM", timing: "today" });
    expect(stayCards[0]?.matchedRuleIds).toEqual(["R-STAY-RETURN-DIFFICULT-SHORT-NEAR", "R-STAY-NEED"]);
  });

  it("uses Rule ID as a deterministic tie-breaker", () => {
    const result = actions(quietSituation({ returnStatus: "unknown", needs: ["consultation"] }));
    const consultation = result.find((action) => action.id === "CONTACT_OFFICIAL_SUPPORT");
    expect(consultation?.priority).toBe(80);
    expect(consultation?.ruleId).toBe("R-CONSULT-NEED");
    expect(consultation?.matchedRuleIds).toEqual(["R-CONSULT-NEED", "R-CONSULT-RETURN-UNKNOWN"]);
  });

  it.each([
    ["2026-08-22", "R-STAY-DEADLINE-PAST", ["CHECK_STAY_STATUS", "CONTACT_OFFICIAL_SUPPORT"]],
    ["2026-08-23", "R-STAY-DEADLINE-TODAY", ["CHECK_STAY_STATUS", "CONTACT_OFFICIAL_SUPPORT"]],
    ["2026-08-24", "R-STAY-DEADLINE-FUTURE", ["CHECK_BEFORE_STAY_DEADLINE"]],
  ] as const)("distinguishes a %s deadline", (knownStayDeadline, expectedRule, expectedIds) => {
    const result = actions(quietSituation({ stayDeadlineKnown: true, knownStayDeadline }));
    expect(result.map((action) => action.id)).toEqual(expectedIds);
    expect(result[0]?.ruleId).toBe(expectedRule);
  });

  it("ignores an entered deadline when the current stay answer is unknown", () => {
    const result = actions(quietSituation({ stayDeadlineKnown: true, knownStayDeadline: "2026-08-22" }), { ...fixedContext, stayAnswer: "unknown" });
    expect(result.map((action) => action.id)).toEqual(["CONTACT_OFFICIAL_SUPPORT"]);
    expect(result[0]?.ruleId).toBe("R-CONSULT-STAY-UNKNOWN");
  });

  it("rejects a missing or invalid injected as-of date", () => {
    expect(() => generateActions(quietSituation(), { asOfDate: "2026-02-30", stayAnswer: "known" })).toThrow(/asOfDate/);
  });

  it("treats an invalid optional deadline as no matching deadline", () => {
    expect(actions(quietSituation({ stayDeadlineKnown: true, knownStayDeadline: "2026-02-30" }))).toEqual([]);
  });

  it("covers accommodation, medical, employment, living cost, and language needs without deciding eligibility", () => {
    const result = actions(quietSituation({ needs: ["accommodation", "medical", "employment", "living_cost", "language"] }));
    expect(result.map((action) => action.id)).toEqual([
      "PLAN_TEMPORARY_LIVING",
      "CHECK_LIVING_COST_SUPPORT",
      "CHECK_MEDICAL_OPTIONS",
      "CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH",
      "FIND_LANGUAGE_SUPPORT",
    ]);
    expect(result.find((action) => action.id === "CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH")?.humanReviewRequired).toBe(true);
  });

  it("adds education and child support only at their age and need boundaries", () => {
    const schoolAge = ids(quietSituation({ familyMembers: { children: [{ ageGroup: "6-11" }] }, needs: ["education", "childcare"] }));
    const adult = ids(quietSituation({ familyMembers: { children: [{ ageGroup: "18+" }] }, needs: ["education", "childcare"] }));
    expect(schoolAge).toEqual(["CHECK_CHILD_EDUCATION", "CHECK_CHILD_LOCAL_SUPPORT"]);
    expect(adult).toEqual([]);
  });

  it("preserves the exact selected child age codes in a deterministic trace", () => {
    const result = actions(quietSituation({
      familyMembers: { children: [{ ageGroup: "15-17" }, { ageGroup: "6-11" }, { ageGroup: "15-17" }] },
      needs: ["education", "childcare"],
    }));
    expect(result.find((action) => action.id === "CHECK_CHILD_EDUCATION")?.answerCodes).toEqual([
      "needs=education",
      "childAge=15-17",
      "childAge=6-11",
    ]);
    expect(result.find((action) => action.id === "CHECK_CHILD_LOCAL_SUPPORT")?.answerCodes).toEqual([
      "needs=childcare",
      "childAge=15-17",
      "childAge=6-11",
    ]);
  });

  it("works without municipality and preserves the input", () => {
    const input = quietSituation({ currentMunicipality: "", needs: ["medical"] });
    const snapshot = structuredClone(input);
    expect(ids(input)).toEqual(["CHECK_MEDICAL_OPTIONS"]);
    expect(input).toEqual(snapshot);
  });

  it("is deterministic across repeated evaluations", () => {
    const input = situation();
    expect(actions(input)).toEqual(actions(input));
  });
});
