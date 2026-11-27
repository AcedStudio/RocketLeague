import { ImageResponse } from "next/og";
import { getCompetition } from "@/lib/data";
import { getTeamOfRound } from "@/lib/totw";
import { getPlayerCard } from "@/lib/cards";
import { DICTS } from "@/lib/i18n/dicts";
import { isLocale, makeT } from "@/lib/i18n/core";
import { loadFont } from "@/lib/og";

// "Team of the round" picture: the picked players as black-and-gold In-Form cards.
export const revalidate = 300;

const GOLD = "#D9AD50";
const PALE = "#F3D58B";

export async function GET(req: Request, { params }: { params: Promise<{ comp: string; round: string }> }) {
  const { comp: compId, round: r } = await params;
  const round = Number(r);
  if (!/^[0-9a-f-]{36}$/i.test(compId) || !Number.isInteger(round)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const stage = url.searchParams.get("stage") === "group" ? "group" : "league";
  const [comp, team] = await Promise.all([getCompetition(compId), getTeamOfRound(compId, stage, round)]);
  if (!comp || !team.length) return new Response("Not found", { status: 404 });
  const lang = url.searchParams.get("lang");
  const locale = isLocale(lang) ? lang : "uz";
  const t = makeT(locale, DICTS[locale]);
  const cards = await Promise.all(team.map((p) => getPlayerCard(p.user_id)));

  const title = t("Команда тура {n}", { n: round }).toUpperCase();
  const text = `${title}${comp.name}${team.map((p) => p.nickname + p.nickname.toUpperCase()).join("")}RL CHAMPIONSHIP IF OVR ELO 0123456789:+-·#`;
  const font = await loadFont("Unbounded", 800, text);
  const W = 1200;
  const H = 675;
  const cw = team.length > 3 ? 190 : 230;

  return new ImageResponse(
    (
      <div
        style={{
          width: W, height: H, display: "flex", flexDirection: "column", alignItems: "center", padding: "44px 40px",
          color: "#fff", fontFamily: font ? "Unbounded" : undefined,
          backgroundColor: "#07070a",
          backgroundImage: `radial-gradient(circle at 50% 0%, rgba(217,173,80,0.35), transparent 55%), radial-gradient(circle at 50% 120%, rgba(2,159,252,0.25), transparent 50%)`,
        }}
      >
        <div style={{ display: "flex", fontSize: 20, letterSpacing: 4, color: PALE }}>RL CHAMPIONSHIP · {comp.name}</div>
        <div style={{ display: "flex", fontSize: 54, marginTop: 10, color: GOLD }}>{title}</div>
        <div style={{ display: "flex", gap: 28, marginTop: 40, alignItems: "flex-end" }}>
          {team.map((p, i) => {
            const card = cards[i];
            const big = p.rank === 1;
            return (
              <div
                key={p.user_id}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", width: big ? cw + 30 : cw, height: big ? 360 : 330,
                  padding: "22px 16px", borderRadius: 22, border: `3px solid ${big ? PALE : GOLD}`,
                  backgroundImage: "linear-gradient(160deg, #3b3427, #0a0a0c 70%)",
                  boxShadow: `0 0 ${big ? 40 : 24}px rgba(217,173,80,${big ? 0.6 : 0.35})`,
                }}
              >
                <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", fontSize: big ? 58 : 50, color: PALE }}>{String(card?.stats.ovr ?? "")}</div>
                  <div style={{ display: "flex", padding: "4px 10px", borderRadius: 8, fontSize: 18, color: "#0a0a0c", backgroundColor: GOLD }}>IF</div>
                </div>
                <div style={{ display: "flex", width: 110, height: 110, marginTop: 14, borderRadius: 999, alignItems: "center", justifyContent: "center", fontSize: 56, color: "#0a0a0c", backgroundImage: `linear-gradient(135deg, #fff3c4, ${GOLD})` }}>
                  {p.nickname.slice(0, 1).toUpperCase()}
                </div>
                <div style={{ display: "flex", marginTop: 18, fontSize: p.nickname.length > 12 ? 20 : 26, color: "#fff", textAlign: "center" }}>{p.nickname}</div>
                <div style={{ display: "flex", flex: 1 }} />
                <div style={{ display: "flex", fontSize: 22, color: PALE }}>{`${p.gf}:${p.ga}`}</div>
                <div style={{ display: "flex", fontSize: 16, marginTop: 6, color: p.elo_delta >= 0 ? "#43D9A0" : "#FF7B88" }}>{`${p.elo_delta >= 0 ? "+" : ""}${p.elo_delta} ELO`}</div>
              </div>
            );
          })}
        </div>
      </div>
    ),
    { width: W, height: H, emoji: "twemoji", headers: { "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=86400" }, fonts: font ? [{ name: "Unbounded", data: font, weight: 800, style: "normal" }] : undefined },
  );
}
