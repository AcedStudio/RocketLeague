import type { Dict, Locale } from "./core";
import uz from "./uz";
import en from "./en";

export const DICTS: Record<Locale, Dict | null> = { uz, ru: null, en };
