import type { ActionCategory, ActionTiming } from "./types";

export const actionIds = [
  "CHECK_STAY_STATUS",
  "CONTACT_OFFICIAL_SUPPORT",
  "CHECK_CHILD_EDUCATION",
  "PLAN_TEMPORARY_LIVING",
  "CHECK_MEDICAL_OPTIONS",
  "CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH",
  "FIND_LANGUAGE_SUPPORT",
  "CHECK_BEFORE_STAY_DEADLINE",
  "CHECK_CHILD_LOCAL_SUPPORT",
  "CHECK_LIVING_COST_SUPPORT",
] as const;

export type ActionId = (typeof actionIds)[number];
export type ActionRiskLevel = "standard" | "high";
export type ActionDestination =
  | { screen: "help" }
  | { screen: "local"; filter: "school" | "medical" | "child_support" };

export type ActionCatalogReview =
  | { status: "draft" }
  | {
    status: "reviewed";
    reviewedAt: string;
    reviewedBy: string;
    reviewAfter: string;
  };

export type ActionCatalogEntry = {
  id: ActionId;
  purpose: string;
  category: ActionCategory;
  timing: ActionTiming;
  fallback: {
    title: string;
    description: string;
    cta: string;
    notice: string;
  };
  sourceIds: readonly string[];
  humanReviewRequired: boolean;
  riskLevel: ActionRiskLevel;
  destination: ActionDestination;
  review: ActionCatalogReview;
};

export type ActionCatalog = Record<ActionId, ActionCatalogEntry>;

const highRiskReview = {
  status: "reviewed",
  reviewedAt: "2026-08-23",
  reviewedBy: "StayBridge maintainers",
  reviewAfter: "2026-11-23",
} as const satisfies ActionCatalogReview;

const standardReview = {
  status: "reviewed",
  reviewedAt: "2026-08-23",
  reviewedBy: "StayBridge maintainers",
  reviewAfter: "2027-02-23",
} as const satisfies ActionCatalogReview;

