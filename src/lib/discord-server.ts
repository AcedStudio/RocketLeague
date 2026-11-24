import "server-only";
import { q, one, type Queryable } from "./db";
import { DICTS } from "./i18n/dicts";
import { makeT, type Locale, type T } from "./i18n/core";
import { TIERS, tierOf, START_RATING, type Tier } from "./engine/elo.ts";
import {
  discordApi, discordEnv, getDiscordSettings, enqueueTo, enqueueBoard, siteUrl, DiscordError,
  BRAND_COLOR, GOLD_COLOR, type BoardKey, type Embed,
} from "./discord";

// Everything the bot builds on the server: roles (rank tiers + titles), a channel
// category with live boards, and the sync that keeps players' roles up to date.

export const CALIBRATION_GAMES = 5;

export const TIER_EMOJI: Record<string, string> = {
  bronze: "🟫", silver: "⬜", gold: "🟨", plat: "🟦", diamond: "💎", champ: "🟪", gc: "🔴", ssl: "⭐",
};

// Role keys in the order they are created: Discord puts each new role at the bottom,
// so the last one created ends up highest (its colour wins in the member list).
type RoleDef = { key: string; name: (t: T) => string; color: number; hoist?: boolean };
const hex = (c: string) => parseInt(c.slice(1), 16);
const ROLE_DEFS: RoleDef[] = [
  { key: "participant", name: (t) => `🎮 ${t("Участник турнира")}`, color: 0x88edff },
  ...[...TIERS].reverse().map((tier) => ({ key: `tier_${tier.key}`, name: (t: T) => `${TIER_EMOJI[tier.key]} ${t(tier.name)}`, color: hex(tier.color) })),
  { key: "top10", name: (t) => `🔝 ${t("Топ-10")}`, color: 0x37befe, hoist: true },
  { key: "champion", name: (t) => `🏆 ${t("Победитель турнира")}`, color: 0xd9ad50, hoist: true },
  { key: "reigning_2v2", name: (t) => `👑 ${t("Действующий чемпион {mode}", { mode: "2v2" })}`, color: 0xffd36b, hoist: true },
  { key: "reigning_1v1", name: (t) => `👑 ${t("Действующий чемпион {mode}", { mode: "1v1" })}`, color: 0xffd36b, hoist: true },
];
const MANAGED_ROLE_KEYS = ROLE_DEFS.map((r) => r.key).filter((k) => k !== "participant");

type ChannelKey = "category" | "results" | "rating" | "hall" | "bot";
const CHANNEL_NAMES: Record<Locale, Record<ChannelKey, string>> = {
  uz: { category: "🏆 RL ARENA", results: "📊・natijalar", rating: "🏅・reyting", hall: "🏛・shon-sharaf", bot: "🤖・bot" },
  ru: { category: "🏆 RL ARENA", results: "📊・результаты", rating: "🏅・рейтинг", hall: "🏛・зал-славы", bot: "🤖・бот" },
  en: { category: "🏆 RL ARENA", results: "📊・results", rating: "🏅・rankings", hall: "🏛・hall-of-fame", bot: "🤖・bot" },
};
const CHANNEL_TOPICS: Record<Exclude<ChannelKey, "category">, string> = {
  results: "Результаты матчей и изменения рейтинга — публикуются автоматически",
  rating: "Таблица ELO обновляется после каждого матча. Здесь же — новые ранги игроков",
  hall: "Все чемпионы турниров",
  bot: "Команды бота: /rank, /top, /h2h, /matches, /table",
};

export type Layout = {
  roles: Record<string, string>;
  channels: Partial<Record<ChannelKey, string>>;
  messages: Partial<Record<BoardKey, string>>;
};

export async function getLayout(c?: Queryable): Promise<Layout> {
  const row = await one<{ value: string }>("select value from settings where key = 'discord_layout'", [], c);
  try {
    const v = row ? (JSON.parse(row.value) as Partial<Layout>) : {};
    return { roles: v.roles ?? {}, channels: v.channels ?? {}, messages: v.messages ?? {} };
  } catch {
    return { roles: {}, channels: {}, messages: {} };
  }
}

