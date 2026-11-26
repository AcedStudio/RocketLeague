import "server-only";
import { checkAchievements } from "./achievements";
import { buildTeamOfRound, INFORM_BOOST } from "./totw";
import { leagueOdds } from "./odds";
import { getCompetition } from "./data";
import { q, one, tx } from "./db";
import { FormError } from "./errors";
import { notify, logAction } from "./notify";
import { enqueueChannel, GOLD_COLOR } from "./discord";

// "Player of the tour": once every match of a tour is played (or the tour's deadline
// has passed), a 48-hour vote opens. Anyone signed in votes once per tour (and may
// change the vote); nominees are the players who played in that tour.

export const POLL_HOURS = 48;

export type Poll = {
  competition_id: string; stage: string; round: number;
  opened_at: Date; closes_at: Date; closed_at: Date | null; winner_id: string | null; winner_votes: number;
  winner_name?: string | null;
};
export type Nominee = { user_id: string; nickname: string; entry_name: string; won: boolean; score: string | null; votes: number };

export async function getPolls(competitionId: string) {
  return q<Poll>(
    `select p.*, u.rl_nickname as winner_name from tour_polls p left join users u on u.id = p.winner_id
      where p.competition_id = $1 order by p.stage, p.round`,
    [competitionId],
  );
}

/** Players who played a completed match in this tour, with their result and current votes. */
export async function nominees(competitionId: string, stage: string, round: number): Promise<Nominee[]> {
  return q<Nominee>(
    `select u.id as user_id, u.rl_nickname as nickname, e.name as entry_name,
            m.winner_entry_id = e.id as won,
            case when m.forfeit then null
                 when m.best_of = 1 then case when m.home_entry_id = e.id then m.home_goals || ':' || m.away_goals else m.away_goals || ':' || m.home_goals end
                 else case when m.home_entry_id = e.id then m.home_wins || ':' || m.away_wins else m.away_wins || ':' || m.home_wins end end as score,
            (select count(*)::int from tour_votes v where v.competition_id = $1 and v.stage = $2 and v.round = $3 and v.nominee_id = u.id) as votes
       from matches m
       join entries e on e.id in (m.home_entry_id, m.away_entry_id)
       join entry_members em on em.entry_id = e.id and em.active
       join users u on u.id = em.user_id
      where m.competition_id = $1 and m.stage = $2 and m.round = $3 and m.status = 'completed' and not m.is_bye
      order by votes desc, won desc, u.rl_nickname`,
    [competitionId, stage, round],
  );
}

export async function myVote(competitionId: string, stage: string, round: number, userId: string) {
  return (await one<{ nominee_id: string }>(
    "select nominee_id from tour_votes where competition_id = $1 and stage = $2 and round = $3 and voter_id = $4",
    [competitionId, stage, round, userId],
  ))?.nominee_id ?? null;
}

export async function vote(competitionId: string, stage: string, round: number, voterId: string, nomineeId: string): Promise<string> {
  return tx(async (c) => {
    const poll = await one<Poll>("select * from tour_polls where competition_id = $1 and stage = $2 and round = $3 for update", [competitionId, stage, round], c);
    if (!poll) throw new FormError("Голосование за этот тур ещё не открыто");
    if (poll.closed_at || new Date(poll.closes_at).getTime() < Date.now()) throw new FormError("Голосование за этот тур закрыто");
    if (voterId === nomineeId) throw new FormError("За себя голосовать нельзя");
    const ok = (await nominees(competitionId, stage, round)).some((n) => n.user_id === nomineeId);
    if (!ok) throw new FormError("Этот игрок не играл в этом туре");
    await q(
      `insert into tour_votes (competition_id, stage, round, voter_id, nominee_id) values ($1, $2, $3, $4, $5)
       on conflict (competition_id, stage, round, voter_id) do update set nominee_id = excluded.nominee_id, created_at = now()`,
      [competitionId, stage, round, voterId, nomineeId],
      c,
    );
    return "Голос принят";
  });
}

