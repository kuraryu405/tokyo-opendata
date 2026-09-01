"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { demoSituation } from "@staybridge/domain/demo";
import { getActionCatalogEntry, type ActionDestination } from "@staybridge/domain/action-catalog";
import { mergeAiRecommendedActions } from "@staybridge/domain/ai-actions";
import { generateActions } from "@staybridge/domain/rules";
import type { Situation } from "@staybridge/domain/types";
import { localResources, sourceRegistry } from "@staybridge/data";
import { getUserMessages } from "@staybridge/i18n/client";
import { formatAssessmentDateForLocale } from "../assessment-date";
import { createInitialOtherAnswers, firstUnansweredStep, isAssessmentComplete, type FamilyAnswers, type Locale, type OtherAnswers, type StayAnswer } from "../components/staybridge-session";
import { buildStayBridgePath, equivalentStayBridgePath, parseStayBridgeRoute, type LocalFilter, type StayBridgeQuery, type StayBridgeRoute, type StayBridgeScreen } from "../routing/staybridge-routes";
import { createRecommendationDeadline, deferStayBridgeStorageError, focusStayBridgeElement, observeTokyoPublicationDate, scrollAfterStayBridgeNavigation, setStayBridgeDocumentLocale } from "./browser-effects";
import { requestRecommendedActions } from "./recommend-actions-client";
import {
  readPendingSituationSubmission,
  readSavedSituationCredentials,
  readStoredSituationPersistencePreference,
  readStoredStayBridgeSession,
  removePendingSituationSubmission,
  removeSavedSituationCredentials,
  removeSituationPersistencePreference,
  removeStoredStayBridgeSession,
  writeSavedSituationCredentials,
  writeStoredStayBridgeSession,
} from "./session-storage";
import { useSituationPersistenceCommands } from "./situation-persistence-commands";
import {
  createStayBridgeFlowState,
  stayBridgeFlowReducer,
  type ConversationConsentState,
  type CopyState,
  type SituationPersistenceState,
} from "./staybridge-flow-state";

const defaultRoute: StayBridgeRoute = { locale: "ja", screen: "landing", query: {} };
const recommendationTimeoutMilliseconds = 8_000;

