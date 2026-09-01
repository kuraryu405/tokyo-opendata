"use client";

import { useEffect, useRef, useState } from "react";
import { getUserMessages, selectableUserLocales } from "@staybridge/i18n/client";
import type { StayBridgeQuery } from "../../routing/staybridge-routes";
import type { Locale } from "../staybridge-session";
import { municipalityAppRoute } from "../../municipality-url";
import type { Screen } from "./screen-types";
import { getPersistenceCopy } from "../../persistence-copy";

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

export function UnreadableSessionNotice({ locale, onStart }: { locale: Locale; onStart: () => void }) {
  const copy = getPersistenceCopy(locale);
  return <section id="unreadable-session-notice" className="consent-card unreadable-session" aria-labelledby="unreadable-session-title" tabIndex={-1}><h2 id="unreadable-session-title">{copy.sessionUnreadableTitle}</h2><p>{copy.sessionUnreadableBody}</p><div className="consent-actions"><button className="secondary-button" onClick={onStart}>{copy.startFreshSession}</button></div></section>;
}

export function LoadingState({ message }: { message: string }) {
  return <output className="loading-page" aria-live="polite"><div className="loading-card"><span className="loading-orbit" aria-hidden="true" /><p>{message}</p></div></output>;
}

export function TokyoAerialVideo() {
  return <video
    className="velorah-video"
    autoPlay
    loop
    muted
    playsInline
    aria-hidden="true"
  >
    <source src="/tokyo-aerial-4308.mp4" type="video/mp4" />
  </video>;
}

export function CinematicHeader({ locale, switchLocale, disabled, onBrandClick, actionLabel, onAction, navigation, showMunicipalityLink = false }: {
  locale: Locale;
  switchLocale: (locale: Locale) => void;
  disabled: boolean;
  onBrandClick: () => void;
  actionLabel?: string;
  onAction?: () => void;
  navigation?: { screen: Screen; go: (screen: Screen, query?: StayBridgeQuery) => void; showStepsNav: boolean };
  showMunicipalityLink?: boolean;
}) {
  const t = getUserMessages(locale).ui;
  return <header className="velorah-nav">
    <button className="velorah-brand" disabled={disabled} onClick={onBrandClick} aria-label={t.homeLabel}>
      <span className="velorah-brand-mark" aria-hidden="true">SB</span>
      <span>StayBridge Tokyo</span>
    </button>
    {navigation && <nav className="cinematic-primary-nav liquid-glass" aria-label={t.primaryNavLabel}>
      {navigation.showStepsNav && <button className={navigation.screen === "roadmap" ? "active" : ""} onClick={() => navigation.go("roadmap")}>{t.navSteps}</button>}
      <button className={navigation.screen === "local" ? "active" : ""} onClick={() => navigation.go("local")}>{t.navLocal}</button>
      <button className={navigation.screen === "help" ? "active" : ""} onClick={() => navigation.go("help")}>{t.navHelp}</button>
    </nav>}
    <div className="velorah-nav-right">
      {showMunicipalityLink && <a className="velorah-public-link liquid-glass" href={municipalityAppRoute}>{t.sectionPublicTeams}</a>}
      <div className="velorah-language-select liquid-glass">
        <LanguageSelect locale={locale} switchLocale={switchLocale} />
      </div>
      {actionLabel && onAction && <button className="velorah-nav-cta liquid-glass" disabled={disabled} onClick={onAction} aria-label={actionLabel}>
        {actionLabel}
      </button>}
    </div>
  </header>;
}
