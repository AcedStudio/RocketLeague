import Link from "next/link";
import { q, one, dbConfigured } from "@/lib/db";
import { SetupNotice } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Статистика") };
}
export const dynamic = "force-dynamic";

export default async function Stats() {
  const t = await getT();
  if (!dbConfigured()) return <SetupNotice />;
  const [totals, players, teams, comps] = await Promise.all([
    one<{ matches: number; goals: number; players: number; teams: number }>(
      `select (select count(*)::int from matches where status = 'completed' and not is_bye) as matches,
              (select coalesce(sum(home_goals + away_goals), 0)::int from matches where status = 'completed') as goals,
              (select count(*)::int from users) as players,
              (select count(*)::int from entries e join competitions c on c.id = e.competition_id where c.mode = '2v2' and e.status = 'confirmed') as teams`,
    ),
    q<{ id: string; rl_nickname: string; wins: number; played: number; goals: number }>(
      `select u.id, u.rl_nickname,
              count(*) filter (where m.winner_entry_id = e.id)::int as wins,
              count(*)::int as played,
              coalesce(sum(case when m.home_entry_id = e.id then m.home_goals else m.away_goals end), 0)::int as goals
         from users u join entry_members em on em.user_id = u.id and em.active
         join entries e on e.id = em.entry_id join competitions c on c.id = e.competition_id and c.mode = '1v1'
         join matches m on m.status = 'completed' and not m.is_bye and e.id in (m.home_entry_id, m.away_entry_id)
        group by u.id order by wins desc, goals desc limit 10`,
    ),
    q<{ id: string; name: string; comp: string; slug: string; wins: number; played: number }>(
      `select e.id, e.name, c.name as comp, c.slug,
              count(*) filter (where m.winner_entry_id = e.id)::int as wins, count(*)::int as played
         from entries e join competitions c on c.id = e.competition_id and c.mode = '2v2'
         join matches m on m.status = 'completed' and not m.is_bye and e.id in (m.home_entry_id, m.away_entry_id)
        group by e.id, c.name, c.slug order by wins desc limit 10`,
    ),
    q<{ name: string; slug: string; done: number; total: number }>(
      `select c.name, c.slug, count(m.*) filter (where m.status = 'completed' and not m.is_bye)::int as done, count(m.*) filter (where not m.is_bye)::int as total
         from competitions c join matches m on m.competition_id = c.id
        where c.status in ('in_progress', 'playoffs', 'finished') group by c.id order by c.status = 'finished', c.updated_at desc limit 6`,
    ),
  ]);

  return (
    <div className="wrap section stack-lg">
      <h1>{t("Статистика")}</h1>
      <div className="stat-strip">
        <div><b className="num">{totals?.matches ?? 0}</b><span>{t("матчей сыграно")}</span></div>
        <div><b className="num">{totals?.goals ?? 0}</b><span>{t("голов забито")}</span></div>
        <div><b className="num">{totals?.players ?? 0}</b><span>{t("игроков")}</span></div>
        <div><b className="num">{totals?.teams ?? 0}</b><span>{t("команд 2v2")}</span></div>
      </div>

      {comps.length > 0 && (
        <section className="stack">
          <h2 style={{ fontSize: "1.3rem" }}>{t("Прогресс соревнований")}</h2>
          <div className="list">
            {comps.map((c) => {
              const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
              return (
                <Link key={c.slug} href={`/c/${c.slug}`} className="list-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                  <span className="row between">
                    <b>{c.name}</b>
                    <span className="small muted num">{c.done}/{c.total} · {pct}%</span>
                  </span>
                  <span className="progress"><i style={{ width: `${pct}%` }} /></span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="two">
        <section className="stack">
          <h2 style={{ fontSize: "1.3rem" }}>{t("Лучшие игроки 1v1")}</h2>
          {players.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>#</th><th>{t("Игрок")}</th><th className="c">{t("Победы")}</th><th className="c">{t("Матчи")}</th><th className="c">{t("Голы")}</th></tr></thead>
                <tbody>
                  {players.map((p, i) => (
                    <tr key={p.id} className={i === 0 ? "champion" : ""}>
                      <td className="pos">{i + 1}</td>
                      <td style={{ fontWeight: 600 }}><Link href={`/players/${p.id}`}>{p.rl_nickname}</Link></td>
                      <td className="c pts">{p.wins}</td><td className="c">{p.played}</td><td className="c">{p.goals}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty">{t("Данных пока нет")}</div>}
        </section>
        <section className="stack">
          <h2 style={{ fontSize: "1.3rem" }}>{t("Лучшие команды 2v2")}</h2>
          {teams.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>#</th><th>{t("Команда")}</th><th className="c">{t("Победы")}</th><th className="c">{t("Матчи")}</th></tr></thead>
                <tbody>
                  {teams.map((t, i) => (
                    <tr key={t.id} className={i === 0 ? "champion" : ""}>
                      <td className="pos">{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{t.name}<span className="small faint" style={{ display: "block" }}>{t.comp}</span></td>
                      <td className="c pts">{t.wins}</td><td className="c">{t.played}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty">{t("Данных пока нет")}</div>}
        </section>
      </div>
    </div>
  );
}
