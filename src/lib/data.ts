import "server-only";
import { cache } from "react";
import { q, one, dbConfigured, type Queryable } from "./db";
import { computeStandings, type StandingRow, type Tiebreaker } from "./engine/standings.ts";

export type Competition = {
  referee_only: boolean;
  champion_entry_id?: string | null;
  season_days: number;
  noshow_minutes: number;
  deadline_forfeit: boolean;
  id: string;
  slug: string;
  name: string;
  kind: "league" | "cup";
  mode: "1v1" | "2v2";
  format: "groups_knockout" | "knockout" | "round_robin";
  status: "draft" | "registration" | "closed" | "in_progress" | "playoffs" | "finished";
  season: string;
  description: string;
  capacity: number;
  registration_deadline: Date | null;
  start_at: Date | null;
  timezone: string;
  region: string;
  platforms: string[];
  require_approval: boolean;
  checkin_required: boolean;
  checkin_open: boolean;
  group_count: number;
  qualifiers_per_group: number;
  seeded_draw: boolean;
  double_round_robin: boolean;
  third_place: boolean;
  group_best_of: number;
  playoff_best_of: number;
  final_best_of: number;
  points_win: number;
  points_loss: number;
  tiebreakers: Tiebreaker[];
  draw_seed: string | null;
  draw_state: "none" | "preview" | "published";
  draw_published_at: Date | null;
  playoffs_generated: boolean;
  prize_currency: string;
  prize_pool: string | null;
  prize_notes: string;
  payout_status: "not_configured" | "pending" | "partially_paid" | "paid";
  featured: boolean;
  created_at: Date;
};

export type Member = { user_id: string; rl_nickname: string; rl_id: string; platform: string; is_captain: boolean; display_name: string };

export type Entry = {
  id: string;
  competition_id: string;
  number: number;
  name: string;
  captain_id: string;
  status: "incomplete" | "pending" | "confirmed" | "waitlist" | "cancelled" | "rejected";
  invite_code: string | null;
  seed: number | null;
  checked_in_at: Date | null;
  created_at: Date;
  members: Member[];
};

export type Match = {
  id: string;
  competition_id: string;
  number: number;
  stage: "group" | "league" | "knockout" | "third_place";
  group_id: string | null;
  group_name: string | null;
  round: number;
  bracket_index: number | null;
  bracket_key: string | null;
  home_entry_id: string | null;
  away_entry_id: string | null;
  home_name: string | null;
  away_name: string | null;
  best_of: number;
  scheduled_at: Date | null;
  status: "upcoming" | "ready" | "live" | "completed" | "under_review" | "postponed";
  games: { home: number; away: number }[] | null;
  home_wins: number | null;
  away_wins: number | null;
  home_goals: number | null;
  away_goals: number | null;
  winner_entry_id: string | null;
  is_bye: boolean;
  forfeit: boolean;
  next_match_id: string | null;
  next_side: "home" | "away" | null;
  loser_next_match_id: string | null;
  loser_next_side: "home" | "away" | null;
  play_by: Date | null;
  referee_user_id: string | null;
  referee_name?: string | null;
  time_confirmed: boolean;
  home_checkin_at: Date | null;
  away_checkin_at: Date | null;
  completed_at?: Date | null;
};

export type Group = { id: string; name: string; position: number; entry_ids: string[] };

export type Prize = {
  id: string;
  place: number | null;
  title: string;
  amount: string | null;
  description: string;
  recipient_entry_id: string | null;
  recipient_name: string | null;
  paid: boolean;
  position: number;
};

export const DEFAULT_SETTINGS = {
  site_name: "RL Championship",
  tagline: "Лиги и кубки по Rocket League",
  contact_email: "",
  discord_url: "",
  logo_url: "",
};
export type Settings = typeof DEFAULT_SETTINGS;

export const getSettings = cache(async (): Promise<Settings> => {
  if (!dbConfigured()) return DEFAULT_SETTINGS;
  try {
    const rows = await q<{ key: string; value: string }>("select key, value from settings");
    const s = { ...DEFAULT_SETTINGS };
    for (const r of rows) if (r.key in s) (s as Record<string, string>)[r.key] = r.value;
    return s;
  } catch {
    return DEFAULT_SETTINGS;
  }
});

export async function listCompetitions(includeDrafts = false) {
  return q<Competition & { active_count: number }>(
    `select c.*, (select count(*)::int from entries e where e.competition_id = c.id and e.status in ('pending','confirmed')) as active_count
       from competitions c
      where $1 or c.status <> 'draft'
      order by c.featured desc, case c.status when 'in_progress' then 0 when 'playoffs' then 0 when 'registration' then 1 when 'closed' then 2 when 'draft' then 3 else 4 end, c.start_at nulls last, c.created_at desc`,
    [includeDrafts],
  );
}

