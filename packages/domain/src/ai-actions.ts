import {
  getPublishableActionCatalogEntry,
  type ActionId,
} from "./action-catalog";
import type { Action, LocalResourceCategory } from "./types";

/**
 * Workers AI may only choose from these existing, reviewed CHECK/CONSULT cards.
 * CHECK_BEFORE_STAY_DEADLINE is intentionally excluded because Q3 text cannot
 * establish a user-specific deadline.
 */
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
] as const satisfies readonly ActionId[];

export type AiSelectableActionId = (typeof AI_SELECTABLE_ACTION_IDS)[number];

const selectableIds = new Set<string>(AI_SELECTABLE_ACTION_IDS);

const localResourceCategories: Partial<Record<AiSelectableActionId, LocalResourceCategory[]>> = {
  CHECK_CHILD_EDUCATION: ["school"],
  PLAN_TEMPORARY_LIVING: ["accommodation"],
  CHECK_MEDICAL_OPTIONS: ["medical"],
  CHECK_CHILD_LOCAL_SUPPORT: ["child_support", "public_facility"],
  CHECK_LIVING_COST_SUPPORT: ["foreign_support", "consultation"],
};

export function isAiSelectableActionId(value: unknown): value is AiSelectableActionId {
  return typeof value === "string" && selectableIds.has(value);
}

/** Invalid, duplicate, or over-limit output is rejected as a whole. */
export function parseAiActionIds(value: unknown): AiSelectableActionId[] | null {
  if (!Array.isArray(value) || value.length > 3) return null;
  const ids = [...value];
  if (!ids.every(isAiSelectableActionId)) return null;
  if (new Set(ids).size !== ids.length) return null;
  return ids;
}

/**
 * Adds only currently publishable catalogue cards. Existing Rule Engine cards
 * always win deduplication and are never removed or reprioritized by AI.
 */
export function mergeAiRecommendedActions(
  ruleActions: readonly Action[],
  recommendedActionIds: readonly AiSelectableActionId[],
  asOfDate: string,
): Action[] {
  const actions = new Map(ruleActions.map((action) => [action.id, action]));
  for (const id of recommendedActionIds) {
    if (actions.has(id)) continue;
    const entry = getPublishableActionCatalogEntry(id, asOfDate);
    if (!entry) continue;
    actions.set(id, {
      id: entry.id,
      category: entry.category,
      timing: entry.timing,
      priority: 55,
      title: entry.fallback.title,
      shortDescription: entry.fallback.description,
      reasonCode: "OTHER_VISIT_PURPOSE",
      reasonText: "The additional visit-purpose note indicates that this may be a useful next step to check.",
      ruleId: null,
      matchedRuleIds: [],
      answerCodes: ["visitPurpose=other"],
      selectionSource: "ai",
      sourceIds: [...entry.sourceIds],
      humanReviewRequired: entry.humanReviewRequired,
      disclaimer: entry.fallback.notice,
      ...(localResourceCategories[id] ? { localResourceCategories: localResourceCategories[id] } : {}),
    });
  }
  return [...actions.values()].sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
}
