import type { Action, ActionTiming, LocalResourceCategory, Situation } from "./types";
import { getPublishableActionCatalogEntry, type ActionId } from "./action-catalog";

export type StayAnswerCode = "known" | "unknown" | "documents";

/**
 * asOfDate pins answer-dependent rule evaluation. publicationDate may advance
 * independently so stale catalog entries can fail closed without rewriting the
 * assessment result; callers that do not need that split keep the old behavior.
 */
export type RuleContext = { asOfDate: string; publicationDate?: string; stayAnswer: StayAnswerCode };

export const ruleIds = [
  "R-STAY-DEADLINE-PAST", "R-CONSULT-DEADLINE-PAST",
  "R-STAY-DEADLINE-TODAY", "R-CONSULT-DEADLINE-TODAY", "R-STAY-DEADLINE-FUTURE",
  "R-STAY-RETURN-DIFFICULT-SHORT-NEAR", "R-STAY-RETURN-DIFFICULT-SHORT-LATER",
  "R-STAY-RETURN-DIFFICULT-OTHER", "R-CONSULT-RETURN-DIFFICULT-SHORT",
  "R-CONSULT-RETURN-DIFFICULT-OTHER", "R-CONSULT-RETURN-UNKNOWN",
  "R-CONSULT-STAY-UNKNOWN", "R-CONSULT-STAY-DOCUMENTS",
  "R-STAY-NEED", "R-CONSULT-NEED", "R-HOUSING-UNSTABLE", "R-HOUSING-HOTEL", "R-HOUSING-NEED",
  "R-EDUCATION-SCHOOL-AGE-RETURN", "R-EDUCATION-NEED", "R-CHILD-SCHOOL-AGE-RETURN",
  "R-CHILDCARE-NEED", "R-MEDICAL-NEED", "R-WORK-EMPLOYMENT-NEED",
  "R-LIVING-COST-NEED", "R-DAILY-LIFE-NEED", "R-LANGUAGE-LEVEL", "R-LANGUAGE-NEED",
] as const;

export type RuleId = (typeof ruleIds)[number];
export type RuleSafety = "check_only" | "consult_only" | "resource_listing_only";

type DeadlineState = "missing" | "past" | "today" | "future";
type RuntimeContext = RuleContext & { publicationDate: string; deadlineState: DeadlineState };
type Match = false | readonly string[];

export type ActionRule = {
  id: RuleId;
  conditions: string;
  exclusions: string;
  actionId: ActionId;
  timing?: ActionTiming;
  priority: number;
  reasonCode: string;
  sourcePolicy: "catalog_sources_required";
  safety: RuleSafety;
  match: (situation: Situation, context: RuntimeContext) => Match;
};

const reasonText: Record<string, string> = {
  RETURN_DIFFICULT_SHORT_TERM: "Your planned return is difficult while you are on a short-term visit.",
  RETURN_DIFFICULT: "Your planned return is difficult, so your current situation should be confirmed with an official service.",
  SITUATION_NEEDS_CONFIRMATION: "Your situation needs confirmation from a support service.",
  SCHOOL_AGE_CHILD: "You are travelling with a school-age child who is not assumed to be enrolled locally.",
  CHILD_LOCAL_ROUTINE: "You are staying with a child and may need local places that support a daily routine.",
  TEMPORARY_HOTEL: "A hotel is temporary accommodation while your return is difficult.",
  UNSTABLE_ACCOMMODATION: "Your current accommodation is unstable while your return is difficult.",
  CHILDCARE_NEED: "You indicated childcare needs for a child; local child support can be checked.",
  MEDICAL_NEED: "You indicated that medical support may be needed.",
  EMPLOYMENT_NEED: "You indicated concern about work; eligibility must be checked first.",
  LIVING_COST_NEED: "You indicated concern about meeting immediate living costs.",
  DAILY_LIFE_NEED: "You indicated a daily-life concern, so official living guidance is shown.",
  LANGUAGE_BARRIER: "Language support may make official and local consultations easier.",
  KNOWN_STAY_DEADLINE: "You entered a stay deadline, so an official check should be planned by that date.",
  STAY_DEADLINE_PASSED: "The stay deadline you entered has passed, so contact an official service immediately.",
};