export const getCompetitionBySlug = cache(async (slug: string) => {
  return one<Competition>("select * from competitions where slug = $1", [slug]);
});

export async function getCompetition(id: string, c?: Queryable) {
  return one<Competition>("select * from competitions where id = $1", [id], c);
}

export async function getFeaturedCompetition() {
  return one<Competition>(
    `select * from competitions where status <> 'draft'
      order by featured desc, case status when 'registration' then 0 when 'in_progress' then 1 when 'playoffs' then 1 when 'closed' then 2 else 3 end, start_at nulls last
      limit 1`,
  );
}

export async function entryCounts(competitionId: string, c?: Queryable) {
  const rows = await q<{ status: string; n: number }>(
    "select status, count(*)::int as n from entries where competition_id = $1 group by status",
    [competitionId],
    c,
  );
  const m: Record<string, number> = { incomplete: 0, pending: 0, confirmed: 0, waitlist: 0, cancelled: 0, rejected: 0 };
  for (const r of rows) m[r.status] = r.n;
  return { ...m, active: m.pending + m.confirmed } as Record<string, number> & { active: number };
}

const ENTRY_SELECT = `
  select e.*, coalesce(json_agg(json_build_object(
      'user_id', u.id, 'rl_nickname', u.rl_nickname, 'rl_id', u.rl_id, 'platform', u.platform,
      'is_captain', em.is_captain, 'display_name', u.display_name
    ) order by em.is_captain desc, em.joined_at) filter (where u.id is not null), '[]') as members
  from entries e
  left join entry_members em on em.entry_id = e.id and em.active
  left join users u on u.id = em.user_id`;

export async function getEntries(competitionId: string, opts: { search?: string; status?: string } = {}, c?: Queryable) {
  const params: unknown[] = [competitionId];
  let where = "where e.competition_id = $1";
  if (opts.status) {
    params.push(opts.status);
    where += ` and e.status = $${params.length}`;
  }
  if (opts.search) {
    params.push(`%${opts.search}%`);
    where += ` and (e.name ilike $${params.length} or exists (select 1 from entry_members m2 join users u2 on u2.id = m2.user_id where m2.entry_id = e.id and (u2.rl_nickname ilike $${params.length} or u2.rl_id ilike $${params.length})))`;
  }
  return q<Entry>(`${ENTRY_SELECT} ${where} group by e.id order by e.number`, params, c);
}

export async function getEntry(id: string, c?: Queryable) {
  return one<Entry>(`${ENTRY_SELECT} where e.id = $1 group by e.id`, [id], c);
}

export async function getEntryByInvite(code: string) {
  return one<Entry>(`${ENTRY_SELECT} where e.invite_code = $1 group by e.id`, [code]);
}

/** The user's active entry in a competition, if any. */
export async function getUserEntry(competitionId: string, userId: string) {
  return one<Entry>(
    `${ENTRY_SELECT} where e.competition_id = $1 and e.id in (select entry_id from entry_members where user_id = $2 and active) group by e.id`,
    [competitionId, userId],
  );
}

export async function getGroups(competitionId: string, c?: Queryable) {
  return q<Group>(
    `select g.id, g.name, g.position, coalesce(array_agg(ge.entry_id) filter (where ge.entry_id is not null), '{}') as entry_ids
       from groups g left join group_entries ge on ge.group_id = g.id
      where g.competition_id = $1 group by g.id order by g.position`,
    [competitionId],
    c,
  );
}

const MATCH_SELECT = `
  select m.*, he.name as home_name, ae.name as away_name, g.name as group_name, ru.rl_nickname as referee_name
    from matches m
    left join entries he on he.id = m.home_entry_id
    left join entries ae on ae.id = m.away_entry_id
    left join groups g on g.id = m.group_id
    left join users ru on ru.id = m.referee_user_id`;

const STAGE_ORDER = "case m.stage when 'group' then 0 when 'league' then 0 when 'knockout' then 1 else 2 end";

