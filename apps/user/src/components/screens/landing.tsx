"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../../motion";
import type { Locale } from "../staybridge-session";
import { CinematicHeader, TokyoAerialVideo } from "./shared-shell";
import type { UserCopy } from "./screen-types";

export function Landing({ t, locale, switchLocale, showDemo, disabled, start, demo }: { t: UserCopy; locale: Locale; switchLocale: (l: Locale) => void; showDemo: boolean; disabled: boolean; start: () => void; demo: () => void }) {
  const heroLines = t.hero.split("\n");
  const [isExiting, setIsExiting] = useState(false);
  const exitTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
  }, []);

  const startWithTransition = () => {
    if (disabled || isExiting) return;
    if (prefersReducedMotion()) {
      start();
      return;
    }
    setIsExiting(true);
    exitTimer.current = window.setTimeout(start, 440);
  };

  return (
    <div className="velorah-scope">
      {/* ── Fullscreen hero ─────────────────────────────── */}
      <section className="velorah-hero" aria-labelledby="landing-heading" aria-busy={isExiting || undefined}>
        <TokyoAerialVideo />

        {/* Navigation floating over video */}
        <CinematicHeader locale={locale} switchLocale={switchLocale} disabled={disabled || isExiting} onBrandClick={startWithTransition} actionLabel={t.start} onAction={startWithTransition} showMunicipalityLink />

        {/* Centered hero content */}
        <div className={`velorah-hero-main${isExiting ? " is-exiting" : ""}`} id="top">
          <div className="velorah-eyebrow animate-fade-rise">
            <span className="velorah-eyebrow-dot" aria-hidden="true" />
            <span>{t.eyebrow}</span>
          </div>

          <h1 id="landing-heading" className="velorah-headline animate-fade-rise" lang={locale}>
            {heroLines.map((line, idx) => (
              <span key={line} className={idx === 0 ? "hl-white" : "hl-muted"}>
                {line}
              </span>
            ))}
          </h1>

          <p className="velorah-lede animate-fade-rise-delay">{t.intro}</p>

          <div className="animate-fade-rise-delay-2 hero-actions" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <button className="velorah-cta liquid-glass" disabled={disabled || isExiting} onClick={startWithTransition}>
              <span>{t.start}</span>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 3l5 5-5 5" />
              </svg>
            </button>
            {showDemo && (
              <button className="velorah-demo secondary-button" disabled={disabled} onClick={demo}>
                {t.demo}
              </button>
            )}
            <div className="velorah-trust">
              <span>{t.noLogin}</span>
              <span className="dot" aria-hidden="true" />
              <span>{t.noAddress}</span>
              <span className="dot" aria-hidden="true" />
              <span>{t.official}</span>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
