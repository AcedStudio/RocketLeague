import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { STAT_KEYS, type StatKey } from "@/lib/engine/card.ts";
import type { PlayerCard } from "@/lib/cards";

// Card palettes per rank tier: light/dark metal + text colour.
export const CARD_THEMES: Record<string, { c1: string; c2: string; ink: string; holo?: boolean }> = {
  calib: { c1: "#2c4569", c2: "#122340", ink: "#d6e6fb" },
  bronze: { c1: "#e8ad7a", c2: "#6e3f1d", ink: "#2b1608" },
  silver: { c1: "#f4f7fb", c2: "#8593a6", ink: "#18212d" },
  gold: { c1: "#ffe597", c2: "#b5861f", ink: "#2a1d02" },
  plat: { c1: "#d2f8ff", c2: "#3a9fc4", ink: "#062433" },
  diamond: { c1: "#6fd8ff", c2: "#1442a3", ink: "#ffffff" },
  champ: { c1: "#cfa9ff", c2: "#4f2296", ink: "#ffffff" },
  gc: { c1: "#ff8f8f", c2: "#7c0d20", ink: "#ffffff", holo: true },
  ssl: { c1: "#ffffff", c2: "#8ea6ff", ink: "#10142a", holo: true },
  // In-Form (team of the round): black and gold, like the special cards in FC.
  inform: { c1: "#3b3427", c2: "#0a0a0c", ink: "#f3d58b", holo: true },
};

export const STAT_LABELS: Record<StatKey, string> = {
  atk: "Атака: голы за игру",
  def: "Защита: пропущенные за игру",
  win: "Победы: доля выигранных серий",
  clu: "Клатч: игры с разницей в один гол",
  frm: "Форма: последние 5 матчей",
  exp: "Опыт: сыгранные матчи",
};

const PLATFORM_SHORT: Record<string, string> = { pc: "PC", playstation: "PS", xbox: "XB" };

export async function FutCard({ card, size = "lg", link = false }: { card: PlayerCard; size?: "lg" | "sm"; link?: boolean }) {
  const t = await getT();
  const key = card.inForm ? "inform" : (card.tier?.key ?? "calib");
  const theme = CARD_THEMES[key];
  const style = { "--c1": theme.c1, "--c2": theme.c2, "--ink": theme.ink } as React.CSSProperties;
  const body = (
    <div className="fut-wrap">
    <div className={`fut fut-${size}${theme.holo ? " fut-holo" : ""}${card.inForm ? " fut-inform" : ""}`} style={style} aria-label={t("Карточка игрока {name}", { name: card.nickname })}>
      <div className="fut-top">
        <div className="fut-ovr num">{card.stats.ovr}</div>
        <div className="fut-pos">{card.mode}</div>
        <div className="fut-plat">{PLATFORM_SHORT[card.platform] ?? card.platform}</div>
        <i className="fut-gem" aria-hidden />
        {card.inForm && <div className="fut-if" title={t("Команда тура {n}", { n: card.inForm.round })}>IF</div>}
      </div>
      <div className="fut-art" aria-hidden>
        <span>{card.nickname.slice(0, 1).toUpperCase()}</span>
      </div>
      <div className="fut-name">{card.nickname}</div>
      <div className="fut-stats">
        {STAT_KEYS.map((k) => (
          <div key={k} title={t(STAT_LABELS[k])}>
            <b className="num">{card.stats[k]}</b>
            <span>{k.toUpperCase()}</span>
          </div>
        ))}
      </div>
      <div className="fut-foot">
        <span>{card.inForm ? t("Команда тура {n}", { n: card.inForm.round }) : card.tier ? t(card.tier.name) : t("Калибровка {n}/{total}", { n: card.ratedGames, total: 5 })}</span>
        {(card.titles > 0 || card.reigning.length > 0 || card.tourAwards > 0) && (
          <span>
            {card.titles > 0 && `🏆${card.titles > 1 ? `×${card.titles}` : ""}`}
            {card.reigning.map((m) => ` 👑${m}`)}
            {card.tourAwards > 0 && ` ⭐${card.tourAwards > 1 ? `×${card.tourAwards}` : ""}`}
          </span>
        )}
      </div>
    </div>
    </div>
  );
  return link ? (
    <Link href={`/players/${card.id}`} className="fut-link">
      {body}
    </Link>
  ) : (
    body
  );
}
