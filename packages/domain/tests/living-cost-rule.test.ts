import { describe, expect, it } from "vitest";
import { demoSituation } from "../src/demo";
import { generateActions, type RuleContext } from "../src/rules";
import type { Situation } from "../src/types";

const fixedContext: RuleContext = { asOfDate: "2026-08-23", stayAnswer: "known" };
const visitPurposes = ["tourism", "visiting_family_or_friends", "work", "study", "resident"] as const;

const situation = (visitPurpose: Situation["visitPurpose"], needs: Situation["needs"]): Situation => ({
  ...demoSituation,
  nationality: "UNKNOWN",
  currentMunicipality: "",
  visitPurpose,
  originalDepartureWindow: "unknown",
  returnStatus: "possible",
  stayDeadlineKnown: false,
  knownStayDeadline: undefined,
  accommodation: "prefer_not_to_say",
  japaneseLevel: "advanced",
  familyMembers: { children: [] },
  needs: [...needs],
});

const actions = (visitPurpose: Situation["visitPurpose"], needs: Situation["needs"]) =>
  generateActions(situation(visitPurpose, needs), fixedContext);

describe("living-cost and employment rule boundary", () => {
  it.each(visitPurposes)("does not infer employment from living cost for %s visits", (visitPurpose) => {
    const result = actions(visitPurpose, ["living_cost"]);

    expect(result.map((action) => action.id)).toEqual(["CHECK_LIVING_COST_SUPPORT"]);
    expect(result[0]).toMatchObject({
      ruleId: "R-LIVING-COST-NEED",
      reasonCode: "LIVING_COST_NEED",
      answerCodes: ["needs=living_cost"],
    });
  });

  it.each(visitPurposes)("keeps the employment action for explicit employment need on %s visits", (visitPurpose) => {
    const result = actions(visitPurpose, ["employment"]);
    const work = result.find((action) => action.id === "CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH");

    expect(work).toMatchObject({
      ruleId: "R-WORK-EMPLOYMENT-NEED",
      reasonCode: "EMPLOYMENT_NEED",
      answerCodes: ["needs=employment"],
    });
  });

  it.each(visitPurposes)("keeps both actions without conflating their reasons on %s visits", (visitPurpose) => {
    const result = actions(visitPurpose, ["living_cost", "employment"]);

    expect(result.map((action) => action.id)).toEqual([
      "CHECK_LIVING_COST_SUPPORT",
      "CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH",
    ]);
    expect(result.find((action) => action.id === "CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH")?.answerCodes)
      .toEqual(["needs=employment"]);
    expect(result.find((action) => action.id === "CHECK_LIVING_COST_SUPPORT")?.answerCodes)
      .toEqual(["needs=living_cost"]);
  });
});
