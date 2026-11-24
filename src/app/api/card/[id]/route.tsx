import { ImageResponse } from "next/og";
import { getPlayerCard } from "@/lib/cards";
import { CARD_THEMES } from "@/components/FutCard";
import { STAT_KEYS } from "@/lib/engine/card";
import { DICTS } from "@/lib/i18n/dicts";
import { isLocale, makeT } from "@/lib/i18n/core";

// PNG of a player's FUT card, used in Discord (/rank) and for sharing.
// Rendered with satori: flexbox only, so the layout mirrors the CSS card in a simpler form.

export const revalidate = 300;

const PLATFORM_SHORT: Record<string, string> = { pc: "PC", playstation: "PS", xbox: "XB" };

/** Loads only the glyphs we need from Google Fonts (TTF, which satori can read). */
async function loadFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&text=${encodeURIComponent(text)}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const card = await getPlayerCard(id);
  if (!card) return new Response("Not found", { status: 404 });
  const lang = new URL(req.url).searchParams.get("lang");
  const locale = isLocale(lang) ? lang : "uz";
  const t = makeT(locale, DICTS[locale]);

  const theme = CARD_THEMES[card.tier?.key ?? "calib"];
  const tierName = card.tier ? t(card.tier.name) : t("Калибровка {n}/{total}", { n: card.ratedGames, total: 5 });
  const titles = `${card.titles ? `🏆${card.titles > 1 ? `×${card.titles}` : ""}` : ""}${card.reigning.map((m) => ` 👑${m}`).join("")}`;
  const text = `${card.nickname}${card.nickname.toUpperCase()}${tierName}0123456789 ×:/OVRATKDEFWINCLUFRMEXPPSXBC1v2`;
  const font = await loadFont("Unbounded", 800, text);

  const W = 400;
  return new ImageResponse(
    (
      <div style={{ width: W, height: 560, display: "flex", background: "transparent" }}>
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            padding: "34px 38px 40px",
            borderRadius: 34,
            color: theme.ink,
            backgroundImage: `radial-gradient(circle at 30% 0%, rgba(255,255,255,0.55), rgba(255,255,255,0) 55%), linear-gradient(160deg, ${theme.c1}, ${theme.c2})`,
            fontFamily: font ? "Unbounded" : undefined,
            border: `4px solid ${theme.c1}`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ display: "flex", fontSize: 84, fontWeight: 800, lineHeight: 0.95 }}>{card.stats.ovr}</div>
              <div style={{ display: "flex", fontSize: 24, fontWeight: 800, opacity: 0.9 }}>{card.mode}</div>
              <div style={{ display: "flex", fontSize: 22, fontWeight: 800, opacity: 0.8 }}>{PLATFORM_SHORT[card.platform] ?? card.platform}</div>
            </div>
            <div style={{ display: "flex", width: 58, height: 58, marginTop: 8, borderRadius: 14, transform: "rotate(45deg)", backgroundImage: `linear-gradient(135deg, #ffffff, ${theme.c1} 40%, ${theme.c2})`, border: "3px solid rgba(0,0,0,0.2)" }} />
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 150, fontWeight: 800, opacity: 0.18 }}>
            {card.nickname.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ display: "flex", justifyContent: "center", fontSize: 32, fontWeight: 800, paddingBottom: 10, borderBottom: "2px solid rgba(0,0,0,0.18)" }}>
            {card.nickname.toUpperCase().slice(0, 16)}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", paddingTop: 14 }}>
            {STAT_KEYS.map((k) => (
              <div key={k} style={{ width: "50%", display: "flex", alignItems: "baseline", fontSize: 24, marginBottom: 4 }}>
                <span style={{ display: "flex", fontWeight: 800, width: 52, marginRight: 8 }}>{card.stats[k]}</span>
                <span style={{ fontWeight: 800, opacity: 0.8 }}>{k.toUpperCase()}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "center", fontSize: 18, fontWeight: 800, paddingTop: 10, opacity: 0.9 }}>
            {`${tierName}${titles ? `  ${titles}` : ""}`}
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: 560,
      emoji: "twemoji",
      fonts: font ? [{ name: "Unbounded", data: font, weight: 800, style: "normal" }] : undefined,
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
    },
  );
}
