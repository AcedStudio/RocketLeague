"use server";

import { redirect } from "next/navigation";
import { q, one, isUniqueViolation } from "@/lib/db";
import { createSession, destroySession, hashPassword, verifyPassword, requireUser } from "@/lib/auth";
import { str, email as emailField, oneOf, guard, safeNext, FormError, ok } from "@/lib/forms";
import { notify } from "@/lib/notify";

const PLATFORMS = ["pc", "playstation", "xbox"] as const;

function profileFields(fd: FormData) {
  return {
    display_name: str(fd, "display_name", "Имя", { max: 60 }),
    rl_nickname: str(fd, "rl_nickname", "Ник в Rocket League", { min: 2, max: 32 }),
    rl_id: str(fd, "rl_id", "Rocket League ID (Epic / PSN / Xbox)", { min: 2, max: 64 }),
    platform: oneOf(fd, "platform", "Платформа", PLATFORMS),
    contact: str(fd, "contact", "Контакт (Discord или Telegram)", { min: 2, max: 80 }),
  };
}

export async function signup(fd: FormData) {
  const next = safeNext(fd.get("next"), "/me");
  await guard(`/signup?next=${encodeURIComponent(next)}`, async () => {
    const mail = emailField(fd);
    const password = str(fd, "password", "Пароль", { min: 8, max: 100 });
    const p = profileFields(fd);
    const owner = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
    const count = await one<{ n: number }>("select count(*)::int as n from users");
    const role = owner ? (owner === mail ? "superadmin" : "participant") : count!.n === 0 ? "superadmin" : "participant";
    let id: string;
    try {
      const row = await one<{ id: string }>(
        `insert into users (email, password_hash, display_name, rl_nickname, rl_id, platform, contact, role)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [mail, await hashPassword(password), p.display_name, p.rl_nickname, p.rl_id, p.platform, p.contact, role],
      );
      id = row!.id;
    } catch (err) {
      if (isUniqueViolation(err)) {
        const detail = String((err as { constraint?: string }).constraint ?? "");
        if (detail.includes("email")) throw new FormError("Этот email уже зарегистрирован");
        if (detail.includes("nickname")) throw new FormError("Этот ник уже занят");
        throw new FormError("Этот Rocket League аккаунт уже зарегистрирован");
      }
      throw err;
    }
    await notify(undefined, [id], "Добро пожаловать!", "Аккаунт создан. Выберите соревнование и зарегистрируйтесь.", "/competitions");
    await createSession(id);
  });
  redirect(next);
}

export async function login(fd: FormData) {
  const next = safeNext(fd.get("next"), "/me");
  await guard(`/login?next=${encodeURIComponent(next)}`, async () => {
    const mail = emailField(fd);
    const password = str(fd, "password", "Пароль", { max: 100 });
    const u = await one<{ id: string; password_hash: string }>("select id, password_hash from users where email = $1", [mail]);
    // Same message either way, so emails can't be probed.
    if (!u || !(await verifyPassword(password, u.password_hash))) throw new FormError("Неверный email или пароль");
    await createSession(u.id);
  });
  redirect(next);
}

export async function logout() {
  await destroySession();
  redirect("/");
}

export async function updateProfile(fd: FormData) {
  const user = await requireUser("/me");
  await guard("/me", async () => {
    const p = profileFields(fd);
    try {
      await q("update users set display_name = $2, rl_nickname = $3, rl_id = $4, platform = $5, contact = $6 where id = $1", [
        user.id, p.display_name, p.rl_nickname, p.rl_id, p.platform, p.contact,
      ]);
    } catch (err) {
      if (isUniqueViolation(err)) throw new FormError("Этот ник или Rocket League аккаунт уже занят");
      throw err;
    }
  });
  ok("/me", "Профиль обновлён");
}

export async function changePassword(fd: FormData) {
  const user = await requireUser("/me");
  await guard("/me", async () => {
    const current = str(fd, "current", "Текущий пароль", { max: 100 });
    const next = str(fd, "password", "Новый пароль", { min: 8, max: 100 });
    const u = await one<{ password_hash: string }>("select password_hash from users where id = $1", [user.id]);
    if (!u || !(await verifyPassword(current, u.password_hash))) throw new FormError("Текущий пароль неверный");
    await q("update users set password_hash = $2 where id = $1", [user.id, await hashPassword(next)]);
  });
  ok("/me", "Пароль изменён");
}

export async function markNotificationsRead() {
  const user = await requireUser("/me/notifications");
  await q("update notifications set read_at = now() where user_id = $1 and read_at is null", [user.id]);
  redirect("/me/notifications");
}
