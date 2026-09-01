import { getTokyoAssessmentDate } from "../assessment-date";
import { prefersReducedMotion } from "../motion";

export function setStayBridgeDocumentLocale(locale: string) {
  document.documentElement.lang = locale;
}

export function observeTokyoPublicationDate(onDate: (date: string) => void) {
  const refresh = () => onDate(getTokyoAssessmentDate());
  const timer = window.setInterval(refresh, 60_000);
  document.addEventListener("visibilitychange", refresh);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", refresh);
  };
}

export function scrollAfterStayBridgeNavigation() {
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

export function focusStayBridgeElement(targetId: string) {
  window.setTimeout(() => document.getElementById(targetId)?.focus(), 0);
}

export function deferStayBridgeStorageError(onError: () => void) {
  window.setTimeout(onError, 0);
}

export function createRecommendationDeadline(controller: AbortController, milliseconds: number) {
  let timer: number | undefined;
  return {
    expires: new Promise<null>((resolve) => {
      timer = window.setTimeout(() => {
        controller.abort();
        resolve(null);
      }, milliseconds);
    }),
    clear: () => {
      if (timer !== undefined) window.clearTimeout(timer);
    },
  };
}
