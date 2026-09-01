"use client";

import { getUserMessages } from "@staybridge/i18n/client";
import { type NeedKey } from "@staybridge/i18n";
import type { Situation } from "@staybridge/domain/types";
import { createInitialOtherAnswers, type FamilyAnswers, type Locale, type OtherAnswers, type StayAnswer } from "../staybridge-session";
import type { CopyState } from "../../flow/staybridge-flow-state";
import type { UserCopy } from "./screen-types";

export function ConsultationSummary({ locale, t, situation, stayAnswer, familyAnswers, otherAnswers, answeredSteps, summaryDate, copyState, setCopyState }: { locale: Locale; t: UserCopy; situation: Situation; stayAnswer: StayAnswer; familyAnswers: FamilyAnswers; otherAnswers: OtherAnswers; answeredSteps: number[]; summaryDate: string; copyState: CopyState; setCopyState: (state: CopyState) => void }) {
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
