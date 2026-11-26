// End-to-end test of the tournament service against a real Postgres (Neon branch).
// Run: DATABASE_URL=... npx tsx --conditions=react-server tests/integration.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { q, one, tx } from "../src/lib/db";
import { leaderboard, recomputeAll } from "../src/lib/rating";
import { syncRoles } from "../src/lib/discord-server";
import { getPlayerCard } from "../src/lib/cards";
import { refereeCandidates, assignReferees, autoAssignReferees, canReferee } from "../src/lib/referees";
import { proposeTime, respondProposal, checkIn as checkInMatch, sweep } from "../src/lib/scheduling";
import {
  registerSolo, createTeam, joinTeam, withdraw, runDraw, resetDraw, publishDraw, submitReport, respondToReport, refereeResult, checkIn,
} from "../src/lib/tournament";
import { getStandings, getCompetition, getMatches, entryCounts, type Match } from "../src/lib/data";
import type { User } from "../src/lib/auth";
import { runTourPolls, vote, nominees, tourAwards } from "../src/lib/awards";
import { saveMatchFiles, listMatchFiles, deleteMatchFile } from "../src/lib/files";
import { playerAchievements } from "../src/lib/achievements";
import { playerRivals } from "../src/lib/rivals";
import { matchOfRound } from "../src/lib/motw";
import { sweep } from "../src/lib/scheduling";
import { leagueOdds } from "../src/lib/odds";
import { getTeamOfRound } from "../src/lib/totw";
import { competitionRecords, matchCommentary } from "../src/lib/commentary";
import { createDuel, respondDuel, reportDuel, confirmDuel, cancelDuel, sweepDuels } from "../src/lib/duels";
import { playerLevel } from "../src/lib/levels";
import { rivalryBetween } from "../src/lib/derby";
import { playerSeason } from "../src/lib/wrapped";
import { resetToTemp, resetLink, checkResetToken, consumeResetToken } from "../src/lib/password-reset";
import { verifyPassword } from "../src/lib/auth";

let passed = 0;
const step = async (name: string, fn: () => Promise<void>) => {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
};
const rejects = async (p: Promise<unknown>, re: RegExp) => {
  try {
    await p;
  } catch (e) {
    assert.match((e as Error).message, re);
    return;
  }
  assert.fail(`expected rejection ${re}`);
};

const RUN = Date.now().toString(36);
async function mkUser(name: string, role = "participant"): Promise<User> {
  const u = await one<User>(
    `insert into users (email, password_hash, display_name, rl_nickname, rl_id, platform, contact, role)
     values ($1, 'x', $2, $2, $3, 'pc', 'test', $4) returning *`,
    [`${name}-${RUN}@t.test`, `${name}_${RUN}`, `id-${name}-${RUN}`, role],
  );
  return u!;
}
async function mkComp(over: Record<string, unknown>) {
  const base = { slug: `t-${RUN}-${Math.random().toString(36).slice(2, 7)}`, name: "T", kind: "cup", mode: "1v1", format: "groups_knockout", status: "registration", capacity: 16, group_count: 2, qualifiers_per_group: 2, group_best_of: 1, playoff_best_of: 3, final_best_of: 3, third_place: true };
  const v = { ...base, ...over };
  const keys = Object.keys(v);
  const row = await one<{ id: string }>(`insert into competitions (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning id`, Object.values(v));
  return row!.id;
}
const close = (id: string) => q("update competitions set status = 'closed' where id = $1", [id]);
const membersOf = async (entryId: string) => (await q<{ user_id: string }>("select user_id from entry_members where entry_id = $1 and active", [entryId])).map((r) => r.user_id);

/** Plays every open match: home wins unless `awayWins` says otherwise, both sides report. */
async function playAll(compId: string, users: Map<string, User>, stage?: string, awayWins = (_m: Match) => false) {
  for (let guard = 0; guard < 50; guard++) {
    const open = (await getMatches(compId)).filter((m) => m.status === "ready" && !m.is_bye && (!stage || m.stage === stage));
    if (!open.length) return;
    for (const m of open) {
      const need = Math.floor(m.best_of / 2) + 1;
      const g = Array.from({ length: need }, () => (awayWins(m) ? { home: 1, away: 3 } : { home: 2, away: 0 }));
      const h = users.get((await membersOf(m.home_entry_id!))[0])!;
      const a = users.get((await membersOf(m.away_entry_id!))[0])!;
      await submitReport(m.id, h, g, "", "");
      const msg = await submitReport(m.id, a, g, "", "");
      assert.match(msg, /совпали/);
    }
  }
}

