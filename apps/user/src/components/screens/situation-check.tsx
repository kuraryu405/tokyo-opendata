"use client";

import { useEffect, useRef, useState } from "react";
import { assessmentOptionCodes } from "@staybridge/domain/selection-coverage";
import type { ChildAgeGroup, NeedCategory, Situation } from "@staybridge/domain/types";
import { getUserMessages } from "@staybridge/i18n/client";
import type { FamilyAnswer, FamilyAnswers, Locale, OtherAnswers, StayAnswer } from "../staybridge-session";
import type { UserCopy } from "./screen-types";

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

export function SituationCheck({ locale, t, step, setStep, backToTop, situation, setSituation, stayAnswer, setStayAnswer, familyAnswers, setFamilyAnswers, otherAnswers, setOtherAnswers, invalidateAiRecommendation, answeredSteps, setAnsweredSteps, restart, restartLabel, finish, isPreparing }: {
  locale: Locale; t: UserCopy; step: number; setStep: (n: number) => void; backToTop: () => void; situation: Situation; setSituation: (s: Situation) => void; stayAnswer: StayAnswer; setStayAnswer: (s: StayAnswer) => void; familyAnswers: FamilyAnswers; setFamilyAnswers: (s: FamilyAnswers) => void; otherAnswers: OtherAnswers; setOtherAnswers: (answers: OtherAnswers) => void; invalidateAiRecommendation: () => void; answeredSteps: number[]; setAnsweredSteps: (steps: number[]) => void; restart: () => void; restartLabel: string; finish: () => void; isPreparing: boolean;
}) {
  const question = getUserMessages(locale).questions[step];
  const [title, hint, options] = question;
  const [cardDirection, setCardDirection] = useState<"forward" | "backward">("forward");
  const moveToStep = (nextStep: number) => {
    setCardDirection(nextStep < step ? "backward" : "forward");
    setStep(nextStep);
  };
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
    <div key={step} className={`question-card question-card-${cardDirection}`}>
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
      <div className="question-actions"><button className="back-button" onClick={() => step === 0 ? backToTop() : moveToStep(step - 1)}>← {t.back}</button><button className="primary-button" disabled={!enabled || isPreparing} onClick={() => step === 9 ? finish() : moveToStep(step + 1)}>{isPreparing ? t.loading : step === 9 ? t.finish : t.next}<span aria-hidden>→</span></button></div>
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
