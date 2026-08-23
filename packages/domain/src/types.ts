/** Domain models are deliberately small: none of these fields identifies a person. */
export type VisitPurpose =
  | "tourism"
  | "visiting_family_or_friends"
  | "work"
  | "study"
  | "resident"
  | "other"
  | "unknown";

export type ReturnStatus = "possible" | "difficult" | "unknown";
export type DepartureWindow =
  | "within_7_days"
  | "within_30_days"
  | "within_3_months"
  | "no_departure_plan"
  | "unknown";
export type AccommodationType =
  | "hotel"
  | "family_or_friend"
  | "rental"
  | "temporary_facility"
  | "unstable"
  | "prefer_not_to_say";
export type JapaneseLevel = "none" | "beginner" | "daily" | "advanced";
export type ChildAgeGroup = "0-2" | "3-5" | "6-11" | "12-14" | "15-17" | "18+";
export type NeedCategory =
  | "stay"
  | "consultation"
  | "accommodation"
  | "living_cost"
  | "education"
  | "childcare"
  | "medical"
  | "employment"
  | "language"
  | "daily_life";

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
  /** Free text collected only when `nationality` is `OTHER`. */
  nationalityOther?: string;
  /** Empty string means the municipality was not collected. */
  currentMunicipality: string;
  /** Municipality-level free text collected only when `currentMunicipality` is `Other`. */
  currentMunicipalityOther?: string;
  visitPurpose: VisitPurpose;
  /** Free text collected only when `visitPurpose` is `other`. */
  visitPurposeOther?: string;
  originalDepartureWindow: DepartureWindow;
  returnStatus: ReturnStatus;
  knownStayDeadline?: string;
  stayDeadlineKnown: boolean;
  accommodation: AccommodationType;
  japaneseLevel: JapaneseLevel;
  /** Relationship description collected only when the family answer includes `other`. */
  familyOther?: string;
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
  sourceIds: string[];
  localResourceCategories?: LocalResourceCategory[];
  humanReviewRequired: boolean;
  disclaimer?: string;
};