async function main() {
  await q(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  // The qa database holds thousands of old test users: skip the one-time silent backfill there.
  await q("insert into settings (key, value) values ('achievements_backfill', 'test') on conflict (key) do nothing");
  const admin = await mkUser("admin", "admin");
  const users = new Map<string, User>();
  const players: User[] = [];
  for (let i = 0; i < 12; i++) {
    const u = await mkUser(`p${i}`);
    players.push(u);
    users.set(u.id, u);
  }

  // ---------------------------------------------------------------- 1v1 cup
  const cup = await mkComp({ capacity: 6, third_place: true });
  await step("1v1: capacity 6 → 7th player goes to waitlist", async () => {
    for (let i = 0; i < 7; i++) await registerSolo(cup, players[i]);
    const c = await entryCounts(cup);
    assert.equal(c.confirmed, 6);
    assert.equal(c.waitlist, 1);
  });
  await step("1v1: duplicate registration rejected", async () => {
    await rejects(registerSolo(cup, players[0]), /уже зарегистрированы/);
  });
  await step("1v1: withdrawal promotes waitlist automatically", async () => {
    const e = await one<{ id: string }>("select e.id from entries e join entry_members m on m.entry_id = e.id where e.competition_id = $1 and m.user_id = $2", [cup, players[0].id]);
    await withdraw(e!.id, players[0]);
    const c = await entryCounts(cup);
    assert.equal(c.confirmed, 6);
    assert.equal(c.waitlist, 0);
    const n = await one<{ n: number }>("select count(*)::int as n from notifications where user_id = $1 and title like '%освободилось%'", [players[6].id]);
    assert.equal(n!.n, 1);
  });
  await step("draw: refused while registration is open", async () => {
    await rejects(runDraw(cup, admin), /закройте регистрацию/);
  });
  await step("draw: balanced groups, fixtures, can redraw before publishing", async () => {
    await close(cup);
    await runDraw(cup, admin);
    const g1 = (await q<{ n: number }>("select count(*)::int as n from group_entries where competition_id = $1 group by group_id", [cup])).map((r) => r.n).sort();
    assert.deepEqual(g1, [3, 3]);
    assert.equal((await getMatches(cup)).length, 6); // 2 groups × 3 matches
    await runDraw(cup, admin);
    assert.equal((await getMatches(cup)).length, 6, "redraw replaces, never duplicates");
    const dup = await one<{ n: number }>("select count(*)::int as n from (select least(home_entry_id, away_entry_id), greatest(home_entry_id, away_entry_id) from matches where competition_id = $1 group by 1, 2 having count(*) > 1) x", [cup]);
    assert.equal(dup!.n, 0);
  });
  await step("results rejected before publication; publish locks draw", async () => {
    const m = (await getMatches(cup))[0];
    const h = users.get((await membersOf(m.home_entry_id!))[0])!;
    const a = users.get((await membersOf(m.away_entry_id!))[0])!;
    await rejects(submitReport(m.id, h, [{ home: 1, away: 0 }], "", ""), /не опубликована/);
    void a;
    await publishDraw(cup, admin);
    await rejects(runDraw(cup, admin), /заблокирована/);
    await rejects(resetDraw(cup, admin), /неопубликованную/);
  });
  await step("results: outsider cannot report; invalid series rejected", async () => {
    const m = (await getMatches(cup)).find((x) => x.status === "ready")!;
    const h = users.get((await membersOf(m.home_entry_id!))[0])!;
    await rejects(submitReport(m.id, players[11], [{ home: 1, away: 0 }], "", ""), /только участники/);
    await rejects(submitReport(m.id, h, [{ home: 2, away: 2 }], "", ""), /ничьих/);
  });
  await step("results: mismatch → under review → referee resolves", async () => {
    const m = (await getMatches(cup)).find((x) => x.status === "ready")!;
    const h = users.get((await membersOf(m.home_entry_id!))[0])!;
    const a = users.get((await membersOf(m.away_entry_id!))[0])!;
    await submitReport(m.id, h, [{ home: 3, away: 1 }], "https://example.com/s.png", "");
    const msg = await submitReport(m.id, a, [{ home: 1, away: 3 }], "", "");
    assert.match(msg, /не совпали/);
    assert.equal((await getMatches(cup)).find((x) => x.id === m.id)!.status, "under_review");
    await rejects(submitReport(m.id, h, [{ home: 3, away: 1 }], "", ""), /рассмотрении/);
    await refereeResult(m.id, admin, { games: [{ home: 3, away: 1 }] }, "по скриншоту");
    const done = (await getMatches(cup)).find((x) => x.id === m.id)!;
    assert.equal(done.status, "completed");
    assert.equal(done.winner_entry_id, m.home_entry_id);
  });
  await step("results: opponent confirms / disputes a pending report", async () => {
    const [m1, m2] = (await getMatches(cup)).filter((x) => x.status === "ready");
    const h1 = users.get((await membersOf(m1.home_entry_id!))[0])!;
    const a1 = users.get((await membersOf(m1.away_entry_id!))[0])!;
    await submitReport(m1.id, h1, [{ home: 0, away: 2 }], "", "");
    const r1 = await one<{ id: string }>("select id from match_reports where match_id = $1 and status = 'pending'", [m1.id]);
    await rejects(respondToReport(r1!.id, h1, true, ""), /только соперник/);
    await respondToReport(r1!.id, a1, true, "");
    assert.equal((await getMatches(cup)).find((x) => x.id === m1.id)!.winner_entry_id, m1.away_entry_id);

    const h2 = users.get((await membersOf(m2.home_entry_id!))[0])!;
    const a2 = users.get((await membersOf(m2.away_entry_id!))[0])!;
    await submitReport(m2.id, h2, [{ home: 5, away: 0 }], "", "");
    const r2 = await one<{ id: string }>("select id from match_reports where match_id = $1 and status = 'pending'", [m2.id]);
    await rejects(respondToReport(r2!.id, a2, false, ""), /Опишите/);
    await respondToReport(r2!.id, a2, false, "Мы выиграли 2:1");
    assert.equal((await getMatches(cup)).find((x) => x.id === m2.id)!.status, "under_review");
    await refereeResult(m2.id, admin, { games: [], forfeitWinner: "away" }, "техническое поражение");
  });
  await step("group stage complete → playoffs generated automatically, standings consistent", async () => {
    await playAll(cup, users, "group");
    const comp = (await getCompetition(cup))!;
    assert.equal(comp.status, "playoffs");
    assert.equal(comp.playoffs_generated, true);
    const tables = await getStandings(comp);
    for (const t of tables) {
      assert.equal(t.rows.reduce((s, r) => s + r.played, 0), 6, "3 matches × 2 sides per group");
      for (let i = 1; i < t.rows.length; i++) assert.ok(t.rows[i - 1].points >= t.rows[i].points);
    }
    const ko = (await getMatches(cup)).filter((m) => m.stage === "knockout");
    assert.equal(ko.length, 3, "2 semis + final");
    assert.ok((await getMatches(cup)).some((m) => m.stage === "third_place"));
    const qualifiers = tables.flatMap((t) => t.rows.slice(0, 2).map((r) => r.id));
    const semis = ko.filter((m) => m.round === 1);
    for (const s of semis) {
      assert.ok(qualifiers.includes(s.home_entry_id!) && qualifiers.includes(s.away_entry_id!));
      const gh = tables.find((t) => t.rows.some((r) => r.id === s.home_entry_id))!.group!.id;
      const ga = tables.find((t) => t.rows.some((r) => r.id === s.away_entry_id))!.group!.id;
      assert.notEqual(gh, ga, "group-mates don't meet in the first knockout round");
    }
  });
  await step("knockout: winner advances; loser goes to 3rd place; champion and prizes set", async () => {
    await q("insert into prizes (competition_id, place, title, amount) values ($1, 1, 'Чемпион', 100), ($1, 2, 'Финалист', 50), ($1, 3, 'Бронза', 25)", [cup]);
    await playAll(cup, users, "knockout", (m) => m.round === 1); // away wins semis
    const ms = await getMatches(cup);
    const semis = ms.filter((m) => m.stage === "knockout" && m.round === 1);
    const final = ms.find((m) => m.stage === "knockout" && m.round === 2)!;
    const third = ms.find((m) => m.stage === "third_place")!;
    assert.deepEqual(new Set([final.home_entry_id, final.away_entry_id]), new Set(semis.map((s) => s.away_entry_id)));
    assert.deepEqual(new Set([third.home_entry_id, third.away_entry_id]), new Set(semis.map((s) => s.home_entry_id)));
    await playAll(cup, users);
    const comp = (await getCompetition(cup))!;
    assert.equal(comp.status, "finished");
    const prizes = await q<{ place: number; recipient_entry_id: string }>("select place, recipient_entry_id from prizes where competition_id = $1 order by place", [cup]);
    const f = (await getMatches(cup)).find((m) => m.id === final.id)!;
    assert.equal(prizes[0].recipient_entry_id, f.winner_entry_id);
    assert.ok(prizes.every((p) => p.recipient_entry_id));
  });

  // ---------------------------------------------------------------- 2v2 knockout with byes
  const duo = await mkComp({ mode: "2v2", format: "knockout", capacity: 8, third_place: false, playoff_best_of: 1, final_best_of: 1 });
  const teams: string[] = [];
  await step("2v2: team creation, invite, duplicate player and own-team join rejected", async () => {
    for (let i = 0; i < 6; i++) {
      await createTeam(duo, players[i * 2], `Team ${i} ${RUN}`);
      const e = await one<{ id: string; invite_code: string }>("select id, invite_code from entries where competition_id = $1 and captain_id = $2", [duo, players[i * 2].id]);
      teams.push(e!.id);
      if (i < 5) {
        if (i === 0) await rejects(joinTeam(e!.invite_code, players[0]), /Это ваша команда/);
        await joinTeam(e!.invite_code, players[i * 2 + 1]);
      }
    }
    await rejects(createTeam(duo, players[1], `Dup ${RUN}`), /уже участвуете|занято/);
    const c = await entryCounts(duo);
    assert.equal(c.confirmed, 5);
    assert.equal(c.incomplete, 1);
    const full = await one<{ invite_code: string }>("select coalesce(invite_code, '') as invite_code from entries where id = $1", [teams[0]]);
    if (full!.invite_code) await rejects(joinTeam(full!.invite_code, players[10]), /нет свободного места/);
  });
  await step("2v2: incomplete team excluded from draw; 5 teams → 3 byes, bracket of 8", async () => {
    await close(duo);
    await runDraw(duo, admin);
    const ms = await getMatches(duo);
    const inDraw = new Set(ms.flatMap((m) => [m.home_entry_id, m.away_entry_id]).filter(Boolean));
    assert.ok(!inDraw.has(teams[5]), "incomplete team not in bracket");
    assert.equal(ms.filter((m) => m.is_bye).length, 3);
    assert.equal(ms.length, 7);
    await publishDraw(duo, admin);
  });
  await step("2v2: play to the final; competition finishes", async () => {
    await playAll(duo, users);
    assert.equal((await getCompetition(duo))!.status, "finished");
  });

  // ---------------------------------------------------------------- league (round robin), odd count, check-in
  const league = await mkComp({ kind: "league", format: "round_robin", double_round_robin: true, checkin_required: true, group_best_of: 3 });
  await step("league: check-in required — non-checked-in excluded", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      await registerSolo(league, players[i]);
      ids.push((await one<{ id: string }>("select entry_id as id from entry_members where competition_id = $1 and user_id = $2", [league, players[i].id]))!.id);
    }
    await rejects(checkIn(ids[0], players[0]), /закрыт/);
    await q("update competitions set checkin_open = true where id = $1", [league]);
    for (let i = 0; i < 5; i++) await checkIn(ids[i], players[i]);
    await close(league);
    await runDraw(league, admin);
    const ms = await getMatches(league);
    assert.equal(ms.length, 5 * 4, "5 players, double round robin = 20 matches");
    assert.ok(!ms.some((m) => m.home_entry_id === ids[5] || m.away_entry_id === ids[5]));
    await publishDraw(league, admin);
  });
  await step("league: Bo3 series, table, finish", async () => {
    await playAll(league, users, undefined, (m) => m.round % 2 === 0);
    const comp = (await getCompetition(league))!;
    assert.equal(comp.status, "finished");
    const [t] = await getStandings(comp);
    assert.equal(t.rows.reduce((s, r) => s + r.wins, 0), 20);
    assert.ok(t.rows.every((r) => r.played === 8));
    assert.equal(t.rows.reduce((s, r) => s + r.goalsFor - r.goalsAgainst, 0), 0);
  });

  await step("ELO: every rated match moves both sides, forfeits are not rated, corrections replace deltas", async () => {
    const lm = (await getMatches(league)).filter((m) => m.status === "completed");
    const rows = await q<{ match_id: string; user_id: string; delta: number; entry_id: string }>(
      "select match_id, user_id, delta, entry_id from rating_changes where match_id = any($1::uuid[])",
      [lm.map((m) => m.id)],
    );
    assert.equal(rows.length, lm.length * 2);
    for (const m of lm) {
      const w = rows.find((r) => r.match_id === m.id && r.entry_id === m.winner_entry_id)!;
      const l = rows.find((r) => r.match_id === m.id && r.entry_id !== m.winner_entry_id)!;
      assert.ok(w.delta > 0 && l.delta < 0, "winner gains, loser loses");
    }
    const ff = (await getMatches(cup)).filter((m) => m.forfeit);
    assert.ok(ff.length >= 1);
    assert.equal((await q("select 1 from rating_changes where match_id = any($1::uuid[])", [ff.map((m) => m.id)])).length, 0);

    // Flip the last league result: its two deltas are replaced, not added.
    const last = lm[lm.length - 1];
    const winHome = last.winner_entry_id === last.home_entry_id;
    await refereeResult(last.id, admin, { games: winHome ? [{ home: 0, away: 1 }, { home: 0, away: 1 }] : [{ home: 1, away: 0 }, { home: 1, away: 0 }] }, "исправление");
    const after = await q<{ entry_id: string; delta: number }>("select entry_id, delta from rating_changes where match_id = $1", [last.id]);
    assert.equal(after.length, 2);
    const fixed = (await getMatches(league)).find((m) => m.id === last.id)!;
    assert.ok(after.find((r) => r.entry_id === fixed.winner_entry_id)!.delta > 0);

    const lb = await leaderboard("1v1", "", 500);
    const mine = lb.filter((r) => players.some((p) => p.id === r.id));
    assert.ok(mine.length >= 5);
    const total = await tx((c) => recomputeAll(c));
    assert.ok(total >= lm.length);
    const again = await q<{ n: number }>("select count(*)::int as n from rating_changes where match_id = any($1::uuid[])", [lm.map((m) => m.id)]);
    assert.equal(again[0].n, lm.length * 2);
  });

  await step("Discord: champion recorded, role sync queues only differences", async () => {
    const comp = (await getCompetition(league))!;
    const champ = await one<{ champion_entry_id: string | null; finished_at: Date | null }>("select champion_entry_id, finished_at from competitions where id = $1", [league]);
    assert.ok(champ?.champion_entry_id && champ.finished_at, "finished league stores its champion");
    const [table] = await getStandings(comp);
    assert.equal(champ!.champion_entry_id, table.rows[0].id);

    const champUser = (await membersOf(champ!.champion_entry_id!))[0];
    const discordId = `9${Date.now()}`;
    await q("update users set discord_id = $2, discord_roles = '{}' where id = $1", [champUser, discordId]);
    const saved = await q<{ key: string; value: string }>("select key, value from settings where key in ('discord_guild_id', 'discord_layout')");
    try {
      await q("insert into settings (key, value) values ('discord_guild_id', '1') on conflict (key) do update set value = excluded.value");
      const roles: Record<string, string> = { champion: "r_champ", reigning_1v1: "r_reign1", top10: "r_top" };
      for (const tier of ["bronze", "silver", "gold", "plat", "diamond", "champ", "gc", "ssl"]) roles[`tier_${tier}`] = `r_${tier}`;
      await q("insert into settings (key, value) values ('discord_layout', $1) on conflict (key) do update set value = excluded.value", [JSON.stringify({ roles, channels: {}, messages: {} })]);
      const before = await q<{ id: number }>("select id from discord_outbox order by id desc limit 1");
      const lastId = before[0]?.id ?? 0;
      await syncRoles();
      const ops = await q<{ target: string; payload: { role: string; op: string } }>("select target, payload from discord_outbox where id > $1 and kind = 'role' and target = $2", [lastId, discordId]);
      const added = ops.filter((o) => o.payload.op === "add").map((o) => o.payload.role);
      assert.ok(added.includes("r_champ"), "tournament winner role");
      assert.ok(added.includes("r_reign1"), "latest 1v1 champion holds the reigning title");
      assert.ok(added.some((r) => /^r_(bronze|silver|gold|plat|diamond|champ|gc|ssl)$/.test(r) && r !== "r_champ"), "one tier role");
      // Second sync: nothing changed → nothing queued.
      const mid = (await q<{ id: number }>("select max(id)::int as id from discord_outbox"))[0].id;
      await syncRoles();
      assert.equal((await q("select 1 from discord_outbox where id > $1 and target = $2", [mid, discordId])).length, 0);
    } finally {
      await q("update users set discord_id = null, discord_roles = '{}' where id = $1", [champUser]);
      await q("delete from discord_outbox where target = $1", [discordId]);
      await q("delete from settings where key in ('discord_guild_id', 'discord_layout')");
      for (const r of saved) await q("insert into settings (key, value) values ($1, $2)", [r.key, r.value]);
    }
  });

  await step("schedule: propose → accept, check-in, no-show and deadline forfeits", async () => {
    const sc = await mkComp({ kind: "league", format: "round_robin", group_best_of: 1, noshow_minutes: 15 });
    for (const p of players.slice(0, 3)) await registerSolo(sc, p);
    await close(sc);
    await runDraw(sc, admin);
    await publishDraw(sc, admin);
    const [m1, m2, m3] = await getMatches(sc);
    const who = async (m: Match, s: "home" | "away") => users.get((await membersOf((s === "home" ? m.home_entry_id : m.away_entry_id)!))[0])!;
    const reload = async (id: string) => (await getMatches(sc)).find((x) => x.id === id)!;

    const h1 = await who(m1, "home"), a1 = await who(m1, "away");
    const at = new Date(Math.ceil((Date.now() + 3600_000) / 60_000) * 60_000);
    await rejects(proposeTime(m1.id, players[11].id, at), /участники/);
    await rejects(proposeTime(m1.id, h1.id, new Date(Date.now() + 60_000)), /вперёд/);
    await proposeTime(m1.id, h1.id, at);
    const p = await one<{ id: string }>("select id from match_proposals where match_id = $1 and status = 'pending'", [m1.id]);
    await rejects(respondProposal(p!.id, h1.id, true), /соперник/);
    await respondProposal(p!.id, a1.id, true);
    let m = await reload(m1.id);
    assert.equal(m.time_confirmed, true);
    assert.equal(new Date(m.scheduled_at!).getTime(), at.getTime());
    await rejects(respondProposal(p!.id, a1.id, true), /уже ответили/);

    await rejects(checkInMatch(m1.id, h1.id), /Отметиться можно/);
    await q("update matches set scheduled_at = now() + interval '10 minutes' where id = $1", [m1.id]);
    await checkInMatch(m1.id, h1.id);
    await q("update matches set scheduled_at = now() - interval '16 minutes' where id = $1", [m1.id]);
    await sweep(true);
    m = await reload(m1.id);
    assert.equal(m.status, "completed", "no-show → forfeit");
    assert.equal(m.forfeit, true);
    assert.equal(m.winner_entry_id, m1.home_entry_id, "the side that checked in wins");

    // Deadline: only the away side tried to agree → away wins.
    const a2 = await who(m2, "away");
    await proposeTime(m2.id, a2.id, new Date(Date.now() + 7200_000));
    await q("update matches set play_by = now() - interval '1 minute' where id = $1", [m2.id]);
    await sweep(true);
    m = await reload(m2.id);
    assert.equal(m.winner_entry_id, m2.away_entry_id);
    assert.equal(m.forfeit, true);

    // Nobody tried → no forfeit, referees are told, handled once.
    await q("update matches set play_by = now() - interval '1 minute' where id = $1", [m3.id]);
    const r = await sweep(true);
    m = await reload(m3.id);
    assert.notEqual(m.status, "completed");
    assert.ok(r.flagged >= 1);
    const again = await sweep(true);
    assert.equal((await reload(m3.id)).status, m.status);
    assert.equal(again.forfeits, 0);
  });

  await step("FUT card: built from real results, champion titles counted", async () => {
    const champEntry = (await one<{ champion_entry_id: string }>("select champion_entry_id from competitions where id = $1", [league]))!.champion_entry_id;
    const champUser = (await membersOf(champEntry))[0];
    const card = (await getPlayerCard(champUser))!;
    assert.ok(card.stats.played >= 8, "league matches are on the card");
    assert.ok(card.titles >= 1, "league title counted");
    assert.ok(card.stats.ovr >= 40 && card.stats.ovr <= 99);
    assert.ok(card.stats.goalsFor > 0);
    for (const k of ["atk", "def", "win", "clu", "frm", "exp"] as const) assert.ok(card.stats[k] >= 30 && card.stats[k] <= 99, k);
  });

  await step("season calendar: double round robin over 30 days, every tour has a growing deadline", async () => {
    const lc = await mkComp({ kind: "league", format: "round_robin", double_round_robin: true, season_days: 30, timezone: "Asia/Tashkent" });
    for (const p of players.slice(0, 5)) await registerSolo(lc, p);
    await close(lc);
    await runDraw(lc, admin);
    await publishDraw(lc, admin);
    const ms = (await getMatches(lc)).filter((m) => m.stage === "league" && !m.is_bye);
    const rounds = Math.max(...ms.map((m) => m.round));
    assert.equal(rounds, 10, "5 players, home and away → 10 tours (one rests each tour)");
    assert.equal(ms.length, 20);
    assert.ok(ms.every((m) => m.play_by), "every match has a deadline");
    const byRound = new Map(ms.map((m) => [m.round, new Date(m.play_by!).getTime()]));
    for (let r = 2; r <= rounds; r++) assert.ok(byRound.get(r)! > byRound.get(r - 1)!, `tour ${r} after tour ${r - 1}`);
    const lastMs = byRound.get(rounds)! - Date.now();
    assert.ok(lastMs > 28 * 86400_000 && lastMs < 31 * 86400_000, "last tour ends ~30 days from now");
    // Each pair meets twice, with home and away swapped.
    const pairs = new Map<string, number>();
    for (const m of ms) {
      const k = [m.home_entry_id, m.away_entry_id].sort().join();
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
    }
    assert.ok([...pairs.values()].every((n) => n === 2));
  });

  await step("referees: a non-playing participant is assigned and enters the score; players can't", async () => {
    const rc = await mkComp({ kind: "league", format: "round_robin", group_best_of: 1, referee_only: true });
    for (const p of players.slice(0, 4)) await registerSolo(rc, p);
    await close(rc);
    await runDraw(rc, admin);
    await publishDraw(rc, admin);
    const ms = (await getMatches(rc)).filter((m) => !m.is_bye);
    const m1 = ms[0];
    const playerOf = async (eid: string) => users.get((await membersOf(eid))[0])!;
    const a = await playerOf(m1.home_entry_id!);
    const cands = await refereeCandidates(rc);
    const outsider = users.get(cands.find((x) => x.entry_id !== m1.home_entry_id && x.entry_id !== m1.away_entry_id)!.user_id)!;

    await rejects(assignReferees(rc, { [m1.id]: a.id }, admin), /свой матч/);
    await rejects(assignReferees(rc, { [m1.id]: players[11].id }, admin), /участник соревнования/);
    assert.equal(await assignReferees(rc, { [m1.id]: outsider.id }, admin), 1);
    const fresh = (await getMatches(rc)).find((m) => m.id === m1.id)!;
    assert.equal(fresh.referee_user_id, outsider.id);
    assert.equal(fresh.referee_name, outsider.rl_nickname);
    assert.ok(await one("select 1 from notifications where user_id = $1 and title = 'Вы судья матча #{n}'", [outsider.id]));

    await rejects(submitReport(m1.id, a, [{ home: 3, away: 1 }], "", ""), /судья матча/);
    assert.equal(canReferee(outsider, fresh), true);
    assert.equal(canReferee(a, fresh), false);
    await refereeResult(m1.id, outsider, { games: [{ home: 3, away: 1 }] }, "");
    const done = (await getMatches(rc)).find((m) => m.id === m1.id)!;
    assert.equal(done.status, "completed");
    assert.equal(done.winner_entry_id, m1.home_entry_id);

    // Auto-assign tour 2: every match gets a referee who doesn't play in it, nobody twice if avoidable.
    const n = await autoAssignReferees(rc, "league", 2, admin);
    const t2 = (await getMatches(rc)).filter((m) => m.stage === "league" && m.round === 2 && !m.is_bye);
    assert.equal(n, t2.length);
    for (const m of t2) {
      assert.ok(m.referee_user_id);
      const plays = (await membersOf(m.home_entry_id!)).concat(await membersOf(m.away_entry_id!));
      assert.ok(!plays.includes(m.referee_user_id!), "referee doesn't play in the match");
    }
    assert.equal(new Set(t2.map((m) => m.referee_user_id)).size, t2.length, "different referee per match");
  });

  await step("player of the tour: poll opens after the tour, self-vote refused, winner awarded", async () => {
    const pc = await mkComp({ kind: "league", format: "round_robin", group_best_of: 1 });
    for (const p of players.slice(0, 4)) await registerSolo(pc, p);
    await close(pc);
    await runDraw(pc, admin);
    await publishDraw(pc, admin);
    const t1 = (await getMatches(pc)).filter((m) => m.stage === "league" && m.round === 1 && !m.is_bye);
    assert.equal((await runTourPolls(pc)).opened, 0, "nothing played yet → no poll");
    for (const m of t1) await refereeResult(m.id, admin, { games: [{ home: 3, away: 1 }] }, "");
    assert.equal((await runTourPolls(pc)).opened, 1);
    const list = await nominees(pc, "league", 1);
    assert.equal(list.length, t1.length * 2, "both sides of each tour-1 match are nominated");
    const star = list.find((n) => n.won)!;
    const voters = players.slice(0, 4).filter((p) => p.id !== star.user_id);
    await rejects(vote(pc, "league", 1, star.user_id, star.user_id), /За себя/);
    await rejects(vote(pc, "league", 2, voters[0].id, star.user_id), /ещё не открыто/);
    for (const v of voters) await vote(pc, "league", 1, v.id, star.user_id);
    await vote(pc, "league", 1, voters[0].id, star.user_id); // re-vote just replaces
    assert.equal((await nominees(pc, "league", 1)).find((n) => n.user_id === star.user_id)!.votes, voters.length);
    await q("update tour_polls set closes_at = now() - interval '1 minute' where competition_id = $1", [pc]);
    assert.equal((await runTourPolls(pc)).closed, 1);
    const poll = await one<{ winner_id: string; winner_votes: number }>("select winner_id, winner_votes from tour_polls where competition_id = $1", [pc]);
    assert.equal(poll!.winner_id, star.user_id);
    assert.equal(poll!.winner_votes, voters.length);
    await rejects(vote(pc, "league", 1, voters[1].id, star.user_id), /закрыто/);
    assert.ok((await tourAwards(star.user_id)) >= 1);
    assert.ok((await getPlayerCard(star.user_id))!.tourAwards >= 1, "badge counted on the FUT card");
  });

  await step("screenshots: players and referee upload, outsiders can't, max per match, magic bytes checked", async () => {
    const sc = await mkComp({ kind: "league", format: "round_robin", group_best_of: 1 });
    for (const p of players.slice(0, 4)) await registerSolo(sc, p);
    await close(sc);
    await runDraw(sc, admin);
    await publishDraw(sc, admin);
    const m = (await getMatches(sc)).find((x) => !x.is_bye && x.home_entry_id && x.away_entry_id)!;
    const home = users.get((await membersOf(m.home_entry_id!))[0])!;
    const png = new File([Buffer.from("89504e470d0a1a0a0000000d49484452", "hex")], "a.png", { type: "image/png" });
    const fake = new File([Buffer.from("not an image at all")], "b.png", { type: "image/png" });
    await rejects(saveMatchFiles(m, players[10], [png]), /только игроки/);
    await rejects(saveMatchFiles(m, home, [fake]), /Нужна картинка/);
    assert.equal(await saveMatchFiles(m, home, [png, png]), 2);
    await rejects(saveMatchFiles(m, home, Array(7).fill(png)), /Не больше/);
    const files = await listMatchFiles(m.id);
    assert.equal(files.length, 2);
    assert.equal(files[0].mime, "image/png");
    await rejects(deleteMatchFile(files[0].id, players[10]), /свой скриншот/);
    assert.equal(await deleteMatchFile(files[0].id, home), m.id);
    assert.equal((await listMatchFiles(m.id)).length, 1);
  });

  await step("achievements: unlocked by results, announced once, kept after a correction", async () => {
    const ac = await mkComp({ kind: "league", format: "round_robin", group_best_of: 1 });
    for (const p of players.slice(0, 4)) await registerSolo(ac, p);
    await close(ac);
    await runDraw(ac, admin);
    await publishDraw(ac, admin);
    const m = (await getMatches(ac)).find((x) => !x.is_bye && x.home_entry_id && x.away_entry_id)!;
    const home = users.get((await membersOf(m.home_entry_id!))[0])!;
    const before = new Set((await q<{ key: string }>("select key from user_achievements where user_id = $1", [home.id])).map((r) => r.key));
    await refereeResult(m.id, admin, { games: [{ home: 6, away: 0 }] }, "");
    const got = new Set((await q<{ key: string }>("select key from user_achievements where user_id = $1", [home.id])).map((r) => r.key));
    for (const k of ["first_win", "clean_sheet", "rout"]) assert.ok(got.has(k), k);
    const fresh = [...got].filter((k) => !before.has(k));
    const notes = await one<{ n: number }>("select count(*)::int as n from notifications where user_id = $1 and title like '🏅%' and created_at > now() - interval '5 minutes'", [home.id]);
    assert.equal(notes!.n, fresh.length, "one notification per new badge");
    // A correction to a loss doesn't take earned badges away.
    await refereeResult(m.id, admin, { games: [{ home: 0, away: 1 }] }, "");
    const list = await playerAchievements(home.id);
    assert.ok(list.find((a) => a.def.key === "clean_sheet")!.done);
    const again = await one<{ n: number }>("select count(*)::int as n from notifications where user_id = $1 and title like '🏅%' and created_at > now() - interval '5 minutes'", [home.id]);
    assert.equal(again!.n, notes!.n, "nothing announced twice");
  });

  await step("rivals, match of the round, two-day deadline nudge", async () => {
    const rc = await mkComp({ kind: "league", format: "round_robin", group_best_of: 1 });
    for (const p of players.slice(0, 4)) await registerSolo(rc, p);
    await close(rc);
    await runDraw(rc, admin);
    await publishDraw(rc, admin);
    const comp = (await getCompetition(rc))!;
    const all = (await getMatches(rc)).filter((m) => m.stage === "league" && !m.is_bye);
    const r1 = all.filter((m) => m.round === 1);
    const motw1 = await matchOfRound(comp);
    assert.equal(motw1!.round, 1);
    assert.ok(r1.some((m) => m.id === motw1!.match.id), "picked from round 1");
    for (const m of r1) await refereeResult(m.id, admin, { games: [{ home: 3, away: 1 }] }, "");
    const motw2 = await matchOfRound(comp);
    assert.equal(motw2!.round, 2, "moves on once round 1 is played");
    assert.ok(motw2!.homePos && motw2!.awayPos, "table positions known after results");

    // Test players meet across many test competitions, so compare against the record before this result.
    const home = users.get((await membersOf(r1[0].home_entry_id!))[0])!;
    const vs = (await playerRivals(home.id)).find((r) => r.last_match_id === r1[0].id)!;
    assert.ok(vs, "latest meeting is the one just played");
    assert.equal(vs.last_score, "3:1");
    assert.equal(vs.last_won, true);
    assert.equal(vs.wins + vs.losses, vs.played);

    const target = (await getMatches(rc)).find((m) => m.round === 2 && !m.is_bye && m.home_entry_id && m.away_entry_id)!;
    await q("update matches set play_by = now() + interval '30 hours', time_confirmed = false where id = $1", [target.id]);
    await sweep(true);
    const nudged = await one<{ at: Date | null }>("select remind_deadline_at as at from matches where id = $1", [target.id]);
    assert.ok(nudged!.at, "nudge recorded");
    const before = await one<{ n: number }>("select count(*)::int as n from notifications where title like '⏰%' and link = $1", [`/match/${target.id}`]);
    assert.ok(before!.n >= 2, "both players notified");
    await sweep(true);
    const after = await one<{ n: number }>("select count(*)::int as n from notifications where title like '⏰%' and link = $1", [`/match/${target.id}`]);
    assert.equal(after!.n, before!.n, "sent only once");
  });

  await step("season fun: title odds, team of the round + In-Form card, commentary and records", async () => {
    const fc = await mkComp({ kind: "league", format: "round_robin", group_best_of: 1 });
    for (const p of players.slice(0, 6)) await registerSolo(fc, p);
    await close(fc);
    await runDraw(fc, admin);
    await publishDraw(fc, admin);
    const comp = (await getCompetition(fc))!;
    const before = await leagueOdds(comp);
    const sum = [...before!.odds.values()].reduce((s, o) => s + o.title, 0);
    assert.ok(Math.abs(sum - 1) < 1e-6, "title chances add up to 100%");

    const r1 = (await getMatches(fc)).filter((m) => m.stage === "league" && m.round === 1 && !m.is_bye);
    const scores = [[7, 0], [3, 2], [2, 1]];
    for (const [i, m] of r1.entries()) await refereeResult(m.id, admin, { games: [{ home: scores[i % 3][0], away: scores[i % 3][1] }] }, "");
    await runTourPolls(fc);
    const team = await getTeamOfRound(fc, "league", 1);
    assert.equal(team.length, 2, "6 players → team of 2");
    const star = team[0];
    assert.ok(team.every((p) => p.gf > p.ga), "only winners make the team");
    assert.ok(team[0].score >= team[1].score, "ranked by performance");
    const card = (await getPlayerCard(star.user_id))!;
    assert.equal(card.inForm?.round, 1, "In-Form card is active");
    assert.ok((await one<{ n: number }>("select count(*)::int as n from notifications where user_id = $1 and title like '🃏%'", [star.user_id]))!.n >= 1);

    const after = await leagueOdds(comp);
    assert.notDeepEqual([...after!.odds.values()].map((o) => o.title), [...before!.odds.values()].map((o) => o.title), "odds move after results");

    const rec = await competitionRecords(fc);
    assert.equal(rec.biggestWin!.score, "7:0");
    assert.ok(rec.topScorer!.goals >= 7);
    const story = await matchCommentary(undefined, fc, r1[0].id);
    assert.ok(Array.isArray(story));
    assert.ok(story.some((l) => l.key === "clean"), "7:0 is a clean-sheet win");
  });

  await step("duels: challenge → accept → report → confirm; rules; expiry; levels, derby and season story", async () => {
    const [a, b, c] = [await mkUser("duel_a"), await mkUser("duel_b"), await mkUser("duel_c")];
    const lvlBefore = await playerLevel(a.id);

    await rejects(createDuel(a.id, a.id, ""), /самого себя/);
    const d1 = await createDuel(a.id, b.id, "gg?");
    await rejects(createDuel(b.id, a.id, ""), /незавершённая дуэль/);
    await rejects(respondDuel(d1, a.id, true), /только тот, кого вызвали/);
    await rejects(reportDuel(d1, a.id, 3, 1), /после принятия/);
    await respondDuel(d1, b.id, true);
    await rejects(reportDuel(d1, c.id, 3, 1), /только участники/);
    await rejects(reportDuel(d1, a.id, 2, 2), /ничьих/);
    await reportDuel(d1, b.id, 1, 3); // b reports from their side: b 1, a 3
    await rejects(confirmDuel(d1, b.id, true), /соперник/);
    await confirmDuel(d1, a.id, false); // a disagrees → back to accepted
    assert.equal((await one<{ status: string }>("select status from duels where id = $1", [d1]))!.status, "accepted");
    await reportDuel(d1, a.id, 3, 1);
    await confirmDuel(d1, b.id, true);
    const done = (await one<{ status: string; winner_id: string; ch_goals: number; op_goals: number }>("select status, winner_id, ch_goals, op_goals from duels where id = $1", [d1]))!;
    assert.deepEqual([done.status, done.winner_id, done.ch_goals, done.op_goals], ["completed", a.id, 3, 1]);

    // A second duel the other way makes it 1–1: a derby.
    const d2 = await createDuel(b.id, a.id, "");
    await respondDuel(d2, a.id, true);
    await reportDuel(d2, b.id, 4, 3);
    await q("update duels set reported_at = now() - interval '25 hours' where id = $1", [d2]);
    await sweepDuels();
    assert.equal((await one<{ status: string }>("select status from duels where id = $1", [d2]))!.status, "completed", "auto-confirmed after 24h");
    const rv = (await rivalryBetween(a.id, b.id))!;
    assert.ok(rv.meetings >= 2);

    // Unanswered challenges expire; cancelled ones stay cancelled.
    const d3 = await createDuel(a.id, c.id, "");
    await q("update duels set created_at = now() - interval '73 hours' where id = $1", [d3]);
    await sweepDuels();
    assert.equal((await one<{ status: string }>("select status from duels where id = $1", [d3]))!.status, "expired");
    const d4 = await createDuel(c.id, a.id, "");
    await cancelDuel(d4, c.id);
    assert.equal((await one<{ status: string }>("select status from duels where id = $1", [d4]))!.status, "cancelled");

    const lvlAfter = await playerLevel(a.id);
    assert.equal(lvlAfter.xp - lvlBefore.xp, 2 * 10 + 1 * 10, "two duels played, one won");

    // Season story for someone with league results.
    const someComp = await one<{ competition_id: string; user_id: string }>(
      `select e.competition_id, em.user_id from matches m join entries e on e.id = m.home_entry_id join entry_members em on em.entry_id = e.id
        where m.status = 'completed' and not m.is_bye and e.status = 'confirmed' order by m.completed_at desc limit 1`,
    );
    const season = (await playerSeason(someComp!.user_id, someComp!.competition_id))!;
    assert.ok(season.story.played >= 1);
    assert.equal(season.story.wins + season.story.losses, season.story.played);
  });

  await step("password reset: temporary password, one-time link, admins can't reset admins", async () => {
    const player = await mkUser("forgetful");
    const plainAdmin = await mkUser("plain_admin", "admin");
    const otherAdmin = await mkUser("other_admin", "admin");
    const temp = await resetToTemp(plainAdmin, player.id);
    assert.match(temp.password, /^rl-[a-z2-9]{4}-[a-z2-9]{4}$/);
    const row = (await one<{ password_hash: string; must_change_password: boolean }>("select password_hash, must_change_password from users where id = $1", [player.id]))!;
    assert.ok(await verifyPassword(temp.password, row.password_hash), "the temporary password works");
    assert.equal(row.must_change_password, true, "a change is required at the next sign-in");

    const { link } = await resetLink(plainAdmin, player.id);
    const token = decodeURIComponent(link.split("token=")[1]);
    assert.equal((await checkResetToken(token))?.id, player.id);
    await consumeResetToken(token, "brand-new-pass");
    const after = (await one<{ password_hash: string; must_change_password: boolean }>("select password_hash, must_change_password from users where id = $1", [player.id]))!;
    assert.ok(await verifyPassword("brand-new-pass", after.password_hash));
    assert.equal(after.must_change_password, false);
    assert.equal(await checkResetToken(token), null, "the link works only once");
    await rejects(consumeResetToken(token, "again-pass-1"), /устарела/);

    await rejects(resetToTemp(plainAdmin, otherAdmin.id), /супер-администратор/);
    await rejects(resetToTemp(plainAdmin, plainAdmin.id), /в профиле/);
    const boss = await mkUser("boss", "superadmin");
    assert.ok((await resetToTemp(boss, otherAdmin.id)).password, "the super admin can reset an admin");
  });

  console.log(`\n${passed} integration checks passed`);
  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