async function saveLayout(layout: Layout, c?: Queryable) {
  await q(
    "insert into settings (key, value) values ('discord_layout', $1) on conflict (key) do update set value = excluded.value",
    [JSON.stringify(layout)],
    c,
  );
}

const P = { VIEW: 1024, SEND: 2048, EMBED: 16384, ATTACH: 32768, HISTORY: 65536, MANAGE_MESSAGES: 8192, REACT: 64, THREADS_PUB: 34359738368, THREADS_PRIV: 68719476736, SEND_THREADS: 274877906944 };

/**
 * Creates whatever is missing: roles, the RL ARENA category and its channels, and the
 * live boards. Never renames or deletes anything that already exists. Safe to re-run.
 */
export async function setupServer(): Promise<{ createdRoles: number; createdChannels: number }> {
  const s = await getDiscordSettings();
  if (!s.guildId) throw new DiscordError(0, "guild not set");
  const t = makeT(s.locale, DICTS[s.locale]);
  const layout = await getLayout();
  const botId = discordEnv().clientId;

  // Roles
  const roles = await discordApi<{ id: string; name: string }[]>(`/guilds/${s.guildId}/roles`);
  let createdRoles = 0;
  for (const def of ROLE_DEFS) {
    if (def.key === "participant" && s.participantRole && roles.some((r) => r.id === s.participantRole)) {
      layout.roles.participant = s.participantRole;
      continue;
    }
    const known = layout.roles[def.key];
    if (known && roles.some((r) => r.id === known)) continue;
    const name = def.name(t);
    const existing = roles.find((r) => r.name === name);
    if (existing) {
      layout.roles[def.key] = existing.id;
      continue;
    }
    const role = await discordApi<{ id: string }>(`/guilds/${s.guildId}/roles`, {
      method: "POST",
      body: { name, color: def.color, hoist: !!def.hoist, mentionable: false, permissions: "0" },
    });
    layout.roles[def.key] = role.id;
    createdRoles++;
  }
  if (layout.roles.participant && layout.roles.participant !== s.participantRole) {
    await q("insert into settings (key, value) values ('discord_participant_role', $1) on conflict (key) do update set value = excluded.value", [layout.roles.participant]);
  }
  await saveLayout(layout);

  // Channels
  const channels = await discordApi<{ id: string; name: string; type: number; parent_id: string | null }[]>(`/guilds/${s.guildId}/channels`);
  const names = CHANNEL_NAMES[s.locale];
  let createdChannels = 0;
  const readOnly = [
    { id: s.guildId, type: 0, deny: String(P.SEND | P.THREADS_PUB | P.THREADS_PRIV | P.SEND_THREADS), allow: String(P.VIEW | P.HISTORY | P.REACT) },
    { id: botId, type: 1, allow: String(P.VIEW | P.SEND | P.EMBED | P.ATTACH | P.HISTORY | P.MANAGE_MESSAGES), deny: "0" },
  ];
  const ensure = async (key: ChannelKey, type: number, extra: Record<string, unknown>) => {
    const known = layout.channels[key];
    if (known && channels.some((ch) => ch.id === known)) return known;
    const existing = channels.find((ch) => ch.name === names[key] && ch.type === type);
    if (existing) return (layout.channels[key] = existing.id);
    const ch = await discordApi<{ id: string }>(`/guilds/${s.guildId}/channels`, { method: "POST", body: { name: names[key], type, ...extra } });
    createdChannels++;
    return (layout.channels[key] = ch.id);
  };
  const category = await ensure("category", 4, { position: 0 });
  await ensure("results", 0, { parent_id: category, topic: t(CHANNEL_TOPICS.results), permission_overwrites: readOnly });
  await ensure("rating", 0, { parent_id: category, topic: t(CHANNEL_TOPICS.rating), permission_overwrites: readOnly });
  await ensure("hall", 0, { parent_id: category, topic: t(CHANNEL_TOPICS.hall), permission_overwrites: readOnly });
  await ensure("bot", 0, { parent_id: category, topic: t(CHANNEL_TOPICS.bot) });
  await saveLayout(layout);

  // Results go to the new channel unless the admin already picked one.
  if (!s.resultsChannel && layout.channels.results) {
    await q("insert into settings (key, value) values ('discord_results_channel', $1) on conflict (key) do update set value = excluded.value", [layout.channels.results]);
  }

  await enqueueBoard(undefined, layout.channels.rating!, "rating");
  await enqueueBoard(undefined, layout.channels.hall!, "hall");
  await enqueueBoard(undefined, layout.channels.bot!, "guide");
  await syncRoles();
  return { createdRoles, createdChannels };
}

