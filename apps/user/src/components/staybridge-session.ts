export {
  parseStoredSession,
  readStoredSession,
  serializeStoredSession,
} from "../session/codec";
export {
  createInitialOtherAnswers,
  createInitialSituation,
} from "../session/defaults";
export { STAYBRIDGE_SESSION_KEY } from "../session/key";
export {
  firstUnansweredStep,
  isAssessmentComplete,
} from "../session/progress";
export type {
  AiRecommendation,
  FamilyAnswer,
  FamilyAnswers,
  Locale,
  OtherAnswers,
  SituationProvenance,
  StayAnswer,
  StoredSession,
  StoredSessionReadResult,
} from "../session/types";
