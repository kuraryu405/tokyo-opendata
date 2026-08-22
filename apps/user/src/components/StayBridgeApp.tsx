"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { generateActions } from "@staybridge/domain/rules";
import type { Action, NeedCategory, Situation } from "@staybridge/domain/types";
import {
  localResources,
  sourceRegistry,
  type LocalResource,
  type LocalResourceId,
} from "@staybridge/data";
import { getLocalResourceDisplay, getUserMessages, type PublicUserMessages } from "@staybridge/i18n/client";
import {
  createInitialSituation,
  isAssessmentComplete,
  parseStoredSession,
  readStoredLocale,
  serializeStoredSession,
  type FamilyAnswer,
  type FamilyAnswers,
  type Locale,
  type StayAnswer,
} from "./staybridge-session";

type Screen = "landing" | "check" | "status" | "roadmap" | "local" | "help" | "summary";
type CopyState = "idle" | "copied" | "error";
type LocalFilter = "all" | "school" | "medical" | "child_support" | "public_facility";
type AppRoute = { screen: Screen; step: number; filter?: LocalFilter; flowId?: string };
type AppHistoryState = { staybridge?: AppRoute };

const screenNames: Screen[] = ["landing", "check", "status", "roadmap", "local", "help", "summary"];
const localFilters: LocalFilter[] = ["all", "school", "medical", "child_support", "public_facility"];

function getHistoryScreen(state: unknown) {
  const route = (state as AppHistoryState | null)?.staybridge;
  if (!route || !screenNames.includes(route.screen)) return null;
  const filter = route.screen === "local" && localFilters.includes(route.filter as LocalFilter) ? route.filter as LocalFilter : undefined;
  const flowId = typeof route.flowId === "string" ? route.flowId : undefined;
  return { screen: route.screen, step: Number.isInteger(route.step) && route.step >= 0 && route.step <= 9 ? route.step : 0, filter, flowId };
}

function getUrlScreen(href: string): AppRoute | null {
  const url = new URL(href);
  const screen = url.searchParams.get("screen");
  if (!screen || !screenNames.includes(screen as Screen)) return null;
  const step = Number(url.searchParams.get("step"));
  const requestedFilter = url.searchParams.get("filter");
  const filter = screen === "local" && localFilters.includes(requestedFilter as LocalFilter) ? requestedFilter as LocalFilter : undefined;
  return { screen: screen as Screen, step: Number.isInteger(step) && step >= 0 && step <= 9 ? step : 0, filter };
}

function getFirstUnansweredStep(answeredSteps: number[]) {
  return Array.from({ length: 10 }, (_, index) => index).find((step) => !answeredSteps.includes(step)) ?? 0;
}

function normalizeRoute(route: AppRoute, answeredSteps: number[]): AppRoute {
  const complete = isAssessmentComplete(answeredSteps);
  const firstUnansweredStep = getFirstUnansweredStep(answeredSteps);
  if (route.screen === "check") {
    return { screen: "check", step: complete ? route.step : Math.min(route.step, firstUnansweredStep) };
  }
  if (!complete && route.screen !== "landing") return { screen: "check", step: firstUnansweredStep };
  if (route.screen === "local") return { ...route, filter: route.filter ?? "all" };
  return route;
}

