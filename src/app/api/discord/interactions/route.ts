import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { verifyInteraction, linkedUser, siteUrl, BRAND_COLOR, GOLD_COLOR } from "@/lib/discord";
import { getFeaturedCompetition, getStandings } from "@/lib/data";
import { DICTS } from "@/lib/i18n/dicts";
import { isLocale, makeT, type Locale, type T } from "@/lib/i18n/core";
import { fmtDateTime, groupLabel } from "@/lib/format";
import { leaderboard, playerRatings } from "@/lib/rating";
import { tierOf } from "@/lib/engine/elo";

// Discord slash commands over HTTP. Every request is signature-checked with the app's public key.

type Interaction = {
  type: number;
  locale?: string;
  data?: { name: string; options?: { name: string; value: string }[] };
  member?: { user: { id: string } };
  user?: { id: string };
};

const EPHEMERAL = 64;

function reply(embeds: unknown[], ephemeral = true) {
  return NextResponse.json({ type: 4, data: { embeds, flags: ephemeral ? EPHEMERAL : 0, allowed_mentions: { parse: [] } } });
}

function localeFor(siteLocale: string | undefined, discordLocale: string | undefined): Locale {
  if (isLocale(siteLocale)) return siteLocale;
  return discordLocale?.startsWith("ru") ? "ru" : "en";
}

async function matches(t: T, userId: string) {
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
  if (!rows.length) return reply([{ title: t("Мои ближайшие матчи"), description: t("Нет предстоящих матчей"), color: BRAND_COLOR }]);
  return reply([
    {
      title: t("Мои ближайшие матчи"),
      color: BRAND_COLOR,
      fields: rows.map((m) => ({
        name: `#${m.number} · ${m.home_name ?? "?"} vs ${m.away_name ?? "?"}`,
        value: `${m.comp} · ${fmtDateTime(m.scheduled_at, m.timezone, t)}\n${siteUrl()}/match/${m.id}`,
      })),
    },
  ]);
}

async function table(t: T) {
  const comp = await getFeaturedCompetition();
  if (!comp || comp.draw_state !== "published" || comp.format === "knockout") {
    return reply([{ title: t("Таблица"), description: t("Таблица появится после жеребьёвки"), color: BRAND_COLOR }], false);
  }
  const tables = (await getStandings(comp)).slice(0, 4);
  const fields = tables.map((tb) => {
    const lines = tb.rows.slice(0, 10).map((r) => `${String(r.position).padStart(2)}. ${r.name.slice(0, 16).padEnd(16)} ${String(r.played).padStart(2)} ${String(r.points).padStart(3)}`);
    return { name: tb.group ? groupLabel(tb.group.name, t) : comp.name, value: "```\n" + lines.join("\n") + "\n```" };
  });
  return reply([{ title: comp.name, url: `${siteUrl()}/c/${comp.slug}/standings`, color: GOLD_COLOR, fields }], false);
}

async function profile(t: T, userId: string, nickname: string) {
  const r = await q<{ wins: number; played: number }>(
    `select count(*) filter (where m.winner_entry_id = em.entry_id)::int as wins, count(*)::int as played
       from entry_members em join matches m on m.status = 'completed' and not m.is_bye and em.entry_id in (m.home_entry_id, m.away_entry_id)
      where em.user_id = $1 and em.active`,
    [userId],
  );
  const s = r[0] ?? { wins: 0, played: 0 };
  const ratings = await playerRatings(userId);
  const eloField = (x: (typeof ratings)[number]) => ({
    name: `ELO ${x.mode}`,
    value: x.games ? `**${x.rating}** · ${t(tierOf(x.rating).name)}${x.rank ? ` · #${x.rank}` : ""}` : t("Ещё нет матчей"),
    inline: true,
  });
  return reply([
    {
      title: nickname,
      url: `${siteUrl()}/players/${userId}`,
      color: BRAND_COLOR,
      fields: [
        ...ratings.map(eloField),
        { name: "\u200b", value: "\u200b", inline: true },
        { name: t("Матчи"), value: String(s.played), inline: true },
        { name: t("Победы"), value: String(s.wins), inline: true },
        { name: t("Поражения"), value: String(s.played - s.wins), inline: true },
      ],
    },
  ]);
}

async function top(t: T, mode: "1v1" | "2v2") {
  const rows = await leaderboard(mode, "", 10);
  if (!rows.length) return reply([{ title: t("Топ рейтинга {mode}", { mode }), description: t("Рейтинг появится после первых сыгранных матчей"), color: GOLD_COLOR }], false);
  const medal = ["🥇", "🥈", "🥉"];
  const lines = rows.map((r, i) => `${medal[i] ?? `\`${String(i + 1).padStart(2)}.\``} **${r.rl_nickname}** — ${r.rating} · ${t(tierOf(r.rating).name)}`);
  return reply(
    [{ title: t("Топ рейтинга {mode}", { mode }), url: `${siteUrl()}/players?mode=${mode}`, color: GOLD_COLOR, description: lines.join("\n") }],
    false,
  );
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyInteraction(raw, req.headers.get("x-signature-ed25519"), req.headers.get("x-signature-timestamp"))) {
    return new NextResponse("invalid request signature", { status: 401 });
  }
  const body = JSON.parse(raw) as Interaction;
  if (body.type === 1) return NextResponse.json({ type: 1 }); // PING

  if (body.type === 2 && body.data) {
    const discordId = body.member?.user.id ?? body.user?.id ?? "";
    const user = discordId ? await linkedUser(discordId) : null;
    const locale = localeFor(user?.locale, body.locale);
    const t = makeT(locale, DICTS[locale]);
    try {
      if (body.data.name === "table") return await table(t);
      if (body.data.name === "top") return await top(t, body.data.options?.find((o) => o.name === "mode")?.value === "2v2" ? "2v2" : "1v1");
      if (!user) {
        return reply([{ title: t("Discord не привязан"), description: t("Привяжите Discord в профиле на сайте: {url}", { url: `${siteUrl()}/me` }), color: BRAND_COLOR }]);
      }
      if (body.data.name === "matches") return await matches(t, user.id);
      if (body.data.name === "profile") return await profile(t, user.id, user.rl_nickname);
    } catch (err) {
      console.error("[discord] interaction", err);
      return reply([{ title: t("Что-то пошло не так. Попробуйте ещё раз."), color: 0xff7b88 }]);
    }
  }
  return reply([{ description: "Unknown command" }]);
}
