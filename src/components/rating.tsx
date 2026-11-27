import { PROVISIONAL_GAMES } from "@/lib/engine/elo";
import { rankOf, divisionLabel, PLACEMENT_GAMES } from "@/lib/engine/ranks";
import { Icon } from "@/components/Icon";
import { getT } from "@/lib/i18n/server";
import type { ModeRating } from "@/lib/rating";

/** Rank emblem + "Gold III", or the placement counter. */
export async function TierBadge({ rating, games, size = 22 }: { rating: number; games: number; size?: number }) {
  const t = await getT();
  const r = rankOf(rating, games);
  if (!r.placed)
    return (
      <span className="rank-chip calib" title={t("Ранг откроется после {n} матчей", { n: PLACEMENT_GAMES })}>
        <Icon name="rk-unranked" size={size} />
        {t("Калибровка {n}/{total}", { n: games, total: PLACEMENT_GAMES })}
      </span>
    );
  return (
    <span className="rank-chip" style={{ ["--tier" as string]: r.tier.color }}>
      <Icon name={`rk-${r.tier.key}`} size={size} />
      {r.label}
    </span>
  );
}

export function Delta({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="faint">—</span>;
  return <span className={`delta ${value > 0 ? "up" : value < 0 ? "down" : ""}`}>{value > 0 ? `+${value}` : value}</span>;
}

function Spark({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 300, h = 56, pad = 4;
  const min = Math.min(...points), max = Math.max(...points);
  const span = Math.max(max - min, 20);
  const x = (i: number) => pad + (i * (w - pad * 2)) / (points.length - 1);
  const y = (v: number) => h - pad - ((v - min) * (h - pad * 2)) / span;
  const line = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <path className="area" d={`${line} L${x(points.length - 1)},${h} L${x(0)},${h} Z`} />
      <path className="line" d={line} />
    </svg>
  );
}

export async function RatingCard({ r, history }: { r: ModeRating; history: number[] }) {
  const t = await getT();
  const rank = rankOf(r.rating, r.games);
  return (
    <div className={`rating-card rank-card${rank.placed ? ` rk-${rank.tier.key}` : ""}`} style={{ ["--tier" as string]: rank.placed ? rank.tier.color : "var(--ink-faint)" }}>
      <div className="rank-head">
        <span className="rank-emblem"><Icon name={rank.placed ? `rk-${rank.tier.key}` : "rk-unranked"} size={72} /></span>
        <div className="rank-info">
          <span className="muted small" style={{ fontWeight: 600 }}>{t("Рейтинг {mode}", { mode: r.mode })}</span>
          <b className="rank-name">{rank.placed ? rank.tier.name : t("Калибровка")}</b>
          <span className="rank-div">{rank.placed ? (rank.division ? t("Дивизион {d}", { d: divisionLabel(rank.division) }) : t("Вершина рейтинга")) : t("Осталось матчей: {n}", { n: rank.left })}</span>
        </div>
        <div className="big">{r.rating}</div>
      </div>
      {rank.placed && rank.next && (
        <div className="rank-next">
          <span className="meter"><i style={{ width: `${Math.round(rank.progress * 100)}%` }} /></span>
          <span className="small muted">
            {t("Далее: {name} — с {at} ELO", { name: rank.next.division ? `${rank.next.tier.name} ${divisionLabel(rank.next.division)}` : rank.next.tier.name, at: rank.next.at })}
          </span>
        </div>
      )}
      <Spark points={[1000, ...history]} />
      <dl>
        <div>
          <dt>{t("Место")}</dt>
          <dd>{r.rank ? `#${r.rank}` : "—"}</dd>
        </div>
        <div>
          <dt>{t("Пик")}</dt>
          <dd>{r.peak}</dd>
        </div>
        <div>
          <dt>{t("Матчи")}</dt>
          <dd>
            {r.games}
            {r.games > 0 && r.games < PROVISIONAL_GAMES && <span className="faint small"> · {t("быстрый рост")}</span>}
          </dd>
        </div>
      </dl>
    </div>
  );
}
