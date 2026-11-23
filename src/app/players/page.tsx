import Link from "next/link";
import { q, dbConfigured } from "@/lib/db";
import { PLATFORM_LABELS } from "@/lib/format";
import { pick, SetupNotice, type SP } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Игроки") };
}
export const dynamic = "force-dynamic";

export default async function Players({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  if (!dbConfigured()) return <SetupNotice />;
  const sp = await searchParams;
  const search = pick(sp, "q").slice(0, 60);
  const rows = await q<{ id: string; rl_nickname: string; platform: string; wins: number; losses: number; teams: string | null }>(
    `with mine as (select em.user_id, em.entry_id from entry_members em where em.active)
     select u.id, u.rl_nickname, u.platform,
            (select count(*)::int from matches m join mine on mine.entry_id = m.winner_entry_id where mine.user_id = u.id and m.status = 'completed' and not m.is_bye) as wins,
            (select count(*)::int from matches m join mine on mine.entry_id in (m.home_entry_id, m.away_entry_id)
              where mine.user_id = u.id and m.status = 'completed' and not m.is_bye and m.winner_entry_id <> mine.entry_id) as losses,
            (select string_agg(distinct e.name, ', ') from mine join entries e on e.id = mine.entry_id join competitions c on c.id = e.competition_id
              where mine.user_id = u.id and c.mode = '2v2') as teams
       from users u
      where $1 = '' or u.rl_nickname ilike $2 or exists (
            select 1 from entry_members em join entries e on e.id = em.entry_id where em.user_id = u.id and em.active and e.name ilike $2)
      order by wins desc, u.rl_nickname limit 100`,
    [search, `%${search}%`],
  );
  return (
    <div className="wrap section stack-lg">
      <h1>{t("Игроки и команды")}</h1>
      <form className="row" role="search">
        <input className="input" name="q" defaultValue={search} placeholder={t("Ник игрока или название команды")} style={{ maxWidth: 380 }} />
        <button className="btn btn-ghost">{t("Найти")}</button>
      </form>
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("Игрок")}</th>
                <th>{t("Платформа")}</th>
                <th>{t("Команды 2v2")}</th>
                <th className="c">{t("В")}</th>
                <th className="c">{t("П")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>
                    <Link href={`/players/${r.id}`}>{r.rl_nickname}</Link>
                  </td>
                  <td className="muted">{PLATFORM_LABELS[r.platform]}</td>
                  <td className="muted">{r.teams ?? "—"}</td>
                  <td className="c">{r.wins}</td>
                  <td className="c">{r.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">{t("Никого не нашли")}</div>
      )}
    </div>
  );
}
