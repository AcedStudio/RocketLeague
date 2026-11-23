"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/core";
import { safeNext } from "@/lib/forms";
import { getUser } from "@/lib/auth";
import { q } from "@/lib/db";

export async function setLocale(fd: FormData) {
  const lang = fd.get("lang");
  if (isLocale(lang)) {
    (await cookies()).set(LOCALE_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    // Remember it on the account too, so Discord DMs arrive in the same language.
    const user = await getUser();
    if (user) await q("update users set locale = $2 where id = $1", [user.id, lang]);
  }
  redirect(safeNext(fd.get("back"), "/"));
}
