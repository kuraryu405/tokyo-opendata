"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { demoSituation } from "@staybridge/domain/demo";
import {
  getActionCatalogEntry,
  type ActionDestination,
  type ActionId,
} from "@staybridge/domain/action-catalog";
import { generateActions } from "@staybridge/domain/rules";
import {
  mergeAiRecommendedActions,
  parseAiActionIds,
  type AiSelectableActionId,
} from "@staybridge/domain/ai-actions";
import { assessmentOptionCodes } from "@staybridge/domain/selection-coverage";
import type { Action, ChildAgeGroup, NeedCategory, Situation } from "@staybridge/domain/types";
import {
  consultationSourcesByNeed,
  humanHandoffSourceIds,
  isSourceEligibleForVisitPurpose,
  localResources,
  sourceRegistry,
  type DataSource,
  type LocalResource,
  type LocalResourceId,
} from "@staybridge/data";
import {
  getUserMessages,
  getLocalResourceDisplay,
  getActionNotice,
  selectableUserLocales,
  type PublicUserMessages,
} from "@staybridge/i18n/client";
import {
  getLocalizedSupportText,
  supportUiCopy,
  type NeedKey,
  type ReasonCode,
  type TimingKey,
} from "@staybridge/i18n";
import {
  buildStayBridgePath,
  equivalentStayBridgePath,
  parseStayBridgeRoute,
  type LocalFilter,
  type StayBridgeQuery,
  type StayBridgeRoute,
  type StayBridgeScreen,
} from "../routing/staybridge-routes";
import {
  createInitialSituation,
  createInitialOtherAnswers,
  isAssessmentComplete,
  firstUnansweredStep,
  readStoredSession,
  serializeStoredSession,
  type FamilyAnswer,
  type FamilyAnswers,
  type Locale,
  type OtherAnswers,
  type AiRecommendation,
  type StayAnswer,
} from "./staybridge-session";
import { SupportChat } from "./SupportChat";
import { prefersReducedMotion } from "../motion";
import { formatAssessmentDateForLocale, getTokyoAssessmentDate } from "../assessment-date";
import { municipalityAppRoute } from "../municipality-url";
import {
  PENDING_SITUATION_SUBMISSION_KEY,
  SAVED_SITUATION_CREDENTIALS_KEY,
  SITUATION_PERSISTENCE_PREFERENCE_KEY,
  readSituationPersistencePreference,
  createPendingSituationSubmission,
  deleteSituationSubmission,
  parsePendingSituationSubmission,
  parseSavedSituationCredentials,
  saveSituationSubmission,
  type PendingSituationSubmission,
  serializeSavedSituationCredentials,
  type SavedRecordCredentials,
} from "../consented-persistence";
import { getPersistenceCopy, type PersistenceCopy } from "../persistence-copy";

type Screen = StayBridgeScreen;
type CopyState = "idle" | "copied" | "error";
type UserCopy = PublicUserMessages["ui"];
type SituationPersistenceState =
  | { status: "idle" | "declined" | "saving" | "error" | "deleted" | "corrupt" | "pending-corrupt" }
  | { status: "saved" | "deleting" | "delete-error"; credentials: SavedRecordCredentials };
type ConversationConsentState = "idle" | "accepted" | "declined";

const defaultRoute: StayBridgeRoute = { locale: "ja", screen: "landing", query: {} };

const routeUi = {
  ja: { restart: "最初からやり直す", preparing: "次のステップを準備しています", catalogUnavailable: "現在表示できる確認済みカードがありません。公式相談先で状況を確認してください。", contactOfficial: "公式相談先を見る", aiReason: "入力したその他の来日目的から、確認すると役立つ可能性がある既存カードを追加しています。最終判断ではありません。" },
  en: { restart: "Start over", preparing: "Preparing your next steps", catalogUnavailable: "No reviewed action card is currently available. Please confirm your situation with an official support service.", contactOfficial: "View official support", aiReason: "Your other reason for coming to Japan suggested this existing reviewed card may be useful to check. This is not a decision." },
  my: { restart: "အစမှ ပြန်စရန်", preparing: "သင့်နောက်အဆင့်များကို ပြင်ဆင်နေသည်", catalogUnavailable: "လက်ရှိပြသနိုင်သည့် စစ်ဆေးပြီးကတ် မရှိပါ။ သင့်အခြေအနေကို တရားဝင်အကူအညီဌာနတွင် အတည်ပြုပါ။", contactOfficial: "တရားဝင်အကူအညီ ကြည့်ရန်", aiReason: "ဂျပန်သို့ လာရောက်ရသည့် အခြားရည်ရွယ်ချက်အရ စစ်ဆေးထားသော ဤကတ်သည် အသုံးဝင်နိုင်သဖြင့် ထည့်ပြထားပါသည်။ ဤသည်မှာ ဆုံးဖြတ်ချက်မဟုတ်ပါ။" },
} satisfies Record<Locale, { restart: string; preparing: string; catalogUnavailable: string; contactOfficial: string; aiReason: string }>;

const searchUi = {
  ja: { areaLabel: "東京23区から選択", areaPlaceholder: "区名を入力して検索", nationalityLabel: "国名・地域名から選択", nationalityPlaceholder: "国名・地域名を入力して検索", noResults: "一致する候補がありません" },
  en: { areaLabel: "Choose from Tokyo's 23 wards", areaPlaceholder: "Search by ward name", nationalityLabel: "Choose a country or region", nationalityPlaceholder: "Search by country or region", noResults: "No matching options" },
  my: { areaLabel: "တိုကျို ၂၃ မြို့နယ်မှ ရွေးပါ", areaPlaceholder: "မြို့နယ်အမည်ဖြင့် ရှာပါ", nationalityLabel: "နိုင်ငံ သို့မဟုတ် ဒေသကို ရွေးပါ", nationalityPlaceholder: "နိုင်ငံ သို့မဟုတ် ဒေသအမည်ဖြင့် ရှာပါ", noResults: "ကိုက်ညီသော ရွေးချယ်စရာ မရှိပါ" },
} satisfies Record<Locale, { areaLabel: string; areaPlaceholder: string; nationalityLabel: string; nationalityPlaceholder: string; noResults: string }>;

const tokyoWardSearchAliases: Record<string, string> = {
  Chiyoda: "ちよだ", Chuo: "ちゅうおう", Minato: "みなと", Shinjuku: "しんじゅく", Bunkyo: "ぶんきょう", Taito: "たいとう",
  Sumida: "すみだ", Koto: "こうとう", Shinagawa: "しながわ", Meguro: "めぐろ", Ota: "おおた", Setagaya: "せたがや",
  Shibuya: "しぶや", Nakano: "なかの", Suginami: "すぎなみ", Toshima: "としま", Kita: "きた", Arakawa: "あらかわ",
  Itabashi: "いたばし", Nerima: "ねりま", Adachi: "あだち", Katsushika: "かつしか", Edogawa: "えどがわ",
};

function normalizeSearchText(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/[ぁ-ゖ]/g, (character) => String.fromCharCode(character.charCodeAt(0) + 0x60));
}

function matchesSearchOption(value: string, label: string, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  return [label, value, tokyoWardSearchAliases[value] ?? ""]
    .some((candidate) => normalizeSearchText(candidate).includes(normalizedQuery));
}

const RECOMMEND_ACTIONS_CLIENT_TIMEOUT_MS = 8_000;

