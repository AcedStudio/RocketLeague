// Isomorphic i18n core. Russian source text is the key; uz/en dictionaries map it.
// Placeholders use {name}. Missing translations fall back to Russian.

export const LOCALES = ["uz", "ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ru";
export const LOCALE_COOKIE = "lang";

export const LOCALE_NAMES: Record<Locale, string> = { uz: "O‘zbekcha", ru: "Русский", en: "English" };
export const LOCALE_SHORT: Record<Locale, string> = { uz: "UZ", ru: "RU", en: "EN" };
export const INTL_LOCALE: Record<Locale, string> = { uz: "uz-Latn-UZ", ru: "ru-RU", en: "en-GB" };

export type Params = Record<string, string | number | null | undefined>;
export type Dict = Record<string, string>;

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  // A value that already ends with a full stop ("2 декабря 2026 г.") swallows the template's own one.
  return template.replace(/\{(\w+)\}(\.?)/g, (m, k: string, dot: string) => {
    if (params[k] === undefined || params[k] === null) return m;
    const v = String(params[k]);
    return dot && v.endsWith(".") ? v : v + dot;
  });
}

export function translate(dict: Dict | null | undefined, key: string, params?: Params): string {
  const tpl = (dict && dict[key]) || key;
  return interpolate(tpl, params);
}

export type T = ((key: string, params?: Params) => string) & { locale: Locale; intl: string };

export function makeT(locale: Locale, dict: Dict | null): T {
  const fn = ((key: string, params?: Params) => translate(dict, key, params)) as T;
  fn.locale = locale;
  fn.intl = INTL_LOCALE[locale];
  return fn;
}