// ---------------------------------------------------------------- roles

type Desired = { id: string; discord_id: string; discord_roles: string[]; best_rating: number | null; champion: boolean; reign_1v1: boolean; reign_2v2: boolean; top10: boolean };

/** Works out every linked player's titles and rank, then queues only the role changes. */
export async function syncRoles(c?: Queryable): Promise<number> {
  const s = await getDiscordSettings(c);
  const layout = await getLayout(c);
  if (!s.guildId || !Object.keys(layout.roles).length) return 0;
  const rows = await q<Desired>(
    `with r as (
       select user_id, mode, ${START_RATING} + sum(delta)::int as rating, count(*)::int as games from rating_changes group by user_id, mode),
     ranked as (
       select user_id, mode, rating, rank() over (partition by mode order by rating desc) as pos from r where games >= ${CALIBRATION_GAMES}),
     champs as (
       select distinct em.user_id, c.mode, c.finished_at,
              c.id = (select c2.id from competitions c2 where c2.mode = c.mode and c2.status = 'finished' and c2.champion_entry_id is not null
                       order by c2.finished_at desc nulls last limit 1) as reigning
         from competitions c join entry_members em on em.entry_id = c.champion_entry_id and em.active
        where c.status = 'finished')
     select u.id, u.discord_id, u.discord_roles,
            (select max(rating) from ranked where ranked.user_id = u.id) as best_rating,
            exists (select 1 from champs where champs.user_id = u.id) as champion,
            exists (select 1 from champs where champs.user_id = u.id and champs.mode = '1v1' and champs.reigning) as reign_1v1,
            exists (select 1 from champs where champs.user_id = u.id and champs.mode = '2v2' and champs.reigning) as reign_2v2,
            exists (select 1 from ranked where ranked.user_id = u.id and ranked.pos <= 10) as top10
       from users u where u.discord_id is not null`,
    [],
    c,
  );
  let changes = 0;
  for (const u of rows) {
    const want = new Set<string>();
    if (u.best_rating !== null) want.add(`tier_${tierOf(u.best_rating).key}`);
    if (u.champion) want.add("champion");
    if (u.reign_1v1) want.add("reigning_1v1");
    if (u.reign_2v2) want.add("reigning_2v2");
    if (u.top10) want.add("top10");
    const have = new Set(u.discord_roles.filter((k) => MANAGED_ROLE_KEYS.includes(k)));
    const ops: { key: string; op: "add" | "remove" }[] = [];
    for (const k of want) if (!have.has(k)) ops.push({ key: k, op: "add" });
    for (const k of have) if (!want.has(k)) ops.push({ key: k, op: "remove" });
    if (!ops.length) continue;
    for (const { key, op } of ops) {
      const role = layout.roles[key];
      if (!role) continue;
      await q("insert into discord_outbox (kind, target, payload) values ('role', $1, $2)", [u.discord_id, JSON.stringify({ guild: s.guildId, role, op })], c);
      changes++;
    }
    await q("update users set discord_roles = $2 where id = $1", [u.id, [...want]], c);
  }
  return changes;
}

