import type { Action } from "./types";

export type ActionCatalogEntry = Omit<Action, "priority" | "reasonCode" | "reasonText" | "localResourceCategories">;

const stayDisclaimer = "Your available options depend on your individual status. Please confirm them with an official support service.";

/**
 * The static source provenance attached to each action. Rule evaluation adds
 * priority and the situation-specific reason without changing source IDs.
 */
export const actionCatalog: Record<string, ActionCatalogEntry> = {
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
    sourceIds: ["KITA_ELEMENTARY_SCHOOLS_OPEN_DATA"], humanReviewRequired: true,
  },
  PLAN_TEMPORARY_LIVING: {
    id: "PLAN_TEMPORARY_LIVING", category: "accommodation", timing: "this_week",
    title: "Plan a place to stay", shortDescription: "Review how long your current accommodation is available and ask about housing support.",
    sourceIds: ["TOKYO_CONSULTATION"], humanReviewRequired: true,
  },
  CHECK_MEDICAL_OPTIONS: {
    id: "CHECK_MEDICAL_OPTIONS", category: "medical", timing: "next_30_days",
    title: "Find medical care options", shortDescription: "Locate nearby medical services and ask about language support before visiting.",
    sourceIds: ["KITA_MEDICAL_INSTITUTIONS_OPEN_DATA"], humanReviewRequired: false,
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
    sourceIds: ["KITA_CHILDCARE_FACILITIES_OPEN_DATA", "KITA_PUBLIC_FACILITIES_OPEN_DATA"], humanReviewRequired: false,
  },
  CHECK_LIVING_COST_SUPPORT: {
    id: "CHECK_LIVING_COST_SUPPORT", category: "living_cost", timing: "this_week",
    title: "Ask about support for living costs", shortDescription: "Talk with a support service about immediate living-cost concerns and available local consultations.",
    sourceIds: ["FRESC", "TOKYO_CONSULTATION"], humanReviewRequired: true,
    disclaimer: "Available support depends on your individual circumstances. Please confirm it with a support service.",
  },
};
