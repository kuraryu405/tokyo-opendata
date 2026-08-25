import type { RuleId } from "./rules";

export const assessmentOptionCodes = {
  municipality: ["Kita", "Shinjuku", "Toshima", "Other"],
  nationality: ["MMR", "OTHER", "UNKNOWN"],
  visitPurpose: ["tourism", "visiting_family_or_friends", "work", "study", "resident", "other", "unknown"],
  departureWindow: ["within_7_days", "within_30_days", "within_3_months", "no_departure_plan", "unknown"],
  returnStatus: ["possible", "difficult", "unknown"],
  stayAnswer: ["known", "unknown", "documents"],
  family: ["none", "children", "spouse", "other"],
  childAge: ["0-2", "3-5", "6-11", "12-14", "15-17", "18+"],
  accommodation: ["hotel", "family_or_friend", "rental", "temporary_facility", "unstable", "prefer_not_to_say"],
  needs: ["stay", "consultation", "accommodation", "living_cost", "employment", "education", "childcare", "medical", "daily_life", "language", "none"],
  japaneseLevel: ["none", "beginner", "daily", "advanced"],
} as const;

export type AssessmentQuestion = keyof typeof assessmentOptionCodes;
export type SelectionUse = "rule_input" | "resource_filter" | "summary_only" | "explicit_no_card";
export type SelectionCoverage = {
  question: AssessmentQuestion;
  code: string;
  use: SelectionUse;
  reason: string;
  ruleIds: readonly RuleId[];
};

const entry = (
  question: AssessmentQuestion,
  code: string,
  use: SelectionUse,
  reason: string,
  ruleIds: readonly RuleId[] = [],
): SelectionCoverage => ({ question, code, use, reason, ruleIds });

