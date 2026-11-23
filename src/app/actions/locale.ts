"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/core";
import { safeNext } from "@/lib/forms";

export async function setLocale(fd: FormData) {
  const lang = fd.get("lang");
  if (isLocale(lang)) {
    (await cookies()).set(LOCALE_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  redirect(safeNext(fd.get("back"), "/"));
}
