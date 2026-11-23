import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompetitionBySlug, getStandings, getEntries } from "@/lib/data";
import { getUser } from "@/lib/auth";
import { TIEBREAKER_LABELS } from "@/lib/engine/standings.ts";
import { StandingsTable } from "@/components/ui";

export default async function Standings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comp = await getCompetitionBySlug(slug);
  if (!comp) notFound();
  if (comp.draw_state !== "published") {
    return (
      <div className="empty">
        <h3>Таблица появится после жеребьёвки</h3>
      </div>
    );
  }
  const [tables, user, entries] = await Promise.all([getStandings(comp), getUser(), getEntries(comp.id)]);
  const mine = user ? entries.find((e) => e.status === "confirmed" && e.members.some((m) => m.user_id === user.id))?.id ?? null : null;
  const isLeague = comp.format === "round_robin";

  return (
    <div className="stack-lg">
      {tables.map((t) => (
        <section key={t.group?.id ?? "league"} className="stack">
          <StandingsTable table={{ ...t, qualify: isLeague ? Math.min(comp.qualifiers_per_group, t.rows.length) : t.qualify }} highlight={mine} />
        </section>
      ))}
      <div className="legend">
        <span>
          <i style={{ background: "var(--accent)" }} />
          {isLeague ? "Призовая зона" : "Выход в плей-офф"}
        </span>
        <span>
          Победа {comp.points_win} · поражение {comp.points_loss} · при равенстве: {comp.tiebreakers.map((t) => TIEBREAKER_LABELS[t]).join(" → ")}
        </span>
        <Link href={`/api/export/${comp.id}/standings`}>CSV</Link>
      </div>
    </div>
  );
}
