import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { T } from "@/lib/i18n/core";
import type { ProStats as Stats, Result } from "@/lib/engine/prostats";
import type { activityGrid } from "@/lib/engine/prostats";

type Grid = ReturnType<typeof activityGrid>;

/** Last 10 results as chips, newest on the right. */
export function FormStrip({ form, t }: { form: Result[]; t: T }) {
  if (!form.length) return <span className="small muted">—</span>;
  return (
    <span className="form-strip" aria-label={t("Форма")}>
      {form.map((r, i) => (
        <i key={i} className={r.won ? "w" : "l"} title={`${r.gf}:${r.ga}`}>
          {r.won ? t("В") : t("П")}
        </i>
      ))}
    </span>
  );
}

/** A ring gauge 0..100. */
export function Gauge({ value, label }: { value: number; label: string }) {
  const r = 26;
  const len = 2 * Math.PI * r;
  const hue = value >= 67 ? "#5BE38C" : value >= 40 ? "#FFC83D" : "#FF6A7A";
  return (
    <span className="gauge">
      <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={hue} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(value / 100) * len} ${len}`} transform="rotate(-90 32 32)" />
      </svg>
      <b className="num">{value}</b>
      <small>{label}</small>
    </span>
  );
}

export function Heatmap({ grid, t }: { grid: Grid; t: T }) {
  return (
    <div className="heat">
      <div className="heat-scroll">
        <div className="heat-grid" role="img" aria-label={t("Активность: {n} игр за полгода", { n: grid.total })}>
          {grid.cols.map((col, i) => (
            <span key={i} className="heat-col">
              {col.map((c) => (
                <i key={c.key} className={`l${c.level}${c.future ? " f" : ""}`} title={`${c.key}: ${c.count}`} />
              ))}
            </span>
          ))}
        </div>
      </div>
      <div className="row between small muted">
        <span>{t("{n} игр · {d} активных дней за полгода", { n: grid.total, d: grid.activeDays })}</span>
        <span className="heat-legend">
          {t("меньше")} {[0, 1, 2, 3, 4].map((l) => <i key={l} className={`l${l}`} />)} {t("больше")}
        </span>
      </div>
    </div>
  );
}

export function ProPanel({
  stats,
  grid,
  chances,
  compareHref,
  t,
}: {
  stats: Stats;
  grid: Grid;
  chances: { slug: string; name: string; title: number; top: number; topN: number }[];
  compareHref: string | null;
  t: T;
}) {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <section className="stack pro" id="pro">
      <div className="row between">
        <h2 className="hall-title"><Icon name="ui-stats" size={26} /> {t("Pro-статистика")}</h2>
        {compareHref && (
          <Link href={compareHref} className="btn btn-ghost btn-sm"><Icon name="ui-duels" size={16} /> {t("Сравнить со мной")}</Link>
        )}
      </div>
      <div className="pro-grid">
        <div className="panel pro-form">
          <Gauge value={stats.formScore} label={t("форма")} />
          <div className="stack" style={{ gap: 6 }}>
            <span className="small muted">{t("Последние 10 матчей")}</span>
            <FormStrip form={stats.form} t={t} />
            <span className="small">
              {stats.streak.kind
                ? stats.streak.kind === "W"
                  ? t("Серия побед: {n}", { n: stats.streak.n })
                  : t("Серия поражений: {n}", { n: stats.streak.n })
                : t("Матчей ещё не было")}
            </span>
          </div>
        </div>
        <div className="pro-tiles">
          <div><b className="num">{pct(stats.winrate)}</b><span>{t("побед")}</span></div>
          <div><b className="num">{stats.bestStreak}</b><span>{t("лучшая серия")}</span></div>
          <div><b className="num">{stats.avgFor.toFixed(1)}</b><span>{t("голов за матч")}</span></div>
          <div><b className="num">{stats.avgAgainst.toFixed(1)}</b><span>{t("пропущено за матч")}</span></div>
          <div><b className="num">{stats.cleanSheets}</b><span>{t("сухих матчей")}</span></div>
        </div>
      </div>
      {chances.length > 0 && (
        <div className="pro-odds">
          {chances.map((c) => (
            <Link key={c.slug} href={`/c/${c.slug}`} className="pro-odd">
              <Icon name="ui-competitions" size={22} />
              <span>
                <b>{c.name}</b>
                <small className="muted">{t("Топ-{n}: {p}", { n: c.topN, p: pct(c.top) })}</small>
              </span>
              <b className="num pro-odd-v">{pct(c.title)}</b>
              <small className="muted">{t("шанс на титул")}</small>
            </Link>
          ))}
        </div>
      )}
      <div className="panel stack">
        <span className="small" style={{ fontWeight: 700 }}>{t("Активность")}</span>
        <Heatmap grid={grid} t={t} />
      </div>
    </section>
  );
}
