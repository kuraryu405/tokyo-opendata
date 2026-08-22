import type { Action, LocalResourceCategory, Situation } from "./types";

type ActionSeed = Omit<Action, "priority" | "reasonCode" | "reasonText" | "localResourceCategories">;

/** Workers AI may only choose from this safety-reviewed card catalogue. */
export const AI_SELECTABLE_ACTION_IDS = [
  "CHECK_STAY_STATUS",
  "CONTACT_OFFICIAL_SUPPORT",
  "CHECK_CHILD_EDUCATION",
  "PLAN_TEMPORARY_LIVING",
  "CHECK_MEDICAL_OPTIONS",
  "CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH",
  "FIND_LANGUAGE_SUPPORT",
  "CHECK_CHILD_LOCAL_SUPPORT",
  "CHECK_LIVING_COST_SUPPORT",
] as const;

export type AiSelectableActionId = typeof AI_SELECTABLE_ACTION_IDS[number];

/** Inject request-derived values to keep action generation deterministic and testable. */
export type RuleContext = {
  asOfDate?: string;
  recommendedActionIds?: readonly AiSelectableActionId[];
};

const stayDisclaimer = "Your available options depend on your individual status. Please confirm them with an official support service.";

const actionSeeds: Record<string, ActionSeed> = {
  CHECK_STAY_STATUS: {
    id: "CHECK_STAY_STATUS", category: "stay", timing: "today",
    title: "Check your stay status", shortDescription: "Confirm your current period of stay and the right place to ask about next steps.",
    sourceIds: ["ISA"], humanReviewRequired: true, disclaimer: stayDisclaimer,
  },
  CONTACT_OFFICIAL_SUPPORT: {
    id: "CONTACT_OFFICIAL_SUPPORT", category: "consultation", timing: "this_week",
    title: "Speak with an official support service", shortDescription: "Get help understanding your situation and which procedures may apply.",
    sourceIds: ["FRESC"], humanReviewRequired: true,
  },
  CHECK_CHILD_EDUCATION: {
    id: "CHECK_CHILD_EDUCATION", category: "education", timing: "this_week",
    title: "Ask about your child's education options", shortDescription: "Find out where to discuss schooling and support for your child in Tokyo.",
    sourceIds: ["TOKYO_SCHOOL_DATA"], humanReviewRequired: true,
  },
  PLAN_TEMPORARY_LIVING: {
    id: "PLAN_TEMPORARY_LIVING", category: "accommodation", timing: "this_week",
    title: "Plan a place to stay", shortDescription: "Review how long your current accommodation is available and ask about housing support.",
    sourceIds: ["TOKYO_CONSULTATION"], humanReviewRequired: true,
  },
  CHECK_MEDICAL_OPTIONS: {
    id: "CHECK_MEDICAL_OPTIONS", category: "medical", timing: "next_30_days",
    title: "Find medical care options", shortDescription: "Locate nearby medical services and ask about language support before visiting.",
    sourceIds: ["TOKYO_MEDICAL_DATA"], humanReviewRequired: false,
  },
  CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH: {
    id: "CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH", category: "employment", timing: "next_30_days",
    title: "Check work eligibility before looking for work", shortDescription: "Do not start a job search until you have confirmed whether your current status permits work.",
    sourceIds: ["ISA", "FRESC"], humanReviewRequired: true, disclaimer: stayDisclaimer,
  },
  FIND_LANGUAGE_SUPPORT: {
    id: "FIND_LANGUAGE_SUPPORT", category: "language", timing: "this_week",
    title: "Find language support", shortDescription: "Use a multilingual consultation service to help communicate your needs.",
    sourceIds: ["TOKYO_CONSULTATION"], humanReviewRequired: false,
  },
  CHECK_BEFORE_STAY_DEADLINE: {
    id: "CHECK_BEFORE_STAY_DEADLINE", category: "stay", timing: "before_deadline",
    title: "Check your documents before the deadline", shortDescription: "Use your document date to plan when to contact an official service.",
    sourceIds: ["ISA"], humanReviewRequired: true, disclaimer: stayDisclaimer,
  },
  CHECK_CHILD_LOCAL_SUPPORT: {
    id: "CHECK_CHILD_LOCAL_SUPPORT", category: "childcare", timing: "next_30_days",
    title: "Find local places for your child", shortDescription: "Check child-focused and public facilities that may help create a daily routine.",
    sourceIds: ["KITA_CHILD_CENTER_LIST", "KITA_LIBRARY_LIST"], humanReviewRequired: false,
  },
  CHECK_LIVING_COST_SUPPORT: {
    id: "CHECK_LIVING_COST_SUPPORT", category: "living_cost", timing: "this_week",
    title: "Ask about support for living costs", shortDescription: "Talk with a support service about immediate living-cost concerns and available local consultations.",
    sourceIds: ["FRESC", "TOKYO_CONSULTATION"], humanReviewRequired: true,
    disclaimer: "Available support depends on your individual circumstances. Please confirm it with a support service.",
  },
};

const aiLocalResourceCategories: Partial<Record<AiSelectableActionId, LocalResourceCategory[]>> = {
  CHECK_CHILD_EDUCATION: ["school"],
  PLAN_TEMPORARY_LIVING: ["accommodation"],
  CHECK_MEDICAL_OPTIONS: ["medical"],
  CHECK_CHILD_LOCAL_SUPPORT: ["child_support", "public_facility"],
  CHECK_LIVING_COST_SUPPORT: ["foreign_support", "consultation"],
};

export function isAiSelectableActionId(value: unknown): value is AiSelectableActionId {
  return typeof value === "string" && (AI_SELECTABLE_ACTION_IDS as readonly string[]).includes(value);
}

export function parseAiActionIds(value: unknown): AiSelectableActionId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isAiSelectableActionId))].slice(0, 3);
}

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
  const hasNeed = (need: Situation["needs"][number]) => situation.needs.includes(need);
  const hasSchoolAgeChild = situation.familyMembers.children.some((child) =>
    ["6-11", "12-14", "15-17"].includes(child.ageGroup),
  );
  const hasPreschoolChild = situation.familyMembers.children.some((child) =>
    ["0-2", "3-5"].includes(child.ageGroup),
  );

  const add = (
    id: keyof typeof actionSeeds,
    priority: number,
    reasonCode: string,
    reasonText: string,
    localResourceCategories?: LocalResourceCategory[],
    timing?: Action["timing"],
  ) => {
    const previous = actions.get(id);
    if (previous) {
      if (priority > previous.priority) actions.set(id, { ...previous, priority, reasonCode, reasonText, ...(timing ? { timing } : {}) });
      return;
    }
    actions.set(id, { ...actionSeeds[id], priority, reasonCode, reasonText, ...(localResourceCategories ? { localResourceCategories } : {}), ...(timing ? { timing } : {}) });
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

  for (const id of context.recommendedActionIds ?? []) {
    add(
      id,
      55,
      "OTHER_VISIT_PURPOSE",
      "The additional visit-purpose note indicates that this may be a useful next step to check.",
      aiLocalResourceCategories[id],
    );
  }

  // A municipality is optional. The UI can show citywide resources whenever it is absent.
  return [...actions.values()].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}