/** Opens polls for finished tours and closes expired ones. Called by the 5-minute sweep. */
export async function runTourPolls(onlyComp?: string): Promise<{ opened: number; closed: number }> {
  // Rounds that finished before the team of the round existed get their team quietly (no posts).
  const missing = await q<{ competition_id: string; stage: string; round: number }>(
    `select p.competition_id, p.stage, p.round from tour_polls p
      where ($1::uuid is null or p.competition_id = $1)
        and not exists (select 1 from tour_team t where t.competition_id = p.competition_id and t.stage = p.stage and t.round = p.round)
      limit 20`,
    [onlyComp ?? null],
  );
  for (const m of missing) await buildTeamOfRound(undefined, m.competition_id, m.stage, m.round);

  const out = { opened: 0, closed: 0 };
  // Tours that are played (every match official) or past their deadline, with at least one result, and no poll yet.
  const ready = await q<{ competition_id: string; stage: string; round: number; comp: string; slug: string }>(
    `select m.competition_id, m.stage, m.round, c.name as comp, c.slug
       from matches m join competitions c on c.id = m.competition_id
      where m.stage in ('league', 'group') and not m.is_bye and c.draw_state = 'published' and ($1::uuid is null or c.id = $1)
      group by m.competition_id, m.stage, m.round, c.name, c.slug
     having count(*) filter (where m.status = 'completed') > 0
        and (bool_and(m.status = 'completed') or max(m.play_by) < now())
        and not exists (select 1 from tour_polls p where p.competition_id = m.competition_id and p.stage = m.stage and p.round = m.round)
      limit 10`,
    [onlyComp ?? null],
  );
  for (const r of ready) {
    await tx(async (c) => {
      const ins = await one(
        `insert into tour_polls (competition_id, stage, round, closes_at) values ($1, $2, $3, now() + interval '${POLL_HOURS} hours')
         on conflict do nothing returning round`,
        [r.competition_id, r.stage, r.round],
        c,
      );
      if (!ins) return;
      out.opened++;
      const people = await q<{ user_id: string }>(
        `select distinct em.user_id from entries e join entry_members em on em.entry_id = e.id and em.active
          where e.competition_id = $1 and e.status = 'confirmed'`,
        [r.competition_id],
        c,
      );
      const link = `/c/${r.slug}/calendar#tour-${r.round}`;
      await notify(c, people.map((p) => p.user_id), "{comp}: выберите игрока тура {n}", "Голосование открыто на 48 часов", link, { comp: r.comp, n: r.round });
      await enqueueChannel(c, "announce", {
        title: "⭐ {comp}: голосование за игрока тура {n}",
        description: "Кто сыграл лучше всех? Голосуйте на сайте — 48 часов.",
        params: { comp: r.comp, n: r.round },
        link,
        color: GOLD_COLOR,
      });
      // Team of the round: In-Form cards for the best performers.
      const team = await buildTeamOfRound(c, r.competition_id, r.stage, r.round);
      if (team.length) {
        for (const p of team) {
          await notify(c, [p.user_id], "🃏 Вы в команде тура {n}!", "{comp} · ваша карточка стала In-Form на неделю (+{boost} OVR)", `/players/${p.user_id}`, { comp: r.comp, n: r.round, boost: INFORM_BOOST });
        }
        await enqueueChannel(c, "announce", {
          title: "🃏 {comp}: команда тура {n}",
          description: "{names}",
          params: { comp: r.comp, n: r.round, names: team.map((p) => p.nickname).join(" · ") },
          image: `/api/totw/${r.competition_id}/${r.round}?stage=${r.stage}&v=${Date.now()}`,
          link: `/c/${r.slug}`,
          color: GOLD_COLOR,
        });
      }
      if (r.stage === "league") {
        const comp = await getCompetition(r.competition_id, c);
        const odds = comp ? await leagueOdds(comp).catch(() => null) : null;
        const names = new Map((await q<{ id: string; name: string }>("select id, name from entries where competition_id = $1", [r.competition_id], c)).map((e) => [e.id, e.name]));
        const top = odds ? [...odds.odds.values()].filter((o) => o.title > 0).slice(0, 5) : [];
        await enqueueChannel(c, "announce", {
          title: "📊 {comp}: таблица после тура {n}",
          params: { comp: r.comp, n: r.round },
          image: `/api/standings-card/${r.slug}?v=${r.round}-${Date.now()}`,
          link: `/c/${r.slug}/standings`,
          fields: top.length
            ? [{ name: "Шансы на чемпионство", value: top.map((o, i) => `${["🥇", "🥈", "🥉", "4.", "5."][i]} ${names.get(o.id) ?? "?"} — ${Math.round(o.title * 100)}%`).join("\n") }]
            : undefined,
        });
      }
    });
  }

  const due = await q<Poll & { comp: string; slug: string }>(
    `select p.*, c.name as comp, c.slug from tour_polls p join competitions c on c.id = p.competition_id
      where p.closed_at is null and p.closes_at < now() and ($1::uuid is null or p.competition_id = $1) limit 10`,
    [onlyComp ?? null],
  );
  for (const p of due) {
    await tx(async (c) => {
      const locked = await one("select 1 from tour_polls where competition_id = $1 and stage = $2 and round = $3 and closed_at is null for update", [p.competition_id, p.stage, p.round], c);
      if (!locked) return;
      // Most votes; ties go to whoever won their match, then the earlier vote leader alphabetically.
      const list = await nominees(p.competition_id, p.stage, p.round);
      const top = list.find((n) => n.votes > 0) ?? null;
      await q(
        "update tour_polls set closed_at = now(), winner_id = $4, winner_votes = $5 where competition_id = $1 and stage = $2 and round = $3",
        [p.competition_id, p.stage, p.round, top?.user_id ?? null, top?.votes ?? 0],
        c,
      );
      out.closed++;
      if (!top) return;
      await checkAchievements(c, [top.user_id]);
      const link = `/players/${top.user_id}`;
      await notify(c, [top.user_id], "⭐ Вы — игрок тура {n}!", "{comp} · голосов: {votes}", link, { n: p.round, comp: p.comp, votes: top.votes });
      await enqueueChannel(c, "announce", {
        title: "⭐ Игрок тура {n}: {name}",
        description: "{comp} · голосов: {votes}",
        params: { n: p.round, name: top.nickname, comp: p.comp, votes: top.votes },
        link,
        color: GOLD_COLOR,
      });
      await logAction(c, null, "tour.award", `${p.comp}: ${p.stage} ${p.round} → ${top.nickname} (${top.votes})`);
    });
  }
  return out;
}

/** How many times a player was voted player of the tour. */
export async function tourAwards(userId: string) {
  return (await one<{ n: number }>("select count(*)::int as n from tour_polls where winner_id = $1", [userId]))?.n ?? 0;
}
