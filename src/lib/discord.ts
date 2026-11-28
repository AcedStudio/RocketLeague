import "server-only";
import { createPublicKey, verify } from "node:crypto";
import { q, one, type Queryable } from "./db";
import { DICTS } from "./i18n/dicts";
import { isLocale, makeT, type Locale, type Params } from "./i18n/core";
import { renderStored, groupLabel } from "./format";
import { enqueueTelegramChannel } from "./telegram";

// Discord integration over the REST API (no gateway connection needed):
// channel posts, DMs and role grants go through an outbox table so a slow or
// failing Discord never breaks a site action; slash commands arrive over HTTP.

const API = "https://discord.com/api/v10";
export const BRAND_COLOR = 0x37befe;
export const GOLD_COLOR = 0xd9ad50;

export function discordEnv() {
  return {
    clientId: process.env.DISCORD_CLIENT_ID ?? "",
    clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
    botToken: process.env.DISCORD_BOT_TOKEN ?? "",
    publicKey: process.env.DISCORD_PUBLIC_KEY ?? "",
  };
}

export const oauthConfigured = () => !!(discordEnv().clientId && discordEnv().clientSecret);
export const botConfigured = () => !!discordEnv().botToken;

export function siteUrl(): string {
  const env = process.env.SITE_URL?.replace(/\/$/, "");
  if (env) return env;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

export type DiscordSettings = {
  guildId: string;
  announceChannel: string;
  resultsChannel: string;
  participantRole: string;
  locale: Locale;
};

export async function getDiscordSettings(c?: Queryable): Promise<DiscordSettings> {
  const rows = await q<{ key: string; value: string }>("select key, value from settings where key like 'discord_%'", [], c);
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    guildId: m.discord_guild_id ?? "",
    announceChannel: m.discord_announce_channel ?? "",
    resultsChannel: m.discord_results_channel ?? "",
    participantRole: m.discord_participant_role ?? "",
    locale: isLocale(m.discord_locale) ? m.discord_locale : "ru",
  };
}

