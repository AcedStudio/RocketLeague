import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompetitionBySlug, getStandings, getEntries, getPrizes, lastPlayedRound } from "@/lib/data";
import { getUser } from "@/lib/auth";
import { TIEBREAKER_LABELS } from "@/lib/engine/standings.ts";
import { StandingsTable } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { leagueOdds } from "@/lib/odds";

export default async function Standings({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getT();
  const { slug } = await params;
  const comp = await getCompetitionBySlug(slug);
  if (!comp) notFound();
  if (comp.draw_state !== "published") {
    return (
      <div className="empty">
        <h3>{t("Таблица появится после жеребьёвки")}</h3>
      </div>
    );
  }
  const [tables, user, entries, prizes, lastRound] = await Promise.all([getStandings(comp), getUser(), getEntries(comp.id), getPrizes(comp.id), lastPlayedRound(comp.id)]);
  const mine = user ? entries.find((e) => e.status === "confirmed" && e.members.some((m) => m.user_id === user.id))?.id ?? null : null;
  const isLeague = comp.format === "round_robin";
  // Positions before the latest tour: arrows show how the last tour moved the table.
  const prevTables = lastRound && lastRound > 1 ? await getStandings(comp, undefined, { beforeRound: lastRound }) : null;
  const previous = prevTables ? new Map(prevTables.flatMap((tb) => tb.rows.map((r) => [r.id, r.position] as const))) : undefined;
  const prizePlaces = Math.max(0, ...prizes.map((p) => p.place ?? 0));
  const odds = isLeague ? await leagueOdds(comp) : null;
  const pct = (x: number) => (x >= 0.995 ? "99%+" : x > 0 && x < 0.005 ? "<1%" : `${Math.round(x * 100)}%`);
  const oddsRows = odds ? tables[0].rows.map((r) => ({ ...r, o: odds.odds.get(r.id)! })).filter((r) => r.o).sort((a, b) => b.o.title - a.o.title || a.o.avgPos - b.o.avgPos) : [];

  return (
    <div className="stack-lg">
      {tables.map((tbl) => (
        <section key={tbl.group?.id ?? "league"} className="stack">
          <StandingsTable
            table={{ ...tbl, qualify: isLeague ? Math.min(comp.qualifiers_per_group, tbl.rows.length) : tbl.qualify }}
            highlight={mine}
            previous={previous}
            zones={isLeague ? { champion: true, prizes: Math.max(prizePlaces, 1) } : undefined}
          />
        </section>
      ))}
      {odds && oddsRows.length > 0 && (
        <section className="panel stack odds">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h3>📈 {t("Шансы на чемпионство")}</h3>
            <span className="small faint">{t("2000 симуляций оставшихся матчей по рейтингу ELO")}</span>
          </div>
          <div className="odds-list">
            {oddsRows.map((r) => (
              <div key={r.id} className={`odds-row${r.id === mine ? " mine" : ""}${r.o.title >= 0.995 ? " sure" : ""}`}>
                <span className="odds-name">{r.name}</span>
                <span className="odds-bar" aria-hidden>
                  <i className="top" style={{ width: `${r.o.top * 100}%` }} />
                  <i className="title" style={{ width: `${r.o.title * 100}%` }} />
                </span>
                <b className="num odds-title">{pct(r.o.title)}</b>
                {odds.topN > 1 && <span className="num small muted odds-top">{pct(r.o.top)}</span>}
              </div>
            ))}
          </div>
          <div className="legend" style={{ marginTop: 0 }}>
            <span><i style={{ background: "var(--gold)" }} />{t("Шанс на титул")}</span>
            {odds.topN > 1 && <span><i style={{ background: "rgba(67, 217, 160, 0.55)" }} />{t("Шанс на призовые места (топ-{n})", { n: odds.topN })}</span>}
          </div>
        </section>
      )}
      <div className="legend">
        {isLeague ? (
          <>
            <span>
              <i style={{ background: "var(--gold)" }} />
              {t("Лидер")}
            </span>
            {prizePlaces > 1 && (
              <span>
                <i style={{ background: "var(--ok)" }} />
                {t("Призовые места")}
              </span>
            )}
          </>
        ) : (
          <span>
            <i style={{ background: "var(--accent)" }} />
            {t("Выход в плей-офф")}
          </span>
        )}
        {previous && <span>▲▼ {t("изменение после тура {n}", { n: lastRound! })}</span>}
        <span>
          {t("Победа {w} · поражение {l} · при равенстве: {tb}", { w: comp.points_win, l: comp.points_loss, tb: comp.tiebreakers.map((tb) => t(TIEBREAKER_LABELS[tb])).join(" → ") })}
        </span>
        <a href={`/api/standings-card/${comp.slug}?lang=${t.locale}&v=${lastRound ?? 0}`} target="_blank" rel="noopener">
          🖼 {t("Картинка таблицы")}
        </a>
        <Link href={`/api/export/${comp.id}/standings`}>CSV</Link>
      </div>
    </div>
  );
}
