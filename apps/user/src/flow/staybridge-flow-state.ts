import type { PendingSituationSubmission } from "../consented-persistence";
import { demoSituation } from "@staybridge/domain/demo";
import {
  createInitialOtherAnswers,
  createInitialSituation,
  type AiRecommendation,
  type FamilyAnswers,
  type OtherAnswers,
  type StayAnswer,
} from "../components/staybridge-session";
import type { SavedRecordCredentials } from "../consented-persistence";
import type { Situation } from "@staybridge/domain/types";

export type CopyState = "idle" | "copied" | "error";
export type SituationPersistenceState =
  | { status: "idle" | "declined" | "saving" | "error" | "deleted" | "corrupt" | "pending-corrupt" }
  | { status: "saved" | "deleting" | "delete-error"; credentials: SavedRecordCredentials };
export type ConversationConsentState = "idle" | "accepted" | "declined";

export type StayBridgeFlowState = {
  situation: Situation;
  stayAnswer: StayAnswer;
  familyAnswers: FamilyAnswers;
  otherAnswers: OtherAnswers;
  aiRecommendation: AiRecommendation | null;
  answeredSteps: number[];
  storageReady: boolean;
  storageError: boolean;
  copyState: CopyState;
  situationPersistence: SituationPersistenceState;
  conversationConsent: ConversationConsentState;
  hasUnreadableSession: boolean;
  isDemoSituation: boolean;
  publicationToday: string;
  pendingSituationSubmission: PendingSituationSubmission | "incompatible" | null;
  hasPendingSituationSubmission: boolean;
  hasCorruptPendingSituationSubmission: boolean;
  allowsPendingSituationReview: boolean;
  isPreparingRecommendations: boolean;
};

export type StayBridgeFlowAction =
  | { type: "storage-ready" }
  | { type: "storage-error" }
  | { type: "session-hydrated"; session: {
    situation: Situation;
    stayAnswer: StayAnswer;
    familyAnswers: FamilyAnswers;
    otherAnswers: OtherAnswers;
    aiRecommendation: AiRecommendation | null;
    answeredSteps: number[];
    isDemoSituation: boolean;
  } }
  | { type: "session-unreadable" }
  | { type: "situation-updated"; situation: Situation }
  | { type: "stay-answer-updated"; stayAnswer: StayAnswer }
  | { type: "family-answers-updated"; familyAnswers: FamilyAnswers }
  | { type: "other-answers-updated"; otherAnswers: OtherAnswers }
  | { type: "ai-recommendation-updated"; aiRecommendation: AiRecommendation | null }
  | { type: "answered-steps-updated"; answeredSteps: number[] }
  | { type: "copy-state-updated"; copyState: CopyState }
  | { type: "persistence-updated"; situationPersistence: SituationPersistenceState }
  | { type: "conversation-consent-updated"; conversationConsent: ConversationConsentState }
  | { type: "publication-date-updated"; publicationToday: string }
  | { type: "pending-submission-updated"; pendingSituationSubmission: PendingSituationSubmission | "incompatible" | null; hasPendingSituationSubmission: boolean; hasCorruptPendingSituationSubmission: boolean }
  | { type: "pending-review-updated"; allowsPendingSituationReview: boolean }
  | { type: "recommendation-preparation-updated"; isPreparingRecommendations: boolean }
  | { type: "demo-loaded"; answeredSteps: number[] }
  | { type: "fresh-session-started" }
  | { type: "assessment-restarted" }
  | { type: "corrupt-local-data-discarded" }
  | { type: "corrupt-pending-discarded" };

export function createStayBridgeFlowState(assessmentDate: string): StayBridgeFlowState {
  return {
    situation: createInitialSituation(),
    stayAnswer: "unknown",
    familyAnswers: [],
    otherAnswers: createInitialOtherAnswers(),
    aiRecommendation: null,
    answeredSteps: [],
    storageReady: false,
    storageError: false,
    copyState: "idle",
    situationPersistence: { status: "idle" },
    conversationConsent: "idle",
    hasUnreadableSession: false,
    isDemoSituation: false,
    publicationToday: assessmentDate,
    pendingSituationSubmission: null,
    hasPendingSituationSubmission: false,
    hasCorruptPendingSituationSubmission: false,
    allowsPendingSituationReview: false,
    isPreparingRecommendations: false,
  };
}

