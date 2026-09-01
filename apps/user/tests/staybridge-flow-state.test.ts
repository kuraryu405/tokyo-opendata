import { describe, expect, it } from "vitest";
import { demoSituation } from "@staybridge/domain/demo";
import { createInitialOtherAnswers } from "../src/components/staybridge-session";
import {
  createStayBridgeFlowState,
  stayBridgeFlowReducer,
} from "../src/flow/staybridge-flow-state";

describe("StayBridge flow reducer", () => {
  it("hydrates a stored session without mutating the initial state", () => {
    const initialState = createStayBridgeFlowState("2026-08-23");
    const otherAnswers = {
      ...createInitialOtherAnswers(),
      visitPurpose: "conference",
    };

    const hydratedState = stayBridgeFlowReducer(initialState, {
      type: "session-hydrated",
      session: {
        situation: { ...demoSituation, visitPurpose: "other" },
        stayAnswer: "documents",
        familyAnswers: ["children", "spouse"],
        otherAnswers,
        aiRecommendation: {
          input: "conference",
          actionIds: ["CHECK_LIVING_COST_SUPPORT"],
        },
        answeredSteps: [0, 1, 2],
        isDemoSituation: false,
      },
    });

    expect(hydratedState).toMatchObject({
      stayAnswer: "documents",
      familyAnswers: ["children", "spouse"],
      otherAnswers,
      answeredSteps: [0, 1, 2],
      isDemoSituation: false,
    });
    expect(initialState).toEqual(createStayBridgeFlowState("2026-08-23"));
  });

  it("resets assessment state while preserving runtime readiness and publication date", () => {
    const initialState = createStayBridgeFlowState("2026-08-23");
    const populatedState = {
      ...initialState,
      situation: demoSituation,
      familyAnswers: ["children" as const],
      answeredSteps: [0, 1, 2, 3],
      storageReady: true,
      storageError: true,
      publicationToday: "2026-08-24",
      isDemoSituation: true,
      conversationConsent: "accepted" as const,
    };

    const restartedState = stayBridgeFlowReducer(populatedState, {
      type: "assessment-restarted",
    });

    expect(restartedState.answeredSteps).toEqual([]);
    expect(restartedState.familyAnswers).toEqual([]);
    expect(restartedState.isDemoSituation).toBe(false);
    expect(restartedState.conversationConsent).toBe("idle");
    expect(restartedState.storageReady).toBe(true);
    expect(restartedState.storageError).toBe(true);
    expect(restartedState.publicationToday).toBe("2026-08-24");
  });

  it("clears only corrupt pending state when the user explicitly discards it", () => {
    const initialState = createStayBridgeFlowState("2026-08-23");
    const corruptState = {
      ...initialState,
      hasCorruptPendingSituationSubmission: true,
      situationPersistence: { status: "pending-corrupt" as const },
    };

    const discardedState = stayBridgeFlowReducer(corruptState, {
      type: "corrupt-pending-discarded",
    });

    expect(discardedState.hasCorruptPendingSituationSubmission).toBe(false);
    expect(discardedState.situationPersistence).toEqual({ status: "idle" });
    expect(discardedState.situation).toBe(initialState.situation);
  });
});
