import { describe, expect, it } from "vitest";
import { demoSituation } from "../src/demo";
import { generateActions, parseAiActionIds } from "../src/rules";
import type { Situation } from "../src/types";

const situation = (overrides: Partial<Situation> = {}): Situation => ({
  ...demoSituation,
  familyMembers: { children: [...demoSituation.familyMembers.children] },
  needs: [...demoSituation.needs],
  ...overrides,
});
const ids = (input: Situation) => generateActions(input).map((action) => action.id);

describe("generateActions", () => {
  it("does not add crisis-specific urgent actions when return is possible", () => {
    expect(ids(situation({ returnStatus: "possible", needs: [] }))).not.toEqual(expect.arrayContaining(["CHECK_STAY_STATUS", "PLAN_TEMPORARY_LIVING"]));
  });
  it("adds stay-status checking for a stranded tourist", () => expect(ids(situation())).toContain("CHECK_STAY_STATUS"));
  it("adds education for a stranded visitor with a child aged 6–11", () => expect(ids(situation())).toContain("CHECK_CHILD_EDUCATION"));
  it("does not add school resources without a child", () => {
    const actions = generateActions(situation({ familyMembers: { children: [] } }));
    expect(actions.some((action) => action.localResourceCategories?.includes("school"))).toBe(false);
  });
  it("plans temporary living for a stranded hotel guest", () => expect(ids(situation())).toContain("PLAN_TEMPORARY_LIVING"));
  it("plans temporary living when accommodation is unstable", () => {
    expect(ids(situation({ accommodation: "unstable" }))).toContain("PLAN_TEMPORARY_LIVING");
  });
  it("checks eligibility instead of presenting a direct job search", () => {
    const result = ids(situation({ needs: ["employment"] }));
    expect(result).toContain("CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH");
    expect(result.some((id) => /JOB_SEARCH/.test(id) && id !== "CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH")).toBe(false);
  });
  it("connects a medical need to medical local resources", () => {
    expect(generateActions(situation({ needs: ["medical"] })).find((action) => action.id === "CHECK_MEDICAL_OPTIONS")?.localResourceCategories).toContain("medical");
  });
  it("adds a consultation action for a living-cost concern", () => {
    const actions = generateActions(situation({ needs: ["living_cost"] }));
    const action = actions.find((item) => item.id === "CHECK_LIVING_COST_SUPPORT");
    expect(action?.category).toBe("living_cost");
    expect(action?.humanReviewRequired).toBe(true);
    expect(actions.map((item) => item.id)).toContain("CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH");
  });
  it("adds child local support for a preschool child when childcare is needed", () => {
    const actions = generateActions(situation({
      familyMembers: { children: [{ ageGroup: "3-5" }] },
      needs: ["childcare"],
    }));
    expect(actions.find((action) => action.id === "CHECK_CHILD_LOCAL_SUPPORT")?.localResourceCategories).toContain("child_support");
  });
  it.each(["resident", "work", "study"] as const)("offers official next steps for a stranded %s", (visitPurpose) => {
    const result = ids(situation({ visitPurpose, needs: [] }));
    expect(result).toEqual(expect.arrayContaining(["CHECK_STAY_STATUS", "CONTACT_OFFICIAL_SUPPORT"]));
  });
  it("handles an unknown return status by offering consultation", () => expect(ids(situation({ returnStatus: "unknown", needs: [] }))).toContain("CONTACT_OFFICIAL_SUPPORT"));
  it("raises stay priority when the departure window is near", () => {
    const now = generateActions(situation({ originalDepartureWindow: "within_7_days" })).find((action) => action.id === "CHECK_STAY_STATUS")!.priority;
    const later = generateActions(situation({ originalDepartureWindow: "within_3_months" })).find((action) => action.id === "CHECK_STAY_STATUS")!.priority;
    expect(now).toBeGreaterThan(later);
  });
  it("routes a past stay deadline to immediate official actions", () => {
    const actions = generateActions(situation({
      returnStatus: "possible",
      japaneseLevel: "advanced",
      needs: [],
      stayDeadlineKnown: true,
      knownStayDeadline: "2026-08-13",
    }), { asOfDate: "2026-08-14" });
    expect(actions.map((action) => action.id)).toEqual(expect.arrayContaining(["CHECK_STAY_STATUS", "CONTACT_OFFICIAL_SUPPORT"]));
    expect(actions.find((action) => action.id === "CONTACT_OFFICIAL_SUPPORT")?.timing).toBe("today");
    expect(actions.map((action) => action.id)).not.toContain("CHECK_BEFORE_STAY_DEADLINE");
  });
  it("keeps a deadline on the as-of date in the before-deadline flow", () => {
    const actions = generateActions(situation({
      returnStatus: "possible",
      japaneseLevel: "advanced",
      needs: [],
      stayDeadlineKnown: true,
      knownStayDeadline: "2026-08-14",
    }), { asOfDate: "2026-08-14" });
    expect(actions.map((action) => action.id)).toContain("CHECK_BEFORE_STAY_DEADLINE");
    expect(actions.map((action) => action.id)).not.toContain("CHECK_STAY_STATUS");
  });
  it("works without a location so the UI can fall back to citywide resources", () => {
    expect(() => generateActions(situation({ currentMunicipality: "" }))).not.toThrow();
    expect(ids(situation({ currentMunicipality: "" }))).toContain("CHECK_MEDICAL_OPTIONS");
  });
  it("adds only validated Workers AI suggestions without replacing stronger rules", () => {
    const actions = generateActions(situation(), {
      recommendedActionIds: ["CHECK_LIVING_COST_SUPPORT", "CHECK_STAY_STATUS"],
    });
    expect(actions.find((action) => action.id === "CHECK_LIVING_COST_SUPPORT")?.reasonCode).toBe("OTHER_VISIT_PURPOSE");
    expect(actions.find((action) => action.id === "CHECK_STAY_STATUS")?.reasonCode).toBe("RETURN_DIFFICULT_SHORT_TERM");
  });
  it("rejects unknown, duplicate, and excessive Workers AI card ids", () => {
    expect(parseAiActionIds([
      "CHECK_MEDICAL_OPTIONS",
      "NOT_ALLOWED",
      "CHECK_MEDICAL_OPTIONS",
      "FIND_LANGUAGE_SUPPORT",
      "CONTACT_OFFICIAL_SUPPORT",
      "CHECK_STAY_STATUS",
    ])).toEqual(["CHECK_MEDICAL_OPTIONS", "FIND_LANGUAGE_SUPPORT", "CONTACT_OFFICIAL_SUPPORT"]);
  });
  it("is deterministic and does not mutate its input", () => {
    const input = situation();
    expect(generateActions(input)).toEqual(generateActions(input));
    expect(input).toEqual(demoSituation);
  });
});
