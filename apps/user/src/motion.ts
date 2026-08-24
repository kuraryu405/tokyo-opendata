export const prefersReducedMotion = (targetWindow: Window = window) =>
  typeof targetWindow.matchMedia === "function" && targetWindow.matchMedia("(prefers-reduced-motion: reduce)").matches;