/** Takes the bot-managed roles back when a player unlinks Discord. */
export async function revokeRoles(c: Queryable | undefined, userId: string) {
  const s = await getDiscordSettings(c);
  const layout = await getLayout(c);
  const u = await one<{ discord_id: string | null; discord_roles: string[] }>("select discord_id, discord_roles from users where id = $1", [userId], c);
  if (!u?.discord_id || !s.guildId) return;
  for (const key of u.discord_roles) {
    const role = layout.roles[key];
    if (role) await q("insert into discord_outbox (kind, target, payload) values ('role', $1, $2)", [u.discord_id, JSON.stringify({ guild: s.guildId, role, op: "remove" })], c);
  }
  await q("update users set discord_roles = '{}' where id = $1", [userId], c);
}

// ---------------------------------------------------------------- hooks

/** "`+12` Nick → 1012" lines for the results post. */
export async function eloLines(c: Queryable, matchId: string): Promise<string> {
  const rows = await q<{ rl_nickname: string; before: number; delta: number }>(
    `select u.rl_nickname, r.before, r.delta from rating_changes r join users u on u.id = r.user_id
      where r.match_id = $1 order by r.delta desc, u.rl_nickname`,
    [matchId],
    c,
  );
  return rows.map((r) => `\`${r.delta > 0 ? "+" : ""}${r.delta}\` ${r.rl_nickname} → **${r.before + r.delta}**`).join("\n");
}

export async function discordAfterResult(c: Queryable, matchId: string) {
  const s = await getDiscordSettings(c);
  if (!s.guildId) return;
  const layout = await getLayout(c);
  const rating = layout.channels.rating;
  if (rating) {
    // New rank reached (or calibration finished) → a short celebration post.
    const ups = await q<{ rl_nickname: string; user_id: string; discord_id: string | null; mode: string; before: number; delta: number; games_before: number }>(
      `select u.rl_nickname, u.id as user_id, u.discord_id, r.mode, r.before, r.delta,
              (select count(*)::int from rating_changes p where p.user_id = r.user_id and p.mode = r.mode and p.id < r.id) as games_before
         from rating_changes r join users u on u.id = r.user_id where r.match_id = $1`,
      [matchId],
      c,
    );
    for (const u of ups) {
      const after = u.before + u.delta;
      const oldTier: Tier | null = u.games_before >= CALIBRATION_GAMES ? tierOf(u.before) : null;
      const newTier: Tier | null = u.games_before + 1 >= CALIBRATION_GAMES ? tierOf(after) : null;
      if (!newTier || (oldTier && newTier.min <= oldTier.min)) continue;
      await enqueueTo(c, rating, {
        title: oldTier ? "{emoji} {player} поднялся до ранга {tier}" : "{emoji} {player} получил первый ранг: {tier}",
        description: "{mode} · {rating} ELO",
        params: { emoji: TIER_EMOJI[newTier.key], player: u.rl_nickname, tier: newTier.name, mode: u.mode, rating: after },
        link: `/players/${u.user_id}`,
        color: hex(newTier.color),
      });
    }
    await enqueueBoard(c, rating, "rating");
  }
  await syncRoles(c);
}

export async function discordAfterFinish(c: Queryable, competitionId: string) {
  const s = await getDiscordSettings(c);
  if (!s.guildId) return;
  const layout = await getLayout(c);
  const hall = layout.channels.hall;
  if (hall) {
    const champ = await one<{ comp: string; slug: string; mode: string; team: string; players: string }>(
      `select c.name as comp, c.slug, c.mode, e.name as team,
              (select string_agg(u.rl_nickname, ', ') from entry_members em join users u on u.id = em.user_id where em.entry_id = e.id and em.active) as players
         from competitions c join entries e on e.id = c.champion_entry_id where c.id = $1`,
      [competitionId],
      c,
    );
    if (champ) {
      await enqueueTo(c, hall, {
        title: "🏆 {team} — чемпион {comp}",
        description: champ.mode === "2v2" ? "Состав: {players}" : "{mode}",
        params: { team: champ.team, comp: champ.comp, players: champ.players ?? "", mode: champ.mode },
        link: `/c/${champ.slug}`,
        color: GOLD_COLOR,
      });
    }
    await enqueueBoard(c, hall, "hall");
  }
  await syncRoles(c);
}

