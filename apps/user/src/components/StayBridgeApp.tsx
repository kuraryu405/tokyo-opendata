"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { demoSituation } from "@staybridge/domain/demo";
import { generateActions } from "@staybridge/domain/rules";
import type { Action, NeedCategory, Situation } from "@staybridge/domain/types";
import {
  localResources,
  sourceRegistry,
  type LocalResource,
  type LocalResourceId,
} from "@staybridge/data";
import {
  getUserMessages,
  getLocalResourceDisplay,
  selectableUserLocales,
  type PublicUserMessages,
} from "@staybridge/i18n/client";
import type { ActionId, NeedKey, ReasonCode, TimingKey } from "@staybridge/i18n";
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
  isAssessmentComplete,
  firstUnansweredStep,
  parseStoredSession,
  serializeStoredSession,
  type FamilyAnswer,
  type FamilyAnswers,
  type Locale,
  type StayAnswer,
} from "./staybridge-session";
import { resolveMunicipalityAppUrl } from "../municipality-url";
import {
  PENDING_SITUATION_SUBMISSION_KEY,
  SAVED_CONVERSATION_CREDENTIALS_KEY,
  SAVED_SITUATION_CREDENTIALS_KEY,
  CONVERSATION_CONSENT_VERSION,
  appendSavedConversationCredential,
  createConversationSecrets,
  createSituationSubmissionSecrets,
  deleteConversation,
  deleteSituationSubmission,
  parseSavedConversationCredentials,
  serializeSavedConversationCredentials,
  parseSavedSituationCredentials,
  parseSituationSubmissionSecrets,
  saveSituationSubmission,
  type SavedRecordCredentials,
  type SituationSubmissionSecrets,
} from "../consented-persistence";
import { getPersistenceCopy, type PersistenceCopy } from "../persistence-copy";

type Screen = StayBridgeScreen;
type CopyState = "idle" | "copied" | "error";
type UserCopy = PublicUserMessages["ui"];
type SituationPersistenceState =
  | { status: "idle" | "declined" | "saving" | "error" | "deleted" }
  | { status: "saved" | "deleting" | "delete-error"; credentials: SavedRecordCredentials };
type ConversationConsentState = "idle" | "accepted" | "declined";
type AssistantSource = { id: string; officialUrl: string; dataUpdatedAt: string; fetchedAt: string; coverageNote: string };
type AssistantReply = { answer: string; sourceIds: string[]; uncertainty: string; actionIds: string[]; sources: AssistantSource[]; conversation?: { id: string; deletionToken: string } };

const defaultRoute: StayBridgeRoute = { locale: "ja", screen: "landing", query: {} };

const routeUi = {
  ja: { restart: "最初からやり直す", preparing: "次のステップを準備しています" },
  en: { restart: "Start over", preparing: "Preparing your next steps" },
  my: { restart: "အစမှ ပြန်စရန်", preparing: "သင့်နောက်အဆင့်များကို ပြင်ဆင်နေသည်" },
} satisfies Record<Locale, { restart: string; preparing: string }>;

const actionDestinations: Record<string, { screen: "local" | "help"; filter?: LocalFilter }> = {
  CHECK_CHILD_EDUCATION: { screen: "local", filter: "school" },
  CHECK_MEDICAL_OPTIONS: { screen: "local", filter: "medical" },
  CHECK_CHILD_LOCAL_SUPPORT: { screen: "local", filter: "child_support" },
};

