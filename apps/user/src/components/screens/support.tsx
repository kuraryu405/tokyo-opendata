"use client";

import type { NeedCategory, Situation } from "@staybridge/domain/types";
import { consultationSourcesByNeed, humanHandoffSourceIds, isSourceEligibleForVisitPurpose, sourceRegistry, type DataSource } from "@staybridge/data";
import { getLocalizedSupportText, supportUiCopy } from "@staybridge/i18n";
import type { Locale } from "../staybridge-session";
import type { UserCopy } from "./screen-types";

export function HumanSupport({ locale, t, needs, visitPurpose, summary }: { locale: Locale; t: UserCopy; needs: NeedCategory[]; visitPurpose: Situation["visitPurpose"]; summary: () => void }) {
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
  return <section className="content-page"><div className="page-heading"><span className="section-label">{t.sectionHumanHandoff}</span><h1>{t.helpTitle}</h1><p>{t.helpIntro}</p></div><div className="handoff-grid"><div className="handoff-main">{infoSources.length > 0 ? <section className="handoff-group"><h2 className="handoff-group-title">{ui.infoTitle}</h2><p className="handoff-group-note">{ui.infoNote}</p><div className="support-list">{infoSources.map((source, index) => <SupportCard key={source.id} locale={locale} source={source} index={index} label={ui.infoLabel} details={t.details} />)}</div></section> : <p className="handoff-empty">{ui.emptyNote}</p>}<section className="handoff-group"><h2 className="handoff-group-title">{ui.talkTitle}</h2><p className="handoff-group-note">{ui.talkNote}</p><div className="support-list">{handoffSources.map((source, index) => <SupportCard key={source.id} locale={locale} source={source} index={index} label={ui.handoffLabel} details={t.details} />)}</div></section></div><aside className="prepare-card"><h2>{t.prepare}</h2><ol>{t.prepareItems.map((item) => <li key={item}>{item}</li>)}</ol><button className="primary-button wide" onClick={summary}>{t.summary}<span>→</span></button></aside></div><div className="emergency-note">{t.emergency}</div></section>;
}

function SupportCard({ locale, source, index, label, details }: { locale: Locale; source: DataSource; index: number; label: string; details: string }) {
  const answer = getLocalizedSupportText(source.id, "answersInText", locale);
  const note = getLocalizedSupportText(source.id, "notes", locale);
  return <article className="support-card"><span className="support-index">{String(index + 1).padStart(2, "0")}</span><div><small>{label}</small><h3>{source.title}</h3>{answer && <p className="support-answer">{answer}</p>}{note && <p className="support-note">{note}</p>}<a href={source.url} target="_blank" rel="noreferrer" aria-label={`${details}: ${source.title}`}>{details} ↗</a></div></article>;
}
