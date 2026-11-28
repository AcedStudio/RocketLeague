import "server-only";
import { q } from "./db";
import { matchStep, duelStep, sortTasks, type Step } from "./engine/today";

export type Task = {
  id: string;
  kind: "match" | "duel";
  href: string;
  step: Step;
  when: Date | null;
  playBy: Date | null;
  tz: string;
  context: string; // competition name / "Дуэль"
  opponent: { name: string; avatar: string | null; color: string | null; userId: string | null };
};

/** Everything that needs me: open matches of my teams and my open duels, most urgent first. */
export async function myTasks(userId: string, now = new Date()): Promise<Task[]> {
  const [matches, duels] = await Promise.all([
    q<{
      id: string; status: "upcoming" | "ready" | "live" | "under_review" | "postponed"; scheduled_at: Date | null; play_by: Date | null;
      referee_only: boolean; comp: string; tz: string; slug: string; round: number | null;
      opp_name: string | null; opp_user: string | null; opp_avatar: string | null; opp_color: string | null;
      their_prop: boolean; my_prop: boolean; their_rep: boolean; my_rep: boolean;
    }>(
      `with mine as (select entry_id from entry_members where user_id = $1 and active)
       select m.id, m.status, m.scheduled_at, m.play_by, c.referee_only, c.name as comp, c.timezone as tz, c.slug, m.round,
              oe.name as opp_name, ou.id as opp_user, ou.avatar as opp_avatar, ou.name_color as opp_color,
              exists (select 1 from match_proposals p where p.match_id = m.id and p.status = 'pending' and p.entry_id = oe.id) as their_prop,
              exists (select 1 from match_proposals p where p.match_id = m.id and p.status = 'pending' and p.entry_id <> oe.id) as my_prop,
              exists (select 1 from match_reports r where r.match_id = m.id and r.status = 'pending' and r.entry_id = oe.id) as their_rep,
              exists (select 1 from match_reports r where r.match_id = m.id and r.status = 'pending' and r.entry_id <> oe.id) as my_rep
         from matches m
         join competitions c on c.id = m.competition_id and c.draw_state = 'published'
         left join entries oe on oe.id = case when m.home_entry_id in (select entry_id from mine) then m.away_entry_id else m.home_entry_id end
         left join lateral (select u.id, u.avatar, u.name_color from entry_members em join users u on u.id = em.user_id
                             where em.entry_id = oe.id and em.active order by em.joined_at nulls last limit 1) ou on true
        where m.status not in ('completed') and not m.is_bye
          and (m.home_entry_id in (select entry_id from mine) or m.away_entry_id in (select entry_id from mine))
        order by m.scheduled_at nulls last, m.round nulls last
        limit 20`,
      [userId],
    ),
    q<{ id: string; status: "pending" | "accepted" | "reported"; challenger_id: string; reported_by: string | null; created_at: Date; opp_id: string; opp_name: string; opp_avatar: string | null; opp_color: string | null }>(
      `select d.id, d.status, d.challenger_id, d.reported_by, d.created_at, u.id as opp_id, u.rl_nickname as opp_name, u.avatar as opp_avatar, u.name_color as opp_color
         from duels d join users u on u.id = case when d.challenger_id = $1 then d.opponent_id else d.challenger_id end
        where (d.challenger_id = $1 or d.opponent_id = $1) and d.status in ('pending', 'accepted', 'reported')
        order by d.created_at desc limit 10`,
      [userId],
    ),
  ]);
  const tasks: Task[] = [
    ...matches.map((m) => ({
      id: m.id,
      kind: "match" as const,
      href: `/match/${m.id}`,
      step: matchStep(
        {
          status: m.status,
          scheduledAt: m.scheduled_at ? new Date(m.scheduled_at) : null,
          playBy: m.play_by ? new Date(m.play_by) : null,
          refereeOnly: m.referee_only,
          theirProposal: m.their_prop,
          myProposal: m.my_prop,
          theirReport: m.their_rep,
          myReport: m.my_rep,
        },
        now,
      ),
      when: m.scheduled_at ? new Date(m.scheduled_at) : m.play_by ? new Date(m.play_by) : null,
      playBy: m.play_by ? new Date(m.play_by) : null,
      tz: m.tz,
      context: m.comp,
      opponent: { name: m.opp_name ?? "?", avatar: m.opp_avatar, color: m.opp_color, userId: m.opp_user },
    })),
    ...duels.map((d) => ({
      id: d.id,
      kind: "duel" as const,
      href: "/duels",
      step: duelStep({ status: d.status, mine: d.challenger_id === userId ? "challenger" : "opponent", reportedByMe: d.reported_by === userId }),
      when: null,
      playBy: null,
      tz: "Asia/Tashkent",
      context: "Дуэль",
      opponent: { name: d.opp_name, avatar: d.opp_avatar, color: d.opp_color, userId: d.opp_id },
    })),
  ];
  return sortTasks(tasks);
}