/** Every selectable answer code has an explicit use or non-use decision. */
export const selectionCoverage: readonly SelectionCoverage[] = [
  ...assessmentOptionCodes.municipality.map((code) => entry("municipality", code, "resource_filter", "Filters local open-data resources after card selection; never changes card priority.")),
  ...assessmentOptionCodes.nationality.map((code) => entry("nationality", code, "summary_only", "Sensitive attribute: never used for automatic card selection.")),
  ...(["tourism", "visiting_family_or_friends"] as const).map((code) => entry("visitPurpose", code, "rule_input", "Raises the urgency of a difficult-return check without inferring legal status.", ["R-STAY-RETURN-DIFFICULT-SHORT-NEAR", "R-STAY-RETURN-DIFFICULT-SHORT-LATER", "R-CONSULT-RETURN-DIFFICULT-SHORT"])),
  ...(["work", "study", "resident", "other", "unknown"] as const).map((code) => entry("visitPurpose", code, "rule_input", "Uses the non-short-visit difficult-return branch; the answer is not treated as an official status.", ["R-STAY-RETURN-DIFFICULT-OTHER", "R-CONSULT-RETURN-DIFFICULT-OTHER"])),
  ...(["within_7_days", "within_30_days"] as const).map((code) => entry("departureWindow", code, "rule_input", "Raises priority only for a difficult-return short visit.", ["R-STAY-RETURN-DIFFICULT-SHORT-NEAR"])),
  ...(["within_3_months", "no_departure_plan", "unknown"] as const).map((code) => entry("departureWindow", code, "rule_input", "Uses the later/unknown short-visit branch; otherwise causes no card by itself.", ["R-STAY-RETURN-DIFFICULT-SHORT-LATER"])),
  entry("returnStatus", "possible", "explicit_no_card", "Does not create a crisis card by itself; other stated needs can still match."),
  entry("returnStatus", "difficult", "rule_input", "Triggers check/consult rules and may combine with accommodation or child answers.", ["R-STAY-RETURN-DIFFICULT-SHORT-NEAR", "R-STAY-RETURN-DIFFICULT-SHORT-LATER", "R-STAY-RETURN-DIFFICULT-OTHER", "R-CONSULT-RETURN-DIFFICULT-SHORT", "R-CONSULT-RETURN-DIFFICULT-OTHER"]),
  entry("returnStatus", "unknown", "rule_input", "Uses a safe consultation fallback.", ["R-CONSULT-RETURN-UNKNOWN"]),
  entry("stayAnswer", "known", "rule_input", "Uses past/today/future rules when a valid optional date is present; otherwise explicitly adds no card.", ["R-STAY-DEADLINE-PAST", "R-CONSULT-DEADLINE-PAST", "R-STAY-DEADLINE-TODAY", "R-CONSULT-DEADLINE-TODAY", "R-STAY-DEADLINE-FUTURE"]),
  entry("stayAnswer", "unknown", "rule_input", "Uses a safe consultation fallback.", ["R-CONSULT-STAY-UNKNOWN"]),
  entry("stayAnswer", "documents", "rule_input", "Routes document uncertainty to official consultation.", ["R-CONSULT-STAY-DOCUMENTS"]),
  entry("family", "none", "explicit_no_card", "No family card is inferred."),
  entry("family", "children", "rule_input", "Enables age-bounded education and child-support rules."),
  entry("family", "spouse", "summary_only", "Shown in the consultation summary; no safe spouse-specific production card exists."),
  entry("family", "other", "summary_only", "Shown in the consultation summary; no family eligibility is inferred."),
  ...(["0-2", "3-5"] as const).map((code) => entry("childAge", code, "rule_input", "Allows child-support only when childcare is selected.", ["R-CHILDCARE-NEED"])),
  ...(["6-11", "12-14", "15-17"] as const).map((code) => entry("childAge", code, "rule_input", "Allows education/child-support rules without deciding enrolment.", ["R-EDUCATION-SCHOOL-AGE-RETURN", "R-EDUCATION-NEED", "R-CHILD-SCHOOL-AGE-RETURN", "R-CHILDCARE-NEED"])),
  entry("childAge", "18+", "explicit_no_card", "Adult family members are not treated as children."),
  entry("accommodation", "hotel", "rule_input", "Matches temporary-living planning only when return is difficult.", ["R-HOUSING-HOTEL"]),
  ...(["family_or_friend", "rental", "temporary_facility"] as const).map((code) => entry("accommodation", code, "explicit_no_card", "No housing risk is inferred from this answer alone; an accommodation concern can still match.")),
  entry("accommodation", "unstable", "rule_input", "Matches a higher-priority temporary-living consultation when return is difficult.", ["R-HOUSING-UNSTABLE"]),
  entry("accommodation", "prefer_not_to_say", "explicit_no_card", "Privacy-preserving empty fallback; an explicit accommodation concern can still match."),
  entry("needs", "stay", "rule_input", "Adds a check-only stay card.", ["R-STAY-NEED"]),
  entry("needs", "consultation", "rule_input", "Adds an official consultation card.", ["R-CONSULT-NEED"]),
  entry("needs", "accommodation", "rule_input", "Adds temporary-living consultation without asserting availability.", ["R-HOUSING-NEED"]),
  entry("needs", "living_cost", "rule_input", "Adds living-cost consultation without inferring a desire or eligibility to work.", ["R-LIVING-COST-NEED"]),
  entry("needs", "employment", "rule_input", "Adds only a work-eligibility check; it never decides permission to work.", ["R-WORK-EMPLOYMENT-NEED"]),
  entry("needs", "education", "rule_input", "Adds education resources only with a school-age child.", ["R-EDUCATION-NEED"]),
  entry("needs", "childcare", "rule_input", "Adds child support only with a child under 18.", ["R-CHILDCARE-NEED"]),
  entry("needs", "medical", "rule_input", "Adds a medical resource listing without asserting service availability.", ["R-MEDICAL-NEED"]),
  entry("needs", "daily_life", "resource_filter", "Filters official handoff information without generating or prioritizing roadmap cards."),
  entry("needs", "none", "explicit_no_card", "Lets people finish honestly without inventing a need; exclusive with every other category."),
  entry("needs", "language", "rule_input", "Adds language-support consultation regardless of self-rated Japanese level.", ["R-LANGUAGE-NEED"]),
  ...(["none", "beginner"] as const).map((code) => entry("japaneseLevel", code, "rule_input", "Adds language-support consultation.", ["R-LANGUAGE-LEVEL"])),
  ...(["daily", "advanced"] as const).map((code) => entry("japaneseLevel", code, "explicit_no_card", "No language barrier is inferred; an explicit language concern can still match.")),
];