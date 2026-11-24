"use server";

import { redirect } from "next/navigation";
import { q, one, isUniqueViolation } from "@/lib/db";
import { createSession, destroySession, hashPassword, verifyPassword, requireUser, getDiscordPending, DISCORD_PENDING_COOKIE } from "@/lib/auth";
import { cookies } from "next/headers";
import { joinGuild } from "@/lib/discord";
import { getLocale } from "@/lib/i18n/server";
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
    const discord = await getDiscordPending();
    // With Discord linked the password is optional (the player can always sign in with Discord).
    const password = str(fd, "password", "Пароль", { min: 8, max: 100, optional: !!discord });
    const p = profileFields(fd);
    const locale = await getLocale();
    const owner = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
    const count = await one<{ n: number }>("select count(*)::int as n from users");
    const role = owner ? (owner === mail ? "superadmin" : "participant") : count!.n === 0 ? "superadmin" : "participant";
    let id: string;
    try {
      const row = await one<{ id: string }>(
        `insert into users (email, password_hash, display_name, rl_nickname, rl_id, platform, contact, role, discord_id, discord_username, locale)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
        [mail, password ? await hashPassword(password) : null, p.display_name, p.rl_nickname, p.rl_id, p.platform, p.contact, role, discord?.id ?? null, discord?.username ?? null, locale],
      );
      id = row!.id;
    } catch (err) {
      if (isUniqueViolation(err)) {
        const detail = String((err as { constraint?: string }).constraint ?? "");
        if (detail.includes("email")) throw new FormError("Этот email уже зарегистрирован");
        if (detail.includes("nickname")) throw new FormError("Этот ник уже занят");
        if (detail.includes("discord")) throw new FormError("Этот Discord уже привязан к другому аккаунту");
        throw new FormError("Этот Rocket League аккаунт уже зарегистрирован");
      }
      throw err;
    }
    await notify(undefined, [id], "Добро пожаловать!", "Аккаунт создан. Выберите соревнование и зарегистрируйтесь.", "/competitions");
    await createSession(id);
    if (discord) {
      (await cookies()).delete(DISCORD_PENDING_COOKIE);
      await joinGuild(discord.id, discord.accessToken);
    }
  });
  redirect(next);
}

export async function login(fd: FormData) {
  const next = safeNext(fd.get("next"), "/me");
  await guard(`/login?next=${encodeURIComponent(next)}`, async () => {
    const mail = emailField(fd);
    const password = str(fd, "password", "Пароль", { max: 100 });
    const u = await one<{ id: string; password_hash: string | null }>("select id, password_hash from users where email = $1", [mail]);
    // Same message either way, so emails can't be probed.
    if (!u || !u.password_hash || !(await verifyPassword(password, u.password_hash))) throw new FormError("Неверный email или пароль");
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
    const next = str(fd, "password", "Новый пароль", { min: 8, max: 100 });
    const u = await one<{ password_hash: string | null }>("select password_hash from users where id = $1", [user.id]);
    // Accounts created via Discord have no password yet: they can set one without the old one.
    if (u?.password_hash) {
      const current = str(fd, "current", "Текущий пароль", { max: 100 });
      if (!(await verifyPassword(current, u.password_hash))) throw new FormError("Текущий пароль неверный");
    }
    await q("update users set password_hash = $2 where id = $1", [user.id, await hashPassword(next)]);
  });
  ok("/me", "Пароль изменён");
}

export async function markNotificationsRead() {
  const user = await requireUser("/me/notifications");
  await q("update notifications set read_at = now() where user_id = $1 and read_at is null", [user.id]);
  redirect("/me/notifications");
}

export async function discordPrefs(fd: FormData) {
  const user = await requireUser("/me");
  const action = String(fd.get("action"));
  await guard("/me", async () => {
    if (action === "dm_on" || action === "dm_off") await q("update users set discord_dm = $2 where id = $1", [user.id, action === "dm_on"]);
    if (action === "unlink") {
      const u = await one<{ password_hash: string | null }>("select password_hash from users where id = $1", [user.id]);
      if (!u?.password_hash) throw new FormError("Сначала задайте пароль, иначе вы не сможете войти");
      await q("update users set discord_id = null, discord_username = null where id = $1", [user.id]);
    }
  });
  ok("/me", action === "unlink" ? "Discord отвязан" : "Сохранено");
}
