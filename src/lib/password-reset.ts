import "server-only";
import { createHash, randomInt } from "node:crypto";
import { one, q } from "./db";
import { hashPassword, signShort, verifyShort, type Role } from "./auth";
import { FormError } from "./errors";
import { logAction } from "./notify";
import { siteUrl } from "./discord";

// Passwords are stored as bcrypt hashes and can't be read back — admins reset them instead.

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i look-alikes

export function tempPassword() {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `rl-${part()}-${part()}`;
}

/** Changes whenever the password does, so a reset link works only once. */
const fingerprint = (hash: string | null) => createHash("sha256").update(hash ?? "none").digest("hex").slice(0, 16);

const RANK: Record<Role, number> = { participant: 0, referee: 1, admin: 2, superadmin: 3 };

async function target(actor: { id: string; role: Role }, userId: string) {
  const u = await one<{ id: string; rl_nickname: string; role: Role; password_hash: string | null }>(
    "select id, rl_nickname, role, password_hash from users where id = $1",
    [userId],
  );
  if (!u) throw new FormError("Игрок не найден");
  if (u.id === actor.id) throw new FormError("Свой пароль меняйте в профиле");
  if (RANK[u.role] >= RANK[actor.role] && actor.role !== "superadmin") throw new FormError("Пароль администратора может сбросить только супер-администратор");
  return u;
}

/** Sets a fresh temporary password (shown to the admin once) and asks for a new one at sign-in. */
export async function resetToTemp(actor: { id: string; role: Role }, userId: string) {
  const u = await target(actor, userId);
  const pw = tempPassword();
  await q("update users set password_hash = $2, must_change_password = true where id = $1", [u.id, await hashPassword(pw)]);
  await logAction(undefined, actor.id, "user.password_temp", u.rl_nickname);
  return { nickname: u.rl_nickname, password: pw };
}

/** A one-time link (24 h) where the player picks a new password themselves. */
export async function resetLink(actor: { id: string; role: Role }, userId: string) {
  const u = await target(actor, userId);
  const token = await signShort({ kind: "pw-reset", uid: u.id, fp: fingerprint(u.password_hash) }, "24h");
  await logAction(undefined, actor.id, "user.password_link", u.rl_nickname);
  return { nickname: u.rl_nickname, link: `${siteUrl()}/reset?token=${encodeURIComponent(token)}` };
}

export async function checkResetToken(token: string | undefined) {
  const p = await verifyShort<{ kind: string; uid: string; fp: string }>(token);
  if (!p || p.kind !== "pw-reset") return null;
  const u = await one<{ id: string; rl_nickname: string; password_hash: string | null }>("select id, rl_nickname, password_hash from users where id = $1", [p.uid]);
  if (!u || fingerprint(u.password_hash) !== p.fp) return null; // already used, or the password changed since
  return { id: u.id, nickname: u.rl_nickname };
}

export async function consumeResetToken(token: string | undefined, password: string) {
  const u = await checkResetToken(token);
  if (!u) throw new FormError("Ссылка устарела или уже использована — попросите администратора новую");
  await q("update users set password_hash = $2, must_change_password = false where id = $1", [u.id, await hashPassword(password)]);
  return u.id;
}
