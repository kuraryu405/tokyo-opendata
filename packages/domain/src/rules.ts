import type { Action, LocalResourceCategory, Situation } from "./types";
import {
  getPublishableActionCatalogEntry,
  type ActionId,
} from "./action-catalog";

/** Inject `asOfDate` in tests (or a request boundary) to make deadline rules repeatable. */
export type RuleContext = { asOfDate?: string };

const toCalendarDate = (value: string): string | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== `${year}-${month}-${day}`
    ? undefined
    : `${year}-${month}-${day}`;
};

/**
 * Produces a stable, safety-first action list. It only tells people to check or
 * consult; it never concludes that a visa, status change, or work permission applies.
 */
export function generateActions(situation: Situation, context: RuleContext = {}): Action[] {
  const actions = new Map<string, Action>();
  const catalogueDate = toCalendarDate(context.asOfDate ?? new Date().toISOString()) ?? new Date().toISOString().slice(0, 10);
  const hasNeed = (need: Situation["needs"][number]) => situation.needs.includes(need);
  const hasSchoolAgeChild = situation.familyMembers.children.some((child) =>
    ["6-11", "12-14", "15-17"].includes(child.ageGroup),
  );
  const hasPreschoolChild = situation.familyMembers.children.some((child) =>
    ["0-2", "3-5"].includes(child.ageGroup),
  );

  const add = (
    id: ActionId,
    priority: number,
    reasonCode: string,
    reasonText: string,
    localResourceCategories?: LocalResourceCategory[],
    timing?: Action["timing"],
  ) => {
    const catalogEntry = getPublishableActionCatalogEntry(id, catalogueDate);
    if (!catalogEntry) return;
    const previous = actions.get(id);
    if (previous) {
      if (priority > previous.priority) actions.set(id, { ...previous, priority, reasonCode, reasonText, ...(timing ? { timing } : {}) });
      return;
    }
    actions.set(id, {
      id: catalogEntry.id,
      category: catalogEntry.category,
      timing: timing ?? catalogEntry.timing,
      priority,
      title: catalogEntry.fallback.title,
      shortDescription: catalogEntry.fallback.description,
      reasonCode,
      reasonText,
      sourceIds: [...catalogEntry.sourceIds],
      humanReviewRequired: catalogEntry.humanReviewRequired,
      disclaimer: catalogEntry.fallback.notice,
      ...(localResourceCategories ? { localResourceCategories } : {}),
    });
  };

  const returnIsDifficult = situation.returnStatus === "difficult";
  const isShortTermVisitor = ["tourism", "visiting_family_or_friends"].includes(situation.visitPurpose);
  const deadlineNear = situation.originalDepartureWindow === "within_7_days" || situation.originalDepartureWindow === "within_30_days";

  if (returnIsDifficult) {
    const reasonCode = isShortTermVisitor ? "RETURN_DIFFICULT_SHORT_TERM" : "RETURN_DIFFICULT";
    const reasonText = isShortTermVisitor
      ? "Your planned return is difficult while you are on a short-term visit."
      : "Your planned return is difficult, so your current situation should be confirmed with an official service.";
    add("CHECK_STAY_STATUS", isShortTermVisitor ? (deadlineNear ? 100 : 90) : 85, reasonCode, reasonText);
    add("CONTACT_OFFICIAL_SUPPORT", isShortTermVisitor ? 95 : 82, reasonCode, "An official support service can help you understand which next steps to check.");
  } else if (situation.returnStatus === "unknown" || hasNeed("consultation")) {
    add("CONTACT_OFFICIAL_SUPPORT", 80, "SITUATION_NEEDS_CONFIRMATION", "Your situation needs confirmation from a support service.");
  }

  if (returnIsDifficult && hasSchoolAgeChild) {
    add("CHECK_CHILD_EDUCATION", 75, "SCHOOL_AGE_CHILD", "You are travelling with a school-age child who is not assumed to be enrolled locally.", ["school"]);
    add("CHECK_CHILD_LOCAL_SUPPORT", 68, "CHILD_LOCAL_ROUTINE", "You are staying with a child and may need local places that support a daily routine.", ["child_support", "public_facility"]);
  }
  if (returnIsDifficult && ["hotel", "unstable"].includes(situation.accommodation)) {
    const isUnstable = situation.accommodation === "unstable";
    add(
      "PLAN_TEMPORARY_LIVING",
      isUnstable ? 90 : 85,
      isUnstable ? "UNSTABLE_ACCOMMODATION" : "TEMPORARY_HOTEL",
      isUnstable
        ? "Your current accommodation is unstable while your return is difficult."
        : "A hotel is temporary accommodation while your return is difficult.",
      ["accommodation"],
    );
  }
  if (hasPreschoolChild && hasNeed("childcare")) {
    add("CHECK_CHILD_LOCAL_SUPPORT", 72, "CHILDCARE_NEED", "You indicated childcare needs for a young child; local child support can be checked.", ["child_support", "public_facility"]);
  }
  if (hasNeed("medical")) {
    add("CHECK_MEDICAL_OPTIONS", 70, "MEDICAL_NEED", "You indicated that medical support may be needed.", ["medical"]);
  }
  if (hasNeed("employment") || hasNeed("living_cost")) {
    add("CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH", 65, "EMPLOYMENT_NEED", "You indicated concern about work or living costs; eligibility must be checked first.");
  }
  if (hasNeed("living_cost")) {
    add("CHECK_LIVING_COST_SUPPORT", 78, "LIVING_COST_NEED", "You indicated concern about meeting immediate living costs.", ["foreign_support", "consultation"]);
  }
  if (situation.japaneseLevel === "none" || situation.japaneseLevel === "beginner") {
    add("FIND_LANGUAGE_SUPPORT", 60, "LANGUAGE_BARRIER", "Language support may make official and local consultations easier.");
  }
  const deadline = situation.knownStayDeadline && toCalendarDate(situation.knownStayDeadline);
  const asOfDate = toCalendarDate(context.asOfDate ?? new Date().toISOString());
  if (situation.stayDeadlineKnown && deadline && asOfDate && deadline < asOfDate) {
    add("CHECK_STAY_STATUS", 110, "STAY_DEADLINE_PASSED", "The stay deadline you entered has passed, so contact an official service immediately to confirm your situation.");
    add("CONTACT_OFFICIAL_SUPPORT", 105, "STAY_DEADLINE_PASSED", "The stay deadline you entered has passed, so contact an official support service immediately.", undefined, "today");
  } else if (situation.stayDeadlineKnown && situation.knownStayDeadline) {
    add("CHECK_BEFORE_STAY_DEADLINE", 88, "KNOWN_STAY_DEADLINE", "You entered a stay deadline, so an official check should be planned before that date.");
  }

  // A municipality is optional. The UI can show citywide resources whenever it is absent.
  return [...actions.values()].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}
