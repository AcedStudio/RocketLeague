import "server-only";
import { q, type Queryable } from "./db";
import type { Params } from "./i18n/core";
import { enqueueDms, type Button } from "./discord";
import { enqueuePush } from "./push";
import { enqueueTelegram } from "./telegram";

// Titles/bodies are Russian templates ({name} placeholders); params are stored alongside
// and each reader sees them in their own language. A param `at` (ISO date) + `tz`
// is rendered as {when}.

export async function notify(c: Queryable | undefined, userIds: string[], title: string, body = "", link = "", params: Params = {}, buttons?: Button[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  await q(
    `insert into notifications (user_id, title, body, link, params)
     select unnest($1::uuid[]), $2, $3, $4, $5`,
    [ids, title, body, link, JSON.stringify(params)],
    c,
  );
  await enqueuePush(c, ids, title, body, link, params);
  await enqueueTelegram(c, ids, title, body, link, params);
  // Mirror to Discord DMs for users who linked Discord (sent after the action commits).
  await enqueueDms(c, ids, { title, description: body || undefined, params, link: link || undefined, buttons });
}

/** Notifies every active member of the given entries. */
export async function notifyEntries(c: Queryable | undefined, entryIds: (string | null | undefined)[], title: string, body = "", link = "", params: Params = {}, buttons?: Button[]) {
  const ids = entryIds.filter(Boolean) as string[];
  if (!ids.length) return;
  const rows = await q<{ user_id: string }>("select user_id from entry_members where entry_id = any($1::uuid[]) and active", [ids], c);
  await notify(c, rows.map((r) => r.user_id), title, body, link, params, buttons);
}

export async function logAction(c: Queryable | undefined, actorId: string | null, action: string, details = "") {
  await q("insert into activity_log (actor_id, action, details) values ($1, $2, $3)", [actorId, action, details], c);
}

export async function matchEvent(c: Queryable | undefined, matchId: string, actorId: string | null, text: string, params: Params = {}) {
  await q("insert into match_events (match_id, actor_id, text, params) values ($1, $2, $3, $4)", [matchId, actorId, text, JSON.stringify(params)], c);
}
