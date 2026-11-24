import { NextResponse, after } from "next/server";
import { q, one } from "@/lib/db";
import { verifyInteraction, linkedUser, siteUrl, discordEnv, getDiscordSettings, BRAND_COLOR, GOLD_COLOR, type Embed } from "@/lib/discord";
import { TIER_EMOJI, CALIBRATION_GAMES, tierLabel, tierColorInt } from "@/lib/discord-server";
import { getFeaturedCompetition, getStandings } from "@/lib/data";
import { leaderboard, playerRatings } from "@/lib/rating";
import { tierOf } from "@/lib/engine/elo";
import { DICTS } from "@/lib/i18n/dicts";
import { isLocale, makeT, type Locale, type T } from "@/lib/i18n/core";
import { fmtDateTime, groupLabel, renderStored } from "@/lib/format";
import { respondProposal, checkIn, sweep } from "@/lib/scheduling";
import { FormError } from "@/lib/errors";

// Discord slash commands over HTTP. Every request is signature-checked with the app's public key.
// Commands are answered in two steps: an instant "thinking…" acknowledgement (Discord allows
// only 3 s), then the real answer is edited in after the database work — so a cold start never
// produces "The application did not respond".

export const maxDuration = 30;

type DUser = { id: string; username: string; global_name?: string | null; avatar?: string | null };
type Interaction = {
  type: number;
  token: string;
  locale?: string;
  data?: {
    custom_id?: string;
    name: string;
    type?: number;
    target_id?: string;
    options?: { name: string; value: string }[];
    resolved?: { users?: Record<string, DUser> };
  };
  member?: { user: DUser };
  user?: DUser;
  message?: { embeds?: Embed[] };
};
type Answer = { embeds: Embed[]; components?: unknown[] };

const EPHEMERAL = 64;
const RED = 0xff7b88;

const avatarUrl = (u?: DUser) => (u?.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : undefined);
const one_ = (t: T, title: string, description?: string, color = BRAND_COLOR): Answer => ({ embeds: [{ title, description, color }] });

function notLinked(t: T, self: boolean): Answer {
  return one_(
    t,
    self ? t("Discord не привязан") : t("Игрок не привязал Discord к сайту"),
    self ? t("Привяжите Discord в профиле на сайте: {url}", { url: `${siteUrl()}/me` }) : undefined,
    RED,
  );
}

// ---------------------------------------------------------------- commands

