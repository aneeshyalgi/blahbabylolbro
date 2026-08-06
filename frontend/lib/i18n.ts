/**
 * Supported locales and localStorage key for offline i18n.
 * All message files are bundled so the app works offline.
 */
export const LOCALE_STORAGE_KEY = "dataflow_locale";

export const SUPPORTED_LOCALES = ["en", "de", "es"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function getDefaultLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored && SUPPORTED_LOCALES.includes(stored as Locale)) return stored as Locale;
  return "en";
}

export function setStoredLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}
