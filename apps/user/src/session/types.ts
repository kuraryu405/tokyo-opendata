import type { Situation } from "@staybridge/domain/types";
import type { AiSelectableActionId } from "@staybridge/domain/ai-actions";
import type { SelectableUserLocale } from "@staybridge/i18n/client";

/** Locales that have passed review and may be used by the public client. */
export type Locale = SelectableUserLocale;
export type StayAnswer = "known" | "unknown" | "documents";
export type FamilyAnswer = "none" | "children" | "spouse" | "other";
export type FamilyAnswers = FamilyAnswer[];
export type SituationProvenance = "user" | "demo";
export type OtherAnswers = {
  area: string;
  nationality: string;
  visitPurpose: string;
  family: string;
  accommodation: string;
  needs: string;
};
export type AiRecommendation = {
  input: string;
  actionIds: AiSelectableActionId[];
};

export type StoredSession = {
  version: 5;
  provenance: SituationProvenance;
  situation: Situation;
  stayAnswer: StayAnswer;
  familyAnswers: FamilyAnswers;
  answeredSteps: number[];
  otherAnswers: OtherAnswers;
  aiRecommendation: AiRecommendation | null;
};

export type StoredSessionReadResult =
  | { status: "absent" }
  | { status: "valid"; session: StoredSession }
  | { status: "corrupt" }
  | { status: "unsupported"; version: number };
