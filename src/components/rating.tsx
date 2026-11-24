import { tierOf, PROVISIONAL_GAMES } from "@/lib/engine/elo";
import { getT } from "@/lib/i18n/server";
import type { ModeRating } from "@/lib/rating";

const CALIBRATION_GAMES = 5;

export async function TierBadge({ rating, games }: { rating: number; games: number }) {
  const t = await getT();
  if (games < CALIBRATION_GAMES)
    return (
      <span className="tier calib" title={t("Ранг откроется после {n} матчей", { n: CALIBRATION_GAMES })}>
        <i aria-hidden />
        {t("Калибровка {n}/{total}", { n: games, total: CALIBRATION_GAMES })}
      </span>
    );
  const tier = tierOf(rating);
  return (
    <span className="tier" style={{ ["--tier" as string]: tier.color }}>
      <i aria-hidden />
      {t(tier.name)}
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
  const tier = tierOf(r.rating);
  return (
    <div className="rating-card" style={{ ["--tier" as string]: r.games ? tier.color : "var(--ink-faint)" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="muted" style={{ fontWeight: 600 }}>{t("Рейтинг {mode}", { mode: r.mode })}</span>
        <TierBadge rating={r.rating} games={r.games} />
      </div>
      <div className="big">{r.rating}</div>
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