const shortTermPurposes = new Set(["tourism", "visiting_family_or_friends"]);
const nearDepartureWindows = new Set(["within_7_days", "within_30_days"]);
const schoolAgeGroups = new Set(["6-11", "12-14", "15-17"]);
const childAgeGroups = new Set(["0-2", "3-5", "6-11", "12-14", "15-17"]);
const hasNeed = (situation: Situation, need: Situation["needs"][number]) => situation.needs.includes(need);
const matchingChildAgeCodes = (situation: Situation, groups: ReadonlySet<string>) =>
  [...new Set(
    situation.familyMembers.children
      .filter((child) => groups.has(child.ageGroup))
      .map((child) => `childAge=${child.ageGroup}`),
  )].sort();
const rule = (definition: Omit<ActionRule, "sourcePolicy">): ActionRule => ({
  ...definition,
  sourcePolicy: "catalog_sources_required",
});

/** Production rules use answer codes only; labels are never accepted as input. */
export const actionRules: readonly ActionRule[] = [
  rule({ id: "R-STAY-DEADLINE-PAST", conditions: "known deadline < asOfDate", exclusions: "invalid or missing date", actionId: "CHECK_STAY_STATUS", timing: "today", priority: 110, reasonCode: "STAY_DEADLINE_PASSED", safety: "check_only", match: (_s, c) => c.deadlineState === "past" && ["stayAnswer=known", "deadline=past"] }),
  rule({ id: "R-CONSULT-DEADLINE-PAST", conditions: "known deadline < asOfDate", exclusions: "invalid or missing date", actionId: "CONTACT_OFFICIAL_SUPPORT", timing: "today", priority: 105, reasonCode: "STAY_DEADLINE_PASSED", safety: "consult_only", match: (_s, c) => c.deadlineState === "past" && ["stayAnswer=known", "deadline=past"] }),
  rule({ id: "R-STAY-DEADLINE-TODAY", conditions: "known deadline = asOfDate", exclusions: "invalid or missing date", actionId: "CHECK_STAY_STATUS", timing: "today", priority: 108, reasonCode: "KNOWN_STAY_DEADLINE", safety: "check_only", match: (_s, c) => c.deadlineState === "today" && ["stayAnswer=known", "deadline=today"] }),
  rule({ id: "R-CONSULT-DEADLINE-TODAY", conditions: "known deadline = asOfDate", exclusions: "invalid or missing date", actionId: "CONTACT_OFFICIAL_SUPPORT", timing: "today", priority: 103, reasonCode: "KNOWN_STAY_DEADLINE", safety: "consult_only", match: (_s, c) => c.deadlineState === "today" && ["stayAnswer=known", "deadline=today"] }),
  rule({ id: "R-STAY-DEADLINE-FUTURE", conditions: "known deadline > asOfDate", exclusions: "invalid or missing date", actionId: "CHECK_BEFORE_STAY_DEADLINE", timing: "before_deadline", priority: 88, reasonCode: "KNOWN_STAY_DEADLINE", safety: "check_only", match: (_s, c) => c.deadlineState === "future" && ["stayAnswer=known", "deadline=future"] }),
  rule({ id: "R-STAY-RETURN-DIFFICULT-SHORT-NEAR", conditions: "difficult return + short visit + departure within 30 days", exclusions: "other purposes/windows", actionId: "CHECK_STAY_STATUS", priority: 100, reasonCode: "RETURN_DIFFICULT_SHORT_TERM", safety: "check_only", match: (s) => s.returnStatus === "difficult" && shortTermPurposes.has(s.visitPurpose) && nearDepartureWindows.has(s.originalDepartureWindow) && [`returnStatus=${s.returnStatus}`, `visitPurpose=${s.visitPurpose}`, `departureWindow=${s.originalDepartureWindow}`] }),
  rule({ id: "R-STAY-RETURN-DIFFICULT-SHORT-LATER", conditions: "difficult return + short visit + departure not within 30 days", exclusions: "near departure", actionId: "CHECK_STAY_STATUS", priority: 90, reasonCode: "RETURN_DIFFICULT_SHORT_TERM", safety: "check_only", match: (s) => s.returnStatus === "difficult" && shortTermPurposes.has(s.visitPurpose) && !nearDepartureWindows.has(s.originalDepartureWindow) && [`returnStatus=${s.returnStatus}`, `visitPurpose=${s.visitPurpose}`, `departureWindow=${s.originalDepartureWindow}`] }),
  rule({ id: "R-STAY-RETURN-DIFFICULT-OTHER", conditions: "difficult return + non-short visit", exclusions: "tourism/family visit", actionId: "CHECK_STAY_STATUS", priority: 85, reasonCode: "RETURN_DIFFICULT", safety: "check_only", match: (s) => s.returnStatus === "difficult" && !shortTermPurposes.has(s.visitPurpose) && [`returnStatus=${s.returnStatus}`, `visitPurpose=${s.visitPurpose}`] }),
  rule({ id: "R-CONSULT-RETURN-DIFFICULT-SHORT", conditions: "difficult return + short visit", exclusions: "non-short visit", actionId: "CONTACT_OFFICIAL_SUPPORT", priority: 95, reasonCode: "RETURN_DIFFICULT_SHORT_TERM", safety: "consult_only", match: (s) => s.returnStatus === "difficult" && shortTermPurposes.has(s.visitPurpose) && [`returnStatus=${s.returnStatus}`, `visitPurpose=${s.visitPurpose}`] }),
  rule({ id: "R-CONSULT-RETURN-DIFFICULT-OTHER", conditions: "difficult return + non-short visit", exclusions: "tourism/family visit", actionId: "CONTACT_OFFICIAL_SUPPORT", priority: 82, reasonCode: "RETURN_DIFFICULT", safety: "consult_only", match: (s) => s.returnStatus === "difficult" && !shortTermPurposes.has(s.visitPurpose) && [`returnStatus=${s.returnStatus}`, `visitPurpose=${s.visitPurpose}`] }),
  rule({ id: "R-CONSULT-RETURN-UNKNOWN", conditions: "return status unknown", exclusions: "possible/difficult", actionId: "CONTACT_OFFICIAL_SUPPORT", priority: 80, reasonCode: "SITUATION_NEEDS_CONFIRMATION", safety: "consult_only", match: (s) => s.returnStatus === "unknown" && ["returnStatus=unknown"] }),
  rule({ id: "R-CONSULT-STAY-UNKNOWN", conditions: "stay knowledge unknown", exclusions: "known/documents", actionId: "CONTACT_OFFICIAL_SUPPORT", priority: 84, reasonCode: "SITUATION_NEEDS_CONFIRMATION", safety: "consult_only", match: (_s, c) => c.stayAnswer === "unknown" && ["stayAnswer=unknown"] }),
  rule({ id: "R-CONSULT-STAY-DOCUMENTS", conditions: "documents need checking", exclusions: "known/unknown", actionId: "CONTACT_OFFICIAL_SUPPORT", priority: 86, reasonCode: "SITUATION_NEEDS_CONFIRMATION", safety: "consult_only", match: (_s, c) => c.stayAnswer === "documents" && ["stayAnswer=documents"] }),
  rule({ id: "R-STAY-NEED", conditions: "stay concern selected", exclusions: "none", actionId: "CHECK_STAY_STATUS", priority: 76, reasonCode: "SITUATION_NEEDS_CONFIRMATION", safety: "check_only", match: (s) => hasNeed(s, "stay") && ["needs=stay"] }),
  rule({ id: "R-CONSULT-NEED", conditions: "consultation selected", exclusions: "none", actionId: "CONTACT_OFFICIAL_SUPPORT", priority: 80, reasonCode: "SITUATION_NEEDS_CONFIRMATION", safety: "consult_only", match: (s) => hasNeed(s, "consultation") && ["needs=consultation"] }),
  rule({ id: "R-HOUSING-UNSTABLE", conditions: "difficult return + unstable accommodation", exclusions: "other accommodation", actionId: "PLAN_TEMPORARY_LIVING", priority: 90, reasonCode: "UNSTABLE_ACCOMMODATION", safety: "consult_only", match: (s) => s.returnStatus === "difficult" && s.accommodation === "unstable" && ["returnStatus=difficult", "accommodation=unstable"] }),
  rule({ id: "R-HOUSING-HOTEL", conditions: "difficult return + hotel", exclusions: "other accommodation", actionId: "PLAN_TEMPORARY_LIVING", priority: 85, reasonCode: "TEMPORARY_HOTEL", safety: "consult_only", match: (s) => s.returnStatus === "difficult" && s.accommodation === "hotel" && ["returnStatus=difficult", "accommodation=hotel"] }),
  rule({ id: "R-HOUSING-NEED", conditions: "accommodation concern selected", exclusions: "none", actionId: "PLAN_TEMPORARY_LIVING", priority: 80, reasonCode: "SITUATION_NEEDS_CONFIRMATION", safety: "consult_only", match: (s) => hasNeed(s, "accommodation") && ["needs=accommodation"] }),
  rule({ id: "R-EDUCATION-SCHOOL-AGE-RETURN", conditions: "difficult return + school-age child", exclusions: "no school-age child", actionId: "CHECK_CHILD_EDUCATION", priority: 75, reasonCode: "SCHOOL_AGE_CHILD", safety: "resource_listing_only", match: (s) => {
    const ageCodes = matchingChildAgeCodes(s, schoolAgeGroups);
    return s.returnStatus === "difficult" && ageCodes.length > 0 && ["returnStatus=difficult", ...ageCodes];
  } }),
  rule({ id: "R-EDUCATION-NEED", conditions: "education selected + school-age child", exclusions: "no school-age child", actionId: "CHECK_CHILD_EDUCATION", priority: 76, reasonCode: "SCHOOL_AGE_CHILD", safety: "resource_listing_only", match: (s) => {
    const ageCodes = matchingChildAgeCodes(s, schoolAgeGroups);
    return hasNeed(s, "education") && ageCodes.length > 0 && ["needs=education", ...ageCodes];
  } }),
  rule({ id: "R-CHILD-SCHOOL-AGE-RETURN", conditions: "difficult return + school-age child", exclusions: "no school-age child", actionId: "CHECK_CHILD_LOCAL_SUPPORT", priority: 68, reasonCode: "CHILD_LOCAL_ROUTINE", safety: "resource_listing_only", match: (s) => {
    const ageCodes = matchingChildAgeCodes(s, schoolAgeGroups);
    return s.returnStatus === "difficult" && ageCodes.length > 0 && ["returnStatus=difficult", ...ageCodes];
  } }),
  rule({ id: "R-CHILDCARE-NEED", conditions: "childcare selected + child under 18", exclusions: "no child or adult child only", actionId: "CHECK_CHILD_LOCAL_SUPPORT", priority: 72, reasonCode: "CHILDCARE_NEED", safety: "resource_listing_only", match: (s) => {
    const ageCodes = matchingChildAgeCodes(s, childAgeGroups);
    return hasNeed(s, "childcare") && ageCodes.length > 0 && ["needs=childcare", ...ageCodes];
  } }),
  rule({ id: "R-MEDICAL-NEED", conditions: "medical selected", exclusions: "none", actionId: "CHECK_MEDICAL_OPTIONS", priority: 70, reasonCode: "MEDICAL_NEED", safety: "resource_listing_only", match: (s) => hasNeed(s, "medical") && ["needs=medical"] }),
  rule({ id: "R-WORK-EMPLOYMENT-NEED", conditions: "employment selected", exclusions: "none", actionId: "CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH", priority: 65, reasonCode: "EMPLOYMENT_NEED", safety: "check_only", match: (s) => hasNeed(s, "employment") && ["needs=employment"] }),
  rule({ id: "R-LIVING-COST-NEED", conditions: "living cost selected", exclusions: "none", actionId: "CHECK_LIVING_COST_SUPPORT", priority: 78, reasonCode: "LIVING_COST_NEED", safety: "consult_only", match: (s) => hasNeed(s, "living_cost") && ["needs=living_cost"] }),
  rule({ id: "R-DAILY-LIFE-NEED", conditions: "daily life selected", exclusions: "none", actionId: "FIND_DAILY_LIFE_GUIDANCE", priority: 62, reasonCode: "DAILY_LIFE_NEED", safety: "consult_only", match: (s) => hasNeed(s, "daily_life") && ["needs=daily_life"] }),
  rule({ id: "R-LANGUAGE-LEVEL", conditions: "Japanese none/beginner", exclusions: "daily/advanced", actionId: "FIND_LANGUAGE_SUPPORT", priority: 60, reasonCode: "LANGUAGE_BARRIER", safety: "consult_only", match: (s) => (s.japaneseLevel === "none" || s.japaneseLevel === "beginner") && [`japaneseLevel=${s.japaneseLevel}`] }),
  rule({ id: "R-LANGUAGE-NEED", conditions: "language selected", exclusions: "none", actionId: "FIND_LANGUAGE_SUPPORT", priority: 65, reasonCode: "LANGUAGE_BARRIER", safety: "consult_only", match: (s) => hasNeed(s, "language") && ["needs=language"] }),
];