/** Queue a refresh of every board (used by the admin "sync" button). */
export async function refreshBoards() {
  const layout = await getLayout();
  if (layout.channels.rating) await enqueueBoard(undefined, layout.channels.rating, "rating");
  if (layout.channels.hall) await enqueueBoard(undefined, layout.channels.hall, "hall");
  if (layout.channels.bot) await enqueueBoard(undefined, layout.channels.bot, "guide");
}

// ---------------------------------------------------------------- boards

const MEDALS = ["🥇", "🥈", "🥉"];

async function ratingEmbeds(t: T): Promise<Embed[]> {
  const out: Embed[] = [];
  for (const mode of ["1v1", "2v2"] as const) {
    const rows = await q<{ id: string; rl_nickname: string; rating: number; games: number; wins: number }>(
      `select u.id, u.rl_nickname, ${START_RATING} + sum(r.delta)::int as rating, count(*)::int as games, count(*) filter (where r.delta > 0)::int as wins
         from rating_changes r join users u on u.id = r.user_id where r.mode = $1
        group by u.id, u.rl_nickname order by rating desc, games desc limit 15`,
      [mode],
    );
    const lines = rows.map((r, i) => {
      const pos = MEDALS[i] ?? `\`${String(i + 1).padStart(2, " ")}\``;
      const tier = r.games >= CALIBRATION_GAMES ? TIER_EMOJI[tierOf(r.rating).key] : "▫️";
      return `${pos} ${tier} **${r.rl_nickname}** — ${r.rating} · ${r.wins}/${r.games}`;
    });
    out.push({
      title: t("Топ рейтинга {mode}", { mode }),
      url: `${siteUrl()}/players?mode=${mode}`,
      color: mode === "1v1" ? BRAND_COLOR : GOLD_COLOR,
      description: lines.length ? lines.join("\n") : t("Рейтинг появится после первых сыгранных матчей"),
    });
  }
  const legend = [...TIERS].reverse().map((tier) => `${TIER_EMOJI[tier.key]} ${t(tier.name)}${Number.isFinite(tier.min) ? ` ${tier.min}+` : ""}`).join(" · ");
  out[out.length - 1].footer = { text: `${legend} · ▫️ ${t("калибровка")}` };
  out[out.length - 1].timestamp = new Date().toISOString();
  return out;
}

async function hallEmbeds(t: T): Promise<Embed[]> {
  const rows = await q<{ comp: string; slug: string; mode: string; season: string; team: string; players: string; finished_at: Date | null }>(
    `select c.name as comp, c.slug, c.mode, c.season, e.name as team, c.finished_at,
            (select string_agg(u.rl_nickname, ', ') from entry_members em join users u on u.id = em.user_id where em.entry_id = e.id and em.active) as players
       from competitions c join entries e on e.id = c.champion_entry_id
      where c.status = 'finished' order by c.finished_at desc nulls last limit 25`,
  );
  const kings = await q<{ rl_nickname: string; titles: number }>(
    `select u.rl_nickname, count(*)::int as titles from competitions c
       join entry_members em on em.entry_id = c.champion_entry_id and em.active join users u on u.id = em.user_id
      where c.status = 'finished' group by u.rl_nickname order by titles desc, u.rl_nickname limit 5`,
  );
  const champions = rows.map((r) => `🏆 **${r.team}**${r.mode === "2v2" && r.players ? ` (${r.players})` : ""} — [${r.comp}](${siteUrl()}/c/${r.slug})${r.season ? ` · ${r.season}` : ""}`);
  const embed: Embed = {
    title: `🏛 ${t("Зал славы")}`,
    url: `${siteUrl()}/competitions`,
    color: GOLD_COLOR,
    description: champions.length ? champions.join("\n") : t("Здесь появятся чемпионы первых турниров"),
    timestamp: new Date().toISOString(),
  };
  if (kings.length) embed.fields = [{ name: t("Больше всего титулов"), value: kings.map((k, i) => `${MEDALS[i] ?? "▫️"} ${k.rl_nickname} — ${k.titles}`).join("\n") }];
  return [embed];
}

