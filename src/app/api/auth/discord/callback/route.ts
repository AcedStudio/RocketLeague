import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { after } from "next/server";
import { q, one, isUniqueViolation } from "@/lib/db";
import { createSession, getUser, signShort, verifyShort, DISCORD_PENDING_COOKIE } from "@/lib/auth";
import { exchangeCode, joinGuild, enqueueParticipantRole, flushOutbox } from "@/lib/discord";

function back(req: Request, path: string, key: "ok" | "err", msg: string) {
  const u = new URL(path, req.url);
  u.searchParams.set(key, msg);
  return NextResponse.redirect(u);
}

async function grantRoles(userId: string) {
  const entries = await q<{ entry_id: string }>(
    "select em.entry_id from entry_members em join entries e on e.id = em.entry_id where em.user_id = $1 and em.active and e.status = 'confirmed'",
    [userId],
  );
  for (const e of entries) await enqueueParticipantRole(undefined, e.entry_id);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const state = await verifyShort<{ nonce: string; mode: "login" | "link"; next: string }>(jar.get("rla_discord_state")?.value);
  jar.delete("rla_discord_state");
  if (url.searchParams.get("error")) return back(req, "/login", "err", "Вход через Discord отменён");
  if (!state || state.nonce !== url.searchParams.get("state")) return back(req, "/login", "err", "Сессия входа устарела, попробуйте ещё раз");

  let d: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    d = await exchangeCode(url.searchParams.get("code") ?? "");
  } catch (err) {
    console.error("[discord] oauth", err);
    return back(req, "/login", "err", "Discord не подтвердил вход, попробуйте ещё раз");
  }

  if (state.mode === "link") {
    const user = await getUser();
    if (!user) return back(req, "/login", "err", "Сначала войдите в аккаунт");
    try {
      await q("update users set discord_id = $2, discord_username = $3 where id = $1", [user.id, d.id, d.username]);
    } catch (err) {
      if (isUniqueViolation(err)) return back(req, "/me", "err", "Этот Discord уже привязан к другому аккаунту");
      throw err;
    }
    await joinGuild(d.id, d.accessToken);
    await grantRoles(user.id);
    after(() => flushOutbox().catch(() => {}));
    return back(req, "/me", "ok", "Discord привязан");
  }

  const existing = await one<{ id: string }>("select id from users where discord_id = $1", [d.id]);
  if (existing) {
    await q("update users set discord_username = $2 where id = $1", [existing.id, d.username]);
    await createSession(existing.id);
    await joinGuild(d.id, d.accessToken);
    await grantRoles(existing.id);
    after(() => flushOutbox().catch(() => {}));
    return NextResponse.redirect(new URL(state.next, req.url));
  }

  // New player: remember the Discord identity for 15 minutes and finish signup on the site.
  jar.set(DISCORD_PENDING_COOKIE, await signShort({ id: d.id, username: d.username, displayName: d.displayName, accessToken: d.accessToken }, "15m"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 900,
  });
  const s = new URL("/signup", req.url);
  s.searchParams.set("next", state.next);
  return NextResponse.redirect(s);
}