export class DiscordError extends Error {
  status: number;
  retryAfter = 0;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function discordApi<T = unknown>(path: string, init: { method?: string; body?: unknown; auth?: "bot" | { bearer: string } } = {}): Promise<T> {
  const { botToken } = discordEnv();
  const auth = init.auth ?? "bot";
  const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": "RLChampionship (https://github.com/AcedStudio/RocketLeague, 1.0)" };
  if (auth === "bot") {
    if (!botToken) throw new DiscordError(0, "DISCORD_BOT_TOKEN is not set");
    headers.Authorization = `Bot ${botToken}`;
  } else headers.Authorization = `Bearer ${auth.bearer}`;
  const res = await fetch(`${API}${path}`, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!res.ok) {
    const err = new DiscordError(res.status, `${res.status} ${text.slice(0, 300)}`);
    if (res.status === 429) {
      try {
        err.retryAfter = Number(JSON.parse(text).retry_after) || 1;
      } catch {
        err.retryAfter = 1;
      }
    }
    throw err;
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

// ---------------------------------------------------------------- messages

export type Embed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  thumbnail?: { url: string };
  image?: { url: string };
  timestamp?: string;
};

/** A Discord button; its label is a Russian template. custom_id is handled by the interactions route. */
export type Button = { label: string; id: string; style?: 1 | 2 | 3 | 4 };

/** A localisable message: Russian templates + params, rendered at send time. */
export type MessageSpec = {
  buttons?: Button[];
  /** Site-relative image path (e.g. /api/match-card/…); the locale is appended at send time. */
  image?: string;
  title: string;
  description?: string;
  params?: Params;
  link?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean; lines?: { text: string; params: Params }[] }[];
};

export function renderMessage(spec: MessageSpec, locale: Locale) {
  const t = makeT(locale, DICTS[locale]);
  const p = spec.params ?? {};
  const embed: Embed = {
    title: renderStored(t, spec.title, p).slice(0, 256),
    description: spec.description ? renderStored(t, spec.description, p).slice(0, 4000) : undefined,
    url: spec.link ? (spec.link.startsWith("http") ? spec.link : `${siteUrl()}${spec.link}`) : undefined,
    color: spec.color ?? BRAND_COLOR,
    fields: spec.fields?.slice(0, 25).map((f) => ({
      name: groupLabel(f.name, t).slice(0, 256),
      value: (f.lines ? f.lines.map((l) => renderStored(t, l.text, l.params)).join("\n") : f.value).slice(0, 1024) || "—",
      inline: f.inline,
    })),
    image: spec.image ? { url: `${siteUrl()}${spec.image}${spec.image.includes("?") ? "&" : "?"}lang=${locale}` } : undefined,
  };
  const components = spec.buttons?.length
    ? [{ type: 1, components: spec.buttons.slice(0, 5).map((b) => ({ type: 2, style: b.style ?? 2, label: renderStored(t, b.label, p).slice(0, 80), custom_id: b.id })) }]
    : undefined;
  return { embeds: [embed], components, allowed_mentions: { parse: [] as string[] } };
}

// ---------------------------------------------------------------- outbox

export async function enqueueChannel(c: Queryable | undefined, which: "announce" | "results", spec: MessageSpec) {
  const s = await getDiscordSettings(c);
  // The Telegram channel gets the same posts (with the same pictures).
  await enqueueTelegramChannel(c, spec, s.locale);
  const channel = which === "announce" ? s.announceChannel : s.resultsChannel || s.announceChannel;
  if (!channel) return;
  await q("insert into discord_outbox (kind, target, payload) values ('channel', $1, $2)", [channel, JSON.stringify({ spec, locale: s.locale })], c);
}

export async function enqueueTo(c: Queryable | undefined, channelId: string, spec: MessageSpec) {
  if (!channelId) return;
  const s = await getDiscordSettings(c);
  await q("insert into discord_outbox (kind, target, payload) values ('channel', $1, $2)", [channelId, JSON.stringify({ spec, locale: s.locale })], c);
}

export type BoardKey = "rating" | "hall" | "guide";

/** A self-updating message (leaderboard, hall of fame). Rendered fresh at send time, so one pending row is enough. */
export async function enqueueBoard(c: Queryable | undefined, channelId: string, key: BoardKey) {
  if (!channelId) return;
  await q(
    `insert into discord_outbox (kind, target, payload)
     select 'board', $1, $2::jsonb where not exists (
       select 1 from discord_outbox where kind = 'board' and sent_at is null and attempts < 5 and target = $1 and payload->>'key' = $3)`,
    [channelId, JSON.stringify({ key }), key],
    c,
  );
}

/** DMs for site users who linked Discord and kept DMs on. Rendered in each user's language. */
export async function enqueueDms(c: Queryable | undefined, userIds: string[], spec: MessageSpec) {
  if (!userIds.length) return;
  const users = await q<{ discord_id: string; locale: string }>(
    "select discord_id, locale from users where id = any($1::uuid[]) and discord_id is not null and discord_dm",
    [userIds],
    c,
  );
  for (const u of users) {
    await q("insert into discord_outbox (kind, target, payload) values ('dm', $1, $2)", [u.discord_id, JSON.stringify({ spec, locale: isLocale(u.locale) ? u.locale : "ru" })], c);
  }
}

/** Gives the participant role to every linked member of the entry. */
export async function enqueueParticipantRole(c: Queryable | undefined, entryId: string) {
  const s = await getDiscordSettings(c);
  if (!s.participantRole || !s.guildId) return;
  const rows = await q<{ discord_id: string }>(
    `select u.discord_id from entry_members em join users u on u.id = em.user_id
      join entries e on e.id = em.entry_id
      where em.entry_id = $1 and em.active and e.status = 'confirmed' and u.discord_id is not null`,
    [entryId],
    c,
  );
  for (const r of rows) {
    await q("insert into discord_outbox (kind, target, payload) values ('role', $1, $2)", [r.discord_id, JSON.stringify({ guild: s.guildId, role: s.participantRole })], c);
  }
}

const dmChannels = new Map<string, string>();

async function deliver(row: { kind: string; target: string; payload: { spec?: MessageSpec; locale?: Locale; guild?: string; role?: string; op?: "add" | "remove"; key?: BoardKey } }) {
  if (row.kind === "board") {
    const { deliverBoard } = await import("./discord-server");
    await deliverBoard(row.target, row.payload.key!);
    return;
  }
  if (row.kind === "channel") {
    await discordApi(`/channels/${row.target}/messages`, { method: "POST", body: renderMessage(row.payload.spec!, row.payload.locale ?? "ru") });
  } else if (row.kind === "dm") {
    let channel = dmChannels.get(row.target);
    if (!channel) {
      const ch = await discordApi<{ id: string }>("/users/@me/channels", { method: "POST", body: { recipient_id: row.target } });
      channel = ch.id;
      dmChannels.set(row.target, channel);
    }
    await discordApi(`/channels/${channel}/messages`, { method: "POST", body: renderMessage(row.payload.spec!, row.payload.locale ?? "ru") });
  } else if (row.kind === "role") {
    try {
      await discordApi(`/guilds/${row.payload.guild}/members/${row.target}/roles/${row.payload.role}`, { method: row.payload.op === "remove" ? "DELETE" : "PUT" });
    } catch (err) {
      // The player left the server or the role was deleted: nothing to do.
      if (err instanceof DiscordError && err.status === 404) return;
      throw err;
    }
  }
}

/**
 * Sends pending outbox rows. Called after actions (via next/server `after`) and by
 * the daily cron. Permanent errors (4xx except 429) are not retried more than 3 times.
 */
export async function flushOutbox(limit = 40): Promise<{ sent: number; failed: number }> {
  if (!botConfigured()) return { sent: 0, failed: 0 };
  const rows = await q<{ id: number; kind: string; target: string; payload: never }>(
    "select id, kind, target, payload from discord_outbox where sent_at is null and attempts < 5 order by id limit $1",
    [limit],
  );
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      try {
        await deliver(row);
      } catch (err) {
        // Short rate limit (role bursts): wait it out once and retry.
        if (err instanceof DiscordError && err.status === 429 && err.retryAfter <= 3) {
          await new Promise((r) => setTimeout(r, err.retryAfter * 1000 + 100));
          await deliver(row);
        } else throw err;
      }
      await q("update discord_outbox set sent_at = now(), attempts = attempts + 1, last_error = null where id = $1", [row.id]);
      sent++;
    } catch (err) {
      failed++;
      const status = err instanceof DiscordError ? err.status : 0;
      const permanent = status >= 400 && status < 500 && status !== 429;
      await q("update discord_outbox set attempts = attempts + $2, last_error = $3 where id = $1", [row.id, permanent ? 2 : 1, String((err as Error).message).slice(0, 500)]);
      if (status === 429) break; // rate limited: leave the rest for later
    }
  }
  return { sent, failed };
}

