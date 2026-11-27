import "server-only";
import { q } from "./db";

export type DeskMatch = {
  id: string;
  number: number;
  round: number;
  best_of: number;
  status: string;
  scheduled_at: Date | null;
  time_confirmed: boolean;
  play_by: Date | null;
  home_name: string | null;
  away_name: string | null;
  comp: string;
  slug: string;
  timezone: string;
  shots: number;
  reports: number;
  referee_user_id: string | null;
};

const SELECT = `select m.id, m.number, m.round, m.best_of, m.status, m.scheduled_at, m.time_confirmed, m.play_by, m.referee_user_id,
       he.name as home_name, ae.name as away_name, c.name as comp, c.slug, c.timezone,
       (select count(*)::int from match_files f where f.match_id = m.id) as shots,
       (select count(*)::int from match_reports r where r.match_id = m.id and r.status = 'pending') as reports
  from matches m join competitions c on c.id = m.competition_id
  left join entries he on he.id = m.home_entry_id left join entries ae on ae.id = m.away_entry_id`;

/** Open matches a player referees, split by what the referee should do next. */
export async function refereeDesk(userId: string) {
  const rows = await q<DeskMatch>(
    `${SELECT} where m.referee_user_id = $1 and m.status not in ('completed') and not m.is_bye
        and m.home_entry_id is not null and m.away_entry_id is not null
      order by m.round, m.scheduled_at nulls last, m.number`,
    [userId],
  );
  const now = Date.now();
  const played = (m: DeskMatch) => m.status === "under_review" || m.status === "live" || (!!m.scheduled_at && new Date(m.scheduled_at).getTime() <= now);
  return {
    score: rows.filter(played),
    upcoming: rows.filter((m) => !played(m) && m.scheduled_at && m.time_confirmed),
    waiting: rows.filter((m) => !played(m) && !(m.scheduled_at && m.time_confirmed)),
  };
}

/** For staff: open matches in referee-only competitions that have no referee yet. */
export async function unrefereed() {
  return q<DeskMatch>(
    `${SELECT} where c.referee_only and c.draw_state = 'published' and m.referee_user_id is null and m.status <> 'completed' and not m.is_bye
        and m.home_entry_id is not null and m.away_entry_id is not null
      order by m.round, m.number limit 40`,
  );
}

export async function refereedCount(userId: string) {
  return (await q<{ n: number }>("select count(*)::int as n from matches where referee_user_id = $1 and status = 'completed'", [userId]))[0]?.n ?? 0;
}