const toCalendarDate = (value: string | undefined): string | undefined => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value ? undefined : value;
};

const resolveDeadlineState = (situation: Situation, context: RuleContext): DeadlineState => {
  if (context.stayAnswer !== "known" || !situation.stayDeadlineKnown) return "missing";
  const deadline = toCalendarDate(situation.knownStayDeadline);
  if (!deadline) return "missing";
  if (deadline < context.asOfDate) return "past";
  if (deadline === context.asOfDate) return "today";
  return "future";
};

type MatchedRule = { rule: ActionRule; answerCodes: readonly string[] };
const compareMatches = (left: MatchedRule, right: MatchedRule) =>
  right.rule.priority - left.rule.priority || left.rule.id.localeCompare(right.rule.id);

/** Safety-first, deterministic action selection without AI, APIs, or current-clock access. */
export function generateActions(situation: Situation, context: RuleContext): Action[] {
  const asOfDate = toCalendarDate(context.asOfDate);
  if (!asOfDate) throw new Error("RuleContext.asOfDate must be a valid YYYY-MM-DD calendar date");
  const publicationDate = toCalendarDate(context.publicationDate ?? context.asOfDate);
  if (!publicationDate) throw new Error("RuleContext.publicationDate must be a valid YYYY-MM-DD calendar date");
  const runtimeContext: RuntimeContext = {
    ...context,
    asOfDate,
    publicationDate,
    deadlineState: resolveDeadlineState(situation, { ...context, asOfDate }),
  };
  const matchesByAction = new Map<ActionId, MatchedRule[]>();

  for (const candidate of actionRules) {
    const answerCodes = candidate.match(situation, runtimeContext);
    if (!answerCodes) continue;
    const matches = matchesByAction.get(candidate.actionId) ?? [];
    matches.push({ rule: candidate, answerCodes });
    matchesByAction.set(candidate.actionId, matches);
  }

  const categories: Partial<Record<ActionId, LocalResourceCategory[]>> = {
    CHECK_CHILD_EDUCATION: ["school"],
    CHECK_CHILD_LOCAL_SUPPORT: ["child_support", "public_facility"],
    PLAN_TEMPORARY_LIVING: ["accommodation"],
    CHECK_MEDICAL_OPTIONS: ["medical"],
    CHECK_LIVING_COST_SUPPORT: ["foreign_support", "consultation"],
  };
  const actions: Action[] = [];
  for (const [actionId, matches] of matchesByAction) {
    const ranked = [...matches].sort(compareMatches);
    const winner = ranked[0];
    const catalogEntry = getPublishableActionCatalogEntry(actionId, publicationDate);
    if (!winner || !catalogEntry) continue;
    actions.push({
      id: catalogEntry.id,
      category: catalogEntry.category,
      timing: winner.rule.timing ?? catalogEntry.timing,
      priority: winner.rule.priority,
      title: catalogEntry.fallback.title,
      shortDescription: catalogEntry.fallback.description,
      reasonCode: winner.rule.reasonCode,
      reasonText: reasonText[winner.rule.reasonCode] ?? "This action matched a reviewed rule.",
      ruleId: winner.rule.id,
      matchedRuleIds: ranked.map(({ rule: matchedRule }) => matchedRule.id),
      answerCodes: [...winner.answerCodes],
      selectionSource: "rule",
      sourceIds: [...catalogEntry.sourceIds],
      humanReviewRequired: catalogEntry.humanReviewRequired,
      disclaimer: catalogEntry.fallback.notice,
      ...(categories[actionId] ? { localResourceCategories: categories[actionId] } : {}),
    });
  }
  return actions.sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
}