async function rank(t: T, discordUser: DUser, self: boolean): Promise<Answer> {
  const u = await linkedUser(discordUser.id);
  if (!u) return notLinked(t, self);
  const [ratings, record, form, titles] = await Promise.all([
    playerRatings(u.id),
    one<{ wins: number; played: number }>(
      `select count(*) filter (where m.winner_entry_id = em.entry_id)::int as wins, count(*)::int as played
         from entry_members em join matches m on m.status = 'completed' and not m.is_bye and em.entry_id in (m.home_entry_id, m.away_entry_id)
        where em.user_id = $1 and em.active`,
      [u.id],
    ),
    q<{ won: boolean }>(
      `select m.winner_entry_id = em.entry_id as won
         from entry_members em join matches m on m.status = 'completed' and not m.is_bye and em.entry_id in (m.home_entry_id, m.away_entry_id)
        where em.user_id = $1 and em.active order by coalesce(m.completed_at, m.updated_at) desc limit 5`,
      [u.id],
    ),
    q<{ mode: string; reigning: boolean }>(
      `select c.mode, c.id = (select c2.id from competitions c2 where c2.mode = c.mode and c2.status = 'finished' and c2.champion_entry_id is not null
                              order by c2.finished_at desc nulls last limit 1) as reigning
         from competitions c join entry_members em on em.entry_id = c.champion_entry_id and em.active
        where c.status = 'finished' and em.user_id = $1`,
      [u.id],
    ),
  ]);
  const rated = ratings.filter((r) => r.games >= CALIBRATION_GAMES);
  const best = rated.length ? Math.max(...rated.map((r) => r.rating)) : null;
  const fields = ratings.map((r) => ({
    name: `ELO ${r.mode}`,
    value: r.games
      ? `**${r.rating}** · ${tierLabel(t, r.rating, r.games)}\n${r.rank ? `#${r.rank} · ` : ""}${t("пик")} ${r.peak} · ${t("{n} матчей", { n: r.games })}`
      : t("Ещё нет матчей"),
    inline: true,
  }));
  const s = record ?? { wins: 0, played: 0 };
  fields.push({
    name: t("Матчи"),
    value: `${s.wins}–${s.played - s.wins}${s.played ? ` · ${Math.round((s.wins / s.played) * 100)}%` : ""}${form.length ? `\n${[...form].reverse().map((f) => (f.won ? "🟩" : "🟥")).join("")}` : ""}`,
    inline: false,
  });
  if (titles.length) {
    const reign = titles.filter((x) => x.reigning).map((x) => `👑 ${t("Действующий чемпион {mode}", { mode: x.mode })}`);
    fields.push({ name: t("Титулы"), value: [`🏆 × ${titles.length}`, ...reign].join("\n"), inline: false });
  }
  return {
    embeds: [
      {
        title: `${best !== null ? TIER_EMOJI[tierOf(best).key] + " " : ""}${u.rl_nickname}`,
        url: `${siteUrl()}/players/${u.id}`,
        color: best !== null ? tierColorInt(tierOf(best).color) : BRAND_COLOR,
        thumbnail: avatarUrl(discordUser) ? { url: avatarUrl(discordUser)! } : undefined,
        // FUT card picture; the version part makes Discord refetch it after every match.
        image: { url: `${siteUrl()}/api/card/${u.id}?lang=${t.locale}&v=${ratings.map((r) => `${r.rating}.${r.games}`).join("-")}` },
        fields,
      },
    ],
  };
}

