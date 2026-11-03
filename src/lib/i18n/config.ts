export const LOCALE_COOKIE = "tile_locale";
export const LOCALE_STORAGE_KEY = "tile_locale";

export const LOCALES = ["en", "sq"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "sq";
}

export function localeLabel(locale: Locale): string {
  return locale === "sq" ? "Shqip" : "English";
}