function guideEmbeds(t: T): Embed[] {
  return [
    {
      title: `🤖 ${t("Команды бота")}`,
      color: BRAND_COLOR,
      description: [
        `**/rank** — ${t("ваш рейтинг, ранг и титулы (или другого игрока)")}`,
        `**/top** — ${t("топ рейтинга 1v1 или 2v2")}`,
        `**/h2h** — ${t("личные встречи с другим игроком")}`,
        `**/matches** — ${t("ваши ближайшие матчи")}`,
        `**/table** — ${t("таблица главного соревнования")}`,
        `**/link** — ${t("как привязать Discord к сайту")}`,
        "",
        t("Правый клик по игроку → Приложения → «RL рейтинг»."),
      ].join("\n"),
    },
    {
      title: `🎖 ${t("Роли и титулы")}`,
      color: GOLD_COLOR,
      description: [
        t("Бот выдаёт роли сам, после каждого матча:"),
        `${[...TIERS].reverse().map((tier) => TIER_EMOJI[tier.key]).join(" ")} — ${t("ранг по лучшему рейтингу (после {n} матчей)", { n: CALIBRATION_GAMES })}`,
        `🔝 ${t("Топ-10")} — ${t("десятка лучших в 1v1 или 2v2")}`,
        `🏆 ${t("Победитель турнира")} — ${t("выиграл хотя бы один турнир")}`,
        `👑 ${t("Действующий чемпион {mode}", { mode: "1v1/2v2" })} — ${t("победитель последнего турнира, переходит к следующему чемпиону")}`,
        "",
        t("Чтобы получать роли, привяжите Discord на сайте: {url}", { url: `${siteUrl()}/me` }),
      ].join("\n"),
    },
  ];
}

export async function deliverBoard(channelId: string, key: BoardKey) {
  const s = await getDiscordSettings();
  const t = makeT(s.locale, DICTS[s.locale]);
  const embeds = key === "rating" ? await ratingEmbeds(t) : key === "hall" ? await hallEmbeds(t) : guideEmbeds(t);
  const body = { embeds, allowed_mentions: { parse: [] as string[] } };
  const layout = await getLayout();
  const existing = layout.messages[key];
  if (existing) {
    try {
      await discordApi(`/channels/${channelId}/messages/${existing}`, { method: "PATCH", body });
      return;
    } catch (err) {
      if (!(err instanceof DiscordError) || err.status !== 404) throw err;
    }
  }
  const msg = await discordApi<{ id: string }>(`/channels/${channelId}/messages`, { method: "POST", body });
  // Pinning is a nicety; ignore if the bot lacks Manage Messages.
  await discordApi(`/channels/${channelId}/pins/${msg.id}`, { method: "PUT" }).catch(() => {});
  const fresh = await getLayout();
  fresh.messages[key] = msg.id;
  await saveLayout(fresh);
}

export function tierLabel(t: T, rating: number, games: number) {
  if (games < CALIBRATION_GAMES) return `▫️ ${t("Калибровка {n}/{total}", { n: games, total: CALIBRATION_GAMES })}`;
  const tier = tierOf(rating);
  return `${TIER_EMOJI[tier.key]} ${t(tier.name)}`;
}
export { hex as tierColorInt };