export function stayBridgeFlowReducer(
  state: StayBridgeFlowState,
  action: StayBridgeFlowAction,
): StayBridgeFlowState {
  switch (action.type) {
    case "storage-ready":
      return { ...state, storageReady: true };
    case "storage-error":
      return { ...state, storageError: true };
    case "session-hydrated":
      return { ...state, ...action.session };
    case "session-unreadable":
      return { ...state, hasUnreadableSession: true };
    case "situation-updated":
      return { ...state, situation: action.situation };
    case "stay-answer-updated":
      return { ...state, stayAnswer: action.stayAnswer };
    case "family-answers-updated":
      return { ...state, familyAnswers: action.familyAnswers };
    case "other-answers-updated":
      return { ...state, otherAnswers: action.otherAnswers };
    case "ai-recommendation-updated":
      return { ...state, aiRecommendation: action.aiRecommendation };
    case "answered-steps-updated":
      return { ...state, answeredSteps: action.answeredSteps };
    case "copy-state-updated":
      return { ...state, copyState: action.copyState };
    case "persistence-updated":
      return { ...state, situationPersistence: action.situationPersistence };
    case "conversation-consent-updated":
      return { ...state, conversationConsent: action.conversationConsent };
    case "publication-date-updated":
      return state.publicationToday === action.publicationToday
        ? state
        : { ...state, publicationToday: action.publicationToday };
    case "pending-submission-updated":
      return {
        ...state,
        pendingSituationSubmission: action.pendingSituationSubmission,
        hasPendingSituationSubmission: action.hasPendingSituationSubmission,
        hasCorruptPendingSituationSubmission: action.hasCorruptPendingSituationSubmission,
      };
    case "pending-review-updated":
      return { ...state, allowsPendingSituationReview: action.allowsPendingSituationReview };
    case "recommendation-preparation-updated":
      return { ...state, isPreparingRecommendations: action.isPreparingRecommendations };
    case "demo-loaded":
      return {
        ...state,
        situation: demoSituation,
        stayAnswer: "unknown",
        familyAnswers: ["children"],
        otherAnswers: createInitialOtherAnswers(),
        aiRecommendation: null,
        answeredSteps: action.answeredSteps,
        isDemoSituation: true,
      };
    case "fresh-session-started":
      return {
        ...state,
        situation: createInitialSituation(),
        stayAnswer: "unknown",
        familyAnswers: [],
        answeredSteps: [],
        copyState: "idle",
        isDemoSituation: false,
        hasUnreadableSession: false,
      };
    case "assessment-restarted":
      return {
        ...state,
        situation: createInitialSituation(),
        stayAnswer: "unknown",
        familyAnswers: [],
        otherAnswers: createInitialOtherAnswers(),
        aiRecommendation: null,
        answeredSteps: [],
        copyState: "idle",
        situationPersistence: { status: "idle" },
        conversationConsent: "idle",
        isDemoSituation: false,
        hasUnreadableSession: false,
        allowsPendingSituationReview: false,
        pendingSituationSubmission: null,
        isPreparingRecommendations: false,
      };
    case "corrupt-local-data-discarded":
      return {
        ...state,
        situation: createInitialSituation(),
        stayAnswer: "unknown",
        familyAnswers: [],
        answeredSteps: [],
        copyState: "idle",
        situationPersistence: { status: "idle" },
        conversationConsent: "idle",
        isDemoSituation: false,
        pendingSituationSubmission: null,
        hasPendingSituationSubmission: false,
      };
    case "corrupt-pending-discarded":
      return {
        ...state,
        hasCorruptPendingSituationSubmission: false,
        situationPersistence: state.situationPersistence.status === "pending-corrupt"
          ? { status: "idle" }
          : state.situationPersistence,
      };
  }
}
