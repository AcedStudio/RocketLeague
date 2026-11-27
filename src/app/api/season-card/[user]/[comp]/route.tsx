import { ImageResponse } from "next/og";
import { playerSeason } from "@/lib/wrapped";
import { DICTS } from "@/lib/i18n/dicts";
import { isLocale, makeT } from "@/lib/i18n/core";
import { loadFont } from "@/lib/og";

// Shareable "your season" picture (1080×1350, fits Instagram and Telegram).
export const revalidate = 300;

const GOLD = "#D9AD50";
const LIGHT = "#88EDFF";

export async function GET(req: Request, { params }: { params: Promise<{ user: string; comp: string }> }) {
  const { user, comp } = await params;
  if (![user, comp].every((x) => /^[0-9a-f-]{36}$/i.test(x))) return new Response("Not found", { status: 404 });
  const s = await playerSeason(user, comp);
  if (!s || !s.story.played) return new Response("Not found", { status: 404 });
  const lang = new URL(req.url).searchParams.get("lang");
  const locale = isLocale(lang) ? lang : "uz";
  const t = makeT(locale, DICTS[locale]);
  const st = s.story;

  const tiles: [string, string][] = [
    [`${st.wins}–${st.losses}`, t("Победы – поражения")],
    [`${st.goalsFor}`, t("Голы")],
    [`${s.eloChange > 0 ? "+" : ""}${s.eloChange}`, "ELO"],
    [`${st.longestStreak}`, t("Лучшая серия")],
    [`${s.playerOfRound}`, t("Игрок тура")],
    [`${s.teamOfRound}`, t("Команда тура")],
  ];
  const headline = s.champion ? t("Чемпион!") : s.position ? `#${s.position}` : "GG";
  const sub = s.position ? t("место из {n}", { n: s.players }) : "";
  const best = st.bestWin ? t("Лучший матч: {score} против {name}", { score: `${st.bestWin.gf}:${st.bestWin.ga}`, name: st.bestWin.opponent }) : "";
  const title = t("Твой сезон").toUpperCase();
  const text = `${title}${s.nickname}${s.comp.name}${headline}${sub}${best}${tiles.map((x) => x.join("")).join("")}RL CHAMPIONSHIP rlchamp.uz 0123456789#–+-:!`;
  const font = await loadFont("Unbounded", 800, text);

  return new ImageResponse(
    (
      <div
        style={{
          width: 1080, height: 1350, display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 70px",
          color: "#fff", fontFamily: font ? "Unbounded" : undefined, backgroundColor: "#081A32",
          backgroundImage: s.champion
            ? "radial-gradient(circle at 50% 0%, rgba(243,213,139,0.6), transparent 50%), linear-gradient(180deg, #3a2a08, #081A32 70%)"
            : "radial-gradient(circle at 15% 0%, rgba(2,159,252,0.65), transparent 50%), radial-gradient(circle at 100% 100%, rgba(55,190,254,0.35), transparent 50%), linear-gradient(180deg, #0b2547, #081A32)",
        }}
      >
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 6, color: LIGHT }}>RL CHAMPIONSHIP</div>
        <div style={{ display: "flex", fontSize: 40, marginTop: 30, color: s.champion ? GOLD : LIGHT }}>{title}</div>
        <div style={{ display: "flex", fontSize: 76, marginTop: 14 }}>{s.nickname}</div>
        <div style={{ display: "flex", fontSize: 28, marginTop: 8, color: "rgba(255,255,255,0.7)" }}>{s.comp.name}</div>
        <div style={{ display: "flex", fontSize: 170, marginTop: 40, color: s.champion ? GOLD : "#fff", lineHeight: 1 }}>{headline}</div>
        {sub ? <div style={{ display: "flex", fontSize: 30, marginTop: 10, color: "rgba(255,255,255,0.75)" }}>{sub}</div> : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 22, marginTop: 56, width: 940, justifyContent: "center" }}>
          {tiles.map(([v, l]) => (
            <div key={l} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 290, padding: "26px 10px", borderRadius: 26, backgroundColor: "rgba(0,0,0,0.28)", border: "2px solid rgba(136,237,255,0.18)" }}>
              <div style={{ display: "flex", fontSize: 58 }}>{v}</div>
              <div style={{ display: "flex", fontSize: 20, marginTop: 8, color: "rgba(255,255,255,0.7)" }}>{l}</div>
            </div>
          ))}
        </div>
        {best ? <div style={{ display: "flex", fontSize: 26, marginTop: 40, color: GOLD }}>{best}</div> : null}
        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", fontSize: 24, color: "rgba(255,255,255,0.55)" }}>rlchamp.uz</div>
      </div>
    ),
    { width: 1080, height: 1350, headers: { "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=86400" }, fonts: font ? [{ name: "Unbounded", data: font, weight: 800, style: "normal" }] : undefined },
  );
}
