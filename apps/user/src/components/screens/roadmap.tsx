"use client";

import { getActionCatalogEntry, type ActionDestination, type ActionId } from "@staybridge/domain/action-catalog";
import type { Action, Situation } from "@staybridge/domain/types";
import { isSourceEligibleForVisitPurpose, sourceRegistry } from "@staybridge/data";
import { getActionNotice, getUserMessages } from "@staybridge/i18n/client";
import { type ReasonCode, type TimingKey } from "@staybridge/i18n";
import { SupportChat } from "../SupportChat";
import type { Locale } from "../staybridge-session";
import type { ConversationConsentState } from "../../flow/staybridge-flow-state";
import { getPersistenceCopy } from "../../persistence-copy";
import type { Screen, UserCopy } from "./screen-types";
import { routeUi } from "./route-ui";

export function Roadmap({ locale, t, actions, visitPurpose, conversationConsent, setConversationConsent, go, openAction, restart, restartLabel }: { locale: Locale; t: UserCopy; actions: Action[]; visitPurpose: Situation["visitPurpose"]; conversationConsent: ConversationConsentState; setConversationConsent: (state: ConversationConsentState) => void; go: (s: Screen) => void; openAction: (destination: ActionDestination) => void; restart: () => void; restartLabel: string }) {
  const groups = ["today", "this_week", "next_30_days", "before_deadline", "long_term"].map((timing) => ({ timing, actions: actions.filter((a) => a.timing === timing) })).filter((g) => g.actions.length);
  const numberedGroups = groups.reduce<Array<{ timing: string; actions: Action[]; offset: number }>>((all, group) => {
    const last = all[all.length - 1];
    return [...all, { ...group, offset: last ? last.offset + last.actions.length : 0 }];
  }, []);
  return <section className="content-page"><div className="page-heading"><span className="section-label">{t.sectionPersonalRoadmap}</span><h1>{t.roadmapTitle}</h1><p>{t.roadmapIntro}</p></div><div className="roadmap-layout"><div className="roadmap-list">{numberedGroups.length ? numberedGroups.map((group) => <section className="roadmap-group" key={group.timing}><div className="timing-heading"><span className="timing-dot" /><h2>{getUserMessages(locale).timing[group.timing as TimingKey]}</h2></div>{group.actions.map((action, index) => <ActionCard key={action.id} locale={locale} t={t} action={action} number={group.offset + index + 1} visitPurpose={visitPurpose} openAction={openAction} />)}</section>) : <div className="empty-state"><h2>{routeUi[locale].catalogUnavailable}</h2><button className="secondary-button" onClick={() => go("help")}>{routeUi[locale].contactOfficial} →</button></div>}</div><aside className="roadmap-aside"><SupportChat locale={locale} /><div className="aside-card"><h3>{t.localTitle}</h3><p>{t.localIntro}</p><button onClick={() => go("local")}>{t.navLocal} →</button></div><div className="aside-card human-card"><h3>{t.helpTitle}</h3><p>{t.helpIntro}</p><button onClick={() => go("help")}>{t.navHelp} →</button></div></aside></div><ConversationPersistenceConsent locale={locale} state={conversationConsent} setState={setConversationConsent} /><aside className="roadmap-restart"><button className="text-button" aria-label={restartLabel} onClick={restart}>↺ {restartLabel}</button></aside></section>;
}

function ConversationPersistenceConsent({ locale, state, setState }: { locale: Locale; state: ConversationConsentState; setState: (state: ConversationConsentState) => void }) {
  const copy = getPersistenceCopy(locale);
  return <section className="consent-card conversation-consent conversation-persistence-consent" aria-labelledby="conversation-consent-title"><h2 id="conversation-consent-title">{copy.conversationTitle}</h2><p>{copy.conversationPurpose}</p><details><summary>{copy.detailsTitle}</summary><ul><li>{copy.conversationItems}</li><li>{copy.retention}</li><li>{copy.deletion}</li><li>{copy.safeguards}</li></ul></details><p className="consent-warning">{copy.warning}</p><div className="consent-actions"><button className="primary-button" aria-pressed={state === "accepted"} onClick={() => setState("accepted")}>{copy.conversationAccept}</button><button className="secondary-button" aria-pressed={state === "declined"} onClick={() => setState("declined")}>{copy.decline}</button></div>{state !== "idle" && <output className="consent-status" aria-live="polite">{state === "accepted" ? copy.conversationAccepted : copy.declined}</output>}</section>;
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
