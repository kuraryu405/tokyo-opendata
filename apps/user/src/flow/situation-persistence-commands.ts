import type { Dispatch, MutableRefObject } from "react";
import {
  createPendingSituationSubmission,
  deleteSituationSubmission,
  saveSituationSubmission,
  type SavedRecordCredentials,
} from "../consented-persistence";
import {
  removePendingSituationSubmission,
  removeSavedSituationCredentials,
  removeSituationPersistencePreference,
  writePendingSituationSubmission,
  writeSavedSituationCredentials,
  writeSituationPersistenceDecline,
} from "./session-storage";
import type {
  StayBridgeFlowAction,
  StayBridgeFlowState,
} from "./staybridge-flow-state";

export function useSituationPersistenceCommands({
  state,
  dispatch,
  requestController,
}: {
  state: StayBridgeFlowState;
  dispatch: Dispatch<StayBridgeFlowAction>;
  requestController: MutableRefObject<AbortController | null>;
}) {
  const startSituationRequest = () => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    return controller;
  };

  const finishSituationRequest = (controller: AbortController) => {
    if (requestController.current === controller) requestController.current = null;
  };
  const persistSituation = async () => {
    if (state.pendingSituationSubmission === "incompatible") {
      dispatch({ type: "persistence-updated", situationPersistence: { status: "error" } });
      return;
    }
    const submission = state.pendingSituationSubmission ?? createPendingSituationSubmission(state.situation);
    if (!state.pendingSituationSubmission) {
      try {
        writePendingSituationSubmission(submission);
      } catch {
        dispatch({ type: "storage-error" });
        dispatch({ type: "persistence-updated", situationPersistence: { status: "error" } });
        return;
      }
      dispatch({ type: "pending-submission-updated", pendingSituationSubmission: submission, hasPendingSituationSubmission: true, hasCorruptPendingSituationSubmission: false });
    }
    const controller = startSituationRequest();
    dispatch({ type: "persistence-updated", situationPersistence: { status: "saving" } });
    try {
      const credentials = await saveSituationSubmission(submission, controller.signal);
      let replacedPending = false;
      try {
        writeSavedSituationCredentials(credentials);
        removePendingSituationSubmission();
        replacedPending = true;
      } catch {
        dispatch({ type: "storage-error" });
      }
      if (replacedPending) {
        dispatch({ type: "pending-submission-updated", pendingSituationSubmission: null, hasPendingSituationSubmission: false, hasCorruptPendingSituationSubmission: false });
      }
      try {
        removeSituationPersistencePreference();
      } catch {
        dispatch({ type: "storage-error" });
      }
      dispatch({ type: "persistence-updated", situationPersistence: { status: "saved", credentials } });
    } catch {
      if (!controller.signal.aborted) {
        dispatch({ type: "persistence-updated", situationPersistence: { status: "error" } });
      }
    } finally {
      finishSituationRequest(controller);
    }
  };

  const deletePersistedSituation = async (credentials: SavedRecordCredentials) => {
    const controller = startSituationRequest();
    dispatch({ type: "persistence-updated", situationPersistence: { status: "deleting", credentials } });
    try {
      await deleteSituationSubmission(credentials, controller.signal);
      try {
        removeSavedSituationCredentials();
        removePendingSituationSubmission();
      } catch {
        dispatch({ type: "storage-error" });
      }
      dispatch({ type: "pending-submission-updated", pendingSituationSubmission: null, hasPendingSituationSubmission: false, hasCorruptPendingSituationSubmission: false });
      try {
        removeSituationPersistencePreference();
      } catch {
        dispatch({ type: "storage-error" });
      }
      dispatch({ type: "persistence-updated", situationPersistence: { status: "deleted" } });
    } catch {
      if (!controller.signal.aborted) {
        dispatch({ type: "persistence-updated", situationPersistence: { status: "delete-error", credentials } });
      }
    } finally {
      finishSituationRequest(controller);
    }
  };

  const declineSituationPersistence = () => {
    try {
      writeSituationPersistenceDecline();
    } catch {
      // Forgetting a decline only re-opens this optional question.
    }
    dispatch({ type: "persistence-updated", situationPersistence: { status: "declined" } });
  };

  return { persistSituation, deletePersistedSituation, declineSituationPersistence };
}