export const actionCatalog = {
  CHECK_STAY_STATUS: {
    id: "CHECK_STAY_STATUS",
    purpose: "Connect a person to an official check of their current stay and applicable procedures.",
    category: "stay",
    timing: "today",
    fallback: {
      title: "Check your stay status",
      description: "Confirm your current period of stay and the right place to ask about next steps.",
      cta: "View official support",
      notice: "Available procedures depend on your individual status. Confirm them with an official support service.",
    },
    sourceIds: ["ISA", "TOKYO_FRESC_STATUS_CONSULT"],
    humanReviewRequired: true,
    riskLevel: "high",
    destination: { screen: "help" },
    review: highRiskReview,
  },
  CONTACT_OFFICIAL_SUPPORT: {
    id: "CONTACT_OFFICIAL_SUPPORT",
    purpose: "Provide a human handoff when the situation needs individual confirmation.",
    category: "consultation",
    timing: "this_week",
    fallback: {
      title: "Speak with an official support service",
      description: "Get help understanding your situation and which procedures may apply.",
      cta: "View support contacts",
      notice: "Services, languages, hours, and contact arrangements can change. Confirm them on the official page.",
    },
    sourceIds: ["FRESC", "TMC_NAVI", "TOKYO_FRAC", "TIPS_CONSULTATIONS", "TMG_CONSULTATION_KURASHI"],
    humanReviewRequired: true,
    riskLevel: "high",
    destination: { screen: "help" },
    review: highRiskReview,
  },
  CHECK_CHILD_EDUCATION: {
    id: "CHECK_CHILD_EDUCATION",
    purpose: "Show where to confirm education options for a child without deciding enrolment eligibility.",
    category: "education",
    timing: "this_week",
    fallback: {
      title: "Ask about your child's education options",
      description: "Find out where to discuss schooling and support for your child in Tokyo.",
      cta: "View nearby schools",
      notice: "A school listing does not confirm enrolment, catchment, vacancy, or language support. Ask the municipality or school.",
    },
    sourceIds: ["TOKYO_SCHOOL_DATA", "TOKYO_SCHOOL_ENROLL_EN", "TOKYO_SCHOOL_ATTENDANCE_BOE", "MEXT_SCHOOL", "TIPS_SCHOOL"],
    humanReviewRequired: true,
    riskLevel: "high",
    destination: { screen: "local", filter: "school" },
    review: highRiskReview,
  },
  PLAN_TEMPORARY_LIVING: {
    id: "PLAN_TEMPORARY_LIVING",
    purpose: "Prompt an early consultation about temporary accommodation and daily living.",
    category: "accommodation",
    timing: "this_week",
    fallback: {
      title: "Plan a place to stay",
      description: "Review how long your current accommodation is available and ask about housing support.",
      cta: "View support contacts",
      notice: "StayBridge does not confirm accommodation availability or eligibility. Ask a support service about current options.",
    },
    sourceIds: ["TOKYO_CONSULTATION", "TOKYO_HOUSING_SUPPORT"],
    humanReviewRequired: true,
    riskLevel: "high",
    destination: { screen: "help" },
    review: highRiskReview,
  },
  CHECK_MEDICAL_OPTIONS: {
    id: "CHECK_MEDICAL_OPTIONS",
    purpose: "Help a person identify official local medical listings before care is needed.",
    category: "medical",
    timing: "next_30_days",
    fallback: {
      title: "Find medical care options",
      description: "Locate nearby medical services and ask about language support before visiting.",
      cta: "View nearby medical services",
      notice: "A listing does not confirm current hours, treatment, acceptance, cost, or language support. Contact the institution before visiting.",
    },
    sourceIds: ["TOKYO_MEDICAL_DATA", "TOKYO_MEDICAL_INFO", "TOKYO_MEDICAL_FLOW", "TOKYO_MEDICAL_HIMAWARI", "TOKYO_MEDICAL_TMCNAVI", "TOKYO_MEDICAL_GAIKOKUGO"],
    humanReviewRequired: false,
    riskLevel: "standard",
    destination: { screen: "local", filter: "medical" },
    review: standardReview,
  },
  CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH: {
    id: "CHECK_WORK_ELIGIBILITY_BEFORE_JOB_SEARCH",
    purpose: "Direct a person to confirm work eligibility before looking for or starting work.",
    category: "employment",
    timing: "next_30_days",
    fallback: {
      title: "Check work eligibility before looking for work",
      description: "Confirm whether your current status permits work before starting a job search.",
      cta: "View official support",
      notice: "StayBridge does not decide whether you may work. Confirm your individual status with an official service before acting.",
    },
    sourceIds: ["ISA", "FRESC", "TOKYO_LABOR_CONSULT", "TOKYO_FOREIGN_WORKERS_HANDBOOK", "TOKYO_CAREER_CONSULT", "HELLO_WORK_TOKYO_FOREIGNER"],
    humanReviewRequired: true,
    riskLevel: "high",
    destination: { screen: "help" },
    review: highRiskReview,
  },
  FIND_LANGUAGE_SUPPORT: {
    id: "FIND_LANGUAGE_SUPPORT",
    purpose: "Prompt a person to confirm language assistance before an official consultation.",
    category: "language",
    timing: "this_week",
    fallback: {
      title: "Find language support",
      description: "Use a multilingual consultation service to help communicate your needs.",
      cta: "View support contacts",
      notice: "Available languages, interpretation methods, and hours vary. Confirm them with the service before contacting it.",
    },
    sourceIds: ["TOKYO_CONSULTATION", "TIPS_JAPANESE"],
    humanReviewRequired: false,
    riskLevel: "standard",
    destination: { screen: "help" },
    review: standardReview,
  },
  CHECK_BEFORE_STAY_DEADLINE: {
    id: "CHECK_BEFORE_STAY_DEADLINE",
    purpose: "Prompt an official check before a user-entered stay deadline.",
    category: "stay",
    timing: "before_deadline",
    fallback: {
      title: "Check your documents before the deadline",
      description: "Use your document date to plan when to contact an official service.",
      cta: "View official support",
      notice: "StayBridge does not calculate, validate, or extend a stay deadline. Confirm the date and procedure with an official service.",
    },
    sourceIds: ["ISA", "TOKYO_FRESC_STATUS_CONSULT"],
    humanReviewRequired: true,
    riskLevel: "high",
    destination: { screen: "help" },
    review: highRiskReview,
  },
  CHECK_CHILD_LOCAL_SUPPORT: {
    id: "CHECK_CHILD_LOCAL_SUPPORT",
    purpose: "Show public places that may help a child maintain a local daily routine.",
    category: "childcare",
    timing: "next_30_days",
    fallback: {
      title: "Find local places for your child",
      description: "Check child-focused and public facilities that may help create a daily routine.",
      cta: "View child support places",
      notice: "Listings do not confirm eligibility, capacity, current programmes, or language support. Confirm details with each facility.",
    },
    sourceIds: ["KITA_CHILD_CENTER_LIST", "KITA_LIBRARY_LIST", "TOKYO_CHILDCARE_SUPPORT", "TOKYO_CHILD_GUIDANCE"],
    humanReviewRequired: false,
    riskLevel: "standard",
    destination: { screen: "local", filter: "child_support" },
    review: standardReview,
  },
  CHECK_LIVING_COST_SUPPORT: {
    id: "CHECK_LIVING_COST_SUPPORT",
    purpose: "Connect a person with immediate living-cost concerns to an official consultation.",
    category: "living_cost",
    timing: "this_week",
    fallback: {
      title: "Ask about support for living costs",
      description: "Talk with a support service about immediate living-cost concerns and available local consultations.",
      cta: "View support contacts",
      notice: "Available support and eligibility depend on individual circumstances. Confirm them with an official support service.",
    },
    sourceIds: ["FRESC", "TOKYO_CONSULTATION", "TOKYO_HOUSING_SUPPORT"],
    humanReviewRequired: true,
    riskLevel: "high",
    destination: { screen: "help" },
    review: highRiskReview,
  },
} as const satisfies ActionCatalog;

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function assertValidActionCatalog(value: unknown): asserts value is ActionCatalog {
  if (!value || typeof value !== "object") throw new Error("Action catalog must be an object");
  const record = value as Record<string, unknown>;
  const actualIds = Object.keys(record).sort();
  const expectedIds = [...actionIds].sort();
  if (actualIds.length !== expectedIds.length || actualIds.some((id, index) => id !== expectedIds[index])) {
    throw new Error("Action catalog keys must exactly match actionIds");
  }

  for (const id of actionIds) {
    const entry = record[id] as ActionCatalogEntry | undefined;
    if (!entry || entry.id !== id) throw new Error(`Invalid action catalog entry: ${id}`);
    if (!isNonEmpty(entry.purpose)) throw new Error(`Missing purpose for action: ${id}`);
    for (const [key, content] of Object.entries(entry.fallback)) {
      if (!isNonEmpty(content)) throw new Error(`Missing fallback ${key} for action: ${id}`);
    }
    if (!Array.isArray(entry.sourceIds) || entry.sourceIds.length === 0 || entry.sourceIds.some((sourceId) => !isNonEmpty(sourceId))) {
      throw new Error(`Missing source IDs for action: ${id}`);
    }
    if (new Set(entry.sourceIds).size !== entry.sourceIds.length) throw new Error(`Duplicate source IDs for action: ${id}`);
    if (entry.riskLevel === "high" && !entry.humanReviewRequired) throw new Error(`High-risk action must require human review: ${id}`);
    if (entry.review.status === "reviewed") {
      if (!isCalendarDate(entry.review.reviewedAt) || !isCalendarDate(entry.review.reviewAfter)) {
        throw new Error(`Invalid review dates for action: ${id}`);
      }
      if (!isNonEmpty(entry.review.reviewedBy) || entry.review.reviewAfter < entry.review.reviewedAt) {
        throw new Error(`Invalid review metadata for action: ${id}`);
      }
    }
  }
}

export function isActionId(value: unknown): value is ActionId {
  return typeof value === "string" && (actionIds as readonly string[]).includes(value);
}

export function getActionCatalogEntry(id: unknown): ActionCatalogEntry | undefined {
  return isActionId(id) ? actionCatalog[id] : undefined;
}

export function isActionCatalogEntryPublishable(entry: ActionCatalogEntry, asOfDate: string): boolean {
  return isCalendarDate(asOfDate)
    && entry.review.status === "reviewed"
    && entry.sourceIds.length > 0
    && entry.review.reviewAfter >= asOfDate;
}

export function getPublishableActionCatalogEntry(id: unknown, asOfDate: string): ActionCatalogEntry | undefined {
  const entry = getActionCatalogEntry(id);
  return entry && isActionCatalogEntryPublishable(entry, asOfDate) ? entry : undefined;
}

assertValidActionCatalog(actionCatalog);
