import "server-only";
import { generateKeyPairSync } from "node:crypto";
import { q, one, type Queryable } from "./db";
import { DICTS } from "./i18n/dicts";
import { isLocale, makeT, type Params } from "./i18n/core";
import { renderStored } from "./format";
import { encryptPayload, vapidHeader, b64u, unb64u } from "./engine/webpush";

// Push services browsers actually use. Anything else is refused, so the server never POSTs to arbitrary URLs.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /^web\.push\.apple\.com$/, /\.push\.apple\.com$/];
export function allowedEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((r) => r.test(u.hostname));
  } catch {
    return false;
  }
}

type Vapid = { publicKey: string; privateJwk: JsonWebKey };
let cached: Vapid | null = null;

/** VAPID keys are generated on the server the first time and kept in settings — nobody ever handles them. */
export async function vapid(): Promise<Vapid> {
  if (cached) return cached;
  const read = async () => {
    const rows = await q<{ key: string; value: string }>("select key, value from settings where key in ('vapid_public', 'vapid_private_jwk')");
    const pub = rows.find((r) => r.key === "vapid_public")?.value;
    const priv = rows.find((r) => r.key === "vapid_private_jwk")?.value;
    return pub && priv ? { publicKey: pub, privateJwk: JSON.parse(priv) as JsonWebKey } : null;
  };
  let v = await read();
  if (!v) {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const jwk = publicKey.export({ format: "jwk" });
    const pub = b64u(Buffer.concat([Buffer.from([4]), unb64u(jwk.x!), unb64u(jwk.y!)]));
    // Both keys in one statement; a concurrent first call loses the race and re-reads the winner.
    await q(
      `insert into settings (key, value)
       select * from (values ('vapid_public', $1), ('vapid_private_jwk', $2)) v(k, val)
       where not exists (select 1 from settings where key = 'vapid_public')
       on conflict (key) do nothing`,
      [pub, JSON.stringify(privateKey.export({ format: "jwk" }))],
    );
    v = await read();
  }
  cached = v!;
  return cached;
}

export async function saveSubscription(userId: string, sub: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }) {
  const endpoint = String(sub.endpoint ?? "");
  const p256dh = String(sub.keys?.p256dh ?? "");
  const auth = String(sub.keys?.auth ?? "");
  if (!allowedEndpoint(endpoint) || endpoint.length > 1000 || !/^[\w-]{40,120}$/.test(p256dh) || !/^[\w-]{10,40}$/.test(auth)) return false;
  await q(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)
     on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    [userId, endpoint, p256dh, auth],
  );
  // Keep the last few devices per user.
  await q(
    `delete from push_subscriptions where user_id = $1 and id not in
       (select id from push_subscriptions where user_id = $1 order by created_at desc limit 5)`,
    [userId],
  );
  return true;
}

export async function removeSubscription(userId: string, endpoint: string) {
  await q("delete from push_subscriptions where user_id = $1 and endpoint = $2", [userId, endpoint]);
}

/** Queues a push for every user who has a subscribed device. Called from notify(). */
export async function enqueuePush(c: Queryable | undefined, userIds: string[], title: string, body: string, link: string, params: Params) {
  await q(
    `insert into push_outbox (user_id, payload)
     select distinct s.user_id, $2::jsonb from push_subscriptions s where s.user_id = any($1::uuid[])`,
    [userIds, JSON.stringify({ title, body, link, params })],
    c,
  );
}

async function sendOne(sub: { id: string; endpoint: string; p256dh: string; auth: string }, json: string, keys: Vapid) {
  const body = encryptPayload(Buffer.from(json), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidHeader(sub.endpoint, keys.privateJwk, keys.publicKey, "mailto:noreply@rlchamp.uz"),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal",
    },
    body,
    signal: AbortSignal.timeout(8000),
  });
  // Gone / not found: the browser dropped this subscription.
  if (res.status === 404 || res.status === 410) await q("delete from push_subscriptions where id = $1", [sub.id]);
  return res.ok;
}

/** Delivers queued pushes (oldest first). Stale items (>1 day) are dropped rather than sent late. */
export async function flushPush(limit = 40): Promise<{ sent: number; failed: number }> {
  const rows = await q<{ id: string; user_id: string; fresh: boolean; payload: { title: string; body: string; link: string; params: Params } }>(
    "delete from push_outbox where id in (select id from push_outbox order by id limit $1 for update skip locked) returning id, user_id, payload, created_at > now() - interval '1 day' as fresh",
    [limit],
  );
  let sent = 0;
  let failed = 0;
  if (!rows.length) return { sent, failed };
  const keys = await vapid();
  const users = [...new Set(rows.map((r) => r.user_id))];
  const subs = await q<{ id: string; user_id: string; endpoint: string; p256dh: string; auth: string; locale: string }>(
    "select s.id, s.user_id, s.endpoint, s.p256dh, s.auth, u.locale from push_subscriptions s join users u on u.id = s.user_id where s.user_id = any($1::uuid[])",
    [users],
  );
  await Promise.all(
    rows.flatMap((r) =>
      subs
        .filter((s) => s.user_id === r.user_id && r.fresh)
        .map(async (s) => {
          const loc = isLocale(s.locale) ? s.locale : "ru";
          const t = makeT(loc, DICTS[loc]);
          const p = r.payload;
          const json = JSON.stringify({
            title: renderStored(t, p.title, p.params ?? {}).slice(0, 120),
            body: p.body ? renderStored(t, p.body, p.params ?? {}).slice(0, 300) : "",
            url: p.link || "/me",
          });
          try {
            if (await sendOne(s, json, keys)) sent++;
            else failed++;
          } catch {
            failed++;
          }
        }),
    ),
  );
  return { sent, failed };
}

export async function hasPush(userId: string) {
  return !!(await one("select 1 from push_subscriptions where user_id = $1 limit 1", [userId]));
}
