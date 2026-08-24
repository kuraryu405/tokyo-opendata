/** Resolve one request-scoped calendar date in Tokyo on the server boundary. */
export function getTokyoAssessmentDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

/** Render the pinned Tokyo assessment date for a locale without depending on the system time zone. */
export function formatAssessmentDateForLocale(assessmentDate: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "my" ? "en" : locale, {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${assessmentDate}T00:00:00+09:00`));
}
