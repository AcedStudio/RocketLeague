import { ImageResponse } from "next/og";
import { getMatch, getCompetition } from "@/lib/data";
import { entryRatings } from "@/lib/rating";
import { DICTS } from "@/lib/i18n/dicts";
import { isLocale, makeT } from "@/lib/i18n/core";
import { fmtDate, fmtDateTime, scoreOf } from "@/lib/format";
import { loadFont } from "@/lib/og";

// 1200×630 picture of a match for Discord, Telegram and Instagram:
// a result card once it's played, a "Match Day" preview before that.
// Satori layout: flexbox only, every multi-child block has display:flex.

export const revalidate = 120;

const NAVY = "#081A32";
const SKY = "#029FFC";
const CYAN = "#37BEFE";
const LIGHT = "#88EDFF";
const GOLD = "#D9AD50";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const m = await getMatch(id);
  if (!m || !m.home_entry_id || !m.away_entry_id) return new Response("Not found", { status: 404 });
  const comp = await getCompetition(m.competition_id);
  if (!comp) return new Response("Not found", { status: 404 });
  const lang = new URL(req.url).searchParams.get("lang");
  const locale = isLocale(lang) ? lang : "uz";
  const t = makeT(locale, DICTS[locale]);
  const elo = new Map((await entryRatings(comp.id)).map((r) => [r.entry_id, r.rating]));

  const done = m.status === "completed";
  const homeWon = done && m.winner_entry_id === m.home_entry_id;
  const awayWon = done && m.winner_entry_id === m.away_entry_id;
  const stage = m.stage === "league" || m.stage === "group" ? t("Тур {n}", { n: m.round }) : t("Плей-офф");
  const score = done ? (m.forfeit ? t("ТП") : scoreOf(m).join(":")) : "VS";
  const games = done && !m.forfeit && (m.games?.length ?? 0) > 1 ? m.games!.map((g) => `${g.home}–${g.away}`).join("  ") : "";
  const when = done
    ? t("Итог матча")
    : m.scheduled_at
      ? fmtDateTime(m.scheduled_at, comp.timezone, t)
      : m.play_by
        ? t("Сыграть до: {when}.", { when: fmtDate(m.play_by, comp.timezone, t) }).replace(/\.$/, "")
        : t("Время ещё не назначено");
  const home = m.home_name ?? "?";
  const away = m.away_name ?? "?";
  const ref = m.referee_name ? `⚖ ${t("Судья: {name}", { name: m.referee_name })}` : "";
  const label = done ? t("Результат") : "MATCH DAY";

  const text = `${home}${away}${comp.name}${stage}${score}${games}${when}${ref}${label}RL CHAMPIONSHIP ELO 0123456789#·:–`;
  const font = await loadFont("Unbounded", 800, text);
  const nameSize = (s: string) => (s.length > 14 ? 40 : s.length > 10 ? 48 : 56);

  const side = (name: string, entryId: string, won: boolean, lost: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 400, opacity: lost ? 0.6 : 1 }}>
      <div
        style={{
          display: "flex",
          width: 150,
          height: 150,
          borderRadius: 40,
          alignItems: "center",
          justifyContent: "center",
          fontSize: 84,
          color: won ? NAVY : "#ffffff",
          backgroundImage: won ? `linear-gradient(135deg, ${GOLD}, #f4d98c)` : `linear-gradient(135deg, ${SKY}, ${CYAN})`,
          boxShadow: won ? `0 0 60px ${GOLD}88` : `0 0 50px ${SKY}66`,
        }}
      >
        {name.slice(0, 1).toUpperCase()}
      </div>
      <div style={{ display: "flex", marginTop: 26, fontSize: nameSize(name), color: won ? GOLD : "#ffffff", textAlign: "center" }}>{name.slice(0, 18)}</div>
      <div style={{ display: "flex", marginTop: 8, fontSize: 24, color: LIGHT, opacity: 0.8 }}>{`ELO ${elo.get(entryId) ?? 1000}`}</div>
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "44px 56px",
          color: "#ffffff",
          fontFamily: font ? "Unbounded" : undefined,
          backgroundColor: NAVY,
          backgroundImage: `radial-gradient(circle at 18% 30%, ${SKY}55, transparent 45%), radial-gradient(circle at 82% 70%, ${CYAN}44, transparent 45%), linear-gradient(135deg, #0b2547, ${NAVY})`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 30, color: "#ffffff" }}>{comp.name}</div>
            <div style={{ display: "flex", fontSize: 22, color: LIGHT, marginTop: 6 }}>{`${stage} · #${m.number}`}</div>
          </div>
          <div style={{ display: "flex", padding: "12px 22px", borderRadius: 999, fontSize: 22, color: done ? NAVY : "#ffffff", backgroundColor: done ? GOLD : SKY }}>{label}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {side(home, m.home_entry_id, homeWon, awayWon)}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", fontSize: done ? 120 : 96, color: done ? "#ffffff" : LIGHT, letterSpacing: -2 }}>{score}</div>
            {games ? <div style={{ display: "flex", fontSize: 22, color: LIGHT, marginTop: 6 }}>{games}</div> : null}
          </div>
          {side(away, m.away_entry_id, awayWon, homeWon)}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 22, color: LIGHT }}>
          <div style={{ display: "flex" }}>{when}</div>
          <div style={{ display: "flex" }}>{ref}</div>
          <div style={{ display: "flex", color: "#ffffff" }}>RL CHAMPIONSHIP</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      emoji: "twemoji",
      fonts: font ? [{ name: "Unbounded", data: font, weight: 800, style: "normal" }] : undefined,
      headers: { "Cache-Control": "public, max-age=120, s-maxage=120" },
    },
  );
}