// ---------------------------------------------------------------- OAuth

export function authorizeUrl(state: string) {
  const { clientId } = discordEnv();
  const u = new URL("https://discord.com/oauth2/authorize");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", `${siteUrl()}/api/auth/discord/callback`);
  u.searchParams.set("scope", "identify guilds.join");
  u.searchParams.set("state", state);
  u.searchParams.set("prompt", "none");
  return u.toString();
}

export async function exchangeCode(code: string) {
  const { clientId, clientSecret } = discordEnv();
  const res = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${siteUrl()}/api/auth/discord/callback`,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new DiscordError(res.status, await res.text());
  const tok = (await res.json()) as { access_token: string };
  const me = await discordApi<{ id: string; username: string; global_name?: string | null }>("/users/@me", { auth: { bearer: tok.access_token } });
  return { accessToken: tok.access_token, id: me.id, username: me.username, displayName: me.global_name || me.username };
}

/** Adds the user to the configured server (needs the guilds.join scope + bot in the server). */
export async function joinGuild(discordId: string, accessToken: string) {
  const s = await getDiscordSettings();
  if (!s.guildId || !botConfigured()) return;
  try {
    await discordApi(`/guilds/${s.guildId}/members/${discordId}`, { method: "PUT", body: { access_token: accessToken } });
  } catch (err) {
    console.error("[discord] joinGuild", err);
  }
}

// ---------------------------------------------------------------- interactions

export function verifyInteraction(rawBody: string, signature: string | null, timestamp: string | null): boolean {
  const { publicKey } = discordEnv();
  if (!publicKey || !signature || !timestamp) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKey, "hex")]), format: "der", type: "spki" });
    return verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

const userOption = (name: string, en: string, ru: string, required = false) => ({
  type: 6, name, description: en, description_localizations: { ru }, required,
});

export const SLASH_COMMANDS = [
  {
    name: "rank",
    description: "Rating, rank and titles — yours or another player's",
    description_localizations: { ru: "Рейтинг, ранг и титулы — ваши или другого игрока" },
    options: [userOption("player", "Player (empty = you)", "Игрок (пусто — вы)")],
  },
  {
    name: "top",
    description: "ELO leaderboard",
    description_localizations: { ru: "Топ рейтинга ELO" },
    options: [
      {
        type: 3,
        name: "mode",
        description: "1v1 or 2v2",
        description_localizations: { ru: "1v1 или 2v2" },
        required: false,
        choices: [
          { name: "1v1", value: "1v1" },
          { name: "2v2", value: "2v2" },
        ],
      },
    ],
  },
  {
    name: "h2h",
    description: "Head-to-head record against another player",
    description_localizations: { ru: "Личные встречи с другим игроком" },
    options: [userOption("opponent", "Opponent", "Соперник", true)],
  },
  { name: "matches", description: "My upcoming matches", description_localizations: { ru: "Мои ближайшие матчи" } },
  { name: "table", description: "Standings of the featured competition", description_localizations: { ru: "Таблица главного соревнования" } },
  { name: "link", description: "Link your Discord to the site", description_localizations: { ru: "Привязать Discord к сайту" } },
  // Right-click a member → Apps → "RL rating"
  { type: 2, name: "RL rating", name_localizations: { ru: "RL рейтинг" } },
];

export async function registerCommands() {
  const { clientId } = discordEnv();
  const s = await getDiscordSettings();
  // Guild commands appear instantly; global ones can take up to an hour.
  const path = s.guildId ? `/applications/${clientId}/guilds/${s.guildId}/commands` : `/applications/${clientId}/commands`;
  return discordApi<unknown[]>(path, { method: "PUT", body: SLASH_COMMANDS });
}

export async function linkedUser(discordId: string) {
  return one<{ id: string; rl_nickname: string; locale: string }>("select id, rl_nickname, locale from users where discord_id = $1", [discordId]);
}