export function StayBridgeApp({ route: initialRoute = defaultRoute, assessmentDate }: { route?: StayBridgeRoute; assessmentDate: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const parsedRoute = useMemo(
    () => pathname ? parseStayBridgeRoute(pathname, searchParams ?? undefined) : { route: initialRoute, canonicalPath: buildStayBridgePath(initialRoute) },
    [initialRoute, pathname, searchParams],
  );
  const { locale, screen, query } = parsedRoute.route;
  const step = query.step ?? 0;
  const localFilter = query.filter ?? "all";
  const [situation, setSituation] = useState<Situation>(createInitialSituation);
  const [stayAnswer, setStayAnswer] = useState<StayAnswer>("unknown");
  const [familyAnswers, setFamilyAnswers] = useState<FamilyAnswers>([]);
  const [otherAnswers, setOtherAnswers] = useState<OtherAnswers>(createInitialOtherAnswers);
  const [aiRecommendation, setAiRecommendation] = useState<AiRecommendation | null>(null);
  const [answeredSteps, setAnsweredSteps] = useState<number[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [situationPersistence, setSituationPersistence] = useState<SituationPersistenceState>({ status: "idle" });
  const [conversationConsent, setConversationConsent] = useState<ConversationConsentState>("idle");
  const [hasUnreadableSession, setHasUnreadableSession] = useState(false);
  const [isDemoSituation, setIsDemoSituation] = useState(false);
  // Keep the request's assessment date pinned for answer-dependent rules while
  // independently advancing the Tokyo date used only for catalog publication.
  const [publicationToday, setPublicationToday] = useState(assessmentDate);
  const [hasPendingSituationSubmission, setHasPendingSituationSubmission] = useState(false);
  const [isPreparingRecommendations, setIsPreparingRecommendations] = useState(false);
  const skipNextSessionWrite = useRef(false);
  const recommendationController = useRef<AbortController | null>(null);
  const [hasCorruptPendingSituationSubmission, setHasCorruptPendingSituationSubmission] = useState(false);
  const [allowsPendingSituationReview, setAllowsPendingSituationReview] = useState(false);
  const situationRequestController = useRef<AbortController | null>(null);
  const pendingSituationSubmission = useRef<PendingSituationSubmission | "incompatible" | null>(null);
  const t = getUserMessages(locale).ui;
  const hasSavedSituationCredentials = "credentials" in situationPersistence;
  const hasCorruptSavedSituationCredentials = situationPersistence.status === "corrupt";
  const hasProtectedSituationSubmission = hasSavedSituationCredentials
    || hasCorruptSavedSituationCredentials
    || hasPendingSituationSubmission
    || hasCorruptPendingSituationSubmission;

  useEffect(() => {
    try {
      const storedSessionResult = readStoredSession(sessionStorage.getItem("staybridge.session"));
      const storedSession = storedSessionResult.status === "valid" ? storedSessionResult.session : null;
      if (storedSession) {
        // oxlint-disable-next-line react/set-state-in-effect -- Initializes browser-only persisted state after hydration.
        setSituation(storedSession.situation);
        setStayAnswer(storedSession.stayAnswer);
        setFamilyAnswers(storedSession.familyAnswers);
        setOtherAnswers(storedSession.otherAnswers);
        setAiRecommendation(storedSession.aiRecommendation);
        setAnsweredSteps(storedSession.answeredSteps);
        setIsDemoSituation(storedSession.provenance === "demo");
      } else if (storedSessionResult.status !== "absent") {
        // Corrupt or newer-than-this-build session data may still hold answers.
        // Keep the raw value untouched and suspend session writes until the
        // person explicitly starts over.
        setHasUnreadableSession(true);
      }
      const savedCredentialsResult = parseSavedSituationCredentials(
        sessionStorage.getItem(SAVED_SITUATION_CREDENTIALS_KEY),
      );
      if (savedCredentialsResult.status === "valid") {
        setSituationPersistence({ status: "saved", credentials: savedCredentialsResult.credentials });
        if (savedCredentialsResult.needsMigration) {
          sessionStorage.setItem(
            SAVED_SITUATION_CREDENTIALS_KEY,
            serializeSavedSituationCredentials(savedCredentialsResult.credentials),
          );
        }
        // With valid credentials the record ID and deletion token are already
        // held in the saved credentials, so any leftover pending value is
        // redundant and can be dropped even when it is unreadable.
        sessionStorage.removeItem(PENDING_SITUATION_SUBMISSION_KEY);
      } else if (savedCredentialsResult.status === "corrupt") {
        setSituationPersistence({ status: "corrupt" });
        const parsedPending = parsePendingSituationSubmission(
          sessionStorage.getItem(PENDING_SITUATION_SUBMISSION_KEY),
        );
        if (parsedPending.status === "retryable") {
          pendingSituationSubmission.current = parsedPending.submission;
          setHasPendingSituationSubmission(true);
        } else if (parsedPending.status === "incompatible") {
          setHasCorruptPendingSituationSubmission(true);
        }
      } else {
        const parsedPending = parsePendingSituationSubmission(
          sessionStorage.getItem(PENDING_SITUATION_SUBMISSION_KEY),
        );
        if (parsedPending.status === "retryable") {
          pendingSituationSubmission.current = parsedPending.submission;
          setHasPendingSituationSubmission(true);
          setSituationPersistence({ status: "error" });
        } else if (parsedPending.status === "incompatible") {
          setHasCorruptPendingSituationSubmission(true);
          setSituationPersistence({ status: "pending-corrupt" });
        } else if (
          readSituationPersistencePreference(sessionStorage.getItem(SITUATION_PERSISTENCE_PREFERENCE_KEY)) === "declined"
        ) {
          setSituationPersistence({ status: "declined" });
        }
      }
    } catch {
      setStorageError(true);
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => () => situationRequestController.current?.abort(), []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const refresh = () => {
      const today = getTokyoAssessmentDate();
      setPublicationToday((previous) => (previous === today ? previous : today));
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    if (screen === "check" && step === 9) return;
    recommendationController.current?.abort();
    recommendationController.current = null;
  }, [screen, step]);

  useEffect(() => () => {
    recommendationController.current?.abort();
    recommendationController.current = null;
  }, []);

  useEffect(() => {
    if (!pathname) return;
    const currentPath = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ""}`;
    if (!equivalentStayBridgePath(currentPath, parsedRoute.canonicalPath)) {
      router.replace(parsedRoute.canonicalPath);
    }
  }, [parsedRoute.canonicalPath, pathname, router, searchParams]);

  const assessmentComplete = isAssessmentComplete(answeredSteps);
  const firstIncompleteStep = firstUnansweredStep(answeredSteps);
  const navVisible = !(screen === "landing" && !assessmentComplete && !isDemoSituation);
  const showStepsNav = assessmentComplete || isDemoSituation;
  const storageGate = !storageReady && ["check", "status", "roadmap", "local", "summary"].includes(screen);
  const pendingSituationReviewAllowed = allowsPendingSituationReview
    && hasPendingSituationSubmission
    && !hasSavedSituationCredentials
    && !hasCorruptSavedSituationCredentials
    && !hasCorruptPendingSituationSubmission;
  const protectedSituationRouteGuard = storageReady
    && hasProtectedSituationSubmission
    && (screen === "landing" || (screen === "check" && !pendingSituationReviewAllowed));
  const demoSituationRouteGuard = storageReady
    && isDemoSituation
    && (screen === "check" || ((screen === "roadmap" || screen === "summary") && !assessmentComplete));
  const routeNeedsAssessmentGuard = storageReady && !hasProtectedSituationSubmission && !isDemoSituation && (
    (screen === "check" && firstIncompleteStep !== null && step > firstIncompleteStep) ||
    ((screen === "status" || screen === "roadmap" || screen === "summary") && !assessmentComplete)
  );

  useEffect(() => {
    if (!routeNeedsAssessmentGuard) return;
    router.replace(buildStayBridgePath({
      locale,
      screen: "check",
      query: { step: firstIncompleteStep ?? 0 },
    }));
  }, [firstIncompleteStep, locale, routeNeedsAssessmentGuard, router]);

  useEffect(() => {
    if (!protectedSituationRouteGuard) return;
    router.replace(buildStayBridgePath({ locale, screen: "status" }));
  }, [locale, protectedSituationRouteGuard, router]);

  useEffect(() => {
    if (!demoSituationRouteGuard) return;
    router.replace(buildStayBridgePath({ locale, screen: "status" }));
  }, [demoSituationRouteGuard, locale, router]);

  useEffect(() => {
    if (!storageReady || hasUnreadableSession) return;
    if (skipNextSessionWrite.current) {
      skipNextSessionWrite.current = false;
      return;
    }
    try {
      sessionStorage.setItem("staybridge.session", serializeStoredSession({ provenance: isDemoSituation ? "demo" : "user", situation, stayAnswer, familyAnswers, answeredSteps, otherAnswers, aiRecommendation }));
    } catch {
      window.setTimeout(() => setStorageError(true), 0);
    }
  }, [aiRecommendation, answeredSteps, familyAnswers, hasUnreadableSession, isDemoSituation, otherAnswers, situation, stayAnswer, storageReady]);

  const actions = useMemo(() => {
    if (!assessmentComplete) return [];
    const municipality = situation.currentMunicipality;
    const ruleActions = generateActions(situation, { asOfDate: assessmentDate, publicationDate: publicationToday, stayAnswer });
    const currentOtherPurpose = situation.visitPurpose === "other" ? otherAnswers.visitPurpose.trim() : "";
    const recommendedActionIds = aiRecommendation?.input === currentOtherPurpose ? aiRecommendation.actionIds : [];
    return mergeAiRecommendedActions(ruleActions, recommendedActionIds, assessmentDate).filter((action) => {
      if (action.sourceIds.length === 0 || !action.sourceIds.every((sourceId) => Boolean(sourceRegistry[sourceId]))) {
        return false;
      }
      // Resource-listing cards must only point at a municipality/category that
      // actually has coverage, or the CTA lands on an empty Local Action screen
      // backed by another municipality's Open Data.
      const destination = getActionCatalogEntry(action.id)?.destination;
      if (destination?.screen !== "local") return true;
      if (!municipality || municipality === "Other") return false;
      return localResources.some((resource) => resource.municipality === municipality && resource.category === destination.filter);
    });
  }, [aiRecommendation, assessmentComplete, assessmentDate, otherAnswers.visitPurpose, publicationToday, situation, stayAnswer]);
  const availableResources = useMemo(() => {
    const municipality = situation.currentMunicipality;
    if (!municipality) return [];
    return localResources.filter((item) => {
      const sameArea = municipality !== "Other" && item.municipality === municipality;
      return sameArea && (localFilter === "all" || item.category === localFilter);
    });
  }, [situation.currentMunicipality, localFilter]);

  const cancelPendingRecommendation = () => {
    if (!recommendationController.current) return;
    recommendationController.current.abort();
    recommendationController.current = null;
    setIsPreparingRecommendations(false);
  };

  const go = (next: Screen, nextQuery: StayBridgeQuery = {}) => {
    cancelPendingRecommendation();
    router.push(buildStayBridgePath({ locale, screen: next, query: nextQuery }));
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  const setStep = (nextStep: number) => {
    cancelPendingRecommendation();
    router.push(buildStayBridgePath({ locale, screen: "check", query: { step: nextStep } }));
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  const setLocalFilter = (nextFilter: LocalFilter) => {
    router.replace(buildStayBridgePath({ locale, screen: "local", query: { filter: nextFilter } }));
  };

  const complete = async () => {
    if (recommendationController.current) return;
    if (!assessmentComplete) {
      router.replace(buildStayBridgePath({
        locale,
        screen: "check",
        query: { step: firstIncompleteStep ?? 0 },
      }));
      return;
    }
    const input = situation.visitPurpose === "other" ? otherAnswers.visitPurpose.trim() : "";
    if (!input) {
      setAiRecommendation(null);
      setAllowsPendingSituationReview(false);
      go("status");
      return;
    }
    setAiRecommendation(null);
    const controller = new AbortController();
    recommendationController.current = controller;
    setIsPreparingRecommendations(true);
    let timeout: number | undefined;
    const actionIds = await Promise.race([
      requestRecommendedActions(input, controller.signal),
      new Promise<null>((resolve) => {
        timeout = window.setTimeout(() => {
          controller.abort();
          resolve(null);
        }, RECOMMEND_ACTIONS_CLIENT_TIMEOUT_MS);
      }),
    ]);
    if (timeout !== undefined) window.clearTimeout(timeout);
    if (recommendationController.current !== controller) {
      if (recommendationController.current === null) setIsPreparingRecommendations(false);
      return;
    }
    recommendationController.current = null;
    setAiRecommendation(actionIds === null ? null : { input, actionIds });
    setIsPreparingRecommendations(false);
    setAllowsPendingSituationReview(false);
    go("status");
  };

  const loadDemo = () => {
    if (hasUnreadableSession || hasProtectedSituationSubmission) {
      focusSessionNotice();
      return;
    }
    setSituation(demoSituation);
    setStayAnswer("unknown");
    setFamilyAnswers(["children"]);
    setOtherAnswers(createInitialOtherAnswers());
    setAiRecommendation(null);
    const demoAnsweredSteps = Array.from({ length: 10 }, (_, index) => index);
    setAnsweredSteps(demoAnsweredSteps);
    setIsDemoSituation(true);
    try {
      sessionStorage.setItem("staybridge.session", serializeStoredSession({
        provenance: "demo",
        situation: demoSituation,
        stayAnswer: "unknown",
        familyAnswers: ["children"],
        answeredSteps: demoAnsweredSteps,
        otherAnswers: createInitialOtherAnswers(),
        aiRecommendation: null,
      }));
    } catch {
      setStorageError(true);
    }
    go("status");
  };

  const focusSituationPersistence = () => {
    if (screen !== "status") router.replace(buildStayBridgePath({ locale, screen: "status" }));
    const targetId = situationPersistence.status === "corrupt"
      ? "corrupt-saved-situation-credentials"
      : situationPersistence.status === "pending-corrupt"
        ? "corrupt-pending-situation-submission"
        : hasSavedSituationCredentials ? "saved-situation-credentials" : "situation-persistence";
    window.setTimeout(() => document.getElementById(targetId)?.focus(), 0);
  };

  const focusSessionNotice = () => {
    if (screen !== "landing") router.replace(buildStayBridgePath({ locale, screen: "landing" }));
    window.setTimeout(() => document.getElementById("unreadable-session-notice")?.focus(), 0);
  };

  const startFreshSession = () => {
    try {
      sessionStorage.removeItem("staybridge.session");
    } catch {
      setStorageError(true);
      return;
    }
    skipNextSessionWrite.current = true;
    setSituation(createInitialSituation());
    setStayAnswer("unknown");
    setFamilyAnswers([]);
    setAnsweredSteps([]);
    setCopyState("idle");
    setIsDemoSituation(false);
    setHasUnreadableSession(false);
    router.replace(buildStayBridgePath({ locale, screen: "landing" }));
  };

  const clearData = () => {
    if (!storageReady) return;
    if (hasProtectedSituationSubmission) {
      focusSituationPersistence();
      return;
    }
    skipNextSessionWrite.current = true;
    try {
      sessionStorage.removeItem("staybridge.session");
    } catch {
      setStorageError(true);
    }
    setSituation(createInitialSituation());
    setStayAnswer("unknown");
    setFamilyAnswers([]);
    setOtherAnswers(createInitialOtherAnswers());
    setAiRecommendation(null);
    recommendationController.current?.abort();
    recommendationController.current = null;
    setIsPreparingRecommendations(false);
    setAnsweredSteps([]);
    setSituationPersistence({ status: "idle" });
    setConversationConsent("idle");
    setIsDemoSituation(false);
    setHasUnreadableSession(false);
    pendingSituationSubmission.current = null;
    try {
      sessionStorage.removeItem(SITUATION_PERSISTENCE_PREFERENCE_KEY);
      sessionStorage.removeItem(PENDING_SITUATION_SUBMISSION_KEY);
    } catch {
      setStorageError(true);
    }
    router.replace(buildStayBridgePath({ locale, screen: "landing" }));
  };

  const restartAssessment = () => {
    if (hasProtectedSituationSubmission) {
      focusSituationPersistence();
      return;
    }
    skipNextSessionWrite.current = true;
    try {
      sessionStorage.removeItem("staybridge.session");
    } catch {
      setStorageError(true);
    }
    setSituation(createInitialSituation());
    setStayAnswer("unknown");
    setFamilyAnswers([]);
    setOtherAnswers(createInitialOtherAnswers());
    setAiRecommendation(null);
    recommendationController.current?.abort();
    recommendationController.current = null;
    setIsPreparingRecommendations(false);
    setAnsweredSteps([]);
    setCopyState("idle");
    setSituationPersistence({ status: "idle" });
    setConversationConsent("idle");
    setIsDemoSituation(false);
    setHasUnreadableSession(false);
    setAllowsPendingSituationReview(false);
    pendingSituationSubmission.current = null;
    try {
      sessionStorage.removeItem(SITUATION_PERSISTENCE_PREFERENCE_KEY);
      sessionStorage.removeItem(PENDING_SITUATION_SUBMISSION_KEY);
    } catch {
      setStorageError(true);
    }
    router.replace(buildStayBridgePath({ locale, screen: "check", query: { step: 0 } }));
  };

  const discardCorruptLocalData = () => {
    if (situationPersistence.status !== "corrupt") return;
    try {
      sessionStorage.removeItem(SAVED_SITUATION_CREDENTIALS_KEY);
    } catch {
      setStorageError(true);
      return;
    }
    if (hasPendingSituationSubmission) {
      setSituationPersistence({ status: "error" });
      return;
    }
    // An unreadable pending value may hold the only deletion token for a
    // record the server already stored, so it is never discarded silently.
    if (hasCorruptPendingSituationSubmission) {
      setSituationPersistence({ status: "pending-corrupt" });
      return;
    }
    skipNextSessionWrite.current = true;
    try {
      sessionStorage.removeItem("staybridge.session");
      sessionStorage.removeItem(SITUATION_PERSISTENCE_PREFERENCE_KEY);
      sessionStorage.removeItem(PENDING_SITUATION_SUBMISSION_KEY);
    } catch {
      setStorageError(true);
      return;
    }
    setSituation(createInitialSituation());
    setStayAnswer("unknown");
    setFamilyAnswers([]);
    setAnsweredSteps([]);
    setCopyState("idle");
    setSituationPersistence({ status: "idle" });
    setConversationConsent("idle");
    setIsDemoSituation(false);
    pendingSituationSubmission.current = null;
    setHasPendingSituationSubmission(false);
    router.replace(buildStayBridgePath({ locale, screen: "landing" }));
  };

  const discardCorruptPending = () => {
    if (!hasCorruptPendingSituationSubmission) return;
    try {
      sessionStorage.removeItem(PENDING_SITUATION_SUBMISSION_KEY);
    } catch {
      setStorageError(true);
      return;
    }
    setHasCorruptPendingSituationSubmission(false);
    if (situationPersistence.status === "pending-corrupt") {
      setSituationPersistence({ status: "idle" });
    }
  };

  const openAction = (destination: ActionDestination) => {
    go(destination.screen, destination.screen === "local" ? { filter: destination.filter } : {});
  };

  const summaryDate = useMemo(
    () => formatAssessmentDateForLocale(assessmentDate, locale),
    [assessmentDate, locale],
  );

  const startSituationRequest = () => {
    situationRequestController.current?.abort();
    const controller = new AbortController();
    situationRequestController.current = controller;
    return controller;
  };

  const persistSituation = async () => {
    if (pendingSituationSubmission.current === "incompatible") {
      setSituationPersistence({ status: "error" });
      return;
    }
    const submission = pendingSituationSubmission.current ?? createPendingSituationSubmission(situation);
    if (!pendingSituationSubmission.current) {
      try {
        sessionStorage.setItem(PENDING_SITUATION_SUBMISSION_KEY, JSON.stringify(submission));
      } catch {
        setStorageError(true);
        setSituationPersistence({ status: "error" });
        return;
      }
      pendingSituationSubmission.current = submission;
      setHasPendingSituationSubmission(true);
    }
    const controller = startSituationRequest();
    setSituationPersistence({ status: "saving" });
    try {
      const credentials = await saveSituationSubmission(submission, controller.signal);
      let replacedPending = false;
      try {
        sessionStorage.setItem(SAVED_SITUATION_CREDENTIALS_KEY, serializeSavedSituationCredentials(credentials));
        sessionStorage.removeItem(PENDING_SITUATION_SUBMISSION_KEY);
        replacedPending = true;
      } catch {
        setStorageError(true);
      }
      if (replacedPending) {
        pendingSituationSubmission.current = null;
        setHasPendingSituationSubmission(false);
      }
      try {
        sessionStorage.removeItem(SITUATION_PERSISTENCE_PREFERENCE_KEY);
      } catch {
        setStorageError(true);
      }
      setSituationPersistence({ status: "saved", credentials });
    } catch {
      if (!controller.signal.aborted) setSituationPersistence({ status: "error" });
    } finally {
      if (situationRequestController.current === controller) situationRequestController.current = null;
    }
  };

  const deletePersistedSituation = async (credentials: SavedRecordCredentials) => {
    const controller = startSituationRequest();
    setSituationPersistence({ status: "deleting", credentials });
    try {
      await deleteSituationSubmission(credentials, controller.signal);
      try {
        sessionStorage.removeItem(SAVED_SITUATION_CREDENTIALS_KEY);
        sessionStorage.removeItem(PENDING_SITUATION_SUBMISSION_KEY);
      } catch {
        setStorageError(true);
      }
      pendingSituationSubmission.current = null;
      setHasPendingSituationSubmission(false);
      try {
        sessionStorage.removeItem(SITUATION_PERSISTENCE_PREFERENCE_KEY);
      } catch {
        setStorageError(true);
      }
      setSituationPersistence({ status: "deleted" });
    } catch {
      if (!controller.signal.aborted) setSituationPersistence({ status: "delete-error", credentials });
    } finally {
      if (situationRequestController.current === controller) situationRequestController.current = null;
    }
  };

  const editSituation = () => {
    if (hasSavedSituationCredentials || hasCorruptSavedSituationCredentials || hasCorruptPendingSituationSubmission) {
      focusSituationPersistence();
      return;
    }
    if (isDemoSituation) {
      restartAssessment();
      return;
    }
    setAllowsPendingSituationReview(hasPendingSituationSubmission);
    setSituationPersistence({ status: "idle" });
    go("check", { step: 0 });
  };

  return (
    <div className={`app-shell locale-${locale}${navVisible ? " nav-visible" : ""}`}>
      <a className="skip-link" href="#main">{t.skip}</a>
      <Header locale={locale} screen={screen} go={go} switchLocale={(nextLocale) => { cancelPendingRecommendation(); router.push(buildStayBridgePath({ locale: nextLocale, screen, query })); }} navVisible={navVisible} showStepsNav={showStepsNav} />
      {storageError && <output className="app-alert">{t.storageError}</output>}
      {hasUnreadableSession && <UnreadableSessionNotice locale={locale} onStart={startFreshSession} />}
      <main id="main">
        {storageGate || routeNeedsAssessmentGuard || protectedSituationRouteGuard || demoSituationRouteGuard ? <LoadingState message={routeUi[locale].preparing} /> : <>
          {screen === "landing" && <Landing t={t} showStart={!assessmentComplete} showDemo={isDemoSituation || answeredSteps.length === 0} disabled={!storageReady || hasUnreadableSession} start={() => go("check", { step: firstIncompleteStep ?? 0 })} demo={loadDemo} municipalityAppUrl={municipalityAppRoute} />}
          {screen === "check" && (
            <SituationCheck locale={locale} t={t} step={step} setStep={setStep} backToTop={() => go("landing")} situation={situation} setSituation={setSituation} stayAnswer={stayAnswer} setStayAnswer={setStayAnswer} familyAnswers={familyAnswers} setFamilyAnswers={setFamilyAnswers} otherAnswers={otherAnswers} setOtherAnswers={setOtherAnswers} invalidateAiRecommendation={() => { cancelPendingRecommendation(); setAiRecommendation(null); }} answeredSteps={answeredSteps} setAnsweredSteps={setAnsweredSteps} restart={restartAssessment} restartLabel={routeUi[locale].restart} finish={() => void complete()} isPreparing={isPreparingRecommendations} />
          )}
          {screen === "status" && <ImmediateStatus locale={locale} t={t} situation={situation} stayAnswer={stayAnswer} familyAnswers={familyAnswers} otherAnswers={otherAnswers} answeredSteps={answeredSteps} persistence={situationPersistence} hasPendingSituationSubmission={hasPendingSituationSubmission} hasCorruptPendingSituationSubmission={hasCorruptPendingSituationSubmission} isDemo={isDemoSituation && !hasPendingSituationSubmission} persist={() => void persistSituation()} declinePersistence={() => {
            try {
              sessionStorage.setItem(SITUATION_PERSISTENCE_PREFERENCE_KEY, "declined");
            } catch {
              // Forgetting a decline is acceptable; it only re-asks consent.
            }
            setSituationPersistence({ status: "declined" });
          }} deletePersistence={(credentials) => void deletePersistedSituation(credentials)} discardCorruptLocalData={discardCorruptLocalData} discardCorruptPending={discardCorruptPending} roadmap={() => go("roadmap")} edit={editSituation} />}
          {screen === "roadmap" && <Roadmap locale={locale} t={t} actions={actions} visitPurpose={situation.visitPurpose} conversationConsent={conversationConsent} setConversationConsent={setConversationConsent} go={go} openAction={openAction} restart={restartAssessment} restartLabel={routeUi[locale].restart} />}
        {screen === "local" && <LocalAction locale={locale} t={t} resources={availableResources} filter={localFilter} setFilter={setLocalFilter} go={go} />}
          {screen === "help" && <HumanSupport locale={locale} t={t} needs={situation.needs} visitPurpose={situation.visitPurpose} summary={() => go("summary")} />}
          {screen === "summary" && <ConsultationSummary locale={locale} t={t} situation={situation} stayAnswer={stayAnswer} familyAnswers={familyAnswers} otherAnswers={otherAnswers} answeredSteps={answeredSteps} summaryDate={summaryDate} copyState={copyState} setCopyState={setCopyState} />}
        </>}
      </main>
      <footer className="site-footer">
        <div><span className="brand-mark">SB</span><strong>StayBridge Tokyo</strong><p>{t.footer}</p></div>
        <button className="text-button" disabled={!storageReady} onClick={clearData}>{t.clear}</button>
      </footer>
    </div>
  );
}

function Header({ locale, screen, go, switchLocale, navVisible, showStepsNav }: { locale: Locale; screen: Screen; go: (s: Screen, query?: StayBridgeQuery) => void; switchLocale: (locale: Locale) => void; navVisible: boolean; showStepsNav: boolean }) {
  const t = getUserMessages(locale).ui;
  return <header className="site-header">
    <button className="brand" onClick={() => go("landing")} aria-label={t.homeLabel}><span className="brand-mark">SB</span><span className="brand-name">StayBridge <b>Tokyo</b></span><span className="brand-home-label">{t.backToTop}</span></button>
    {navVisible && <nav aria-label={t.primaryNavLabel}>
      {showStepsNav && <button className={screen === "roadmap" ? "active" : ""} onClick={() => go("roadmap")}>{t.navSteps}</button>}
      <button className={screen === "local" ? "active" : ""} onClick={() => go("local")}>{t.navLocal}</button>
      <button className={screen === "help" ? "active" : ""} onClick={() => go("help")}>{t.navHelp}</button>
    </nav>}
    <LanguageSelect key={locale} locale={locale} switchLocale={switchLocale} />
  </header>;
}

// oxlint-disable jsx-a11y/prefer-tag-over-role -- This custom listbox intentionally replaces the browser-native language select UI.
function LanguageSelect({ locale, switchLocale }: { locale: Locale; switchLocale: (locale: Locale) => void }) {
  const t = getUserMessages(locale).ui;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => selectableUserLocales.indexOf(locale));
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = "language-select-listbox";
  const currentLabel = getUserMessages(locale).metadata.nativeLabel;

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  const closeAndFocusTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const chooseLocale = (nextLocale: Locale) => {
    setOpen(false);
    if (nextLocale === locale) {
      triggerRef.current?.focus();
      return;
    }
    switchLocale(nextLocale);
  };

  const moveActiveOption = (direction: 1 | -1) => {
    setActiveIndex((index) => (index + direction + selectableUserLocales.length) % selectableUserLocales.length);
  };

  return <div
    className="language-select"
    title={t.languageSelectTitle}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}
  >
    <button
      ref={triggerRef}
      type="button"
      className="language-select-trigger"
      aria-label={`${t.languageSelectLabel}: ${currentLabel}`}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={listboxId}
      onClick={() => {
        setActiveIndex(selectableUserLocales.indexOf(locale));
        setOpen((currentOpen) => !currentOpen);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setActiveIndex(selectableUserLocales.indexOf(locale));
          setOpen(true);
        } else if (event.key === "Escape" && open) {
          event.preventDefault();
          setOpen(false);
        }
      }}
    >
      <span>{currentLabel}</span>
      <span className={`language-select-chevron ${open ? "open" : ""}`} aria-hidden="true" />
    </button>
    {open && <div id={listboxId} className="language-select-menu" role="listbox" aria-label={t.languageSelectLabel}>
      {selectableUserLocales.map((availableLocale, index) => {
        const optionLabel = getUserMessages(availableLocale).metadata.nativeLabel;
        return <button
          key={availableLocale}
          ref={(element) => { optionRefs.current[index] = element; }}
          type="button"
          role="option"
          tabIndex={-1}
          aria-selected={availableLocale === locale}
          className={index === activeIndex ? "active" : ""}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => chooseLocale(availableLocale)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveActiveOption(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              moveActiveOption(-1);
            } else if (event.key === "Home") {
              event.preventDefault();
              setActiveIndex(0);
            } else if (event.key === "End") {
              event.preventDefault();
              setActiveIndex(selectableUserLocales.length - 1);
            } else if (event.key === "Escape") {
              event.preventDefault();
              closeAndFocusTrigger();
            } else if (event.key === "Tab") {
              setOpen(false);
            }
          }}
        ><span>{optionLabel}</span>{availableLocale === locale && <span className="language-select-check" aria-hidden="true">✓</span>}</button>;
      })}
    </div>}
  </div>;
}
// oxlint-enable jsx-a11y/prefer-tag-over-role

function UnreadableSessionNotice({ locale, onStart }: { locale: Locale; onStart: () => void }) {
  const copy = getPersistenceCopy(locale);
  return <section id="unreadable-session-notice" className="consent-card unreadable-session" aria-labelledby="unreadable-session-title" tabIndex={-1}><h2 id="unreadable-session-title">{copy.sessionUnreadableTitle}</h2><p>{copy.sessionUnreadableBody}</p><div className="consent-actions"><button className="secondary-button" onClick={onStart}>{copy.startFreshSession}</button></div></section>;
}

function LoadingState({ message }: { message: string }) {
  return <output className="loading-page" aria-live="polite"><div className="loading-card"><span className="loading-orbit" aria-hidden="true" /><p>{message}</p></div></output>;
}

function Landing({ t, showStart, showDemo, disabled, start, demo, municipalityAppUrl }: { t: UserCopy; showStart: boolean; showDemo: boolean; disabled: boolean; start: () => void; demo: () => void; municipalityAppUrl: string }) {
  return <>
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-dot" />{t.eyebrow}</div>
        <h1>{t.hero.split("\n").map((line) => <span key={line}>{line}</span>)}</h1>
        <p className="lede">{t.intro}</p>
        <div className="hero-actions">{showStart && <button className="primary-button" disabled={disabled} onClick={start}>{t.start}<span aria-hidden>→</span></button>}{showDemo && <button className="secondary-button" disabled={disabled} onClick={demo}>{t.demo}</button>}</div>
        <div className="trust-row"><span>{t.noLogin}</span><span>{t.noAddress}</span><span>{t.official}</span></div>
      </div>
      <div className="roadmap-preview" aria-label={t.previewAriaLabel}>
        <div className="preview-top"><span>{t.previewTitle}</span><span className="safe-chip">{t.previewSafety}</span></div>
        <div className="timeline-line" />
        {t.previewSteps.map((preview, i) => <div className="preview-step" key={preview.time}><span className={`time-dot dot-${i}`} /><div><small>{preview.time}</small><strong>{preview.title}</strong><p>{preview.detail}</p></div><span className="step-number">0{i + 1}</span></div>)}
        <div className="preview-note"><span>i</span><details><summary>{t.sectionOfficialSupport}</summary><p>{t.notDecision}</p></details></div>
      </div>
    </section>
    <section className="principles">
      <div className="section-heading"><span>{t.sectionHowItHelps}</span><h2>{t.privacyTitle}</h2><p>{t.privacyText}</p></div>
      <div className="principle-grid">
        {t.principleTitles.map((title, index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{t.principleBodies[index]}</p></article>)}
      </div>
      <a className="crisis-link" href={municipalityAppUrl}><span>{t.sectionPublicTeams}</span>{t.crisis}<b>↗</b></a>
    </section>
  </>;
}

function SituationCheck({ locale, t, step, setStep, backToTop, situation, setSituation, stayAnswer, setStayAnswer, familyAnswers, setFamilyAnswers, otherAnswers, setOtherAnswers, invalidateAiRecommendation, answeredSteps, setAnsweredSteps, restart, restartLabel, finish, isPreparing }: {
  locale: Locale; t: UserCopy; step: number; setStep: (n: number) => void; backToTop: () => void; situation: Situation; setSituation: (s: Situation) => void; stayAnswer: StayAnswer; setStayAnswer: (s: StayAnswer) => void; familyAnswers: FamilyAnswers; setFamilyAnswers: (s: FamilyAnswers) => void; otherAnswers: OtherAnswers; setOtherAnswers: (answers: OtherAnswers) => void; invalidateAiRecommendation: () => void; answeredSteps: number[]; setAnsweredSteps: (steps: number[]) => void; restart: () => void; restartLabel: string; finish: () => void; isPreparing: boolean;
}) {
  const question = getUserMessages(locale).questions[step];
  const [title, hint, options] = question;
  const current = getQuestionValue(step, situation, stayAnswer);
  const multi = step === 6 || step === 8;
  const markAnswered = (isAnswered = true) => {
    const next = isAnswered
      ? [...new Set([...answeredSteps, step])]
      : answeredSteps.filter((answeredStep) => answeredStep !== step);
    setAnsweredSteps(next);
  };
  const choose = (value: string) => {
    if (step === 0) {
      setSituation({ ...situation, currentMunicipality: value });
      if (value !== "Other") setOtherAnswers({ ...otherAnswers, area: "" });
      markAnswered(value !== "Other" || Boolean(otherAnswers.area.trim()));
      return;
    }
    if (step === 1) {
      setSituation({ ...situation, nationality: value });
      if (value !== "OTHER") setOtherAnswers({ ...otherAnswers, nationality: "" });
      markAnswered(value !== "OTHER" || Boolean(otherAnswers.nationality.trim()));
      return;
    }
    if (step === 2) {
      invalidateAiRecommendation();
      setSituation({ ...situation, visitPurpose: value as Situation["visitPurpose"] });
      if (value !== "other") setOtherAnswers({ ...otherAnswers, visitPurpose: "" });
      markAnswered(value !== "other" || Boolean(otherAnswers.visitPurpose.trim()));
      return;
    }
    if (step === 3) setSituation({ ...situation, originalDepartureWindow: value as Situation["originalDepartureWindow"] });
    if (step === 4) setSituation({ ...situation, returnStatus: value as Situation["returnStatus"] });
    if (step === 5) { setStayAnswer(value as StayAnswer); setSituation({ ...situation, knownStayDeadline: value === "known" ? situation.knownStayDeadline : undefined, stayDeadlineKnown: value === "known" && Boolean(situation.knownStayDeadline) }); }
    if (step === 6) {
      const answer = value as FamilyAnswer;
      const nextAnswers = answer === "none"
        ? ["none" as const]
        : familyAnswers.includes(answer)
          ? familyAnswers.filter((item) => item !== answer && item !== "none")
          : [...familyAnswers.filter((item) => item !== "none"), answer];
      setFamilyAnswers(nextAnswers);
      const hasChildren = nextAnswers.includes("children");
      const children = hasChildren ? situation.familyMembers.children : [];
      const hasOtherFamily = nextAnswers.includes("other");
      if (!hasOtherFamily) setOtherAnswers({ ...otherAnswers, family: "" });
      setSituation({
        ...situation,
        familyMembers: { children },
      });
      markAnswered(nextAnswers.length > 0
        && (!hasChildren || children.length > 0)
        && (!hasOtherFamily || Boolean(otherAnswers.family.trim())));
      return;
    }
    if (step === 7) {
      setSituation({ ...situation, accommodation: value as Situation["accommodation"] });
      if (value !== "other") setOtherAnswers({ ...otherAnswers, accommodation: "" });
      markAnswered(value !== "other" || Boolean(otherAnswers.accommodation.trim()));
      return;
    }
    if (step === 8) {
      // 「特になし」is exclusive: choosing it clears real needs, and any real
      // need clears it, so nobody must fake a category to finish the flow.
      const nextNeeds = value === "none"
        ? situation.needs.includes("none") ? [] : ["none" as NeedCategory]
        : situation.needs.includes(value as NeedCategory)
          ? situation.needs.filter((n) => n !== value)
          : [...situation.needs.filter((n) => n !== "none"), value as NeedCategory];
      setSituation({ ...situation, needs: nextNeeds });
      if (!nextNeeds.includes("other")) setOtherAnswers({ ...otherAnswers, needs: "" });
      markAnswered(nextNeeds.length > 0
        && (!nextNeeds.includes("other") || Boolean(otherAnswers.needs.trim())));
      return;
    }
    if (step === 9) setSituation({ ...situation, japaneseLevel: value as Situation["japaneseLevel"] });
    markAnswered();
  };
  const clearSearchAnswer = () => {
    if (step === 0) {
      setSituation({ ...situation, currentMunicipality: "" });
      setOtherAnswers({ ...otherAnswers, area: "" });
    }
    if (step === 1) {
      setSituation({ ...situation, nationality: "" });
      setOtherAnswers({ ...otherAnswers, nationality: "" });
    }
    markAnswered(false);
  };
  const toggleChildAge = (age: ChildAgeGroup) => {
    const nextChildren = situation.familyMembers.children.some((child) => child.ageGroup === age)
      ? situation.familyMembers.children.filter((child) => child.ageGroup !== age)
      : [...situation.familyMembers.children, { ageGroup: age }].sort((a, b) =>
        assessmentOptionCodes.childAge.indexOf(a.ageGroup) - assessmentOptionCodes.childAge.indexOf(b.ageGroup));
    setSituation({ ...situation, familyMembers: { children: nextChildren } });
    markAnswered(nextChildren.length > 0 && (!familyAnswers.includes("other") || Boolean(otherAnswers.family.trim())));
  };
  const otherAnswerKey = getSelectedOtherAnswerKey(step, situation, familyAnswers);
  const otherAnswer = otherAnswerKey ? otherAnswers[otherAnswerKey] : undefined;
  const otherCopy = otherAnswerKey ? getUserMessages(locale).otherAnswers[otherAnswerKey] : undefined;
  const otherMaxLength = otherAnswerKey === "visitPurpose" ? 300 : 100;
  const showOtherGuidance = otherAnswerKey !== "visitPurpose";
  const updateOtherAnswer = (value: string) => {
    if (!otherAnswerKey) return;
    if (otherAnswerKey === "visitPurpose") invalidateAiRecommendation();
    const nextOtherAnswers = { ...otherAnswers, [otherAnswerKey]: value };
    setOtherAnswers(nextOtherAnswers);
    const familyIsComplete = familyAnswers.length > 0
      && (!familyAnswers.includes("children") || situation.familyMembers.children.length > 0)
      && (!familyAnswers.includes("other") || Boolean(nextOtherAnswers.family.trim()));
    markAnswered(step === 6 ? familyIsComplete : Boolean(value.trim()));
  };
  const familyComplete = familyAnswers.length > 0
    && (!familyAnswers.includes("children") || situation.familyMembers.children.length > 0)
    && (!familyAnswers.includes("other") || Boolean(otherAnswers.family.trim()));
  const enabled = answeredSteps.includes(step) && (
    otherAnswer !== undefined
      ? Boolean(otherAnswer.trim()) && (step !== 6 || familyComplete)
      : step === 6
        ? familyComplete
        : step === 8
          ? situation.needs.length > 0
          : Boolean(current)
  );
  return <section className="check-page">
    <div className="check-progress"><div className="progress-meta"><span>{t.sectionSituationCheck}</span><strong>{step + 1} / 10</strong></div><div className="progress-track"><span style={{ width: `${(step + 1) * 10}%` }} /></div></div>
    <div className="question-card">
      <span className="question-kicker">{t.questionLabel} {String(step + 1).padStart(2, "0")}</span>
      <h1>{title}</h1>{hint && <p>{hint}</p>}
      {step === 0 || step === 1
        ? <SearchableAnswer key={step} id={`question-search-${step}`} label={step === 0 ? searchUi[locale].areaLabel : searchUi[locale].nationalityLabel} placeholder={step === 0 ? searchUi[locale].areaPlaceholder : searchUi[locale].nationalityPlaceholder} noResults={searchUi[locale].noResults} options={options} separateOptionValue={step === 1 ? "OTHER" : undefined} current={answeredSteps.includes(step) || (step === 1 && situation.nationality === "OTHER") ? current : ""} choose={choose} clear={clearSearchAnswer} />
        : <div className="option-grid" role={multi ? "group" : "radiogroup"} aria-label={title}>
          {options.map(([value, label]) => { const selectedOther = (step === 2 || step === 7) && value === "other" && current === value; const selected = step === 6 ? familyAnswers.includes(value as FamilyAnswer) : step === 8 ? situation.needs.includes(value as NeedCategory) : selectedOther || (answeredSteps.includes(step) && current === value); return <label key={value} className={`option-button ${selected ? "selected" : ""}`}><input type={multi ? "checkbox" : "radio"} name={`q-${step}`} className="option-input" checked={selected} onChange={() => choose(value)} /><span className="option-control" aria-hidden="true">{selected ? "✓" : ""}</span><span>{label}</span></label>; })}
        </div>}
      {step === 6 && familyAnswers.includes("children") && <div className="age-panel"><label>{t.ageLabel}</label><div className="age-options">{assessmentOptionCodes.childAge.map((age) => { const selected = situation.familyMembers.children.some((child) => child.ageGroup === age); return <label key={age} className={`age-chip ${selected ? "selected" : ""}`}><input type="checkbox" name="child-ages" className="option-input" checked={selected} onChange={() => toggleChildAge(age)} /><span aria-hidden="true">{selected ? "✓" : ""}</span><span>{age}</span></label>; })}</div></div>}
      {otherAnswer !== undefined && otherCopy && <div className="other-answer-panel"><label htmlFor={`other-answer-${step}`}>{otherCopy.label}</label><textarea id={`other-answer-${step}`} data-testid={`question-${step + 1}-other`} value={otherAnswer} maxLength={otherMaxLength} required aria-invalid={!otherAnswer.trim()} aria-describedby={showOtherGuidance ? `other-answer-notice-${step} other-answer-error-${step}` : undefined} placeholder={otherCopy.placeholder} onChange={(event) => updateOtherAnswer(event.target.value)} />{showOtherGuidance && <><div className="other-answer-meta"><small id={`other-answer-notice-${step}`}>{otherCopy.notice}</small><span>{otherAnswer.length} / {otherMaxLength}</span></div>{!otherAnswer.trim() && <p id={`other-answer-error-${step}`} className="inline-error" role="alert">{otherCopy.required}</p>}</>}</div>}
      {step === 5 && stayAnswer === "known" && <div className="age-panel"><label htmlFor="stay-deadline">{t.deadlineLabel}</label><input id="stay-deadline" className="date-input" type="date" value={situation.knownStayDeadline || ""} onChange={(e) => setSituation({ ...situation, knownStayDeadline: e.target.value || undefined, stayDeadlineKnown: Boolean(e.target.value) })} /></div>}
      <div className="question-actions"><button className="back-button" onClick={() => step === 0 ? backToTop() : setStep(step - 1)}>← {t.back}</button><button className="primary-button" disabled={!enabled || isPreparing} onClick={() => step === 9 ? finish() : setStep(step + 1)}>{isPreparing ? t.loading : step === 9 ? t.finish : t.next}<span aria-hidden>→</span></button></div>
      {answeredSteps.length > 0 && <div className="question-restart"><button className="text-button" aria-label={restartLabel} onClick={restart}>↺ {restartLabel}</button></div>}
    </div>
  </section>;
}

// oxlint-disable jsx-a11y/prefer-tag-over-role -- This WAI-ARIA combobox intentionally replaces browser-native datalist UI.
function SearchableAnswer({ id, label, placeholder, noResults, options, separateOptionValue, current, choose, clear }: {
  id: string;
  label: string;
  placeholder: string;
  noResults: string;
  options: readonly (readonly [string, string])[];
  separateOptionValue?: string;
  current: string;
  choose: (value: string) => void;
  clear: () => void;
}) {
  const separateOption = options.find(([value]) => value === separateOptionValue);
  const searchableOptions = separateOptionValue ? options.filter(([value]) => value !== separateOptionValue) : options;
  const selectedLabel = searchableOptions.find(([value]) => value === current)?.[1] ?? "";
  const [query, setQuery] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const localSelectionChange = useRef(false);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const normalizedQuery = query === selectedLabel ? "" : normalizeSearchText(query);
  const filteredOptions = normalizedQuery
    ? searchableOptions.filter(([value, optionLabel]) => matchesSearchOption(value, optionLabel, normalizedQuery))
    : searchableOptions;
  const listboxId = `${id}-listbox`;
  const activeOptionId = open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  useEffect(() => {
    if (localSelectionChange.current) {
      localSelectionChange.current = false;
      return;
    }
    setQuery(selectedLabel);
    setOpen(false);
    setActiveIndex(-1);
  }, [selectedLabel]);

  useEffect(() => {
    if (open && activeIndex >= 0) optionRefs.current[activeIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, open]);

  const selectOption = (value: string, optionLabel: string) => {
    setQuery(optionLabel);
    setOpen(false);
    setActiveIndex(-1);
    choose(value);
  };

  const selectSeparateOption = () => {
    if (!separateOption) return;
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
    choose(separateOption[0]);
  };

  return <div className="searchable-answer">
    <label htmlFor={id}>{label}</label>
    <div className="searchable-answer-control" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }}>
      <div className="searchable-answer-input-wrap">
        <input
          id={id}
          type="text"
          role="combobox"
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-activedescendant={activeOptionId}
          onFocus={() => {
            setOpen(true);
            setActiveIndex(current ? searchableOptions.findIndex(([value]) => value === current) : -1);
          }}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            const nextQuery = event.target.value;
            const nextNormalizedQuery = normalizeSearchText(nextQuery);
            const nextOptions = nextNormalizedQuery
              ? searchableOptions.filter(([value, optionLabel]) => matchesSearchOption(value, optionLabel, nextNormalizedQuery))
              : searchableOptions;
            setQuery(nextQuery);
            setOpen(true);
            setActiveIndex(nextOptions.length ? 0 : -1);
            const match = searchableOptions.find(([, optionLabel]) => optionLabel === nextQuery);
            if (match) {
              setOpen(false);
              setActiveIndex(-1);
              choose(match[0]);
            } else {
              if (selectedLabel) localSelectionChange.current = true;
              clear();
            }
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => filteredOptions.length ? Math.min(index + 1, filteredOptions.length - 1) : -1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => filteredOptions.length ? (index <= 0 ? filteredOptions.length - 1 : index - 1) : -1);
            } else if (event.key === "Enter" && open && activeIndex >= 0) {
              event.preventDefault();
              const option = filteredOptions[activeIndex];
              if (option) selectOption(option[0], option[1]);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              setActiveIndex(-1);
            } else if (event.key === "Tab") {
              setOpen(false);
              setActiveIndex(-1);
            }
          }}
        />
        <span className={`searchable-answer-chevron ${open ? "open" : ""}`} aria-hidden="true">⌄</span>
      </div>
      {separateOption && <button type="button" className={`option-button searchable-answer-separate ${current === separateOption[0] ? "selected" : ""}`} aria-pressed={current === separateOption[0]} onClick={selectSeparateOption}><span className="option-control" aria-hidden="true">{current === separateOption[0] ? "✓" : ""}</span><span>{separateOption[1]}</span></button>}
      {open && <div id={listboxId} className="searchable-answer-menu" role="listbox" aria-label={label}>
        {filteredOptions.length
          ? filteredOptions.map(([value, optionLabel], index) => <button
            key={value}
            type="button"
            id={`${listboxId}-option-${index}`}
            ref={(element) => { optionRefs.current[index] = element; }}
            role="option"
            tabIndex={-1}
            aria-selected={value === current}
            className={index === activeIndex ? "active" : ""}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectOption(value, optionLabel)}
            onMouseEnter={() => setActiveIndex(index)}
          ><span>{optionLabel}</span>{value === current && <span className="searchable-answer-check" aria-hidden="true">✓</span>}</button>)
          : <p className="searchable-answer-empty">{noResults}</p>}
      </div>}
    </div>
  </div>;
}
// oxlint-enable jsx-a11y/prefer-tag-over-role

function getSelectedOtherAnswerKey(step: number, situation: Situation, familyAnswers: FamilyAnswers): keyof OtherAnswers | null {
  if (step === 0 && situation.currentMunicipality === "Other") return "area";
  if (step === 1 && situation.nationality === "OTHER") return "nationality";
  if (step === 2 && situation.visitPurpose === "other") return "visitPurpose";
  if (step === 6 && familyAnswers.includes("other")) return "family";
  if (step === 7 && situation.accommodation === "other") return "accommodation";
  if (step === 8 && situation.needs.includes("other")) return "needs";
  return null;
}

function getQuestionValue(step: number, s: Situation, stay: string) {
  return [s.currentMunicipality, s.nationality, s.visitPurpose, s.originalDepartureWindow, s.returnStatus, stay, "", s.accommodation, "", s.japaneseLevel][step];
}

async function requestRecommendedActions(text: string, signal: AbortSignal): Promise<AiSelectableActionId[] | null> {
  try {
    const response = await fetch("/api/recommend-actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    });
    if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json" || !response.ok) return null;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || Object.keys(payload).length !== 1 || !("actionIds" in payload)) return null;
    return parseAiActionIds(payload.actionIds);
  } catch {
    return null;
  }
}

function ImmediateStatus({ locale, t, situation, stayAnswer, familyAnswers, otherAnswers, answeredSteps, persistence, hasPendingSituationSubmission, hasCorruptPendingSituationSubmission, isDemo, persist, declinePersistence, deletePersistence, discardCorruptLocalData, discardCorruptPending, roadmap, edit }: { locale: Locale; t: UserCopy; situation: Situation; stayAnswer: StayAnswer; familyAnswers: FamilyAnswers; otherAnswers: OtherAnswers; answeredSteps: number[]; persistence: SituationPersistenceState; hasPendingSituationSubmission: boolean; hasCorruptPendingSituationSubmission: boolean; isDemo: boolean; persist: () => void; declinePersistence: () => void; deletePersistence: (credentials: SavedRecordCredentials) => void; discardCorruptLocalData: () => void; discardCorruptPending: () => void; roadmap: () => void; edit: () => void }) {
  const items = summarizeSituation(locale, situation, stayAnswer, familyAnswers, answeredSteps, otherAnswers);
  return <section className="result-page narrow-page"><span className="section-label">{t.sectionSituationReview}</span><h1>{t.reviewed}</h1><p className="page-intro">{t.reviewedIntro}</p><div className="status-list">{items.length ? items.map((item) => <div key={item}>{item}</div>) : <p>{t.noEnteredInfo}</p>}</div><div className="stack-actions"><button className="primary-button wide" onClick={roadmap}>{t.seeRoadmap}<span>→</span></button><button className="text-button" onClick={edit}>{t.answerAgain}</button></div><SituationPersistenceConsent locale={locale} state={persistence} hasPendingSituationSubmission={hasPendingSituationSubmission} hasCorruptPendingSituationSubmission={hasCorruptPendingSituationSubmission} isDemo={isDemo} persist={persist} decline={declinePersistence} deleteRecord={deletePersistence} discardCorruptLocalData={discardCorruptLocalData} discardCorruptPending={discardCorruptPending} /><div className="safe-notice"><strong>{t.notDecision}</strong><p>{t.helpIntro}</p></div></section>;

}

function Roadmap({ locale, t, actions, visitPurpose, conversationConsent, setConversationConsent, go, openAction, restart, restartLabel }: { locale: Locale; t: UserCopy; actions: Action[]; visitPurpose: Situation["visitPurpose"]; conversationConsent: ConversationConsentState; setConversationConsent: (state: ConversationConsentState) => void; go: (s: Screen) => void; openAction: (destination: ActionDestination) => void; restart: () => void; restartLabel: string }) {
  const groups = ["today", "this_week", "next_30_days", "before_deadline", "long_term"].map((timing) => ({ timing, actions: actions.filter((a) => a.timing === timing) })).filter((g) => g.actions.length);
  const numberedGroups = groups.reduce<Array<{ timing: string; actions: Action[]; offset: number }>>((all, group) => {
    const last = all[all.length - 1];
    return [...all, { ...group, offset: last ? last.offset + last.actions.length : 0 }];
  }, []);
  return <section className="content-page"><div className="page-heading"><span className="section-label">{t.sectionPersonalRoadmap}</span><h1>{t.roadmapTitle}</h1><p>{t.roadmapIntro}</p></div><div className="roadmap-layout"><div className="roadmap-list">{numberedGroups.length ? numberedGroups.map((group) => <section className="roadmap-group" key={group.timing}><div className="timing-heading"><span className="timing-dot" /><h2>{getUserMessages(locale).timing[group.timing as TimingKey]}</h2></div>{group.actions.map((action, index) => <ActionCard key={action.id} locale={locale} t={t} action={action} number={group.offset + index + 1} visitPurpose={visitPurpose} openAction={openAction} />)}</section>) : <div className="empty-state"><h2>{routeUi[locale].catalogUnavailable}</h2><button className="secondary-button" onClick={() => go("help")}>{routeUi[locale].contactOfficial} →</button></div>}</div><aside className="roadmap-aside"><SupportChat locale={locale} /><div className="aside-card"><h3>{t.localTitle}</h3><p>{t.localIntro}</p><button onClick={() => go("local")}>{t.navLocal} →</button></div><div className="aside-card human-card"><h3>{t.helpTitle}</h3><p>{t.helpIntro}</p><button onClick={() => go("help")}>{t.navHelp} →</button></div></aside></div><ConversationPersistenceConsent locale={locale} state={conversationConsent} setState={setConversationConsent} /><aside className="roadmap-restart"><button className="text-button" aria-label={restartLabel} onClick={restart}>↺ {restartLabel}</button></aside></section>;
}

function SituationPersistenceConsent({ locale, state, hasPendingSituationSubmission, hasCorruptPendingSituationSubmission, isDemo, persist, decline, deleteRecord, discardCorruptLocalData, discardCorruptPending }: { locale: Locale; state: SituationPersistenceState; hasPendingSituationSubmission: boolean; hasCorruptPendingSituationSubmission: boolean; isDemo: boolean; persist: () => void; decline: () => void; deleteRecord: (credentials: SavedRecordCredentials) => void; discardCorruptLocalData: () => void; discardCorruptPending: () => void }) {
  const copy = getPersistenceCopy(locale);
  const busy = state.status === "saving" || state.status === "deleting";
  return <section id="situation-persistence" className="consent-card" aria-labelledby="situation-consent-title" tabIndex={-1}><h2 id="situation-consent-title">{copy.situationTitle}</h2><p>{copy.situationPurpose}</p><details><summary>{copy.detailsTitle}</summary><ul><li>{copy.situationItems}</li><li>{copy.retention}</li><li>{copy.deletion}</li><li>{copy.safeguards}</li></ul></details><p className="consent-warning">{copy.warning}</p>{state.status === "saved" || state.status === "deleting" || state.status === "delete-error" ? <SavedCredentials copy={copy} state={state} deleteRecord={deleteRecord} /> : state.status === "corrupt" ? <CorruptSavedCredentials copy={copy} keepsPendingSave={hasPendingSituationSubmission || hasCorruptPendingSituationSubmission} discardLocalData={discardCorruptLocalData} /> : state.status === "pending-corrupt" || hasCorruptPendingSituationSubmission ? <CorruptPendingSection copy={copy} discardPending={discardCorruptPending} /> : <><div className="consent-actions"><button className="primary-button" disabled={busy || isDemo} onClick={persist}>{state.status === "saving" ? copy.saving : copy.accept}</button><button className="secondary-button" disabled={busy} onClick={decline}>{copy.decline}</button></div>{isDemo && <output className="consent-status" aria-live="polite">{copy.demoNotSaved}</output>}<ConsentStatus copy={copy} status={state.status} /></>}</section>;
}

function CorruptPendingSection({ copy, discardPending }: { copy: PersistenceCopy; discardPending: () => void }) {
  return <div id="corrupt-pending-situation-submission" className="saved-credentials" tabIndex={-1}><h3>{copy.pendingCorruptTitle}</h3><p>{copy.pendingCorruptBody}</p><p className="consent-warning">{copy.pendingCorruptWarning}</p><div className="consent-actions"><button className="secondary-button" onClick={discardPending}>{copy.discardCorruptPending}</button></div></div>;
}

function CorruptSavedCredentials({ copy, keepsPendingSave, discardLocalData }: { copy: PersistenceCopy; keepsPendingSave: boolean; discardLocalData: () => void }) {
  return <div id="corrupt-saved-situation-credentials" className="saved-credentials" tabIndex={-1}><h3>{copy.corruptCredentialsTitle}</h3><p>{copy.corruptCredentialsBody}</p><p className="consent-warning">{keepsPendingSave ? copy.corruptCredentialsPendingWarning : copy.corruptCredentialsDiscardWarning}</p><div className="consent-actions"><button className="secondary-button" onClick={discardLocalData}>{keepsPendingSave ? copy.discardOnlyCorruptCredentials : copy.discardCorruptLocalData}</button></div></div>;
}

function ConversationPersistenceConsent({ locale, state, setState }: { locale: Locale; state: ConversationConsentState; setState: (state: ConversationConsentState) => void }) {
  const copy = getPersistenceCopy(locale);
  return <section className="consent-card conversation-consent" aria-labelledby="conversation-consent-title"><h2 id="conversation-consent-title">{copy.conversationTitle}</h2><p>{copy.conversationPurpose}</p><details><summary>{copy.detailsTitle}</summary><ul><li>{copy.conversationItems}</li><li>{copy.retention}</li><li>{copy.deletion}</li><li>{copy.safeguards}</li></ul></details><p className="consent-warning">{copy.warning}</p><div className="consent-actions"><button className="primary-button" aria-pressed={state === "accepted"} onClick={() => setState("accepted")}>{copy.conversationAccept}</button><button className="secondary-button" aria-pressed={state === "declined"} onClick={() => setState("declined")}>{copy.decline}</button></div>{state !== "idle" && <output className="consent-status" aria-live="polite">{state === "accepted" ? copy.conversationAccepted : copy.declined}</output>}</section>;
}

function ConsentStatus({ copy, status }: { copy: PersistenceCopy; status: SituationPersistenceState["status"] }) {
  if (status === "idle" || status === "saving") return null;
  const message = status === "declined" ? copy.declined : status === "deleted" ? copy.deleted : copy.saveFailed;
  return <output className={`consent-status ${status === "error" ? "error" : ""}`} aria-live="polite">{message}</output>;
}

function SavedCredentials({ copy, state, deleteRecord }: { copy: PersistenceCopy; state: Extract<SituationPersistenceState, { credentials: SavedRecordCredentials }>; deleteRecord: (credentials: SavedRecordCredentials) => void }) {
  const [credentialCopyState, setCredentialCopyState] = useState<"idle" | "copied" | "error">("idle");
  const copyCredentials = async () => {
    try {
      await navigator.clipboard.writeText(`${copy.recordId}: ${state.credentials.id}\n${copy.deletionToken}: ${state.credentials.deletionToken}`);
      setCredentialCopyState("copied");
    } catch {
      setCredentialCopyState("error");
    }
  };
  return <div id="saved-situation-credentials" className="saved-credentials" tabIndex={-1}><h3>{copy.credentialsTitle}</h3><dl><div><dt>{copy.recordId}</dt><dd><code>{state.credentials.id}</code></dd></div><div><dt>{copy.deletionToken}</dt><dd><code>{state.credentials.deletionToken}</code></dd></div></dl><p>{copy.savedSessionWarning}</p><p>{copy.deleteBeforeReset}</p><div className="consent-actions"><button className="secondary-button" onClick={() => void copyCredentials()}>{copy.copyCredentials}</button><button className="secondary-button" disabled={state.status === "deleting"} onClick={() => deleteRecord(state.credentials)}>{state.status === "deleting" ? copy.deleting : copy.deleteNow}</button></div>{credentialCopyState !== "idle" && <output className={`consent-status ${credentialCopyState === "error" ? "error" : ""}`} aria-live="polite">{credentialCopyState === "copied" ? copy.credentialsCopied : copy.credentialsCopyFailed}</output>}{state.status === "delete-error" && <output className="consent-status error" aria-live="polite">{copy.deleteFailed}</output>}</div>;
}

function ActionCard({ locale, t, action, number, visitPurpose, openAction }: { locale: Locale; t: UserCopy; action: Action; number: number; visitPurpose: Situation["visitPurpose"]; openAction: (destination: ActionDestination) => void }) {
  const messages = getUserMessages(locale);
  const catalogEntry = getActionCatalogEntry(action.id);
  if (!catalogEntry) return null;
  const ui = messages.actions[catalogEntry.id as ActionId];
  const sourceCandidates = action.sourceIds.flatMap((id) => sourceRegistry[id] ? [sourceRegistry[id]] : []);
  if (sourceCandidates.length !== action.sourceIds.length) return null;
  const sources = sourceCandidates.filter((source) => isSourceEligibleForVisitPurpose(source, visitPurpose));
  if (sources.length === 0) return null;
  const reason = action.selectionSource === "ai"
    ? routeUi[locale].aiReason
    : messages.reasons[action.reasonCode as ReasonCode];
  return <article className="action-card"><div className="action-number">{String(number).padStart(2, "0")}</div><div className="action-content"><h3>{ui.title}</h3><p>{ui.desc}</p><p className="action-disclaimer">i {getActionNotice(locale, catalogEntry.id)}</p><details><summary>{t.why}</summary><p>{reason}</p></details><div className="action-footer"><div className="source-list">{sources.map((source) => <div className="source-mini" key={source.id}><span>{source.sourceType === "open_data" ? t.sourceTypeLabels.openData : t.sourceTypeLabels.official}</span><a href={source.url} target="_blank" rel="noreferrer">{source.publisher} · {source.title}</a></div>)}</div><button onClick={() => openAction(catalogEntry.destination)}>{ui.cta} →</button></div></div></article>;
}

function LocalAction({ locale, t, resources, filter, setFilter, go }: { locale: Locale; t: UserCopy; resources: Array<LocalResource & { id: LocalResourceId }>; filter: LocalFilter; setFilter: (s: LocalFilter) => void; go: (screen: Screen) => void }) {
  const filters: LocalFilter[] = ["all", "school", "medical", "child_support", "public_facility"];
  return <section className="content-page"><div className="page-heading local-heading"><span className="section-label">{t.sectionLocalAction}</span><h1>{t.localTitle}</h1><p>{t.localIntro}</p><div className="location-pill">{t.localFallback}</div></div><div className="page-actions" aria-label={t.localNavigationLabel}><button className="secondary-button" onClick={() => go("roadmap")}>← {t.backToRoadmap}</button><button className="primary-button" onClick={() => go("help")}>{t.continueToHelp}<span aria-hidden>→</span></button></div><div className="filter-tabs">{filters.map((item) => <button aria-pressed={filter === item} className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{t[item as keyof UserCopy] as string}</button>)}</div>{resources.length ? <div className="resource-grid">{resources.map((resource) => <ResourceCard key={resource.id} resource={resource} locale={locale} t={t} />)}</div> : <div className="empty-state"><h2>{t.noResources}</h2><button className="secondary-button" onClick={() => setFilter("all")}>{t.all}</button></div>}</section>;
}

function ResourceCard({ resource, locale, t }: { resource: LocalResource & { id: LocalResourceId }; locale: Locale; t: UserCopy }) {
  const source = sourceRegistry[resource.sourceId];
  const updatedAt = resource.dataUpdatedAt ?? source?.dataUpdatedAt;
  const display = getLocalResourceDisplay(locale, resource.id);
  const icon = t.resourceIcons[resource.category as keyof UserCopy["resourceIcons"]];
  return <article className="resource-card"><div className={`resource-icon ${resource.category}`}>{icon}</div><div className="resource-main"><div className="resource-meta"><span>{t[resource.category as keyof UserCopy] as string}</span><span>{resource.municipality}</span></div><h2>{resource.name}</h2><p>{display.description}</p><dl><div><dt>{t.addressLabel}</dt><dd>{resource.address ?? t.unavailable}</dd></div>{resource.phone && <div><dt>{t.phoneLabel}</dt><dd><a href={`tel:${resource.phone}`}>{resource.phone}</a></dd></div>}</dl>{resource.category === "school" && <p className="resource-disclaimer">i {t.schoolNote}</p>}<details className="resource-source"><summary>{t.sourceLabel}</summary><a href={source?.url || resource.website || "#"} target="_blank" rel="noreferrer">{source?.title || t.publicDataLabel}</a><small>{source?.publisher ?? t.publicDataLabel}</small>{source?.license && <small>{source.licenseUrl ? <a href={source.licenseUrl} target="_blank" rel="noreferrer">LICENSE: {source.license}</a> : `LICENSE: ${source.license}`}</small>}{source?.adaptation === "selected_and_normalized" && <small>{t.changesMade}</small>}<small>{t.updated}: {updatedAt ?? t.unavailable}</small><small>{t.fetched}: {source?.fetchedAt ?? t.unavailable}</small></details>{resource.website && <a className="card-link" href={resource.website} target="_blank" rel="noreferrer">{t.details} ↗</a>}</div></article>;
}

function HumanSupport({ locale, t, needs, visitPurpose, summary }: { locale: Locale; t: UserCopy; needs: NeedCategory[]; visitPurpose: Situation["visitPurpose"]; summary: () => void }) {
  const ui = supportUiCopy[locale];
  const infoSourceIds = [...new Set(needs.flatMap((need) => consultationSourcesByNeed[need]))];
  const infoSources = infoSourceIds
    .map((id) => sourceRegistry[id])
    .filter((source): source is DataSource => Boolean(source))
    .filter((source) => isSourceEligibleForVisitPurpose(source, visitPurpose));
  const handoffSources = humanHandoffSourceIds
    .map((id) => sourceRegistry[id])
    .filter((source): source is DataSource => Boolean(source))
    .filter((source) => isSourceEligibleForVisitPurpose(source, visitPurpose));
  return <section className="content-page"><div className="page-heading"><span className="section-label">{t.sectionHumanHandoff}</span><h1>{t.helpTitle}</h1><p>{t.helpIntro}</p></div><div className="handoff-grid"><div className="handoff-main">{infoSources.length > 0 ? <section className="handoff-group"><h2 className="handoff-group-title">{ui.infoTitle}</h2><p className="handoff-group-note">{ui.infoNote}</p><div className="support-list">{infoSources.map((source, index) => <SupportCard key={source.id} locale={locale} source={source} index={index} label={ui.infoLabel} details={t.details} />)}</div></section> : <p className="handoff-empty">{ui.emptyNote}</p>}<section className="handoff-group"><h2 className="handoff-group-title">{ui.talkTitle}</h2><p className="handoff-group-note">{ui.talkNote}</p><div className="support-list">{handoffSources.map((source, index) => <SupportCard key={source.id} locale={locale} source={source} index={index} label={ui.handoffLabel} details={t.details} />)}</div></section></div><aside className="prepare-card"><h2>{t.prepare}</h2><ol>{t.prepareItems.map((item) => <li key={item}>{item}</li>)}</ol><button className="primary-button wide" onClick={summary}>{t.summary}<span>→</span></button></aside></div><details className="safe-notice"><summary>{t.sectionOfficialSupport}</summary><p>{t.notDecision}</p></details><div className="emergency-note">{t.emergency}</div></section>;
}

function SupportCard({ locale, source, index, label, details }: { locale: Locale; source: DataSource; index: number; label: string; details: string }) {
  const answer = getLocalizedSupportText(source.id, "answersInText", locale);
  const note = getLocalizedSupportText(source.id, "notes", locale);
  return <article className="support-card"><span className="support-index">{String(index + 1).padStart(2, "0")}</span><div><small>{label}</small><h3>{source.title}</h3>{answer && <p className="support-answer">{answer}</p>}{note && <p className="support-note">{note}</p>}<a href={source.url} target="_blank" rel="noreferrer" aria-label={`${details}: ${source.title}`}>{details} ↗</a></div></article>;
}

function ConsultationSummary({ locale, t, situation, stayAnswer, familyAnswers, otherAnswers, answeredSteps, summaryDate, copyState, setCopyState }: { locale: Locale; t: UserCopy; situation: Situation; stayAnswer: StayAnswer; familyAnswers: FamilyAnswers; otherAnswers: OtherAnswers; answeredSteps: number[]; summaryDate: string; copyState: CopyState; setCopyState: (state: CopyState) => void }) {
  const items = summarizeSituation(locale, situation, stayAnswer, familyAnswers, answeredSteps, otherAnswers);
  const asks = summarizeNeeds(locale, situation, answeredSteps, otherAnswers);
  const text = `${t.summaryTitle}\n\n${t.current}\n${items.map((i) => `• ${i}`).join("\n")}\n\n${t.questions}\n${asks.map((i, n) => `${n + 1}. ${i}`).join("\n")}`;
  const copyText = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("error");
    }
  };
  return <section className="summary-page"><div className="page-heading"><span className="section-label">{t.sectionConsultationSummary}</span><h1>{t.summaryTitle}</h1><p>{t.summaryIntro}</p></div><div className="summary-toolbar"><button className="secondary-button" onClick={copyText}>{copyState === "copied" ? `✓ ${t.copied}` : t.copy}</button><button className="secondary-button" onClick={() => window.print()}>{t.print}</button><span>{t.showMode}</span>{copyState === "error" && <p className="inline-error" role="alert">{t.copyError}</p>}</div><article className="summary-sheet"><header><span className="brand-mark">SB</span><div><strong>StayBridge Tokyo</strong><small>{t.summarySheetLabel}</small></div><time>{summaryDate}</time></header><section><span className="sheet-label">{t.summarySheetSections[0]}</span><div><h2>{t.current}</h2>{items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{t.noEnteredInfo}</p>}</div></section><section><span className="sheet-label">{t.summarySheetSections[1]}</span><div><h2>{t.questions}</h2>{asks.length ? <ol>{asks.map((item) => <li key={item}>{item}</li>)}</ol> : <p>{t.noSelectedNeeds}</p>}</div></section></article></section>;
}

export function summarizeSituation(locale: Locale, s: Situation, stayAnswer: StayAnswer, familyAnswers: FamilyAnswers, answeredSteps: number[], otherAnswers: OtherAnswers = createInitialOtherAnswers()) {
  const labels = getUserMessages(locale).questions;
  const messages = getUserMessages(locale);
  const find = (q: number, value: string) => labels[q][2].find(([v]) => v === value)?.[1] ?? "";
  const childAgeLabels = s.familyMembers.children.map((child) => child.ageGroup).join(locale === "ja" ? "、" : ", ");
  const byStep: Record<number, string | undefined> = {
    0: s.currentMunicipality ? `${messages.ui.areaLabel}: ${s.currentMunicipality === "Other" ? otherAnswers.area.trim() || find(0, s.currentMunicipality) : find(0, s.currentMunicipality)}` : undefined,
    1: s.nationality ? `${messages.ui.nationalityLabel}: ${s.nationality === "OTHER" ? otherAnswers.nationality.trim() || find(1, s.nationality) : find(1, s.nationality)}` : undefined,
    2: s.visitPurpose === "other" && otherAnswers.visitPurpose.trim() ? `${find(2, s.visitPurpose)}: ${otherAnswers.visitPurpose.trim()}` : find(2, s.visitPurpose),
    3: find(3, s.originalDepartureWindow),
    4: find(4, s.returnStatus),
    5: s.knownStayDeadline ? `${find(5, stayAnswer)}: ${s.knownStayDeadline}` : find(5, stayAnswer),
    6: familyAnswers.length
      ? familyAnswers.map((answer) => answer === "children" && childAgeLabels
        ? `${find(6, answer)} · ${messages.ui.ageValueLabel}: ${childAgeLabels}`
        : answer === "other" && otherAnswers.family.trim() ? `${find(6, answer)}: ${otherAnswers.family.trim()}` : find(6, answer)).join(" / ")
      : undefined,
    7: s.accommodation === "other" && otherAnswers.accommodation.trim() ? `${find(7, s.accommodation)}: ${otherAnswers.accommodation.trim()}` : find(7, s.accommodation),
    9: `${messages.ui.japaneseLabel}: ${find(9, s.japaneseLevel)}`,
  };
  return answeredSteps.flatMap((step) => byStep[step] ? [byStep[step]] : []);
}

export function summarizeNeeds(locale: Locale, s: Situation, answeredSteps: number[], otherAnswers: OtherAnswers = createInitialOtherAnswers()) {
  const needMap = getUserMessages(locale).needs;
  if (!answeredSteps.includes(8)) return [];
  return s.needs.map((need) => need === "other" && otherAnswers.needs.trim()
    ? `${needMap[need as NeedKey]}: ${otherAnswers.needs.trim()}`
    : needMap[need as NeedKey]).filter(Boolean);
}
