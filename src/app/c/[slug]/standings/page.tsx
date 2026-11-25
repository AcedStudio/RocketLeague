import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompetitionBySlug, getStandings, getEntries, getPrizes, lastPlayedRound } from "@/lib/data";
import { getUser } from "@/lib/auth";
import { TIEBREAKER_LABELS } from "@/lib/engine/standings.ts";
import { StandingsTable } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

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