async function top(t: T, mode: "1v1" | "2v2"): Promise<Answer> {
  const rows = await leaderboard(mode, "", 10);
  if (!rows.length) return one_(t, t("Топ рейтинга {mode}", { mode }), t("Рейтинг появится после первых сыгранных матчей"), GOLD_COLOR);
  const medal = ["🥇", "🥈", "🥉"];
  const lines = rows.map((r, i) => `${medal[i] ?? `\`${String(i + 1).padStart(2)}\``} **${r.rl_nickname}** — ${r.rating} · ${tierLabel(t, r.rating, r.games)}`);
  return { embeds: [{ title: t("Топ рейтинга {mode}", { mode }), url: `${siteUrl()}/players?mode=${mode}`, color: GOLD_COLOR, description: lines.join("\n") }] };
}

async function h2h(t: T, me: DUser, opponent: DUser): Promise<Answer> {
  const [a, b] = await Promise.all([linkedUser(me.id), linkedUser(opponent.id)]);
  if (!a) return notLinked(t, true);
  if (!b) return notLinked(t, false);
  if (a.id === b.id) return one_(t, t("Выберите другого игрока"), undefined, RED);
  const rows = await q<{ id: string; a_won: boolean; home_name: string; away_name: string; home_wins: number; away_wins: number; forfeit: boolean; comp: string }>(
    `with ea as (select entry_id from entry_members where user_id = $1 and active),
          eb as (select entry_id from entry_members where user_id = $2 and active)
     select m.id, m.winner_entry_id in (select entry_id from ea) as a_won, he.name as home_name, ae.name as away_name,
            m.home_wins, m.away_wins, m.forfeit, c.name as comp
       from matches m join competitions c on c.id = m.competition_id
       join entries he on he.id = m.home_entry_id join entries ae on ae.id = m.away_entry_id
      where m.status = 'completed' and not m.is_bye
        and ((m.home_entry_id in (select entry_id from ea) and m.away_entry_id in (select entry_id from eb))
          or (m.home_entry_id in (select entry_id from eb) and m.away_entry_id in (select entry_id from ea)))
      order by coalesce(m.completed_at, m.updated_at) desc`,
    [a.id, b.id],
  );
  const title = `⚔️ ${a.rl_nickname} vs ${b.rl_nickname}`;
  if (!rows.length) return one_(t, title, t("Они ещё не встречались"));
  const aw = rows.filter((r) => r.a_won).length;
  const last = rows.slice(0, 5).map((r) => `${r.a_won ? "🟩" : "🟥"} ${r.home_name} ${r.forfeit ? t("ТП") : `${r.home_wins}:${r.away_wins}`} ${r.away_name} · ${r.comp} · [#](${siteUrl()}/match/${r.id})`);
  return {
    embeds: [
      {
        title,
        color: aw > rows.length - aw ? 0x43d9a0 : aw < rows.length - aw ? RED : BRAND_COLOR,
        description: `## ${aw} : ${rows.length - aw}\n${t("Встреч: {n}", { n: rows.length })}\n\n${last.join("\n")}`,
      },
    ],
  };
}

async function matches(t: T, userId: string): Promise<Answer> {
  const rows = await q<{ id: string; number: number; scheduled_at: Date | null; home_name: string | null; away_name: string | null; comp: string; timezone: string }>(
    `select m.id, m.number, m.scheduled_at, he.name as home_name, ae.name as away_name, c.name as comp, c.timezone
       from matches m join competitions c on c.id = m.competition_id
       left join entries he on he.id = m.home_entry_id left join entries ae on ae.id = m.away_entry_id
      where c.draw_state = 'published' and m.status <> 'completed' and not m.is_bye
        and (m.home_entry_id in (select entry_id from entry_members where user_id = $1 and active)
          or m.away_entry_id in (select entry_id from entry_members where user_id = $1 and active))
      order by m.scheduled_at nulls last, m.number limit 6`,
    [userId],
  );
  if (!rows.length) return one_(t, t("Мои ближайшие матчи"), t("Нет предстоящих матчей"));
  return {
    embeds: [
      {
        title: t("Мои ближайшие матчи"),
        color: BRAND_COLOR,
        fields: rows.map((m) => ({
          name: `#${m.number} · ${m.home_name ?? "?"} vs ${m.away_name ?? "?"}`,
          value: `${m.comp} · ${fmtDateTime(m.scheduled_at, m.timezone, t)}\n${siteUrl()}/match/${m.id}`,
        })),
      },
    ],
  };
}

async function table(t: T): Promise<Answer> {
  const comp = await getFeaturedCompetition();
  if (!comp || comp.draw_state !== "published" || comp.format === "knockout") return one_(t, t("Таблица"), t("Таблица появится после жеребьёвки"));
  const tables = (await getStandings(comp)).slice(0, 4);
  const fields = tables.map((tb) => {
    const lines = tb.rows.slice(0, 10).map((r) => `${String(r.position).padStart(2)}. ${r.name.slice(0, 16).padEnd(16)} ${String(r.played).padStart(2)} ${String(r.points).padStart(3)}`);
    return { name: tb.group ? groupLabel(tb.group.name, t) : comp.name, value: "```\n" + lines.join("\n") + "\n```" };
  });
  return { embeds: [{ title: comp.name, url: `${siteUrl()}/c/${comp.slug}/standings`, color: GOLD_COLOR, fields }] };
}

async function link(t: T, discordId: string): Promise<Answer> {
  const u = await linkedUser(discordId);
  if (u) return one_(t, t("Привязан: {name}", { name: u.rl_nickname }), `${siteUrl()}/players/${u.id}`, 0x43d9a0);
  return one_(t, t("Привязать Discord"), t("Привяжите Discord в профиле на сайте: {url}", { url: `${siteUrl()}/me` }));
}

// ---------------------------------------------------------------- dispatch

async function answer(body: Interaction, t: T): Promise<Answer> {
  const d = body.data!;
  const invoker = (body.member?.user ?? body.user)!;
  const opt = (n: string) => d.options?.find((o) => o.name === n)?.value;
  const resolve = (id: string | undefined) => (id ? d.resolved?.users?.[id] ?? { id, username: "" } : undefined);

  if (d.type === 2) {
    const target = resolve(d.target_id) ?? invoker;
    return rank(t, target, target.id === invoker.id);
  }
  switch (d.name) {
    case "rank": {
      const target = resolve(opt("player")) ?? invoker;
      return rank(t, target, target.id === invoker.id);
    }
    case "profile":
      return rank(t, invoker, true);
    case "top":
      return top(t, opt("mode") === "2v2" ? "2v2" : "1v1");
    case "h2h":
      return h2h(t, invoker, resolve(opt("opponent"))!);
    case "table":
      return table(t);
    case "link":
      return link(t, invoker.id);
    case "matches": {
      const u = await linkedUser(invoker.id);
      return u ? matches(t, u.id) : notLinked(t, true);
    }
  }
  return { embeds: [{ description: "Unknown command" }] };
}

async function localeFor(discordId: string | undefined, discordLocale: string | undefined): Promise<Locale> {
  const u = discordId ? await linkedUser(discordId) : null;
  if (u && isLocale(u.locale)) return u.locale;
  if (discordLocale?.startsWith("ru")) return "ru";
  return (await getDiscordSettings()).locale;
}

async function editOriginal(token: string, payload: Answer) {
  const res = await fetch(`https://discord.com/api/v10/webhooks/${discordEnv().clientId}/${token}/messages/@original`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }),
  });
  if (!res.ok) console.error("[discord] edit original", res.status, await res.text());
}

