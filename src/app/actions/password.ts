"use server";

import { requireAdmin, createSession } from "@/lib/auth";
import { resetToTemp, resetLink, consumeResetToken } from "@/lib/password-reset";
import { FormError } from "@/lib/errors";
import { guard, str, ok } from "@/lib/forms";
import { getT } from "@/lib/i18n/server";

export type ResetState = { nickname?: string; password?: string; link?: string; error?: string } | null;

/** Admin: reset a player's password. The result is shown once in the admin's browser, never stored or put in a URL. */
export async function adminResetAction(_prev: ResetState, fd: FormData): Promise<ResetState> {
  const actor = await requireAdmin();
  const t = await getT();
  try {
    const id = String(fd.get("user_id") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new FormError("Игрок не найден");
    return fd.get("mode") === "link" ? await resetLink(actor, id) : await resetToTemp(actor, id);
  } catch (e) {
    if (e instanceof FormError) return { error: t(e.message, e.params) };
    throw e;
  }
}

/** Player: set a new password from a reset link, then sign in. */
export async function applyResetAction(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  const back = `/reset?token=${encodeURIComponent(token)}`;
  let userId = "";
  await guard(back, async () => {
    const pw = str(fd, "password", "Новый пароль", { min: 8, max: 100 });
    if (pw !== String(fd.get("password2") ?? "")) throw new FormError("Пароли не совпадают");
    userId = await consumeResetToken(token, pw);
  });
  await createSession(userId);
  ok("/me", "Пароль изменён");
}