function getHistoryUrl(route: AppRoute, href: string) {
  const url = new URL(href);
  if (route.screen === "landing") {
    url.searchParams.delete("screen");
    url.searchParams.delete("step");
    url.searchParams.delete("filter");
  } else {
    url.searchParams.set("screen", route.screen);
    if (route.screen === "check") url.searchParams.set("step", String(route.step));
    else url.searchParams.delete("step");
    if (route.screen === "local") url.searchParams.set("filter", route.filter ?? "all");
    else url.searchParams.delete("filter");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function routesMatch(left: AppRoute | null, right: AppRoute) {
  return left?.screen === right.screen && left.step === right.step && left.filter === right.filter;
}

function createFlowId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

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

type AppCopy = PublicUserMessages["ui"];
export function StayBridgeApp({ initialLocale = "ja", initialScreen = "landing", initialMunicipality }: { initialLocale?: Locale; initialScreen?: Screen; initialMunicipality?: string } = {}) {
  const isLocaleRoute = initialScreen === "local";
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [step, setStep] = useState(0);
  const [situation, setSituation] = useState<Situation>(() => initialMunicipality ? { ...createInitialSituation(), currentMunicipality: initialMunicipality } : createInitialSituation());
  const [stayAnswer, setStayAnswer] = useState<StayAnswer>("unknown");
  const [familyAnswers, setFamilyAnswers] = useState<FamilyAnswers>([]);
  const [answeredSteps, setAnsweredSteps] = useState<number[]>([]);
  const [storageReady, setStorageReady] = useState(isLocaleRoute);
  const [storageError, setStorageError] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [summaryDate, setSummaryDate] = useState("");
  const [localFilter, setLocalFilter] = useState<LocalFilter>("all");
  const [isPreparingResults, setIsPreparingResults] = useState(false);
  const [assessmentDate] = useState(currentTokyoDate);
  const skipNextSessionWrite = useRef(false);
  const completionTimer = useRef<number | undefined>(undefined);
  const answeredStepsRef = useRef(answeredSteps);
  const localeRef = useRef(locale);
  const screenRef = useRef(screen);
  const flowIdRef = useRef("");
  answeredStepsRef.current = answeredSteps;
  localeRef.current = locale;
  screenRef.current = screen;
  const t = getUserMessages(locale).ui;

  useEffect(() => {
    try {
      if (!isLocaleRoute) {
        const storedLocale = readStoredLocale(localStorage.getItem("staybridge.locale"));
        if (storedLocale) setLocale(storedLocale);
        const storedSession = parseStoredSession(sessionStorage.getItem("staybridge.session"));
        if (storedSession) {
          setSituation(storedSession.situation);
          setStayAnswer(storedSession.stayAnswer);
          setFamilyAnswers(storedSession.familyAnswers);
          setAnsweredSteps(storedSession.answeredSteps);
        }
      }
    } catch {
      setStorageError(true);
    } finally {
      setStorageReady(true);
    }
  }, [isLocaleRoute]);

  useEffect(() => () => {
    if (completionTimer.current !== undefined) window.clearTimeout(completionTimer.current);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const restoreScreen = (state: unknown) => {
      const storedRoute = getHistoryScreen(state);
      const urlRoute = getUrlScreen(window.location.href) ?? (isLocaleRoute ? { screen: "local" as const, step: 0, filter: "all" as const } : null);
      if (!flowIdRef.current) flowIdRef.current = storedRoute?.flowId ?? createFlowId();
      const requestedRoute = urlRoute
        ? { ...urlRoute, flowId: storedRoute && routesMatch(storedRoute, urlRoute) ? storedRoute.flowId : undefined }
        : storedRoute ?? { screen: "landing" as const, step: 0 };
      const route = { ...(isLocaleRoute && requestedRoute.screen === "local" ? requestedRoute : normalizeRoute(requestedRoute, answeredStepsRef.current)), flowId: flowIdRef.current };
      const historyUrl = getHistoryUrl(route, window.location.href);
      if (!routesMatch(storedRoute, route) || storedRoute?.flowId !== route.flowId || `${window.location.pathname}${window.location.search}${window.location.hash}` !== historyUrl) {
        const baseState = state && typeof state === "object" ? state : {};
        window.history.replaceState({ ...baseState, staybridge: route }, "", historyUrl);
      }
      setScreen(route.screen);
      setStep(route.screen === "check" ? route.step : 0);
      if (route.screen === "local") setLocalFilter(route.filter ?? "all");
      if (route.screen === "summary") setSummaryDate(new Date().toLocaleDateString(localeRef.current === "my" ? "en" : localeRef.current));
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    restoreScreen(window.history.state);
    const handlePopState = (event: PopStateEvent) => {
      if (completionTimer.current !== undefined) {
        window.clearTimeout(completionTimer.current);
        completionTimer.current = undefined;
        setIsPreparingResults(false);
      }
      const storedRoute = getHistoryScreen(event.state);
      if (storedRoute?.flowId && storedRoute.flowId !== flowIdRef.current) {
        const route = { screen: "landing" as const, step: 0, flowId: flowIdRef.current };
        const baseState = event.state && typeof event.state === "object" ? event.state : {};
        window.history.replaceState({ ...baseState, staybridge: route }, "", getHistoryUrl(route, window.location.href));
        if (screenRef.current === "landing") {
          window.history.back();
          return;
        }
        setScreen("landing");
        setStep(0);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      restoreScreen(event.state);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isLocaleRoute, storageReady]);

  useEffect(() => {
    document.documentElement.lang = locale === "my" ? "my" : locale;
    if (!storageReady) return;
    try {
      localStorage.setItem("staybridge.locale", locale);
    } catch {
      window.setTimeout(() => setStorageError(true), 0);
    }
  }, [locale, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    if (skipNextSessionWrite.current) {
      skipNextSessionWrite.current = false;
      return;
    }
    try {
      sessionStorage.setItem("staybridge.session", serializeStoredSession({ situation, stayAnswer, familyAnswers, answeredSteps }));
    } catch {
      window.setTimeout(() => setStorageError(true), 0);
    }
  }, [answeredSteps, familyAnswers, situation, stayAnswer, storageReady]);

  const assessmentComplete = isAssessmentComplete(answeredSteps);
  const actions = useMemo(() => assessmentComplete ? generateActions(situation, { asOfDate: assessmentDate }) : [], [assessmentComplete, assessmentDate, situation]);
  const availableResources = useMemo<Array<LocalResource & { id: LocalResourceId }>>(() => {
    const municipality = situation.currentMunicipality;
    if (!municipality) return [];
    return localResources.filter((item) => {
      const sameArea = municipality !== "Other" && (municipality === "Kita" || municipality === "北区") && item.municipality === "Kita";
      return sameArea && (localFilter === "all" || item.category === localFilter);
    });
  }, [situation.currentMunicipality, localFilter]);

  const writeHistory = (next: Screen, nextStep: number, filter?: LocalFilter, mode?: "push" | "replace") => {
    if (!flowIdRef.current) flowIdRef.current = createFlowId();
    const currentState = window.history.state;
    const baseState = currentState && typeof currentState === "object" ? currentState : {};
    const route = { screen: next, step: nextStep, filter: next === "local" ? filter ?? "all" : undefined, flowId: flowIdRef.current };
    const currentRoute = getUrlScreen(window.location.href) ?? getHistoryScreen(currentState);
    const historyMode = mode ?? (routesMatch(currentRoute, route) ? "replace" : "push");
    window.history[`${historyMode}State`]({ ...baseState, staybridge: route }, "", getHistoryUrl(route, window.location.href));
  };

  const go = (next: Screen, nextStep = next === "check" ? step : 0, filter = next === "local" ? localFilter : undefined) => {
    if (next === "summary") setSummaryDate(new Date().toLocaleDateString(locale === "my" ? "en" : locale));
    writeHistory(next, nextStep, filter);
    setScreen(next);
    if (next === "check") setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goToQuestion = (nextStep: number) => {
    writeHistory("check", nextStep);
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const complete = () => {
    if (completionTimer.current !== undefined) return;
    if (!isAssessmentComplete(answeredSteps)) {
      go("check", getFirstUnansweredStep(answeredSteps));
      return;
    }
    setIsPreparingResults(true);
    completionTimer.current = window.setTimeout(() => {
      completionTimer.current = undefined;
      setIsPreparingResults(false);
      go("status");
    }, 650);
  };

  const restartAssessment = () => {
    try {
      sessionStorage.removeItem("staybridge.session");
      skipNextSessionWrite.current = true;
    } catch {
      skipNextSessionWrite.current = false;
      setStorageError(true);
    }
    setSituation(createInitialSituation());
    setStayAnswer("unknown");
    setFamilyAnswers([]);
    setAnsweredSteps([]);
    setLocalFilter("all");
    setCopyState("idle");
    setSummaryDate("");
    flowIdRef.current = createFlowId();
    go("check", 0);
  };

  const openAction = (actionId: string) => {
    const destination = actionDestinations[actionId] ?? { screen: "help" as const };
    if (destination.filter) setLocalFilter(destination.filter);
    go(destination.screen, 0, destination.filter);
  };

  const changeLocalFilter = (filter: LocalFilter) => {
    setLocalFilter(filter);
    writeHistory("local", 0, filter, "replace");
  };

  if (!storageReady) return <div className="app-shell session-restore" aria-busy="true"><span className="sr-only">Loading</span></div>;

  return (
    <div className={`app-shell locale-${locale} ${screen === "landing" ? "landing-screen" : ""}`}>
      <a className="skip-link" href="#main">{t.skip}</a>
      <Header locale={locale} setLocale={setLocale} isLocaleRoute={isLocaleRoute} screen={screen} hasCompletedAssessment={assessmentComplete} isPreparingResults={isPreparingResults} go={go} />
      {storageError && <output className="app-alert">{t.storageError}</output>}
      <main id="main">
        {isPreparingResults ? <LoadingState t={t} /> : <>
        {screen === "landing" && <Landing t={t} showStart={!assessmentComplete} start={() => go("check", 0)} />}
        {screen === "check" && (
          <SituationCheck locale={locale} t={t} step={step} goToQuestion={goToQuestion} situation={situation} setSituation={setSituation} stayAnswer={stayAnswer} setStayAnswer={setStayAnswer} familyAnswers={familyAnswers} setFamilyAnswers={setFamilyAnswers} answeredSteps={answeredSteps} setAnsweredSteps={setAnsweredSteps} assessmentDate={assessmentDate} backToLanding={() => go("landing")} restart={restartAssessment} finish={complete} />
        )}
        {screen === "status" && <ImmediateStatus locale={locale} t={t} situation={situation} stayAnswer={stayAnswer} familyAnswers={familyAnswers} answeredSteps={answeredSteps} roadmap={() => go("roadmap")} edit={() => go("check")} />}
        {screen === "roadmap" && <Roadmap locale={locale} t={t} actions={actions} restart={assessmentComplete ? restartAssessment : undefined} openAction={openAction} />}
        {screen === "local" && <LocalAction locale={locale} t={t} resources={availableResources} filter={localFilter} setFilter={changeLocalFilter} />}
        {screen === "help" && <HumanSupport t={t} summary={() => go("summary")} />}
        {screen === "summary" && <ConsultationSummary locale={locale} t={t} situation={situation} stayAnswer={stayAnswer} familyAnswers={familyAnswers} answeredSteps={answeredSteps} summaryDate={summaryDate} copyState={copyState} setCopyState={setCopyState} />}
        </>}
      </main>
    </div>
  );
}

function Header({ locale, setLocale, isLocaleRoute, screen, hasCompletedAssessment, isPreparingResults, go }: { locale: Locale; setLocale: (l: Locale) => void; isLocaleRoute: boolean; screen: Screen; hasCompletedAssessment: boolean; isPreparingResults: boolean; go: (s: Screen) => void }) {
  const t = getUserMessages(locale).ui;
  const isAnswering = screen === "check" || isPreparingResults;
  const returnsToRoadmap = hasCompletedAssessment && !isAnswering;
  return <header className="site-header">
    <button className="brand" onClick={() => go(returnsToRoadmap ? "roadmap" : "landing")} aria-label={returnsToRoadmap ? t.brandToSteps : t.homeLabel} disabled={isPreparingResults}><span className="brand-mark">SB</span><span>StayBridge <b>Tokyo</b></span></button>
    {hasCompletedAssessment && !isAnswering && <nav aria-label={t.primaryNavLabel}>
      <button className={screen === "roadmap" ? "active" : ""} onClick={() => go("roadmap")}>{t.navSteps}</button>
      <button className={screen === "local" ? "active" : ""} onClick={() => go("local")}>{t.navLocal}</button>
      <button className={screen === "help" ? "active" : ""} onClick={() => go("help")}>{t.navHelp}</button>
    </nav>}
    <label className="language-select" title={t.languageSelectTitle}><span className="sr-only">{t.languageSelectLabel}</span><select value={locale} disabled={isLocaleRoute} onChange={(e) => setLocale(e.target.value as Locale)}><option value="ja">日本語</option><option value="en">English</option><option value="my">မြန်မာ</option></select></label>
  </header>;
}

function LoadingState({ t }: { t: AppCopy }) {
  return <output className="loading-page" aria-live="polite"><div className="loading-card"><span className="loading-orbit" aria-hidden="true" /><p>{t.loading}</p></div></output>;
}

function Landing({ t, showStart, start }: { t: AppCopy; showStart: boolean; start: () => void }) {
  return <section className={`landing-start${showStart ? "" : " landing-complete"}`}>
    <h1 className="sr-only">StayBridge Tokyo</h1>
    {showStart && <button className="primary-button" onClick={start}>{t.start}<span aria-hidden>→</span></button>}
  </section>;
}

function SituationCheck({ locale, t, step, goToQuestion, situation, setSituation, stayAnswer, setStayAnswer, familyAnswers, setFamilyAnswers, answeredSteps, setAnsweredSteps, assessmentDate, backToLanding, restart, finish }: {
  locale: Locale; t: AppCopy; step: number; goToQuestion: (n: number) => void; situation: Situation; setSituation: (s: Situation) => void; stayAnswer: StayAnswer; setStayAnswer: (s: StayAnswer) => void; familyAnswers: FamilyAnswers; setFamilyAnswers: (s: FamilyAnswers) => void; answeredSteps: number[]; setAnsweredSteps: (steps: number[]) => void; assessmentDate: string; backToLanding: () => void; restart: () => void; finish: () => void;
}) {
  const question = getUserMessages(locale).questions[step];
  const [title, , options] = question;
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
      <h1>{title}</h1>
      <div className="option-grid" role={multi ? "group" : "radiogroup"} aria-label={title}>
        {options.map(([value, label]) => { const selected = step === 6 ? familyAnswers.includes(value as FamilyAnswer) : step === 8 ? situation.needs.includes(value as NeedCategory) : current === value; return <button key={value} className={`option-button ${selected ? "selected" : ""}`} onClick={() => choose(value)} role={multi ? "checkbox" : "radio"} aria-checked={selected}><span className="option-control">{selected ? "✓" : ""}</span><span>{label}</span></button>; })}
      </div>
      {step === 6 && familyAnswers.includes("children") && <div className="age-panel"><label>{t.ageLabel}</label><div className="age-options">{["0-2", "3-5", "6-11", "12-14", "15-17", "18+"].map((age) => <button key={age} className={situation.familyMembers.children[0]?.ageGroup === age ? "selected" : ""} onClick={() => setSituation({ ...situation, familyMembers: { children: [{ ageGroup: age as Situation["familyMembers"]["children"][number]["ageGroup"] }] } })}>{age}</button>)}</div></div>}
      {step === 5 && stayAnswer === "known" && <div className="age-panel"><label htmlFor="stay-deadline">{t.deadlineLabel}</label><input id="stay-deadline" className="date-input" type="date" min={assessmentDate} value={situation.knownStayDeadline || ""} onChange={(e) => setSituation({ ...situation, knownStayDeadline: e.target.value || undefined, stayDeadlineKnown: Boolean(e.target.value) })} /></div>}
      <div className="question-actions">{step === 0 ? <button className="back-button" onClick={backToLanding}><span aria-hidden="true">←</span> {t.backToTop}</button> : <button className="back-button" onClick={() => goToQuestion(step - 1)}><span aria-hidden="true">←</span> {t.back}</button>}<button className="primary-button" disabled={!enabled} onClick={() => step === 9 ? finish() : goToQuestion(step + 1)}>{step === 9 ? t.finish : t.next}<span aria-hidden>→</span></button></div>
      {answeredSteps.length > 0 && <div className="question-restart"><button className="text-button" onClick={restart}><span aria-hidden="true">↺</span> {t.restart}</button></div>}
    </div>
  </section>;
}

function getQuestionValue(step: number, s: Situation, stay: string) {
  return [s.currentMunicipality, s.nationality, s.visitPurpose, s.originalDepartureWindow, s.returnStatus, stay, "", s.accommodation, "", s.japaneseLevel][step];
}

function ImmediateStatus({ locale, t, situation, stayAnswer, familyAnswers, answeredSteps, roadmap, edit }: { locale: Locale; t: AppCopy; situation: Situation; stayAnswer: StayAnswer; familyAnswers: FamilyAnswers; answeredSteps: number[]; roadmap: () => void; edit: () => void }) {
  const items = summarizeSituation(locale, situation, stayAnswer, familyAnswers, answeredSteps);
  return <section className="result-page narrow-page"><div className="success-mark">✓</div><span className="section-label">{t.sectionSituationReview}</span><h1>{t.reviewed}</h1><p className="page-intro">{t.reviewedIntro}</p><div className="status-list">{items.length ? items.map((item) => <div key={item}><span>✓</span>{item}</div>) : <p>{t.noEnteredInfo}</p>}</div><div className="stack-actions"><button className="primary-button wide" onClick={roadmap}>{t.seeRoadmap}<span>→</span></button><button className="text-button" onClick={edit}>{t.answerAgain}</button></div><div className="safe-notice"><strong>{t.notDecision}</strong><p>{t.helpIntro}</p></div></section>;
}

function Roadmap({ locale, t, actions, restart, openAction }: { locale: Locale; t: AppCopy; actions: Action[]; restart?: () => void; openAction: (actionId: string) => void }) {
  const messages = getUserMessages(locale);
  const groups = ["today", "this_week", "next_30_days", "before_deadline", "long_term"].map((timing) => ({ timing, actions: actions.filter((a) => a.timing === timing) })).filter((g) => g.actions.length);
  return <section className="content-page"><div className="page-heading"><span className="section-label">{t.sectionPersonalRoadmap}</span><h1>{t.roadmapTitle}</h1></div><div className="roadmap-list">{groups.length ? groups.map((group) => <section className="roadmap-group" key={group.timing}><div className="timing-heading"><span className="timing-dot" /><h2>{messages.timing[group.timing as keyof typeof messages.timing]}</h2></div>{group.actions.map((action, index) => <ActionCard key={action.id} locale={locale} t={t} action={action} number={index + 1} openAction={openAction} />)}</section>) : <div className="empty-state"><span>○</span><h2>{t.noEnteredInfo}</h2></div>}</div>{restart && <aside className="roadmap-restart"><p>{t.restartPrompt}</p><button className="text-button" onClick={restart}><span aria-hidden="true">↺</span> {t.restart}</button></aside>}</section>;
}

function ActionCard({ locale, t, action, number, openAction }: { locale: Locale; t: AppCopy; action: Action; number: number; openAction: (actionId: string) => void }) {
  const messages = getUserMessages(locale);
  const actionId = action.id as keyof typeof messages.actions;
  const ui = messages.actions[actionId];
  const sources = action.sourceIds.flatMap((id) => sourceRegistry[id] ? [sourceRegistry[id]] : []);
  return <article className="action-card"><div className="action-number">{String(number).padStart(2, "0")}</div><div className="action-content"><div className="action-meta"><span className={`priority priority-${action.priority}`}>{t.priorityLabel} {action.priority}</span>{action.humanReviewRequired && <span className="review-chip">◎ {t.human}</span>}</div><h3>{ui.title}</h3><p>{ui.desc}</p><details><summary>{t.why}</summary><p>{messages.reasons[action.reasonCode as keyof typeof messages.reasons] || action.reasonText}</p></details><div className="action-footer">{sources.length > 0 && <div className="source-list">{sources.map((source) => <div className="source-mini" key={source.id}><span>{source.sourceType === "open_data" ? t.sourceTypeLabels.openData : t.sourceTypeLabels.official}</span><a href={source.url} target="_blank" rel="noreferrer">{source.publisher} · {source.title}</a><small>{t.verified}: {source.fetchedAt}</small></div>)}</div>}<button onClick={() => openAction(action.id)}>{ui.cta} →</button></div></div></article>;
}

function LocalAction({ locale, t, resources, filter, setFilter }: { locale: Locale; t: AppCopy; resources: Array<LocalResource & { id: LocalResourceId }>; filter: LocalFilter; setFilter: (s: LocalFilter) => void }) {
  const filters: LocalFilter[] = ["all", "school", "medical", "child_support", "public_facility"];
  return <section className="content-page"><div className="page-heading local-heading"><span className="section-label">{t.sectionLocalAction}</span><h1>{t.localTitle}</h1></div><div className="filter-tabs" role="tablist">{filters.map((item) => <button role="tab" aria-selected={filter === item} className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{t[item as keyof typeof t] as string}</button>)}</div>{resources.length ? <div className="resource-grid">{resources.map((resource) => <ResourceCard key={resource.id} resource={resource} locale={locale} t={t} />)}</div> : <div className="empty-state"><span>⌖</span><h2>{t.noResources}</h2><button className="secondary-button" onClick={() => setFilter("all")}>{t.all}</button></div>}</section>;
}

function ResourceCard({ resource, locale, t }: { resource: LocalResource & { id: LocalResourceId }; locale: Locale; t: AppCopy }) {
  const source = sourceRegistry[resource.sourceId];
  const updatedAt = resource.dataUpdatedAt ?? source?.dataUpdatedAt;
  const display = getLocalResourceDisplay(locale, resource.id);
  const icon = resource.category === "school" ? "S" : resource.category === "medical" ? "+" : resource.category === "child_support" ? "C" : "P";
  return <article className="resource-card"><div className={`resource-icon ${resource.category}`}>{icon}</div><div className="resource-main"><div className="resource-meta"><span>{t[resource.category as keyof typeof t] as string}</span><span>{display.municipality}</span></div><h2>{display.name}</h2><p>{display.description}</p><dl><div><dt>{t.addressLabel}</dt><dd>{display.address}</dd></div>{resource.phone && <div><dt>{t.phoneLabel}</dt><dd><a href={`tel:${resource.phone}`}>{resource.phone}</a></dd></div>}</dl>{resource.category === "school" && <p className="resource-disclaimer">i {t.schoolNote}</p>}<div className="resource-source"><span>{t.sourceLabel}</span><a href={source?.url || resource.website || "#"} target="_blank" rel="noreferrer">{source?.publisher || t.publicDataLabel}</a><small>{t.updated}: {updatedAt ?? t.unavailable}</small><small>{t.verified}: {source?.fetchedAt ?? t.unavailable}</small></div>{resource.website && <a className="card-link" href={resource.website} target="_blank" rel="noreferrer">{t.details} ↗</a>}</div></article>;
}

function HumanSupport({ t, summary }: { t: AppCopy; summary: () => void }) {
  const supportIds = ["FRESC", "ISA", "TOKYO_CONSULTATION"];
  const supportSources = supportIds.flatMap((id) => sourceRegistry[id] ? [sourceRegistry[id]] : []).filter((source, index, all) => all.findIndex((candidate) => candidate.url === source.url) === index);
  return <section className="content-page"><div className="page-heading"><span className="section-label">{t.sectionHumanHandoff}</span><h1>{t.helpTitle}</h1></div><div className="handoff-grid"><div className="support-list">{supportSources.map((source, index) => <article className="support-card" key={source.id}><span className="support-index">0{index + 1}</span><div><small>{t.sourceTypeLabels.official}</small><h2>{source.title}</h2><p>{source.notes || t.supportFallback}</p><a href={source.url} target="_blank" rel="noreferrer">{t.details} ↗</a></div></article>)}</div><aside className="prepare-card"><span className="aside-icon">▤</span><h2>{t.prepare}</h2><ol>{t.prepareItems.map((item) => <li key={item}>{item}</li>)}</ol><button className="primary-button wide" onClick={summary}>{t.summary}<span aria-hidden>→</span></button></aside></div><div className="emergency-note">{t.emergency}</div></section>;
}

function ConsultationSummary({ locale, t, situation, stayAnswer, familyAnswers, answeredSteps, summaryDate, copyState, setCopyState }: { locale: Locale; t: AppCopy; situation: Situation; stayAnswer: StayAnswer; familyAnswers: FamilyAnswers; answeredSteps: number[]; summaryDate: string; copyState: CopyState; setCopyState: (state: CopyState) => void }) {
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
  const messages = getUserMessages(locale);
  const labels = messages.questions;
  const find = (q: number, value: string) => labels[q][2].find(([v]) => v === value)?.[1] || value;
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
  if (!answeredSteps.includes(8)) return [];
  const messages = getUserMessages(locale);
  return s.needs.map((need) => messages.needs[need]).filter(Boolean);
}