export function useStayBridgeController({
  route: initialRoute = defaultRoute,
  assessmentDate,
}: {
  route?: StayBridgeRoute;
  assessmentDate: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const parsedRoute = useMemo(
    () => pathname
      ? parseStayBridgeRoute(pathname, searchParams ?? undefined)
      : { route: initialRoute, canonicalPath: buildStayBridgePath(initialRoute) },
    [initialRoute, pathname, searchParams],
  );
  const { locale, screen, query } = parsedRoute.route;
  const step = query.step ?? 0;
  const localFilter = query.filter ?? "all";
  const [state, dispatch] = useReducer(
    stayBridgeFlowReducer,
    assessmentDate,
    createStayBridgeFlowState,
  );
  const skipNextSessionWrite = useRef(false);
  const recommendationController = useRef<AbortController | null>(null);
  const situationRequestController = useRef<AbortController | null>(null);
  const hasSavedSituationCredentials = "credentials" in state.situationPersistence;
  const hasCorruptSavedSituationCredentials = state.situationPersistence.status === "corrupt";
  const hasProtectedSituationSubmission = hasSavedSituationCredentials
    || hasCorruptSavedSituationCredentials
    || state.hasPendingSituationSubmission
    || state.hasCorruptPendingSituationSubmission;

  const cancelPendingRecommendation = () => {
    if (!recommendationController.current) return;
    recommendationController.current.abort();
    recommendationController.current = null;
    dispatch({ type: "recommendation-preparation-updated", isPreparingRecommendations: false });
  };

  const abortPendingRecommendation = () => {
    recommendationController.current?.abort();
    recommendationController.current = null;
  };

  useEffect(() => {
    try {
      const storedSessionResult = readStoredStayBridgeSession();
      if (storedSessionResult.status === "valid") {
        dispatch({
          type: "session-hydrated",
          session: {
            situation: storedSessionResult.session.situation,
            stayAnswer: storedSessionResult.session.stayAnswer,
            familyAnswers: storedSessionResult.session.familyAnswers,
            otherAnswers: storedSessionResult.session.otherAnswers,
            aiRecommendation: storedSessionResult.session.aiRecommendation,
            answeredSteps: storedSessionResult.session.answeredSteps,
            isDemoSituation: storedSessionResult.session.provenance === "demo",
          },
        });
      } else if (storedSessionResult.status !== "absent") {
        // Present-but-unreadable answers stay untouched until a person chooses
        // the explicit fresh-start path.
        dispatch({ type: "session-unreadable" });
      }

      const savedCredentialsResult = readSavedSituationCredentials();
      if (savedCredentialsResult.status === "valid") {
        dispatch({ type: "persistence-updated", situationPersistence: { status: "saved", credentials: savedCredentialsResult.credentials } });
        if (savedCredentialsResult.needsMigration) {
          writeSavedSituationCredentials(savedCredentialsResult.credentials);
        }
        removePendingSituationSubmission();
      } else if (savedCredentialsResult.status === "corrupt") {
        dispatch({ type: "persistence-updated", situationPersistence: { status: "corrupt" } });
        const parsedPending = readPendingSituationSubmission();
        if (parsedPending.status === "retryable") {
          dispatch({ type: "pending-submission-updated", pendingSituationSubmission: parsedPending.submission, hasPendingSituationSubmission: true, hasCorruptPendingSituationSubmission: false });
        } else if (parsedPending.status === "incompatible") {
          dispatch({ type: "pending-submission-updated", pendingSituationSubmission: null, hasPendingSituationSubmission: false, hasCorruptPendingSituationSubmission: true });
        }
      } else {
        const parsedPending = readPendingSituationSubmission();
        if (parsedPending.status === "retryable") {
          dispatch({ type: "pending-submission-updated", pendingSituationSubmission: parsedPending.submission, hasPendingSituationSubmission: true, hasCorruptPendingSituationSubmission: false });
          dispatch({ type: "persistence-updated", situationPersistence: { status: "error" } });
        } else if (parsedPending.status === "incompatible") {
          dispatch({ type: "pending-submission-updated", pendingSituationSubmission: null, hasPendingSituationSubmission: false, hasCorruptPendingSituationSubmission: true });
          dispatch({ type: "persistence-updated", situationPersistence: { status: "pending-corrupt" } });
        } else if (readStoredSituationPersistencePreference() === "declined") {
          dispatch({ type: "persistence-updated", situationPersistence: { status: "declined" } });
        }
      }
    } catch {
      dispatch({ type: "storage-error" });
    } finally {
      dispatch({ type: "storage-ready" });
    }
  }, []);

  useEffect(() => () => situationRequestController.current?.abort(), []);

  useEffect(() => {
    setStayBridgeDocumentLocale(locale);
  }, [locale]);

  useEffect(() => observeTokyoPublicationDate((publicationToday) => {
    dispatch({ type: "publication-date-updated", publicationToday });
  }), []);

  useEffect(() => {
    if (screen === "check" && step === 9) return;
    abortPendingRecommendation();
  }, [screen, step]);

  useEffect(() => () => abortPendingRecommendation(), []);

  useEffect(() => {
    if (!pathname) return;
    const currentPath = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`;
    if (!equivalentStayBridgePath(currentPath, parsedRoute.canonicalPath)) {
      router.replace(parsedRoute.canonicalPath);
    }
  }, [parsedRoute.canonicalPath, pathname, router, searchParams]);

  const assessmentComplete = isAssessmentComplete(state.answeredSteps);
  const firstIncompleteStep = firstUnansweredStep(state.answeredSteps);
  const pendingSituationReviewAllowed = state.allowsPendingSituationReview
    && state.hasPendingSituationSubmission
    && !hasSavedSituationCredentials
    && !hasCorruptSavedSituationCredentials
    && !state.hasCorruptPendingSituationSubmission;
  const protectedSituationRouteGuard = state.storageReady
    && hasProtectedSituationSubmission
    && (screen === "landing" || (screen === "check" && !pendingSituationReviewAllowed));
  const demoSituationRouteGuard = state.storageReady
    && state.isDemoSituation
    && (screen === "check" || ((screen === "roadmap" || screen === "summary") && !assessmentComplete));
  const routeNeedsAssessmentGuard = state.storageReady && !hasProtectedSituationSubmission && !state.isDemoSituation && (
    (screen === "check" && firstIncompleteStep !== null && step > firstIncompleteStep)
    || ((screen === "status" || screen === "roadmap" || screen === "summary") && !assessmentComplete)
  );

  useEffect(() => {
    if (!routeNeedsAssessmentGuard) return;
    router.replace(buildStayBridgePath({ locale, screen: "check", query: { step: firstIncompleteStep ?? 0 } }));
  }, [firstIncompleteStep, locale, routeNeedsAssessmentGuard, router]);

  useEffect(() => {
    if (!protectedSituationRouteGuard && !demoSituationRouteGuard) return;
    router.replace(buildStayBridgePath({ locale, screen: "status" }));
  }, [demoSituationRouteGuard, locale, protectedSituationRouteGuard, router]);

  useEffect(() => {
    if (!state.storageReady || state.hasUnreadableSession) return;
    if (skipNextSessionWrite.current) {
      skipNextSessionWrite.current = false;
      return;
    }
    try {
      writeStoredStayBridgeSession({
        provenance: state.isDemoSituation ? "demo" : "user",
        situation: state.situation,
        stayAnswer: state.stayAnswer,
        familyAnswers: state.familyAnswers,
        answeredSteps: state.answeredSteps,
        otherAnswers: state.otherAnswers,
        aiRecommendation: state.aiRecommendation,
      });
    } catch {
      deferStayBridgeStorageError(() => dispatch({ type: "storage-error" }));
    }
  }, [state.aiRecommendation, state.answeredSteps, state.familyAnswers, state.hasUnreadableSession, state.isDemoSituation, state.otherAnswers, state.situation, state.stayAnswer, state.storageReady]);

  const actions = useMemo(() => {
    if (!assessmentComplete) return [];
    const municipality = state.situation.currentMunicipality;
    const ruleActions = generateActions(state.situation, {
      asOfDate: assessmentDate,
      publicationDate: state.publicationToday,
      stayAnswer: state.stayAnswer,
    });
    const currentOtherPurpose = state.situation.visitPurpose === "other" ? state.otherAnswers.visitPurpose.trim() : "";
    const recommendedActionIds = state.aiRecommendation?.input === currentOtherPurpose ? state.aiRecommendation.actionIds : [];
    return mergeAiRecommendedActions(ruleActions, recommendedActionIds, assessmentDate).filter((action) => {
      if (action.sourceIds.length === 0 || !action.sourceIds.every((sourceId) => Boolean(sourceRegistry[sourceId]))) return false;
      // A resource-listing card must have municipality/category coverage, or
      // its CTA would open an empty view backed by another ward's data.
      const destination = getActionCatalogEntry(action.id)?.destination;
      if (destination?.screen !== "local") return true;
      if (!municipality || municipality === "Other") return false;
      return localResources.some((resource) => resource.municipality === municipality && resource.category === destination.filter);
    });
  }, [assessmentComplete, assessmentDate, state.aiRecommendation, state.otherAnswers.visitPurpose, state.publicationToday, state.situation, state.stayAnswer]);
  const availableResources = useMemo(() => {
    const municipality = state.situation.currentMunicipality;
    if (!municipality) return [];
    return localResources.filter((item) => municipality !== "Other"
      && item.municipality === municipality
      && (localFilter === "all" || item.category === localFilter));
  }, [localFilter, state.situation.currentMunicipality]);
  const summaryDate = useMemo(
    () => formatAssessmentDateForLocale(assessmentDate, locale),
    [assessmentDate, locale],
  );

  const go = (next: StayBridgeScreen, nextQuery: StayBridgeQuery = {}) => {
    cancelPendingRecommendation();
    router.push(buildStayBridgePath({ locale, screen: next, query: nextQuery }));
    scrollAfterStayBridgeNavigation();
  };

  const setStep = (nextStep: number) => {
    cancelPendingRecommendation();
    router.push(buildStayBridgePath({ locale, screen: "check", query: { step: nextStep } }));
    scrollAfterStayBridgeNavigation();
  };

  const setLocalFilter = (nextFilter: LocalFilter) => {
    router.replace(buildStayBridgePath({ locale, screen: "local", query: { filter: nextFilter } }));
  };

  const complete = async () => {
    if (recommendationController.current) return;
    if (!assessmentComplete) {
      router.replace(buildStayBridgePath({ locale, screen: "check", query: { step: firstIncompleteStep ?? 0 } }));
      return;
    }
    const input = state.situation.visitPurpose === "other" ? state.otherAnswers.visitPurpose.trim() : "";
    if (!input) {
      dispatch({ type: "ai-recommendation-updated", aiRecommendation: null });
      dispatch({ type: "pending-review-updated", allowsPendingSituationReview: false });
      go("status");
      return;
    }
    dispatch({ type: "ai-recommendation-updated", aiRecommendation: null });
    const controller = new AbortController();
    recommendationController.current = controller;
    dispatch({ type: "recommendation-preparation-updated", isPreparingRecommendations: true });
    const deadline = createRecommendationDeadline(controller, recommendationTimeoutMilliseconds);
    const actionIds = await Promise.race([
      requestRecommendedActions(input, controller.signal),
      deadline.expires,
    ]);
    deadline.clear();
    if (recommendationController.current !== controller) {
      if (recommendationController.current === null) {
        dispatch({ type: "recommendation-preparation-updated", isPreparingRecommendations: false });
      }
      return;
    }
    recommendationController.current = null;
    dispatch({ type: "ai-recommendation-updated", aiRecommendation: actionIds === null ? null : { input, actionIds } });
    dispatch({ type: "recommendation-preparation-updated", isPreparingRecommendations: false });
    dispatch({ type: "pending-review-updated", allowsPendingSituationReview: false });
    go("status");
  };

  const focusSituationPersistence = () => {
    if (screen !== "status") router.replace(buildStayBridgePath({ locale, screen: "status" }));
    const targetId = state.situationPersistence.status === "corrupt"
      ? "corrupt-saved-situation-credentials"
      : state.situationPersistence.status === "pending-corrupt"
        ? "corrupt-pending-situation-submission"
        : hasSavedSituationCredentials ? "saved-situation-credentials" : "situation-persistence";
    focusStayBridgeElement(targetId);
  };

  const focusSessionNotice = () => {
    if (screen !== "landing") router.replace(buildStayBridgePath({ locale, screen: "landing" }));
    focusStayBridgeElement("unreadable-session-notice");
  };

  const loadDemo = () => {
    if (state.hasUnreadableSession || hasProtectedSituationSubmission) {
      focusSessionNotice();
      return;
    }
    const answeredSteps = Array.from({ length: 10 }, (_, index) => index);
    dispatch({ type: "demo-loaded", answeredSteps });
    try {
      writeStoredStayBridgeSession({
        provenance: "demo",
        situation: demoSituation,
        stayAnswer: "unknown",
        familyAnswers: ["children"],
        answeredSteps,
        otherAnswers: createInitialOtherAnswers(),
        aiRecommendation: null,
      });
    } catch {
      dispatch({ type: "storage-error" });
    }
    go("status");
  };

  const startFreshSession = () => {
    try {
      removeStoredStayBridgeSession();
    } catch {
      dispatch({ type: "storage-error" });
      return;
    }
    skipNextSessionWrite.current = true;
    dispatch({ type: "fresh-session-started" });
    router.replace(buildStayBridgePath({ locale, screen: "landing" }));
  };

  const restartAssessment = () => {
    if (hasProtectedSituationSubmission) {
      focusSituationPersistence();
      return;
    }
    skipNextSessionWrite.current = true;
    try {
      removeStoredStayBridgeSession();
    } catch {
      dispatch({ type: "storage-error" });
    }
    cancelPendingRecommendation();
    dispatch({ type: "assessment-restarted" });
    try {
      removeSituationPersistencePreference();
      removePendingSituationSubmission();
    } catch {
      dispatch({ type: "storage-error" });
    }
    router.replace(buildStayBridgePath({ locale, screen: "check", query: { step: 0 } }));
  };

  const discardCorruptLocalData = () => {
    if (state.situationPersistence.status !== "corrupt") return;
    try {
      removeSavedSituationCredentials();
    } catch {
      dispatch({ type: "storage-error" });
      return;
    }
    if (state.hasPendingSituationSubmission) {
      dispatch({ type: "persistence-updated", situationPersistence: { status: "error" } });
      return;
    }
    // Unreadable pending data may be the only remaining deletion capability.
    if (state.hasCorruptPendingSituationSubmission) {
      dispatch({ type: "persistence-updated", situationPersistence: { status: "pending-corrupt" } });
      return;
    }
    skipNextSessionWrite.current = true;
    try {
      removeStoredStayBridgeSession();
      removeSituationPersistencePreference();
      removePendingSituationSubmission();
    } catch {
      dispatch({ type: "storage-error" });
      return;
    }
    dispatch({ type: "corrupt-local-data-discarded" });
    router.replace(buildStayBridgePath({ locale, screen: "landing" }));
  };

  const discardCorruptPending = () => {
    if (!state.hasCorruptPendingSituationSubmission) return;
    try {
      removePendingSituationSubmission();
    } catch {
      dispatch({ type: "storage-error" });
      return;
    }
    dispatch({ type: "corrupt-pending-discarded" });
  };

  const editSituation = () => {
    if (hasSavedSituationCredentials || hasCorruptSavedSituationCredentials || state.hasCorruptPendingSituationSubmission) {
      focusSituationPersistence();
      return;
    }
    if (state.isDemoSituation) {
      restartAssessment();
      return;
    }
    dispatch({ type: "pending-review-updated", allowsPendingSituationReview: state.hasPendingSituationSubmission });
    dispatch({ type: "persistence-updated", situationPersistence: { status: "idle" } });
    go("check", { step: 0 });
  };

  const switchLocale = (nextLocale: Locale) => {
    cancelPendingRecommendation();
    router.push(buildStayBridgePath({ locale: nextLocale, screen, query }));
  };

  const openAction = (destination: ActionDestination) => {
    go(destination.screen, destination.screen === "local" ? { filter: destination.filter } : {});
  };

  const situationPersistenceCommands = useSituationPersistenceCommands({
    state,
    dispatch,
    requestController: situationRequestController,
  });

  return {
    ...state,
    locale,
    screen,
    query,
    step,
    localFilter,
    t: getUserMessages(locale).ui,
    actions,
    availableResources,
    summaryDate,
    assessmentComplete,
    firstIncompleteStep,
    navVisible: !(screen === "landing" && !assessmentComplete && !state.isDemoSituation),
    showStepsNav: assessmentComplete || state.isDemoSituation,
    storageGate: !state.storageReady && ["check", "status", "roadmap", "local", "summary"].includes(screen),
    routeNeedsAssessmentGuard,
    protectedSituationRouteGuard,
    demoSituationRouteGuard,
    hasSavedSituationCredentials,
    hasCorruptSavedSituationCredentials,
    hasProtectedSituationSubmission,
    isLanding: screen === "landing",
    isCheck: screen === "check",
    setSituation: (situation: Situation) => dispatch({ type: "situation-updated", situation }),
    setStayAnswer: (stayAnswer: StayAnswer) => dispatch({ type: "stay-answer-updated", stayAnswer }),
    setFamilyAnswers: (familyAnswers: FamilyAnswers) => dispatch({ type: "family-answers-updated", familyAnswers }),
    setOtherAnswers: (otherAnswers: OtherAnswers) => dispatch({ type: "other-answers-updated", otherAnswers }),
    setAnsweredSteps: (answeredSteps: number[]) => dispatch({ type: "answered-steps-updated", answeredSteps }),
    setCopyState: (copyState: CopyState) => dispatch({ type: "copy-state-updated", copyState }),
    setConversationConsent: (conversationConsent: ConversationConsentState) => dispatch({ type: "conversation-consent-updated", conversationConsent }),
    invalidateAiRecommendation: () => {
      cancelPendingRecommendation();
      dispatch({ type: "ai-recommendation-updated", aiRecommendation: null });
    },
    go,
    setStep,
    setLocalFilter,
    complete,
    loadDemo,
    startFreshSession,
    restartAssessment,
    discardCorruptLocalData,
    discardCorruptPending,
    ...situationPersistenceCommands,
    editSituation,
    switchLocale,
    openAction,
  };
}

export type StayBridgeController = ReturnType<typeof useStayBridgeController>;
export type { ConversationConsentState, SituationPersistenceState };
