import { parseAiActionIds } from "@staybridge/domain/ai-actions";
import type { Situation } from "@staybridge/domain/types";
import { createInitialOtherAnswers } from "./defaults";
import {
  isAnsweredSteps,
  isFamilyAnswers,
  isOtherAnswers,
  isSituation,
  migrateLegacyStoredSession,
} from "./legacy-migration";
import { normalizeAnsweredSteps } from "./progress";
import type {
  AiRecommendation,
  OtherAnswers,
  StayAnswer,
  StoredSession,
  StoredSessionReadResult,
} from "./types";

const stayAnswers = new Set<StayAnswer>(["known", "unknown", "documents"]);

/**
 * Distinguishes a missing session from one that exists but cannot be read.
 * A present-but-unreadable value may still hold answers, so callers must keep
 * the raw value intact and let the person decide when to discard it.
 */
export function readStoredSession(raw: string | null): StoredSessionReadResult {
  if (!raw) return { status: "absent" };
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return { status: "corrupt" };

    if (typeof value.version === "number" && Number.isInteger(value.version) && value.version > 5) {
      return { status: "unsupported", version: value.version };
    }

    if (value.version === 5 && isSituation(value.situation) && isOtherAnswers(value.otherAnswers)) {
      if (value.provenance !== "user" && value.provenance !== "demo") return { status: "corrupt" };
      if (!stayAnswers.has(value.stayAnswer as StayAnswer)) return { status: "corrupt" };
      if (!isFamilyAnswers(value.familyAnswers)) return { status: "corrupt" };
      if (!isAnsweredSteps(value.answeredSteps)) return { status: "corrupt" };
      const situation = normalizeLegacySituation(value.situation);
      return {
        status: "valid",
        session: {
          version: 5,
          provenance: value.provenance,
          situation,
          stayAnswer: value.stayAnswer as StayAnswer,
          familyAnswers: value.familyAnswers,
          answeredSteps: normalizeAnsweredSteps(situation, value.stayAnswer as StayAnswer, value.familyAnswers, value.otherAnswers, value.answeredSteps),
          otherAnswers: value.otherAnswers,
          aiRecommendation: parseAiRecommendation(value.aiRecommendation, situation, value.otherAnswers),
        },
      };
    }

    const session = migrateLegacyStoredSession(value, parseAiRecommendation);
    return session ? { status: "valid", session } : { status: "corrupt" };
  } catch {
    return { status: "corrupt" };
  }
}

export function parseStoredSession(raw: string | null): StoredSession | null {
  const result = readStoredSession(raw);
  return result.status === "valid" ? result.session : null;
}

export function serializeStoredSession(
  session: Omit<StoredSession, "version" | "otherAnswers" | "aiRecommendation"> & {
    otherAnswers?: OtherAnswers;
    aiRecommendation?: AiRecommendation | null;
  },
): string {
  return JSON.stringify({
    version: 5,
    ...session,
    otherAnswers: session.otherAnswers ?? createInitialOtherAnswers(),
    aiRecommendation: session.aiRecommendation ?? null,
  } satisfies StoredSession);
}

function parseAiRecommendation(
  value: unknown,
  situation: Situation,
  otherAnswers: OtherAnswers,
): AiRecommendation | null {
  if (!isRecord(value) || Object.keys(value).length !== 2 || typeof value.input !== "string") return null;
  const input = value.input.trim();
  const actionIds = parseAiActionIds(value.actionIds);
  if (
    !input
    || input.length > 300
    || actionIds === null
    || situation.visitPurpose !== "other"
    || input !== otherAnswers.visitPurpose.trim()
  ) return null;
  return { input, actionIds };
}

function normalizeLegacySituation(situation: Situation): Situation {
  return situation.nationality === "MMR" ? { ...situation, nationality: "MM" } : situation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