const PRIVATE = new Set(["matches", "link"]);

/** Buttons in DMs: accept/decline a proposed time, "I'm here". Replies by editing that DM. */
async function component(body: Interaction, t: T): Promise<Answer> {
  const invoker = (body.member?.user ?? body.user)!;
  const u = await linkedUser(invoker.id);
  if (!u) return notLinked(t, true);
  const [kind, id] = String(body.data?.custom_id ?? "").split(":");
  if (!/^[0-9a-f-]{36}$/i.test(id ?? "")) return one_(t, "?", undefined, RED);
  try {
    const msg =
      kind === "acc" ? await respondProposal(id, u.id, true) : kind === "dec" ? await respondProposal(id, u.id, false) : kind === "in" ? await checkIn(id, u.id) : "?";
    return one_(t, `✅ ${t(msg)}`, undefined, 0x43d9a0);
  } catch (err) {
    if (err instanceof FormError) return one_(t, renderStored(t, err.message, err.params ?? {}), undefined, RED);
    throw err;
  }
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyInteraction(raw, req.headers.get("x-signature-ed25519"), req.headers.get("x-signature-timestamp"))) {
    return new NextResponse("invalid request signature", { status: 401 });
  }
  const body = JSON.parse(raw) as Interaction;
  if (body.type === 1) return NextResponse.json({ type: 1 }); // PING
  if ((body.type !== 2 && body.type !== 3) || !body.data) return NextResponse.json({ type: 4, data: { content: "Unknown interaction", flags: EPHEMERAL } });
  const isButton = body.type === 3;

  after(async () => {
    const invoker = body.member?.user ?? body.user;
    let t: T;
    try {
      const locale = await localeFor(invoker?.id, body.locale);
      t = makeT(locale, DICTS[locale]);
    } catch {
      t = makeT("ru", DICTS.ru);
    }
    try {
      if (isButton) {
        // Keep the original message, add the outcome below it, remove the buttons.
        const res = await component(body, t);
        await editOriginal(body.token, { embeds: [...(body.message?.embeds ?? []).slice(0, 1), ...res.embeds], components: [] } as Answer);
      } else {
        await editOriginal(body.token, await answer(body, t));
      }
      await sweep().catch(() => {});
    } catch (err) {
      console.error("[discord] interaction", err);
      await editOriginal(body.token, one_(t, t("Что-то пошло не так. Попробуйте ещё раз."), undefined, RED));
    }
  });
  // Type 6 (buttons): acknowledge and edit the message later. Type 5 (commands): "Bot is thinking…".
  if (isButton) return NextResponse.json({ type: 6 });
  return NextResponse.json({ type: 5, data: { flags: PRIVATE.has(body.data.name) ? EPHEMERAL : 0 } });
}