function currentTokyoDate(): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function StayBridgeApp({ route: initialRoute = defaultRoute }: { route?: StayBridgeRoute } = {}) {
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
  const municipalityAppUrl = resolveMunicipalityAppUrl();
  const [situation, setSituation] = useState<Situation>(createInitialSituation);
  const [stayAnswer, setStayAnswer] = useState<StayAnswer>("unknown");
  const [familyAnswers, setFamilyAnswers] = useState<FamilyAnswers>([]);
  const [answeredSteps, setAnsweredSteps] = useState<number[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [isPreparingResults, setIsPreparingResults] = useState(false);
  const [situationPersistence, setSituationPersistence] = useState<SituationPersistenceState>({ status: "idle" });
  const [conversationConsent, setConversationConsent] = useState<ConversationConsentState>("idle");
  const [savedConversations, setSavedConversations] = useState<SavedRecordCredentials[]>([]);
  const [isDemoSituation, setIsDemoSituation] = useState(false);
  const [hasPendingSituationSubmission, setHasPendingSituationSubmission] = useState(false);
  const [assessmentDate] = useState(currentTokyoDate);
  const skipNextSessionWrite = useRef(false);
  const completionTimer = useRef<number | undefined>(undefined);
  const situationSubmissionSecrets = useRef<SituationSubmissionSecrets | null>(null);
  const t = getUserMessages(locale).ui;
  const hasSavedSituationCredentials = "credentials" in situationPersistence;
  const hasProtectedSituationSubmission = hasSavedSituationCredentials || hasPendingSituationSubmission;

  useEffect(() => {
    try {
      const storedSession = parseStoredSession(sessionStorage.getItem("staybridge.session"));
      if (storedSession) {
        setSituation(storedSession.situation);
        setStayAnswer(storedSession.stayAnswer);
        setFamilyAnswers(storedSession.familyAnswers);
        setAnsweredSteps(storedSession.answeredSteps);
        setIsDemoSituation(storedSession.provenance === "demo");
      }
      const savedCredentials = parseSavedSituationCredentials(
        sessionStorage.getItem(SAVED_SITUATION_CREDENTIALS_KEY),
      );
      if (savedCredentials) {
        setSituationPersistence({ status: "saved", credentials: savedCredentials });
        sessionStorage.removeItem(PENDING_SITUATION_SUBMISSION_KEY);
      } else {
        const pendingSecrets = parseSituationSubmissionSecrets(
          sessionStorage.getItem(PENDING_SITUATION_SUBMISSION_KEY),
        );
        if (pendingSecrets) {
          situationSubmissionSecrets.current = pendingSecrets;
          setHasPendingSituationSubmission(true);
          setSituationPersistence({ status: "error" });
        }
      }
      const conversationCredentials = parseSavedConversationCredentials(sessionStorage.getItem(SAVED_CONVERSATION_CREDENTIALS_KEY));
      if (conversationCredentials.length) {
        // Existing #62 sessions stored one object. Persist the canonical array
        // immediately so every created record remains deletable.
        sessionStorage.setItem(SAVED_CONVERSATION_CREDENTIALS_KEY, serializeSavedConversationCredentials(conversationCredentials));
        setSavedConversations(conversationCredentials);
      }
    } catch {
      setStorageError(true);
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (screen === "check") return;
    if (completionTimer.current !== undefined) {
      window.clearTimeout(completionTimer.current);
      completionTimer.current = undefined;
      setIsPreparingResults(false);
    }
  }, [screen]);

  useEffect(() => () => {
    if (completionTimer.current !== undefined) window.clearTimeout(completionTimer.current);
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
  const storageGate = !storageReady && ["check", "status", "roadmap", "local", "summary"].includes(screen);
  const protectedSituationRouteGuard = storageReady
    && hasProtectedSituationSubmission
    && (screen === "landing" || screen === "check");
  const demoSituationRouteGuard = storageReady
    && isDemoSituation
    && (screen === "check" || (screen === "roadmap" && !assessmentComplete));
  const routeNeedsAssessmentGuard = storageReady && !hasProtectedSituationSubmission && !isDemoSituation && (
    (screen === "check" && firstIncompleteStep !== null && step > firstIncompleteStep) ||
    ((screen === "status" || screen === "roadmap") && !assessmentComplete)
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
    if (!storageReady) return;
    if (skipNextSessionWrite.current) {
      skipNextSessionWrite.current = false;
      return;
    }
    try {
      sessionStorage.setItem("staybridge.session", serializeStoredSession({ provenance: isDemoSituation ? "demo" : "user", situation, stayAnswer, familyAnswers, answeredSteps }));
    } catch {
      window.setTimeout(() => setStorageError(true), 0);
    }
  }, [answeredSteps, familyAnswers, isDemoSituation, situation, stayAnswer, storageReady]);

  const actions = useMemo(() => assessmentComplete ? generateActions(situation, { asOfDate: assessmentDate }) : [], [assessmentComplete, assessmentDate, situation]);
  const availableResources = useMemo(() => {
    const municipality = situation.currentMunicipality;
    if (!municipality) return [];
    return localResources.filter((item) => {
      const sameArea = municipality !== "Other" && item.municipality === municipality;
      return sameArea && (localFilter === "all" || item.category === localFilter);
    });
  }, [situation.currentMunicipality, localFilter]);

  const go = (next: Screen, nextQuery: StayBridgeQuery = {}) => {
    router.push(buildStayBridgePath({ locale, screen: next, query: nextQuery }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setStep = (nextStep: number) => {
    router.push(buildStayBridgePath({ locale, screen: "check", query: { step: nextStep } }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setLocalFilter = (nextFilter: LocalFilter) => {
    router.replace(buildStayBridgePath({ locale, screen: "local", query: { filter: nextFilter } }));
  };

  const complete = () => {
    if (completionTimer.current !== undefined) return;
    if (!assessmentComplete) {
      router.replace(buildStayBridgePath({
        locale,
        screen: "check",
        query: { step: firstIncompleteStep ?? 0 },
      }));
      return;
    }
    setIsPreparingResults(true);
    completionTimer.current = window.setTimeout(() => {
      completionTimer.current = undefined;
      setIsPreparingResults(false);
      go("status");
    }, 650);
  };

  const loadDemo = () => {
    if (hasProtectedSituationSubmission) {
      focusSituationPersistence();
      return;
    }
    setSituation(demoSituation);
    setStayAnswer("unknown");
    setFamilyAnswers(["children"]);
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
      }));
    } catch {
      setStorageError(true);
    }
    go("status");
  };

  const focusSituationPersistence = () => {
    if (screen !== "status") router.replace(buildStayBridgePath({ locale, screen: "status" }));
    window.setTimeout(() => document.getElementById(hasSavedSituationCredentials ? "saved-situation-credentials" : "situation-persistence")?.focus(), 0);
  };

  const clearData = () => {
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
    setAnsweredSteps([]);
    setSituationPersistence({ status: "idle" });
    setConversationConsent("idle");
    setIsDemoSituation(false);
    situationSubmissionSecrets.current = null;
    try {
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
    setAnsweredSteps([]);
    setCopyState("idle");
    setSituationPersistence({ status: "idle" });
    setConversationConsent("idle");
    setIsDemoSituation(false);
    situationSubmissionSecrets.current = null;
    try {
      sessionStorage.removeItem(PENDING_SITUATION_SUBMISSION_KEY);
    } catch {
      setStorageError(true);
    }
    router.replace(buildStayBridgePath({ locale, screen: "check", query: { step: 0 } }));
  };

  const openAction = (actionId: string) => {
    const destination = actionDestinations[actionId] ?? { screen: "help" as const };
    go(destination.screen, destination.filter ? { filter: destination.filter } : {});
  };

  const summaryDate = useMemo(
    () => new Date().toLocaleDateString(locale === "my" ? "en" : locale),
    [locale],
  );

  const persistSituation = async () => {
    const secrets = situationSubmissionSecrets.current ?? createSituationSubmissionSecrets();
    if (!situationSubmissionSecrets.current) {
      try {
        sessionStorage.setItem(PENDING_SITUATION_SUBMISSION_KEY, JSON.stringify(secrets));
      } catch {
        setStorageError(true);
        setSituationPersistence({ status: "error" });
        return;
      }
      situationSubmissionSecrets.current = secrets;
      setHasPendingSituationSubmission(true);
    }
    setSituationPersistence({ status: "saving" });
    try {
      const credentials = await saveSituationSubmission(situation, secrets);
      let replacedPending = false;
      try {
        sessionStorage.setItem(SAVED_SITUATION_CREDENTIALS_KEY, JSON.stringify(credentials));
        sessionStorage.removeItem(PENDING_SITUATION_SUBMISSION_KEY);
        replacedPending = true;
      } catch {
        setStorageError(true);
      }
      if (replacedPending) {
        situationSubmissionSecrets.current = null;
        setHasPendingSituationSubmission(false);
      }
      setSituationPersistence({ status: "saved", credentials });
    } catch {
      setSituationPersistence({ status: "error" });
    }
  };

  const deletePersistedSituation = async (credentials: SavedRecordCredentials) => {
    setSituationPersistence({ status: "deleting", credentials });
    try {
      await deleteSituationSubmission(credentials);
      try {
        sessionStorage.removeItem(SAVED_SITUATION_CREDENTIALS_KEY);
        sessionStorage.removeItem(PENDING_SITUATION_SUBMISSION_KEY);
      } catch {
        setStorageError(true);
      }
      situationSubmissionSecrets.current = null;
      setHasPendingSituationSubmission(false);
      setSituationPersistence({ status: "deleted" });
    } catch {
      setSituationPersistence({ status: "delete-error", credentials });
    }
  };

  const editSituation = () => {
    if (hasProtectedSituationSubmission) {
      focusSituationPersistence();
      return;
    }
    if (isDemoSituation) {
      restartAssessment();
      return;
    }
    setSituationPersistence({ status: "idle" });
    go("check");
  };

  return (
    <div className={`app-shell locale-${locale}`}>
      <a className="skip-link" href="#main">{t.skip}</a>
      <Header locale={locale} screen={screen} go={go} switchLocale={(nextLocale) => router.push(buildStayBridgePath({ locale: nextLocale, screen, query }))} disabled={isPreparingResults} />
      {storageError && <output className="app-alert">{t.storageError}</output>}
      <main id="main">
        {storageGate || routeNeedsAssessmentGuard || protectedSituationRouteGuard || demoSituationRouteGuard || isPreparingResults ? <LoadingState message={routeUi[locale].preparing} /> : <>
          {screen === "landing" && <Landing t={t} showStart={!assessmentComplete} disabled={!storageReady} start={() => go("check")} demo={loadDemo} municipalityAppUrl={municipalityAppUrl} />}
          {screen === "check" && (
            <SituationCheck locale={locale} t={t} step={step} setStep={setStep} situation={situation} setSituation={setSituation} stayAnswer={stayAnswer} setStayAnswer={setStayAnswer} familyAnswers={familyAnswers} setFamilyAnswers={setFamilyAnswers} answeredSteps={answeredSteps} setAnsweredSteps={setAnsweredSteps} assessmentDate={assessmentDate} restart={restartAssessment} restartLabel={routeUi[locale].restart} finish={complete} />
          )}
          {screen === "status" && <ImmediateStatus locale={locale} t={t} situation={situation} stayAnswer={stayAnswer} familyAnswers={familyAnswers} answeredSteps={answeredSteps} persistence={situationPersistence} isDemo={isDemoSituation} persist={() => void persistSituation()} declinePersistence={() => setSituationPersistence({ status: "declined" })} deletePersistence={(credentials) => void deletePersistedSituation(credentials)} roadmap={() => go("roadmap")} edit={editSituation} />}
          {screen === "roadmap" && <Roadmap locale={locale} t={t} actions={actions} conversationConsent={conversationConsent} setConversationConsent={setConversationConsent} savedConversations={savedConversations} setSavedConversations={setSavedConversations} go={go} openAction={openAction} restart={restartAssessment} restartLabel={routeUi[locale].restart} />}
        {screen === "local" && <LocalAction locale={locale} t={t} resources={availableResources} filter={localFilter} setFilter={setLocalFilter} go={go} />}
          {screen === "help" && <HumanSupport t={t} summary={() => go("summary")} />}
          {screen === "summary" && <ConsultationSummary locale={locale} t={t} situation={situation} stayAnswer={stayAnswer} familyAnswers={familyAnswers} answeredSteps={answeredSteps} summaryDate={summaryDate} copyState={copyState} setCopyState={setCopyState} />}
        </>}
      </main>
      <footer className="site-footer">
        <div><span className="brand-mark">SB</span><strong>StayBridge Tokyo</strong><p>{t.footer}</p></div>
        <button className="text-button" onClick={clearData}>{t.clear}</button>
      </footer>
    </div>
  );
}

function Header({ locale, screen, go, switchLocale, disabled }: { locale: Locale; screen: Screen; go: (s: Screen, query?: StayBridgeQuery) => void; switchLocale: (locale: Locale) => void; disabled: boolean }) {
  const t = getUserMessages(locale).ui;
  return <header className="site-header">
    <button className="brand" onClick={() => go("landing")} aria-label={t.homeLabel} disabled={disabled}><span className="brand-mark">SB</span><span>StayBridge <b>Tokyo</b></span></button>
    <nav aria-label={t.primaryNavLabel}>
      <button className={screen === "roadmap" ? "active" : ""} onClick={() => go("roadmap")}>{t.navSteps}</button>
      <button className={screen === "local" ? "active" : ""} onClick={() => go("local")}>{t.navLocal}</button>
      <button className={screen === "help" ? "active" : ""} onClick={() => go("help")}>{t.navHelp}</button>
    </nav>
    <label className="language-select" title={t.languageSelectTitle}><span className="sr-only">{t.languageSelectLabel}</span><select value={locale} disabled={disabled} onChange={(e) => switchLocale(e.target.value as Locale)}>{selectableUserLocales.map((availableLocale) => <option key={availableLocale} value={availableLocale}>{getUserMessages(availableLocale).metadata.nativeLabel}</option>)}</select></label>
  </header>;
}

function LoadingState({ message }: { message: string }) {
  return <output className="loading-page" aria-live="polite"><div className="loading-card"><span className="loading-orbit" aria-hidden="true" /><p>{message}</p></div></output>;
}

function Landing({ t, showStart, disabled, start, demo, municipalityAppUrl }: { t: UserCopy; showStart: boolean; disabled: boolean; start: () => void; demo: () => void; municipalityAppUrl: string }) {
  return <>
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-dot" />{t.eyebrow}</div>
        <h1>{t.hero.split("\n").map((line) => <span key={line}>{line}</span>)}</h1>
        <p className="lede">{t.intro}</p>
        <div className="hero-actions">{showStart && <button className="primary-button" disabled={disabled} onClick={start}>{t.start}<span aria-hidden>→</span></button>}<button className="secondary-button" disabled={disabled} onClick={demo}>{t.demo}</button></div>
        <div className="trust-row"><span>✓ {t.noLogin}</span><span>✓ {t.noAddress}</span><span>✓ {t.official}</span></div>
      </div>
      <div className="roadmap-preview" aria-label={t.previewAriaLabel}>
        <div className="preview-top"><span>{t.previewTitle}</span><span className="safe-chip">{t.previewSafety}</span></div>
        <div className="timeline-line" />
        {t.previewSteps.map((preview, i) => <div className="preview-step" key={preview.time}><span className={`time-dot dot-${i}`} /><div><small>{preview.time}</small><strong>{preview.title}</strong><p>{preview.detail}</p></div><span className="step-number">0{i + 1}</span></div>)}
        <div className="preview-note"><span>i</span>{t.notDecision}</div>
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

function SituationCheck({ locale, t, step, setStep, situation, setSituation, stayAnswer, setStayAnswer, familyAnswers, setFamilyAnswers, answeredSteps, setAnsweredSteps, assessmentDate, restart, restartLabel, finish }: {
  locale: Locale; t: UserCopy; step: number; setStep: (n: number) => void; situation: Situation; setSituation: (s: Situation) => void; stayAnswer: StayAnswer; setStayAnswer: (s: StayAnswer) => void; familyAnswers: FamilyAnswers; setFamilyAnswers: (s: FamilyAnswers) => void; answeredSteps: number[]; setAnsweredSteps: (steps: number[]) => void; assessmentDate: string; restart: () => void; restartLabel: string; finish: () => void;
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
    if (step === 0) setSituation({ ...situation, currentMunicipality: value });
    if (step === 1) setSituation({ ...situation, nationality: value });
    if (step === 2) setSituation({ ...situation, visitPurpose: value as Situation["visitPurpose"] });
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
      setSituation({
        ...situation,
        familyMembers: {
          children: hasChildren
            ? (situation.familyMembers.children.length ? situation.familyMembers.children : [{ ageGroup: "6-11" }])
            : [],
        },
      });
      markAnswered(nextAnswers.length > 0);
      return;
    }
    if (step === 7) setSituation({ ...situation, accommodation: value as Situation["accommodation"] });
    if (step === 8) {
      const nextNeeds = situation.needs.includes(value as NeedCategory) ? situation.needs.filter((n) => n !== value) : [...situation.needs, value as NeedCategory];
      setSituation({ ...situation, needs: nextNeeds });
      markAnswered(nextNeeds.length > 0);
      return;
    }
    if (step === 9) setSituation({ ...situation, japaneseLevel: value as Situation["japaneseLevel"] });
    markAnswered();
  };
  const enabled = answeredSteps.includes(step) && (step === 6 ? familyAnswers.length > 0 : step === 8 ? situation.needs.length > 0 : Boolean(current));
  return <section className="check-page">
    <div className="check-progress"><div className="progress-meta"><span>{t.sectionSituationCheck}</span><strong>{step + 1} / 10</strong></div><div className="progress-track"><span style={{ width: `${(step + 1) * 10}%` }} /></div></div>
    <div className="question-card">
      <span className="question-kicker">{t.questionLabel} {String(step + 1).padStart(2, "0")}</span>
      <h1>{title}</h1><p>{hint}</p>
      <div className="option-grid" role={multi ? "group" : "radiogroup"} aria-label={title}>
        {options.map(([value, label]) => { const selected = step === 6 ? familyAnswers.includes(value as FamilyAnswer) : step === 8 ? situation.needs.includes(value as NeedCategory) : current === value; return <button key={value} className={`option-button ${selected ? "selected" : ""}`} onClick={() => choose(value)} role={multi ? "checkbox" : "radio"} aria-checked={selected}><span className="option-control">{selected ? "✓" : ""}</span><span>{label}</span></button>; })}
      </div>
      {step === 6 && familyAnswers.includes("children") && <div className="age-panel"><label>{t.ageLabel}</label><div className="age-options">{["0-2", "3-5", "6-11", "12-14", "15-17", "18+"].map((age) => <button key={age} className={situation.familyMembers.children[0]?.ageGroup === age ? "selected" : ""} onClick={() => setSituation({ ...situation, familyMembers: { children: [{ ageGroup: age as Situation["familyMembers"]["children"][number]["ageGroup"] }] } })}>{age}</button>)}</div></div>}
      {step === 5 && stayAnswer === "known" && <div className="age-panel"><label htmlFor="stay-deadline">{t.deadlineLabel}</label><input id="stay-deadline" className="date-input" type="date" min={assessmentDate} value={situation.knownStayDeadline || ""} onChange={(e) => setSituation({ ...situation, knownStayDeadline: e.target.value || undefined, stayDeadlineKnown: Boolean(e.target.value) })} /></div>}
      <div className="question-actions"><button className="back-button" disabled={step === 0} onClick={() => setStep(step - 1)}>← {t.back}</button><button className="primary-button" disabled={!enabled} onClick={() => step === 9 ? finish() : setStep(step + 1)}>{step === 9 ? t.finish : t.next}<span aria-hidden>→</span></button></div>
      {answeredSteps.length > 0 && <div className="question-restart"><button className="text-button" aria-label={restartLabel} onClick={restart}>↺ {restartLabel}</button></div>}
    </div>
    <p className="privacy-line">◉ {t.privacyText}</p>
  </section>;
}

function getQuestionValue(step: number, s: Situation, stay: string) {
  return [s.currentMunicipality, s.nationality, s.visitPurpose, s.originalDepartureWindow, s.returnStatus, stay, "", s.accommodation, "", s.japaneseLevel][step];
}

function ImmediateStatus({ locale, t, situation, stayAnswer, familyAnswers, answeredSteps, persistence, isDemo, persist, declinePersistence, deletePersistence, roadmap, edit }: { locale: Locale; t: UserCopy; situation: Situation; stayAnswer: StayAnswer; familyAnswers: FamilyAnswers; answeredSteps: number[]; persistence: SituationPersistenceState; isDemo: boolean; persist: () => void; declinePersistence: () => void; deletePersistence: (credentials: SavedRecordCredentials) => void; roadmap: () => void; edit: () => void }) {
  const items = summarizeSituation(locale, situation, stayAnswer, familyAnswers, answeredSteps);
  return <section className="result-page narrow-page"><div className="success-mark">✓</div><span className="section-label">{t.sectionSituationReview}</span><h1>{t.reviewed}</h1><p className="page-intro">{t.reviewedIntro}</p><div className="status-list">{items.length ? items.map((item) => <div key={item}><span>✓</span>{item}</div>) : <p>{t.noEnteredInfo}</p>}</div><SituationPersistenceConsent locale={locale} state={persistence} isDemo={isDemo} persist={persist} decline={declinePersistence} deleteRecord={deletePersistence} /><div className="stack-actions"><button className="primary-button wide" onClick={roadmap}>{t.seeRoadmap}<span>→</span></button><button className="text-button" onClick={edit}>{t.answerAgain}</button></div><div className="safe-notice"><strong>{t.notDecision}</strong><p>{t.helpIntro}</p></div></section>;
}

function Roadmap({ locale, t, actions, conversationConsent, setConversationConsent, savedConversations, setSavedConversations, go, openAction, restart, restartLabel }: { locale: Locale; t: UserCopy; actions: Action[]; conversationConsent: ConversationConsentState; setConversationConsent: (state: ConversationConsentState) => void; savedConversations: SavedRecordCredentials[]; setSavedConversations: (value: SavedRecordCredentials[]) => void; go: (s: Screen) => void; openAction: (actionId: string) => void; restart: () => void; restartLabel: string }) {
  const groups = ["today", "this_week", "next_30_days", "before_deadline", "long_term"].map((timing) => ({ timing, actions: actions.filter((a) => a.timing === timing) })).filter((g) => g.actions.length);
  return <section className="content-page"><div className="page-heading"><span className="section-label">{t.sectionPersonalRoadmap}</span><h1>{t.roadmapTitle}</h1><p>{t.roadmapIntro}</p></div><ConversationPersistenceConsent locale={locale} state={conversationConsent} setState={setConversationConsent} /><VerifiedAssistant locale={locale} consent={conversationConsent} savedConversations={savedConversations} setSavedConversations={setSavedConversations} go={go} /><div className="roadmap-layout"><div className="roadmap-list">{groups.length ? groups.map((group) => <section className="roadmap-group" key={group.timing}><div className="timing-heading"><span className="timing-dot" /><h2>{getUserMessages(locale).timing[group.timing as TimingKey]}</h2></div>{group.actions.map((action, index) => <ActionCard key={action.id} locale={locale} t={t} action={action} number={index + 1} openAction={openAction} />)}</section>) : <div className="empty-state"><span>○</span><h2>{t.noEnteredInfo}</h2></div>}</div><aside className="roadmap-aside"><div className="aside-card"><span className="aside-icon">⌁</span><h3>{t.localTitle}</h3><p>{t.localIntro}</p><button onClick={() => go("local")}>{t.navLocal} →</button></div><div className="aside-card human-card"><span className="aside-icon">◎</span><h3>{t.helpTitle}</h3><p>{t.helpIntro}</p><button onClick={() => go("help")}>{t.navHelp} →</button></div></aside></div><aside className="roadmap-restart"><button className="text-button" aria-label={restartLabel} onClick={restart}>↺ {restartLabel}</button></aside></section>;
}

function VerifiedAssistant({ locale, consent, savedConversations, setSavedConversations, go }: { locale: Locale; consent: ConversationConsentState; savedConversations: SavedRecordCredentials[]; setSavedConversations: (value: SavedRecordCredentials[]) => void; go: (screen: Screen) => void }) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "send-error" | "delete-error">("idle");
  const copy = locale === "ja" ? { title: "確認済み情報アシスタント", intro: "北区の公開済み避難所データだけを使います。制度・在留・安全の判断は行いません。", example: "避難所を確認したい", send: "質問する", error: "回答を取得できませんでした。Rule Engine、地域情報、人による相談は引き続き使えます。", storage: "会話保存に同意した場合だけ、サーバー確認後に削除情報を表示します。", delete: "保存済み会話をすべて削除", deleting: "削除中…", stored: "保存済み会話", remaining: "削除できなかった会話が残っています。もう一度削除できます。", sources: "確認した出典", uncertainty: "注意点", local: "地域情報を開く", help: "人的相談を開く" } : locale === "my" ? { title: "အတည်ပြုအချက်အလက် အကူအညီ", intro: "北区の公開避難所データのみを使います。", example: "避難所を確認したい", send: "မေးရန်", error: "အဖြေမရပါ။ အခြားလမ်းညွှန်ကို ဆက်သုံးနိုင်သည်。", storage: "同意がある場合のみ保存し、削除情報を表示します。", delete: "保存会話をすべて削除", deleting: "削除中…", stored: "保存済み会話", remaining: "削除できなかった会話が残っています。", sources: "出典", uncertainty: "注意", local: "地域情報を開く", help: "人的相談を開く" } : { title: "Verified information assistant", intro: "Uses only published Kita shelter records. It does not decide legal status, eligibility, or safety.", example: "I need to check shelters", send: "Ask", error: "We could not get an answer. Rule Engine, Local Support, and Human Support remain available.", storage: "Only an accepted storage preference can create a record; deletion information appears after server confirmation.", delete: "Delete all saved conversations", deleting: "Deleting…", stored: "Saved conversations", remaining: "Some saved conversations remain. You can try deletion again.", sources: "Sources checked", uncertainty: "Important limitation", local: "Open local support", help: "Open human support" };
  const send = async () => {
    const current = question.trim(); if (!current || state === "sending") return;
    setState("sending");
    const secrets = consent === "accepted" ? createConversationSecrets() : null;
    try {
      const response = await fetch("/api/verified-assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: current, history: history.slice(-6), ...(secrets ? { conversation: { consent: { accepted: true, version: CONVERSATION_CONSENT_VERSION }, ...secrets } } : {}) }) });
      const body = await response.json() as { ok?: boolean; data?: AssistantReply };
      if (!response.ok || !body.ok || !body.data || !body.data.sources?.length) throw new Error("ASSISTANT_FAILED");
      const nextHistory: Array<{ role: "user" | "assistant"; content: string }> = [...history, { role: "user", content: current }, { role: "assistant", content: body.data.answer }];
      setReply(body.data); setQuestion(""); setHistory(nextHistory.slice(-6));
      if (body.data.conversation) {
        const credentials = appendSavedConversationCredential(savedConversations, body.data.conversation);
        sessionStorage.setItem(SAVED_CONVERSATION_CREDENTIALS_KEY, serializeSavedConversationCredentials(credentials));
        setSavedConversations(credentials);
      }
      setState("idle");
    } catch { setState("send-error"); }
  };
  const remove = async () => {
    if (!savedConversations.length) return;
    setState("sending");
    let remaining = savedConversations;
    let failed = false;
    for (const credentials of savedConversations) {
      try {
        await deleteConversation(credentials);
        remaining = remaining.filter((item) => item.id !== credentials.id);
        if (remaining.length) sessionStorage.setItem(SAVED_CONVERSATION_CREDENTIALS_KEY, serializeSavedConversationCredentials(remaining));
        else sessionStorage.removeItem(SAVED_CONVERSATION_CREDENTIALS_KEY);
        setSavedConversations(remaining);
      } catch { failed = true; }
    }
    setState(failed ? "delete-error" : "idle");
  };
  return <section className="verified-assistant" aria-labelledby="verified-assistant-title"><h2 id="verified-assistant-title">{copy.title}</h2><p>{copy.intro}</p><p className="assistant-storage">{copy.storage}</p>{savedConversations.length > 0 && <p className="assistant-storage" aria-live="polite">{copy.stored}: {savedConversations.length}</p>}<div className="assistant-form"><label htmlFor="assistant-question">{copy.example}</label><textarea id="assistant-question" value={question} maxLength={2000} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && !event.shiftKey) { event.preventDefault(); void send(); } }} /><button className="primary-button" disabled={!question.trim() || state === "sending"} onClick={() => void send()}>{state === "sending" ? "…" : copy.send}</button></div>{state === "send-error" && <output className="consent-status error" aria-live="polite">{copy.error}</output>}{state === "delete-error" && <output className="consent-status error" aria-live="polite">{copy.remaining}</output>}{reply && <article className="assistant-reply" aria-live="polite"><p>{reply.answer}</p><h3>{copy.sources}</h3>{reply.sources.map((source) => <div className="assistant-source" key={source.id}><a href={source.officialUrl} target="_blank" rel="noreferrer">{source.id}</a><small>Updated: {source.dataUpdatedAt} · Fetched: {source.fetchedAt}</small><small>{source.coverageNote}</small></div>)}<h3>{copy.uncertainty}</h3><p>{reply.uncertainty}</p></article>}<div className="assistant-actions"><button className="secondary-button" onClick={() => go("local")}>{copy.local}</button><button className="secondary-button" onClick={() => go("help")}>{copy.help}</button>{savedConversations.length > 0 && <button className="text-button" onClick={() => void remove()}>{state === "sending" ? copy.deleting : `${copy.delete} (${savedConversations.length})`}</button>}</div></section>;
}

function SituationPersistenceConsent({ locale, state, isDemo, persist, decline, deleteRecord }: { locale: Locale; state: SituationPersistenceState; isDemo: boolean; persist: () => void; decline: () => void; deleteRecord: (credentials: SavedRecordCredentials) => void }) {
  const copy = getPersistenceCopy(locale);
  const busy = state.status === "saving" || state.status === "deleting";
  return <section id="situation-persistence" className="consent-card" aria-labelledby="situation-consent-title" tabIndex={-1}><h2 id="situation-consent-title">{copy.situationTitle}</h2><p>{copy.situationPurpose}</p><ul><li>{copy.situationItems}</li><li>{copy.retention}</li><li>{copy.deletion}</li><li>{copy.safeguards}</li></ul><p className="consent-warning">{copy.warning}</p>{state.status === "saved" || state.status === "deleting" || state.status === "delete-error" ? <SavedCredentials copy={copy} state={state} deleteRecord={deleteRecord} /> : <><div className="consent-actions"><button className="primary-button" disabled={busy || isDemo} onClick={persist}>{state.status === "saving" ? copy.saving : copy.accept}</button><button className="secondary-button" disabled={busy} onClick={decline}>{copy.decline}</button></div>{isDemo && <output className="consent-status" aria-live="polite">{copy.demoNotSaved}</output>}<ConsentStatus copy={copy} status={state.status} /></>}</section>;
}

function ConversationPersistenceConsent({ locale, state, setState }: { locale: Locale; state: ConversationConsentState; setState: (state: ConversationConsentState) => void }) {
  const copy = getPersistenceCopy(locale);
  return <section className="consent-card conversation-consent" aria-labelledby="conversation-consent-title"><h2 id="conversation-consent-title">{copy.conversationTitle}</h2><p>{copy.conversationPurpose}</p><ul><li>{copy.conversationItems}</li><li>{copy.retention}</li><li>{copy.deletion}</li><li>{copy.safeguards}</li></ul><p className="consent-warning">{copy.warning}</p><div className="consent-actions"><button className="primary-button" aria-pressed={state === "accepted"} onClick={() => setState("accepted")}>{copy.conversationAccept}</button><button className="secondary-button" aria-pressed={state === "declined"} onClick={() => setState("declined")}>{copy.decline}</button></div>{state !== "idle" && <output className="consent-status" aria-live="polite">{state === "accepted" ? copy.conversationAccepted : copy.declined}</output>}</section>;
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

function ActionCard({ locale, t, action, number, openAction }: { locale: Locale; t: UserCopy; action: Action; number: number; openAction: (actionId: string) => void }) {
  const messages = getUserMessages(locale);
  const ui = messages.actions[action.id as ActionId];
  if (!ui) throw new Error(`Missing action translation: ${action.id}`);
  const sources = action.sourceIds.flatMap((id) => sourceRegistry[id] ? [sourceRegistry[id]] : []);
  return <article className="action-card"><div className="action-number">{String(number).padStart(2, "0")}</div><div className="action-content"><div className="action-meta"><span className={`priority priority-${action.priority}`}>{t.priorityLabel} {action.priority}</span>{action.humanReviewRequired && <span className="review-chip">◎ {t.human}</span>}</div><h3>{ui.title}</h3><p>{ui.desc}</p><details><summary>{t.why}</summary><p>{messages.reasons[action.reasonCode as ReasonCode]}</p></details><div className="action-footer">{sources.length > 0 && <div className="source-list">{sources.map((source) => <div className="source-mini" key={source.id}><span>{source.sourceType === "open_data" ? t.sourceTypeLabels.openData : t.sourceTypeLabels.official}</span><a href={source.url} target="_blank" rel="noreferrer">{source.publisher} · {source.title}</a><small>{t.verified}: {source.fetchedAt}</small></div>)}</div>}<button onClick={() => openAction(action.id)}>{ui.cta} →</button></div></div></article>;
}

function LocalAction({ locale, t, resources, filter, setFilter, go }: { locale: Locale; t: UserCopy; resources: Array<LocalResource & { id: LocalResourceId }>; filter: LocalFilter; setFilter: (s: LocalFilter) => void; go: (screen: Screen) => void }) {
  const filters: LocalFilter[] = ["all", "school", "medical", "child_support", "public_facility"];
  return <section className="content-page"><div className="page-heading local-heading"><span className="section-label">{t.sectionLocalAction}</span><h1>{t.localTitle}</h1><p>{t.localIntro}</p><div className="location-pill">⌖ {t.localFallback}</div></div><div className="page-actions" aria-label={t.localNavigationLabel}><button className="secondary-button" onClick={() => go("roadmap")}>← {t.backToRoadmap}</button><button className="primary-button" onClick={() => go("help")}>{t.continueToHelp}<span aria-hidden>→</span></button></div><div className="filter-tabs" role="tablist">{filters.map((item) => <button role="tab" aria-selected={filter === item} className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{t[item as keyof UserCopy] as string}</button>)}</div>{resources.length ? <div className="resource-grid">{resources.map((resource) => <ResourceCard key={resource.id} resource={resource} locale={locale} t={t} />)}</div> : <div className="empty-state"><span>⌖</span><h2>{t.noResources}</h2><button className="secondary-button" onClick={() => setFilter("all")}>{t.all}</button></div>}</section>;
}

function ResourceCard({ resource, locale, t }: { resource: LocalResource & { id: LocalResourceId }; locale: Locale; t: UserCopy }) {
  const source = sourceRegistry[resource.sourceId];
  const updatedAt = resource.dataUpdatedAt ?? source?.dataUpdatedAt;
  const display = getLocalResourceDisplay(locale, resource.id);
  const icon = t.resourceIcons[resource.category as keyof UserCopy["resourceIcons"]];
  return <article className="resource-card"><div className={`resource-icon ${resource.category}`}>{icon}</div><div className="resource-main"><div className="resource-meta"><span>{t[resource.category as keyof UserCopy] as string}</span><span>{display.municipality}</span></div><h2>{display.name}</h2><p>{display.description}</p><dl><div><dt>{t.addressLabel}</dt><dd>{display.address}</dd></div>{resource.phone && <div><dt>{t.phoneLabel}</dt><dd><a href={`tel:${resource.phone}`}>{resource.phone}</a></dd></div>}</dl>{resource.category === "school" && <p className="resource-disclaimer">i {t.schoolNote}</p>}<div className="resource-source"><span>{t.sourceLabel}</span><a href={source?.url || resource.website || "#"} target="_blank" rel="noreferrer">{source?.publisher || t.publicDataLabel}</a><small>{t.updated}: {updatedAt ?? t.unavailable}</small><small>{t.verified}: {source?.fetchedAt ?? t.unavailable}</small></div>{resource.website && <a className="card-link" href={resource.website} target="_blank" rel="noreferrer">{t.details} ↗</a>}</div></article>;
}

function HumanSupport({ t, summary }: { t: UserCopy; summary: () => void }) {
  const supportIds = ["FRESC", "ISA", "TOKYO_CONSULTATION"];
  const supportSources = supportIds.flatMap((id) => sourceRegistry[id] ? [sourceRegistry[id]] : []).filter((source, index, all) => all.findIndex((candidate) => candidate.url === source.url) === index);
  return <section className="content-page"><div className="page-heading"><span className="section-label">{t.sectionHumanHandoff}</span><h1>{t.helpTitle}</h1><p>{t.helpIntro}</p></div><div className="handoff-grid"><div className="support-list">{supportSources.map((source, index) => <article className="support-card" key={source.id}><span className="support-index">0{index + 1}</span><div><small>{t.sectionOfficialSupport}</small><h2>{source.title}</h2><p>{source.notes || t.supportFallback}</p><a href={source.url} target="_blank" rel="noreferrer">{t.details} ↗</a></div></article>)}</div><aside className="prepare-card"><span className="aside-icon">▤</span><h2>{t.prepare}</h2><ol>{t.prepareItems.map((item) => <li key={item}>{item}</li>)}</ol><button className="primary-button wide" onClick={summary}>{t.summary}<span>→</span></button></aside></div><div className="emergency-note">{t.emergency}</div></section>;
}

function ConsultationSummary({ locale, t, situation, stayAnswer, familyAnswers, answeredSteps, summaryDate, copyState, setCopyState }: { locale: Locale; t: UserCopy; situation: Situation; stayAnswer: StayAnswer; familyAnswers: FamilyAnswers; answeredSteps: number[]; summaryDate: string; copyState: CopyState; setCopyState: (state: CopyState) => void }) {
  const items = summarizeSituation(locale, situation, stayAnswer, familyAnswers, answeredSteps);
  const asks = summarizeNeeds(locale, situation, answeredSteps);
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
  return <section className="summary-page"><div className="page-heading"><span className="section-label">{t.sectionConsultationSummary}</span><h1>{t.summaryTitle}</h1><p>{t.summaryIntro}</p></div><div className="summary-toolbar"><button className="secondary-button" onClick={copyText}>{copyState === "copied" ? `✓ ${t.copied}` : `▣ ${t.copy}`}</button><button className="secondary-button" onClick={() => window.print()}>⌑ {t.print}</button><span>◎ {t.showMode}</span>{copyState === "error" && <p className="inline-error" role="alert">{t.copyError}</p>}</div><article className="summary-sheet"><header><span className="brand-mark">SB</span><div><strong>StayBridge Tokyo</strong><small>{t.summarySheetLabel}</small></div><time>{summaryDate}</time></header><section><span className="sheet-label">{t.summarySheetSections[0]}</span><div><h2>{t.current}</h2>{items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{t.noEnteredInfo}</p>}</div></section><section><span className="sheet-label">{t.summarySheetSections[1]}</span><div><h2>{t.questions}</h2>{asks.length ? <ol>{asks.map((item) => <li key={item}>{item}</li>)}</ol> : <p>{t.noSelectedNeeds}</p>}</div></section><footer><strong>{t.notDecision}</strong><p>{t.helpIntro}</p></footer></article></section>;
}

export function summarizeSituation(locale: Locale, s: Situation, stayAnswer: StayAnswer, familyAnswers: FamilyAnswers, answeredSteps: number[]) {
  const labels = getUserMessages(locale).questions;
  const messages = getUserMessages(locale);
  const find = (q: number, value: string) => labels[q][2].find(([v]) => v === value)?.[1] ?? "";
  const child = s.familyMembers.children[0];
  const byStep: Record<number, string | undefined> = {
    0: s.currentMunicipality ? `${messages.ui.areaLabel}: ${find(0, s.currentMunicipality)}` : undefined,
    1: s.nationality ? `${messages.ui.nationalityLabel}: ${find(1, s.nationality)}` : undefined,
    2: find(2, s.visitPurpose),
    3: find(3, s.originalDepartureWindow),
    4: find(4, s.returnStatus),
    5: s.knownStayDeadline ? `${find(5, stayAnswer)}: ${s.knownStayDeadline}` : find(5, stayAnswer),
    6: familyAnswers.length
      ? familyAnswers.map((answer) => answer === "children" && child
        ? `${find(6, answer)} · ${messages.ui.ageValueLabel}: ${child.ageGroup}`
        : find(6, answer)).join(" / ")
      : undefined,
    7: find(7, s.accommodation),
    9: `${messages.ui.japaneseLabel}: ${find(9, s.japaneseLevel)}`,
  };
  return answeredSteps.flatMap((step) => byStep[step] ? [byStep[step]] : []);
}

export function summarizeNeeds(locale: Locale, s: Situation, answeredSteps: number[]) {
  const needMap = getUserMessages(locale).needs;
  if (!answeredSteps.includes(8)) return [];
  return s.needs.map((need) => needMap[need as NeedKey]).filter(Boolean);
}
