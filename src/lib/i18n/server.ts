import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, makeT, type Locale, type T } from "./core";
import { DICTS } from "./dicts";

export const getLocale = cache(async (): Promise<Locale> => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  // First visit: follow the browser language.
  const accept = ((await headers()).get("accept-language") ?? "").toLowerCase();
  for (const part of accept.split(",")) {
    const code = part.trim().slice(0, 2);
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
});

export const getT = cache(async (): Promise<T> => {
  const locale = await getLocale();
  return makeT(locale, DICTS[locale]);
});
