import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listCompetitions } from "@/lib/data";
import { KIND_LABELS } from "@/lib/format";
import { CompStatusBadge, Flash, type SP } from "@/components/ui";

export default async function AdminCompetitions({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  await requireAdmin();
  const comps = await listCompetitions(true);
  return (
    <>
      <div className="row between">
        <h1 style={{ fontSize: "2rem" }}>Соревнования</h1>
        <Link href="/admin/competitions/new" className="btn">
          Новое соревнование
        </Link>
      </div>
      <Flash sp={sp} />
      {comps.length ? (
        <div className="list">
          {comps.map((c) => (
            <Link key={c.id} href={`/admin/c/${c.id}`} className="list-row">
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{c.name}</b>
                <span className="small muted" style={{ display: "block" }}>
                  {KIND_LABELS[c.kind]} · {c.mode} · {c.active_count}/{c.capacity}
                  {c.featured ? " · на главной" : ""}
                </span>
              </span>
              <CompStatusBadge status={c.status} />
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty">
          <h3>Соревнований пока нет</h3>
          <p>Создайте первую лигу или кубок.</p>
        </div>
      )}
    </>
  );
}
