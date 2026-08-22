/**
 * Shared i18n boundary for user-facing applications. Translation catalogs stay
 * in the owning app until the dedicated i18n migration is introduced.
 */
export const supportedUserLocales = ["ja", "en", "my"] as const;

export type UserLocale = (typeof supportedUserLocales)[number];
