import { ImageResponse } from "next/og";
import { getCompetitionBySlug, getStandings, lastPlayedRound, getPrizes } from "@/lib/data";
import { DICTS } from "@/lib/i18n/dicts";
import { isLocale, makeT } from "@/lib/i18n/core";
import { groupLabel } from "@/lib/format";
import { loadFont } from "@/lib/og";
import { siteUrl } from "@/lib/discord";

// Portrait picture of the league table after the latest tour (Discord, Telegram, Instagram stories).
// Satori layout: flexbox only, every multi-child block has display:flex.

export const revalidate = 120;

const NAVY = "#081A32";
const SKY = "#029FFC";
const CYAN = "#37BEFE";
const LIGHT = "#88EDFF";
const GOLD = "#D9AD50";
const UP = "#43D9A0";
const DOWN = "#FF7B88";

const W = 1080;
const ROW = 66;

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comp = await getCompetitionBySlug(slug);
  if (!comp || comp.draw_state !== "published") return new Response("Not found", { status: 404 });
  const lang = new URL(req.url).searchParams.get("lang");
  const locale = isLocale(lang) ? lang : "uz";
  const t = makeT(locale, DICTS[locale]);

  const round = await lastPlayedRound(comp.id);
  const [tables, before, prizeRows] = await Promise.all([
    getStandings(comp),
    round && round > 1 ? getStandings(comp, undefined, { beforeRound: round }) : Promise.resolve([]),
    getPrizes(comp.id),
  ]);
  const prevPos = new Map(before.flatMap((g) => g.rows.map((r) => [r.id, r.position] as const)));
  const prizes = Math.max(1, ...prizeRows.map((p) => p.place ?? 0));
  const rows = tables.reduce((s, g) => s + g.rows.length + (g.group ? 1 : 0), 0);
  const H = Math.max(1080, 330 + rows * ROW + 120);

  const subtitle = round ? t("Таблица после тура {n}", { n: round }) : t("Турнирная таблица");
  const head = [t("И"), t("В"), t("П"), t("РГ"), t("Очки")];
  const allNames = tables.flatMap((g) => [g.group ? groupLabel(g.group.name, t) : "", ...g.rows.map((r) => r.name)]).join("");
  const font = await loadFont("Unbounded", 700, `${comp.name}${subtitle}${head.join("")}${allNames}RL CHAMPIONSHIP 0123456789+-–▲▼#`);

  const cell = (v: string | number, w: number, color = "#ffffff", size = 28) => (
    <div style={{ display: "flex", width: w, justifyContent: "center", fontSize: size, color }}>{String(v)}</div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: "flex",
          flexDirection: "column",
          padding: "64px 56px 48px",
          color: "#ffffff",
          fontFamily: font ? "Unbounded" : undefined,
          backgroundColor: NAVY,
          backgroundImage: `radial-gradient(circle at 15% 0%, ${SKY}66, transparent 40%), radial-gradient(circle at 100% 100%, ${CYAN}40, transparent 45%), linear-gradient(180deg, #0b2547, ${NAVY})`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 36 }}>
          <div style={{ display: "flex", fontSize: 26, color: LIGHT, letterSpacing: 2 }}>RL CHAMPIONSHIP</div>
          <div style={{ display: "flex", fontSize: 58, marginTop: 10 }}>{comp.name}</div>
          <div style={{ display: "flex", marginTop: 14 }}>
            <div style={{ display: "flex", padding: "10px 22px", borderRadius: 999, fontSize: 24, color: NAVY, backgroundColor: GOLD }}>{subtitle}</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", height: 44, fontSize: 20, color: LIGHT, borderBottom: `2px solid ${LIGHT}33` }}>
          <div style={{ display: "flex", width: 70 }}>#</div>
          <div style={{ display: "flex", flex: 1 }} />
          {head.map((h, i) => cell(h, i === 4 ? 110 : 80, LIGHT, 20))}
        </div>

        {tables.map((g, gi) => (
          <div key={gi} style={{ display: "flex", flexDirection: "column" }}>
            {g.group ? <div style={{ display: "flex", height: ROW, alignItems: "flex-end", paddingBottom: 10, fontSize: 24, color: GOLD }}>{groupLabel(g.group.name, t)}</div> : null}
            {g.rows.map((r) => {
              const was = prevPos.get(r.id);
              const move = was ? was - r.position : 0;
              const lead = r.position === 1;
              const prize = r.position <= prizes;
              return (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    height: ROW,
                    borderBottom: `1px solid ${LIGHT}1f`,
                    backgroundColor: lead ? `${GOLD}26` : "transparent",
                    borderLeft: `6px solid ${lead ? GOLD : prize ? UP : "transparent"}`,
                    paddingLeft: 12,
                  }}
                >
                  <div style={{ display: "flex", width: 52, fontSize: 30, color: lead ? GOLD : "#ffffff" }}>{String(r.position)}</div>
                  <div style={{ display: "flex", width: 54, fontSize: 20, color: move > 0 ? UP : move < 0 ? DOWN : `${LIGHT}88` }}>
                    {move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : "–"}
                  </div>
                  <div style={{ display: "flex", flex: 1, fontSize: r.name.length > 16 ? 24 : 30, color: lead ? GOLD : "#ffffff", overflow: "hidden" }}>{r.name}</div>
                  {cell(r.played, 80)}
                  {cell(r.wins, 80)}
                  {cell(r.losses, 80)}
                  {cell(`${r.goalDiff > 0 ? "+" : ""}${r.goalDiff}`, 80, r.goalDiff > 0 ? UP : r.goalDiff < 0 ? DOWN : "#ffffff")}
                  {cell(r.points, 110, lead ? GOLD : "#ffffff", 34)}
                </div>
              );
            })}
          </div>
        ))}

        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: `${LIGHT}aa`, marginTop: 28 }}>
          <div style={{ display: "flex" }}>{siteUrl().replace(/^https?:\/\//, "")}</div>
          <div style={{ display: "flex" }}>{`#${comp.slug}`}</div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      emoji: "twemoji",
      fonts: font ? [{ name: "Unbounded", data: font, weight: 700, style: "normal" }] : undefined,
      headers: { "Cache-Control": "public, max-age=120, s-maxage=600, stale-while-revalidate=86400" },
    },
  );
}
