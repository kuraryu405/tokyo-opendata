"use client";

import type { StayBridgeRoute } from "../routing/staybridge-routes";
import { useStayBridgeController } from "../flow/use-staybridge-controller";
import { Landing } from "./screens/landing";
import { LocalAction } from "./screens/local-action";
import { Roadmap } from "./screens/roadmap";
import { routeUi } from "./screens/route-ui";
import { CinematicHeader, LoadingState, TokyoAerialVideo, UnreadableSessionNotice } from "./screens/shared-shell";
import { SituationCheck } from "./screens/situation-check";
import { ImmediateStatus } from "./screens/status";
import { ConsultationSummary } from "./screens/summary";
import { HumanSupport } from "./screens/support";

export { summarizeNeeds, summarizeSituation } from "./screens/summary";

export function StayBridgeApp({ route, assessmentDate }: { route?: StayBridgeRoute; assessmentDate: string }) {
  const controller = useStayBridgeController({ route, assessmentDate });
  const {
    locale,
    screen,
    step,
    localFilter,
    t,
    situation,
    stayAnswer,
    familyAnswers,
    otherAnswers,
    answeredSteps,
    storageReady,
    storageError,
    copyState,
    situationPersistence,
    conversationConsent,
    hasUnreadableSession,
    isDemoSituation,
    hasPendingSituationSubmission,
    hasCorruptPendingSituationSubmission,
    isPreparingRecommendations,
    actions,
    availableResources,
    firstIncompleteStep,
    navVisible,
    showStepsNav,
    storageGate,
    routeNeedsAssessmentGuard,
    protectedSituationRouteGuard,
    demoSituationRouteGuard,
    isLanding,
    isCheck,
    summaryDate,
    setSituation,
    setStayAnswer,
    setFamilyAnswers,
    setOtherAnswers,
    setAnsweredSteps,
    setCopyState,
    setConversationConsent,
    invalidateAiRecommendation,
    go,
    setStep,
    setLocalFilter,
    complete,
    loadDemo,
    startFreshSession,
    restartAssessment,
    discardCorruptLocalData,
    discardCorruptPending,
    persistSituation,
    deletePersistedSituation,
    editSituation,
    switchLocale,
    declineSituationPersistence,
    openAction,
  } = controller;

  return (
    <div className={`app-shell locale-${locale}${navVisible && !isCheck ? " nav-visible" : ""} velorah-scope${!isLanding ? " cinematic-shell" : ""}`}>
      <a className="skip-link" href="#main">{t.skip}</a>
      {!isLanding && <>
        <TokyoAerialVideo />
        <CinematicHeader locale={locale} switchLocale={switchLocale} disabled={!storageReady} onBrandClick={() => go("landing")} navigation={{ screen, go, showStepsNav }} />
      </>}
      {storageError && <output className="app-alert">{t.storageError}</output>}
      {hasUnreadableSession && <UnreadableSessionNotice locale={locale} onStart={startFreshSession} />}
      <main id="main">
        {storageGate || routeNeedsAssessmentGuard || protectedSituationRouteGuard || demoSituationRouteGuard ? <LoadingState message={routeUi[locale].preparing} /> : <>
          {screen === "landing" && <Landing t={t} locale={locale} switchLocale={switchLocale} showDemo={isDemoSituation || answeredSteps.length === 0} disabled={!storageReady || hasUnreadableSession} start={() => go("check", { step: firstIncompleteStep ?? 0 })} demo={loadDemo} />}
          {screen === "check" && (
            <SituationCheck locale={locale} t={t} step={step} setStep={setStep} backToTop={() => go("landing")} situation={situation} setSituation={setSituation} stayAnswer={stayAnswer} setStayAnswer={setStayAnswer} familyAnswers={familyAnswers} setFamilyAnswers={setFamilyAnswers} otherAnswers={otherAnswers} setOtherAnswers={setOtherAnswers} invalidateAiRecommendation={invalidateAiRecommendation} answeredSteps={answeredSteps} setAnsweredSteps={setAnsweredSteps} restart={restartAssessment} restartLabel={routeUi[locale].restart} finish={() => void complete()} isPreparing={isPreparingRecommendations} />
          )}
          {screen === "status" && <div className="cinematic-route-card" key={`${locale}-${screen}`}><ImmediateStatus locale={locale} t={t} situation={situation} stayAnswer={stayAnswer} familyAnswers={familyAnswers} otherAnswers={otherAnswers} answeredSteps={answeredSteps} persistence={situationPersistence} hasPendingSituationSubmission={hasPendingSituationSubmission} hasCorruptPendingSituationSubmission={hasCorruptPendingSituationSubmission} isDemo={isDemoSituation && !hasPendingSituationSubmission} persist={() => void persistSituation()} declinePersistence={declineSituationPersistence} deletePersistence={(credentials) => void deletePersistedSituation(credentials)} discardCorruptLocalData={discardCorruptLocalData} discardCorruptPending={discardCorruptPending} roadmap={() => go("roadmap")} edit={editSituation} /></div>}
          {screen === "roadmap" && <div className="cinematic-route-card" key={`${locale}-${screen}`}><Roadmap locale={locale} t={t} actions={actions} visitPurpose={situation.visitPurpose} conversationConsent={conversationConsent} setConversationConsent={setConversationConsent} go={go} openAction={openAction} restart={restartAssessment} restartLabel={routeUi[locale].restart} /></div>}
          {screen === "local" && <div className="cinematic-route-card" key={`${locale}-${screen}`}><LocalAction locale={locale} t={t} resources={availableResources} filter={localFilter} setFilter={setLocalFilter} go={go} /></div>}
          {screen === "help" && <div className="cinematic-route-card" key={`${locale}-${screen}`}><HumanSupport locale={locale} t={t} needs={situation.needs} visitPurpose={situation.visitPurpose} summary={() => go("summary")} /></div>}
          {screen === "summary" && <div className="cinematic-route-card" key={`${locale}-${screen}`}><ConsultationSummary locale={locale} t={t} situation={situation} stayAnswer={stayAnswer} familyAnswers={familyAnswers} otherAnswers={otherAnswers} answeredSteps={answeredSteps} summaryDate={summaryDate} copyState={copyState} setCopyState={setCopyState} /></div>}
        </>}
      </main>
    </div>
  );
}
