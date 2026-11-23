import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { one, dbConfigured } from "./db";

export type Role = "superadmin" | "admin" | "referee" | "participant";

export type User = {
  id: string;
  email: string;
  display_name: string;
  rl_nickname: string;
  rl_id: string;
  platform: "pc" | "playstation" | "xbox";
  contact: string;
  role: Role;
  created_at: string;
};

const COOKIE = "rla_session";

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET не задан или короче 32 символов");
  return new TextEncoder().encode(s);
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 11);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export const getUser = cache(async (): Promise<User | null> => {
  if (!dbConfigured()) return null;
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return await one<User>(
      "select id, email, display_name, rl_nickname, rl_id, platform, contact, role, created_at from users where id = $1",
      [payload.sub],
    );
  } catch {
    return null;
  }
});

export async function requireUser(next = "/"): Promise<User> {
  const u = await getUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  return u;
}

export const isAdmin = (r?: Role | null) => r === "admin" || r === "superadmin";
export const isReferee = (r?: Role | null) => r === "referee" || isAdmin(r);

/** Admin pages and actions. Participants never get past this. */
export async function requireAdmin(): Promise<User> {
  const u = await requireUser("/admin");
  if (!isAdmin(u.role)) redirect("/?err=" + encodeURIComponent("Нет доступа"));
  return u;
}

/** Referees can resolve disputes and manage match results/status. */
export async function requireReferee(): Promise<User> {
  const u = await requireUser("/admin");
  if (!isReferee(u.role)) redirect("/?err=" + encodeURIComponent("Нет доступа"));
  return u;
}

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Супер-администратор",
  admin: "Администратор",
  referee: "Судья",
  participant: "Участник",
};

/** Short-lived signed tokens for OAuth state and the pending Discord signup. */
export async function signShort(payload: Record<string, unknown>, ttl: string) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(ttl).sign(secret());
}

export async function verifyShort<T>(token: string | undefined): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload as T;
  } catch {
    return null;
  }
}

export const DISCORD_PENDING_COOKIE = "rla_discord_pending";
export type DiscordPending = { id: string; username: string; displayName: string; accessToken: string };

export async function getDiscordPending(): Promise<DiscordPending | null> {
  return verifyShort<DiscordPending>((await cookies()).get(DISCORD_PENDING_COOKIE)?.value);
}
