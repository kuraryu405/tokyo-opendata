import {
  PENDING_SITUATION_SUBMISSION_KEY,
  parsePendingSituationSubmission,
  parseSavedSituationCredentials,
  readSituationPersistencePreference,
  SAVED_SITUATION_CREDENTIALS_KEY,
  serializeSavedSituationCredentials,
  SITUATION_PERSISTENCE_PREFERENCE_KEY,
  type PendingSituationSubmission,
  type SavedRecordCredentials,
} from "../consented-persistence";
import {
  readStoredSession,
  serializeStoredSession,
  STAYBRIDGE_SESSION_KEY,
  type AiRecommendation,
  type FamilyAnswers,
  type OtherAnswers,
  type SituationProvenance,
  type StayAnswer,
} from "../components/staybridge-session";
import type { Situation } from "@staybridge/domain/types";

function flowSessionStorage(): Storage {
  return window.sessionStorage;
}

export function readStoredStayBridgeSession() {
  return readStoredSession(flowSessionStorage().getItem(STAYBRIDGE_SESSION_KEY));
}

export function readSavedSituationCredentials() {
  return parseSavedSituationCredentials(flowSessionStorage().getItem(SAVED_SITUATION_CREDENTIALS_KEY));
}

export function readPendingSituationSubmission() {
  return parsePendingSituationSubmission(flowSessionStorage().getItem(PENDING_SITUATION_SUBMISSION_KEY));
}

export function readStoredSituationPersistencePreference() {
  return readSituationPersistencePreference(flowSessionStorage().getItem(SITUATION_PERSISTENCE_PREFERENCE_KEY));
}

export function writeStoredStayBridgeSession({
  provenance,
  situation,
  stayAnswer,
  familyAnswers,
  answeredSteps,
  otherAnswers,
  aiRecommendation,
}: {
  provenance: SituationProvenance;
  situation: Situation;
  stayAnswer: StayAnswer;
  familyAnswers: FamilyAnswers;
  answeredSteps: number[];
  otherAnswers: OtherAnswers;
  aiRecommendation: AiRecommendation | null;
}) {
  flowSessionStorage().setItem(STAYBRIDGE_SESSION_KEY, serializeStoredSession({
    provenance,
    situation,
    stayAnswer,
    familyAnswers,
    answeredSteps,
    otherAnswers,
    aiRecommendation,
  }));
}

export function removeStoredStayBridgeSession() {
  flowSessionStorage().removeItem(STAYBRIDGE_SESSION_KEY);
}

export function writePendingSituationSubmission(submission: PendingSituationSubmission) {
  flowSessionStorage().setItem(PENDING_SITUATION_SUBMISSION_KEY, JSON.stringify(submission));
}

export function removePendingSituationSubmission() {
  flowSessionStorage().removeItem(PENDING_SITUATION_SUBMISSION_KEY);
}

export function writeSavedSituationCredentials(credentials: SavedRecordCredentials) {
  flowSessionStorage().setItem(
    SAVED_SITUATION_CREDENTIALS_KEY,
    serializeSavedSituationCredentials(credentials),
  );
}

export function removeSavedSituationCredentials() {
  flowSessionStorage().removeItem(SAVED_SITUATION_CREDENTIALS_KEY);
}

export function writeSituationPersistenceDecline() {
  flowSessionStorage().setItem(SITUATION_PERSISTENCE_PREFERENCE_KEY, "declined");
}

export function removeSituationPersistencePreference() {
  flowSessionStorage().removeItem(SITUATION_PERSISTENCE_PREFERENCE_KEY);
}
