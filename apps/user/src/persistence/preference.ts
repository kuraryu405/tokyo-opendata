/**
 * An explicit decline is honored for the lifetime of the answer session it
 * belongs to, so reloading does not re-ask the same consent question.
 * Anything unreadable simply means "no remembered preference": the worst case
 * is one repeated consent prompt, never a saved record.
 */
export function readSituationPersistencePreference(value: string | null): "declined" | null {
  return value === "declined" ? "declined" : null;
}
