"use client";

import { useState } from "react";
import type { Situation } from "@staybridge/domain/types";
import type { SavedRecordCredentials } from "../../consented-persistence";
import { getPersistenceCopy, type PersistenceCopy } from "../../persistence-copy";
import type { FamilyAnswers, Locale, OtherAnswers, StayAnswer } from "../staybridge-session";
import type { SituationPersistenceState } from "../../flow/staybridge-flow-state";
import type { UserCopy } from "./screen-types";
import { summarizeSituation } from "./summary";

export function ImmediateStatus({ locale, t, situation, stayAnswer, familyAnswers, otherAnswers, answeredSteps, persistence, hasPendingSituationSubmission, hasCorruptPendingSituationSubmission, isDemo, persist, declinePersistence, deletePersistence, discardCorruptLocalData, discardCorruptPending, roadmap, edit }: { locale: Locale; t: UserCopy; situation: Situation; stayAnswer: StayAnswer; familyAnswers: FamilyAnswers; otherAnswers: OtherAnswers; answeredSteps: number[]; persistence: SituationPersistenceState; hasPendingSituationSubmission: boolean; hasCorruptPendingSituationSubmission: boolean; isDemo: boolean; persist: () => void; declinePersistence: () => void; deletePersistence: (credentials: SavedRecordCredentials) => void; discardCorruptLocalData: () => void; discardCorruptPending: () => void; roadmap: () => void; edit: () => void }) {
  const items = summarizeSituation(locale, situation, stayAnswer, familyAnswers, answeredSteps, otherAnswers);
  return <section className="result-page narrow-page"><span className="section-label">{t.sectionSituationReview}</span><h1>{t.reviewed}</h1><p className="page-intro">{t.reviewedIntro}</p><div className="status-list">{items.length ? items.map((item) => <div key={item}>{item}</div>) : <p>{t.noEnteredInfo}</p>}</div><div className="stack-actions"><button className="primary-button wide" onClick={roadmap}>{t.seeRoadmap}<span>→</span></button><button className="text-button" onClick={edit}>{t.answerAgain}</button></div><SituationPersistenceConsent locale={locale} state={persistence} hasPendingSituationSubmission={hasPendingSituationSubmission} hasCorruptPendingSituationSubmission={hasCorruptPendingSituationSubmission} isDemo={isDemo} persist={persist} decline={declinePersistence} deleteRecord={deletePersistence} discardCorruptLocalData={discardCorruptLocalData} discardCorruptPending={discardCorruptPending} /><div className="safe-notice"><strong>{t.notDecision}</strong><p>{t.helpIntro}</p></div></section>;

}

function SituationPersistenceConsent({ locale, state, hasPendingSituationSubmission, hasCorruptPendingSituationSubmission, isDemo, persist, decline, deleteRecord, discardCorruptLocalData, discardCorruptPending }: { locale: Locale; state: SituationPersistenceState; hasPendingSituationSubmission: boolean; hasCorruptPendingSituationSubmission: boolean; isDemo: boolean; persist: () => void; decline: () => void; deleteRecord: (credentials: SavedRecordCredentials) => void; discardCorruptLocalData: () => void; discardCorruptPending: () => void }) {
  const copy = getPersistenceCopy(locale);
  const busy = state.status === "saving" || state.status === "deleting";
  const requiresManagement = "credentials" in state || state.status === "corrupt" || state.status === "pending-corrupt" || hasPendingSituationSubmission || hasCorruptPendingSituationSubmission;
  return <section id="situation-persistence" className={`consent-card situation-persistence-consent${requiresManagement ? " is-management" : ""}`} aria-labelledby="situation-consent-title" tabIndex={-1}><h2 id="situation-consent-title">{copy.situationTitle}</h2><p>{copy.situationPurpose}</p><details><summary>{copy.detailsTitle}</summary><ul><li>{copy.situationItems}</li><li>{copy.retention}</li><li>{copy.deletion}</li><li>{copy.safeguards}</li></ul></details><p className="consent-warning">{copy.warning}</p>{state.status === "saved" || state.status === "deleting" || state.status === "delete-error" ? <SavedCredentials copy={copy} state={state} deleteRecord={deleteRecord} /> : state.status === "corrupt" ? <CorruptSavedCredentials copy={copy} keepsPendingSave={hasPendingSituationSubmission || hasCorruptPendingSituationSubmission} discardLocalData={discardCorruptLocalData} /> : state.status === "pending-corrupt" || hasCorruptPendingSituationSubmission ? <CorruptPendingSection copy={copy} discardPending={discardCorruptPending} /> : <><div className="consent-actions"><button className="primary-button" disabled={busy || isDemo} onClick={persist}>{state.status === "saving" ? copy.saving : copy.accept}</button><button className="secondary-button" disabled={busy} onClick={decline}>{copy.decline}</button></div>{isDemo && <output className="consent-status" aria-live="polite">{copy.demoNotSaved}</output>}<ConsentStatus copy={copy} status={state.status} /></>}</section>;
}

function CorruptPendingSection({ copy, discardPending }: { copy: PersistenceCopy; discardPending: () => void }) {
  return <div id="corrupt-pending-situation-submission" className="saved-credentials" tabIndex={-1}><h3>{copy.pendingCorruptTitle}</h3><p>{copy.pendingCorruptBody}</p><p className="consent-warning">{copy.pendingCorruptWarning}</p><div className="consent-actions"><button className="secondary-button" onClick={discardPending}>{copy.discardCorruptPending}</button></div></div>;
}

function CorruptSavedCredentials({ copy, keepsPendingSave, discardLocalData }: { copy: PersistenceCopy; keepsPendingSave: boolean; discardLocalData: () => void }) {
  return <div id="corrupt-saved-situation-credentials" className="saved-credentials" tabIndex={-1}><h3>{copy.corruptCredentialsTitle}</h3><p>{copy.corruptCredentialsBody}</p><p className="consent-warning">{keepsPendingSave ? copy.corruptCredentialsPendingWarning : copy.corruptCredentialsDiscardWarning}</p><div className="consent-actions"><button className="secondary-button" onClick={discardLocalData}>{keepsPendingSave ? copy.discardOnlyCorruptCredentials : copy.discardCorruptLocalData}</button></div></div>;
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
