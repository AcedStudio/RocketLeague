import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompetitionBySlug, getStandings, getEntries } from "@/lib/data";
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
  const [tables, user, entries] = await Promise.all([getStandings(comp), getUser(), getEntries(comp.id)]);
  const mine = user ? entries.find((e) => e.status === "confirmed" && e.members.some((m) => m.user_id === user.id))?.id ?? null : null;
  const isLeague = comp.format === "round_robin";

  return (
    <div className="stack-lg">
      {tables.map((tbl) => (
        <section key={tbl.group?.id ?? "league"} className="stack">
          <StandingsTable table={{ ...tbl, qualify: isLeague ? Math.min(comp.qualifiers_per_group, tbl.rows.length) : tbl.qualify }} highlight={mine} />
        </section>
      ))}
      <div className="legend">
        <span>
          <i style={{ background: "var(--accent)" }} />
          {isLeague ? t("Призовая зона") : t("Выход в плей-офф")}
        </span>
        <span>
          {t("Победа {w} · поражение {l} · при равенстве: {tb}", { w: comp.points_win, l: comp.points_loss, tb: comp.tiebreakers.map((tb) => t(TIEBREAKER_LABELS[tb])).join(" → ") })}
        </span>
        <Link href={`/api/export/${comp.id}/standings`}>CSV</Link>
      </div>
    </div>
  );
}
