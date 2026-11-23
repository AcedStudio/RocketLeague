import "server-only";
import { q, type Queryable } from "./db";

export async function notify(c: Queryable | undefined, userIds: string[], title: string, body = "", link = "") {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  await q(
    `insert into notifications (user_id, title, body, link)
     select unnest($1::uuid[]), $2, $3, $4`,
    [ids, title, body, link],
    c,
  );
}

/** Notifies every active member of the given entries. */
export async function notifyEntries(c: Queryable | undefined, entryIds: (string | null | undefined)[], title: string, body = "", link = "") {
  const ids = entryIds.filter(Boolean) as string[];
  if (!ids.length) return;
  const rows = await q<{ user_id: string }>("select user_id from entry_members where entry_id = any($1::uuid[]) and active", [ids], c);
  await notify(c, rows.map((r) => r.user_id), title, body, link);
}

export async function logAction(c: Queryable | undefined, actorId: string | null, action: string, details = "") {
  await q("insert into activity_log (actor_id, action, details) values ($1, $2, $3)", [actorId, action, details], c);
}

export async function matchEvent(c: Queryable | undefined, matchId: string, actorId: string | null, text: string) {
  await q("insert into match_events (match_id, actor_id, text) values ($1, $2, $3)", [matchId, actorId, text], c);
}
