import type {
  AccommodationType,
  ChildAgeGroup,
  DepartureWindow,
  JapaneseLevel,
  NeedCategory,
  ReturnStatus,
  VisitPurpose,
} from "./persistence-contracts";

export type {
  AccommodationType,
  ChildAgeGroup,
  DepartureWindow,
  JapaneseLevel,
  NeedCategory,
  ReturnStatus,
  VisitPurpose,
} from "./persistence-contracts";

/** Domain models are deliberately small: none of these fields identifies a person. */
export type ActionTiming = "today" | "this_week" | "next_30_days" | "before_deadline" | "long_term";
export type ActionCategory = NeedCategory;
export type LocalResourceCategory =
  | "school"
  | "medical"
  | "child_support"
  | "public_facility"
  | "housing"
  | "language"
  | "foreign_support"
  | "consultation"
  | "accommodation";

export type Situation = {
  nationality: string;
  /** Empty string means the municipality was not collected. */
  currentMunicipality: string;
  visitPurpose: VisitPurpose;
  originalDepartureWindow: DepartureWindow;
  returnStatus: ReturnStatus;
  knownStayDeadline?: string;
  stayDeadlineKnown: boolean;
  accommodation: AccommodationType;
  japaneseLevel: JapaneseLevel;
  familyMembers: { children: { ageGroup: ChildAgeGroup }[] };
  needs: NeedCategory[];
};

export type Action = {
  id: string;
  category: ActionCategory;
  timing: ActionTiming;
  priority: number;
  title: string;
  shortDescription: string;
  reasonCode: string;
  reasonText: string;
  /** Null only for a reviewed catalogue card added by the Q3 classifier. */
  ruleId: import("./rules").RuleId | null;
  matchedRuleIds: import("./rules").RuleId[];
  answerCodes: string[];
  selectionSource: "rule" | "ai";
  sourceIds: string[];
  localResourceCategories?: LocalResourceCategory[];
  humanReviewRequired: boolean;
  disclaimer?: string;
};
