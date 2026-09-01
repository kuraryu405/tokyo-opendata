import { demoSituation } from "../../src/demo";
import type { RuleContext } from "../../src/rules";
import type { Situation } from "../../src/types";

export type GoldenCase = {
  name: string;
  situation: Situation;
  context: RuleContext;
  expected: Array<{ id: string; ruleId: string; timing: string; priority: number; reasonCode: string }>;
};

export const ruleGoldenCases: GoldenCase[] = [
  {
    name: "stranded-short-visit-family",
    situation: demoSituation,
    context: { asOfDate: "2026-08-23", stayAnswer: "unknown" },
    expected: [
      { id: "CHECK_STAY_STATUS", ruleId: "R-STAY-RETURN-DIFFICULT-SHORT-NEAR", timing: "today", priority: 100, reasonCode: "RETURN_DIFFICULT_SHORT_TERM" },
      { id: "CONTACT_OFFICIAL_SUPPORT", ruleId: "R-CONSULT-RETURN-DIFFICULT-SHORT", timing: "this_week", priority: 95, reasonCode: "RETURN_DIFFICULT_SHORT_TERM" },
      { id: "PLAN_TEMPORARY_LIVING", ruleId: "R-HOUSING-HOTEL", timing: "this_week", priority: 85, reasonCode: "TEMPORARY_HOTEL" },
      { id: "CHECK_CHILD_EDUCATION_GUIDANCE", ruleId: "R-EDUCATION-NEED", timing: "this_week", priority: 76, reasonCode: "SCHOOL_AGE_CHILD" },
      { id: "FIND_NEARBY_SCHOOLS", ruleId: "R-EDUCATION-SCHOOL-AGE-RETURN", timing: "next_30_days", priority: 75, reasonCode: "SCHOOL_AGE_CHILD" },
      { id: "CHECK_MEDICAL_OPTIONS", ruleId: "R-MEDICAL-NEED", timing: "next_30_days", priority: 70, reasonCode: "MEDICAL_NEED" },
      { id: "CHECK_CHILD_LOCAL_SUPPORT", ruleId: "R-CHILD-SCHOOL-AGE-RETURN", timing: "next_30_days", priority: 68, reasonCode: "CHILD_LOCAL_ROUTINE" },
      { id: "CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH", ruleId: "R-WORK-EMPLOYMENT-NEED", timing: "next_30_days", priority: 65, reasonCode: "EMPLOYMENT_NEED" },
      { id: "FIND_LANGUAGE_SUPPORT", ruleId: "R-LANGUAGE-LEVEL", timing: "this_week", priority: 60, reasonCode: "LANGUAGE_BARRIER" },
    ],
  },
  {
    name: "deadline-today",
    situation: {
      ...demoSituation,
      returnStatus: "possible",
      stayDeadlineKnown: true,
      knownStayDeadline: "2026-08-23",
      accommodation: "rental",
      japaneseLevel: "advanced",
      familyMembers: { children: [] },
      needs: [],
    },
    context: { asOfDate: "2026-08-23", stayAnswer: "known" },
    expected: [
      { id: "CHECK_STAY_STATUS", ruleId: "R-STAY-DEADLINE-TODAY", timing: "today", priority: 108, reasonCode: "KNOWN_STAY_DEADLINE" },
      { id: "CONTACT_OFFICIAL_SUPPORT", ruleId: "R-CONSULT-DEADLINE-TODAY", timing: "today", priority: 103, reasonCode: "KNOWN_STAY_DEADLINE" },
    ],
  },
];
