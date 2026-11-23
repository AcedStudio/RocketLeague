import Link from "next/link";
import { requireReferee, isAdmin } from "@/lib/auth";
import { q, one } from "@/lib/db";
import { Flash, MatchStatusBadge, type SP } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export default async function AdminHome({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const user = await requireReferee();
  const [k, review, pendingEntries, awaiting] = await Promise.all([
    one<Record<string, number>>(
      `select (select count(*)::int from users) as players,
              (select count(*)::int from entries e join competitions c on c.id = e.competition_id where c.mode = '2v2' and e.status in ('confirmed','pending')) as teams,
              (select count(*)::int from matches where status in ('ready','live') and not is_bye) as active,
              (select count(*)::int from matches where status = 'completed' and not is_bye) as completed,
              (select count(*)::int from match_reports where status = 'pending') as pending_reports,
              (select count(*)::int from matches where status = 'under_review') as disputed,
              (select count(*)::int from entries where status = 'pending') as pending_entries,
              (select count(*)::int from entries where status = 'waitlist') as waitlist,
              (select count(*)::int from entries where status = 'incomplete') as incomplete`,
    ),
    q<{ id: string; number: number; status: "under_review"; home_name: string; away_name: string; comp: string }>(
      `select m.id, m.number, m.status, he.name as home_name, ae.name as away_name, c.name as comp
         from matches m join competitions c on c.id = m.competition_id
         left join entries he on he.id = m.home_entry_id left join entries ae on ae.id = m.away_entry_id
        where m.status = 'under_review' order by m.updated_at`,
    ),
    q<{ id: string; competition_id: string; name: string; comp: string }>(
      "select e.id, e.competition_id, e.name, c.name as comp from entries e join competitions c on c.id = e.competition_id where e.status = 'pending' order by e.created_at limit 20",
    ),
    q<{ id: string; number: number; status: "ready"; home_name: string; away_name: string; comp: string }>(
      `select distinct on (m.id) m.id, m.number, m.status, he.name as home_name, ae.name as away_name, c.name as comp
         from match_reports r join matches m on m.id = r.match_id join competitions c on c.id = m.competition_id
         left join entries he on he.id = m.home_entry_id left join entries ae on ae.id = m.away_entry_id
        where r.status = 'pending' and r.created_at < now() - interval '12 hours' limit 20`,
    ),
  ]);

  const kpis: [string, number, boolean?][] = [
    [t("Игроков"), k?.players ?? 0],
    [t("Команд 2v2"), k?.teams ?? 0],
    [t("Активных матчей"), k?.active ?? 0],
    [t("Сыграно матчей"), k?.completed ?? 0],
    [t("Ждут подтверждения"), k?.pending_reports ?? 0],
    [t("Споров"), k?.disputed ?? 0, (k?.disputed ?? 0) > 0],
    [t("Заявок на проверке"), k?.pending_entries ?? 0, (k?.pending_entries ?? 0) > 0],
    [t("В листе ожидания"), k?.waitlist ?? 0],
    [t("Неполных команд"), k?.incomplete ?? 0],
  ];

  return (
    <>
      <h1 style={{ fontSize: "2rem" }}>{t("Обзор")}</h1>
      <Flash sp={sp} />
      <div className="kpis">
        {kpis.map(([label, n, alert]) => (
          <div key={label} className={`kpi ${alert ? "alert" : ""}`}>
            <b className="num">{n}</b>
            <span>{t(label)}</span>
          </div>
        ))}
      </div>

      <section className="stack">
        <h2 style={{ fontSize: "1.3rem" }}>{t("Споры")}</h2>
        {review.length ? (
          <div className="list">
            {review.map((m) => (
              <Link key={m.id} href={`/match/${m.id}`} className="list-row">
                <span style={{ flex: 1 }}>
                  <b>
                    #{m.number} {m.home_name} vs {m.away_name}
                  </b>
                  <span className="small muted" style={{ display: "block" }}>{m.comp}</span>
                </span>
                <MatchStatusBadge status={m.status} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty">{t("Открытых споров нет")}</div>
        )}
      </section>

      {awaiting.length > 0 && (
        <section className="stack">
          <h2 style={{ fontSize: "1.3rem" }}>{t("Результаты без ответа больше 12 часов")}</h2>
          <div className="list">
            {awaiting.map((m) => (
              <Link key={m.id} href={`/match/${m.id}`} className="list-row">
                <b style={{ flex: 1 }}>
                  #{m.number} {m.home_name} vs {m.away_name}
                </b>
                <span className="small muted">{m.comp}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {isAdmin(user.role) && pendingEntries.length > 0 && (
        <section className="stack">
          <h2 style={{ fontSize: "1.3rem" }}>{t("Заявки на проверке")}</h2>
          <div className="list">
            {pendingEntries.map((e) => (
              <Link key={e.id} href={`/admin/c/${e.competition_id}?tab=participants`} className="list-row">
                <b style={{ flex: 1 }}>{e.name}</b>
                <span className="small muted">{e.comp}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