export async function getMatches(
  competitionId: string,
  f: { status?: string; stage?: string; group?: string; entry?: string } = {},
  c?: Queryable,
) {
  const params: unknown[] = [competitionId];
  let where = "where m.competition_id = $1";
  if (f.status) {
    params.push(f.status);
    where += ` and m.status = $${params.length}`;
  }
  if (f.stage) {
    params.push(f.stage);
    where += ` and m.stage = $${params.length}`;
  }
  if (f.group) {
    params.push(f.group);
    where += ` and m.group_id = $${params.length}`;
  }
  if (f.entry) {
    params.push(f.entry);
    where += ` and (m.home_entry_id = $${params.length} or m.away_entry_id = $${params.length})`;
  }
  return q<Match>(`${MATCH_SELECT} ${where} order by ${STAGE_ORDER}, m.round, m.bracket_index nulls last, m.number`, params, c);
}

export async function getMatch(id: string, c?: Queryable) {
  return one<Match>(`${MATCH_SELECT} where m.id = $1`, [id], c);
}

/** Latest tour with at least one official result (league/group stage), or null. */
export async function lastPlayedRound(competitionId: string, c?: Queryable) {
  const r = await one<{ r: number | null }>(
    "select max(round)::int as r from matches where competition_id = $1 and stage in ('group','league') and status = 'completed' and not is_bye",
    [competitionId],
    c,
  );
  return r?.r ?? null;
}

export type GroupTable = { group: Group | null; rows: (StandingRow & { name: string })[]; qualify: number };

/** Live tables: one per group (cups) or one table (leagues). Only official results count. */
export async function getStandings(comp: Competition, c?: Queryable, opts: { beforeRound?: number } = {}): Promise<GroupTable[]> {
  const [groups, entries, matches] = await Promise.all([
    getGroups(comp.id, c),
    getEntries(comp.id, {}, c),
    q<Match>(
      `select * from matches where competition_id = $1 and stage in ('group','league') and status = 'completed' and not is_bye
          and ($2::int is null or round < $2)`,
      [comp.id, opts.beforeRound ?? null],
      c,
    ),
  ]);
  const names = new Map(entries.map((e) => [e.id, e.name]));
  const cfg = { pointsWin: comp.points_win, pointsLoss: comp.points_loss, tiebreakers: comp.tiebreakers };
  const completed = matches
    .filter((m) => m.home_entry_id && m.away_entry_id && m.winner_entry_id)
    .map((m) => ({ home: m.home_entry_id!, away: m.away_entry_id!, homeGoals: m.home_goals ?? 0, awayGoals: m.away_goals ?? 0, winner: m.winner_entry_id! }));
  return groups.map((g) => ({
    group: comp.format === "round_robin" ? null : g,
    qualify: comp.qualifiers_per_group,
    rows: computeStandings(g.entry_ids, completed, cfg).map((r) => ({ ...r, name: names.get(r.id) ?? "—" })),
  }));
}

export async function getPrizes(competitionId: string) {
  return q<Prize>(
    `select p.*, e.name as recipient_name from prizes p left join entries e on e.id = p.recipient_entry_id
      where p.competition_id = $1 order by p.place nulls last, p.position, p.title`,
    [competitionId],
  );
}

export async function getAnnouncements(competitionId?: string, limit = 5) {
  return q<{ id: string; title: string; body: string; pinned: boolean; created_at: Date; competition_id: string | null; competition_name: string | null; competition_slug: string | null }>(
    `select a.*, c.name as competition_name, c.slug as competition_slug from announcements a left join competitions c on c.id = a.competition_id
      where ($1::uuid is null or a.competition_id = $1 or a.competition_id is null)
      order by a.pinned desc, a.created_at desc limit $2`,
    [competitionId ?? null, limit],
  );
}

export type Rule = {
  id: string; category: string; title: string; body: string; position: number; published: boolean; updated_at: Date;
  title_uz: string; body_uz: string; title_en: string; body_en: string;
};

/** The rule text in the reader's language, falling back to Russian. */
export function ruleText(r: Rule, locale: string) {
  if (locale === "uz" && r.title_uz) return { title: r.title_uz, body: r.body_uz || r.body };
  if (locale === "en" && r.title_en) return { title: r.title_en, body: r.body_en || r.body };
  return { title: r.title, body: r.body };
}

export async function getRules(publishedOnly: boolean) {
  return q<Rule>(`select * from rules where $1 = false or published order by category, position, title`, [publishedOnly]);
}

export const RULE_CATEGORIES = [
  "Общие правила",
  "Требования к регистрации",
  "Правила 1v1",
  "Правила 2v2",
  "Настройки матча",
  "Расписание матчей",
  "Дисконнекты и технические проблемы",
  "Опоздания и технические поражения",
  "Честная игра",
  "Протесты и споры",
  "Распределение призов",
] as const;
