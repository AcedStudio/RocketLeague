import "server-only";
import { rateMatch } from "./rating";
import type { PoolClient } from "@neondatabase/serverless";
import { q, one, tx, lockCompetition, isUniqueViolation, type Queryable } from "./db";
import { FormError } from "./errors";
import { notify, notifyEntries, logAction, matchEvent } from "./notify";
import { getCompetition, getStandings, entryCounts, type Competition, type Match, type Entry } from "./data";
import { drawGroups, validateDraw, GROUP_LETTERS } from "./engine/draw.ts";
import { roundRobin, seasonDeadlineDays } from "./engine/roundRobin.ts";
import { fromLocalInput, toLocalInput } from "./format";
import { buildKnockout, seedQualifiers, type QualifierRow } from "./engine/knockout.ts";
import { createRng, randomSeed, shuffle } from "./engine/rng.ts";
import { validateSeries, type GameScore } from "./engine/results.ts";
import type { User } from "./auth";
import type { Params } from "./i18n/core";
import { enqueueChannel, enqueueParticipantRole, GOLD_COLOR } from "./discord";
import { discordAfterResult, discordAfterFinish, eloLines } from "./discord-server";

// ---------------------------------------------------------------- helpers

async function compForUpdate(c: PoolClient, competitionId: string): Promise<Competition> {
  await lockCompetition(c, competitionId);
  const comp = await getCompetition(competitionId, c);
  if (!comp) throw new FormError("Соревнование не найдено");
  return comp;
}

async function nextMatchNumber(c: Queryable, competitionId: string) {
  const r = await one<{ n: number }>("select coalesce(max(number), 0)::int + 1 as n from matches where competition_id = $1", [competitionId], c);
  return r!.n;
}

function inviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function registrationOpen(comp: Competition): string | null {
  if (comp.status !== "registration") return "Регистрация сейчас закрыта";
  if (comp.registration_deadline && new Date(comp.registration_deadline).getTime() < Date.now()) return "Срок регистрации истёк";
  return null;
}

// ---------------------------------------------------------------- registration

async function placeEntry(c: PoolClient, comp: Competition): Promise<"pending" | "confirmed" | "waitlist"> {
  const counts = await entryCounts(comp.id, c);
  if (counts.active >= comp.capacity) return "waitlist";
  return comp.require_approval ? "pending" : "confirmed";
}

async function nextEntryNumber(c: Queryable, competitionId: string) {
  const r = await one<{ n: number }>("select coalesce(max(number), 0)::int + 1 as n from entries where competition_id = $1", [competitionId], c);
  return r!.n;
}

const ENTRY_STATUS_MESSAGE: Record<string, string> = {
  confirmed: "Регистрация подтверждена",
  pending: "Заявка отправлена и ждёт одобрения администратора",
  waitlist: "Мест нет — вы в листе ожидания",
  incomplete: "Команда создана. Отправьте напарнику ссылку-приглашение",
};

export async function registerSolo(competitionId: string, user: User): Promise<string> {
  try {
    return await tx(async (c) => {
      const comp = await compForUpdate(c, competitionId);
      const closed = registrationOpen(comp);
      if (closed) throw new FormError(closed);
      if (comp.mode !== "1v1") throw new FormError("Это соревнование для команд 2v2");
      if (!comp.platforms.includes(user.platform)) throw new FormError("Ваша платформа не допущена к этому соревнованию");
      const status = await placeEntry(c, comp);
      const number = await nextEntryNumber(c, comp.id);
      const entry = await one<{ id: string }>(
        "insert into entries (competition_id, number, name, captain_id, status) values ($1, $2, $3, $4, $5) returning id",
        [comp.id, number, user.rl_nickname, user.id, status],
        c,
      );
      await q("insert into entry_members (entry_id, user_id, competition_id, is_captain) values ($1, $2, $3, true)", [entry!.id, user.id, comp.id], c);
      await notify(c, [user.id], "{comp}: " + ENTRY_STATUS_MESSAGE[status], "Ваш номер участника: #{n}", `/c/${comp.slug}`, { comp: comp.name, n: number });
      await enqueueParticipantRole(c, entry!.id);
      return ENTRY_STATUS_MESSAGE[status];
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new FormError("Вы уже зарегистрированы в этом соревновании");
    throw err;
  }
}

export async function createTeam(competitionId: string, user: User, teamName: string): Promise<string> {
  try {
    return await tx(async (c) => {
      const comp = await compForUpdate(c, competitionId);
      const closed = registrationOpen(comp);
      if (closed) throw new FormError(closed);
      if (comp.mode !== "2v2") throw new FormError("Это соревнование для игроков 1v1");
      if (!comp.platforms.includes(user.platform)) throw new FormError("Ваша платформа не допущена к этому соревнованию");
      const number = await nextEntryNumber(c, comp.id);
      const entry = await one<{ id: string }>(
        "insert into entries (competition_id, number, name, captain_id, status, invite_code) values ($1, $2, $3, $4, 'incomplete', $5) returning id",
        [comp.id, number, teamName, user.id, inviteCode()],
        c,
      );
      await q("insert into entry_members (entry_id, user_id, competition_id, is_captain) values ($1, $2, $3, true)", [entry!.id, user.id, comp.id], c);
      return ENTRY_STATUS_MESSAGE.incomplete;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new FormError("Название команды занято или вы уже участвуете в этом соревновании");
    throw err;
  }
}

export async function joinTeam(code: string, user: User): Promise<{ slug: string; message: string }> {
  try {
    return await tx(async (c) => {
      const pre = await one<{ competition_id: string }>("select competition_id from entries where invite_code = $1", [code], c);
      if (!pre) throw new FormError("Приглашение не найдено");
      const comp = await compForUpdate(c, pre.competition_id);
      const entry = await one<Entry>("select * from entries where invite_code = $1", [code], c);
      if (!entry || entry.status !== "incomplete") throw new FormError("В этой команде уже нет свободного места");
      const closed = registrationOpen(comp);
      if (closed) throw new FormError(closed);
      if (entry.captain_id === user.id) throw new FormError("Это ваша команда — отправьте ссылку напарнику");
      if (!comp.platforms.includes(user.platform)) throw new FormError("Ваша платформа не допущена к этому соревнованию");
      await q("insert into entry_members (entry_id, user_id, competition_id, is_captain) values ($1, $2, $3, false)", [entry.id, user.id, comp.id], c);
      const status = await placeEntry(c, comp);
      await q("update entries set status = $2 where id = $1", [entry.id, status], c);
      await notifyEntries(c, [entry.id], "{team}: команда собрана", ENTRY_STATUS_MESSAGE[status], `/c/${comp.slug}`, { team: entry.name });
      await enqueueParticipantRole(c, entry.id);
      return { slug: comp.slug, message: ENTRY_STATUS_MESSAGE[status] };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new FormError("Вы уже участвуете в этом соревновании");
    throw err;
  }
}

/** Fills free slots from the waiting list, oldest first. */
export async function promoteWaitlist(c: PoolClient, comp: Competition) {
  for (;;) {
    const counts = await entryCounts(comp.id, c);
    if (counts.active >= comp.capacity) return;
    const next = await one<{ id: string; name: string }>(
      "select id, name from entries where competition_id = $1 and status = 'waitlist' order by created_at limit 1",
      [comp.id],
      c,
    );
    if (!next) return;
    const status = comp.require_approval ? "pending" : "confirmed";
    await q("update entries set status = $2 where id = $1", [next.id, status], c);
    await notifyEntries(c, [next.id], "{comp}: освободилось место", ENTRY_STATUS_MESSAGE[status], `/c/${comp.slug}`, { comp: comp.name });
    await enqueueParticipantRole(c, next.id);
  }
}

async function deactivate(c: PoolClient, entryId: string, status: "cancelled" | "rejected") {
  await q("update entries set status = $2, invite_code = null where id = $1", [entryId, status], c);
  await q("update entry_members set active = false where entry_id = $1", [entryId], c);
}

/** Captain withdraws the entry, or the second player leaves a 2v2 team. */
export async function withdraw(entryId: string, user: User): Promise<string> {
  return tx(async (c) => {
    const pre = await one<{ competition_id: string }>("select competition_id from entries where id = $1", [entryId], c);
    if (!pre) throw new FormError("Заявка не найдена");
    const comp = await compForUpdate(c, pre.competition_id);
    const entry = await one<Entry>("select * from entries where id = $1", [entryId], c);
    if (!entry || entry.status === "cancelled" || entry.status === "rejected") throw new FormError("Заявка уже не активна");
    const member = await one<{ is_captain: boolean }>("select is_captain from entry_members where entry_id = $1 and user_id = $2 and active", [entryId, user.id], c);
    if (!member) throw new FormError("Вы не состоите в этой заявке");
    if (comp.draw_state !== "none" || !["registration", "closed"].includes(comp.status)) throw new FormError("После жеребьёвки отменить участие нельзя — свяжитесь с администратором");
    if (comp.registration_deadline && new Date(comp.registration_deadline).getTime() < Date.now()) throw new FormError("Срок регистрации истёк — отмена недоступна");

    if (member.is_captain) {
      await deactivate(c, entryId, "cancelled");
      await promoteWaitlist(c, comp);
      return "Регистрация отменена";
    }
    // Partner leaves: team goes back to "waiting for second player" and frees its slot.
    await q("update entry_members set active = false where entry_id = $1 and user_id = $2", [entryId, user.id], c);
    await q("update entries set status = 'incomplete', invite_code = coalesce(invite_code, $2), checked_in_at = null where id = $1", [entryId, inviteCode()], c);
    await notify(c, [entry.captain_id], "{team}: напарник покинул команду", "Пригласите нового игрока по ссылке", `/c/${comp.slug}`, { team: entry.name });
    await promoteWaitlist(c, comp);
    return "Вы покинули команду";
  });
}

export async function checkIn(entryId: string, user: User): Promise<string> {
  return tx(async (c) => {
    const pre = await one<{ competition_id: string }>("select competition_id from entries where id = $1", [entryId], c);
    if (!pre) throw new FormError("Заявка не найдена");
    const comp = await compForUpdate(c, pre.competition_id);
    if (!comp.checkin_open) throw new FormError("Чек-ин сейчас закрыт");
    const entry = await one<Entry>("select * from entries where id = $1", [entryId], c);
    if (entry?.status !== "confirmed") throw new FormError("Чек-ин доступен только подтверждённым участникам");
    const member = await one("select 1 from entry_members where entry_id = $1 and user_id = $2 and active", [entryId, user.id], c);
    if (!member) throw new FormError("Вы не состоите в этой заявке");
    await q("update entries set checked_in_at = coalesce(checked_in_at, now()) where id = $1", [entryId], c);
    return "Чек-ин пройден";
  });
}

// ---------------------------------------------------------------- admin: entries

export async function adminSetEntryStatus(entryId: string, action: "approve" | "reject" | "remove" | "confirm_waitlist", actor: User) {
  return tx(async (c) => {
    const pre = await one<{ competition_id: string }>("select competition_id from entries where id = $1", [entryId], c);
    if (!pre) throw new FormError("Заявка не найдена");
    const comp = await compForUpdate(c, pre.competition_id);
    const entry = await one<Entry>("select * from entries where id = $1", [entryId], c);
    if (!entry) throw new FormError("Заявка не найдена");
    if (comp.draw_state === "published" && action !== "approve") throw new FormError("Жеребьёвка опубликована: состав участников заблокирован");

    if (action === "approve") {
      if (entry.status !== "pending") throw new FormError("Одобрить можно только заявку на проверке");
      await q("update entries set status = 'confirmed' where id = $1", [entryId], c);
      await notifyEntries(c, [entryId], "{comp}: заявка одобрена", "Вы в списке участников", `/c/${comp.slug}`, { comp: comp.name });
      await enqueueParticipantRole(c, entryId);
    } else if (action === "confirm_waitlist") {
      if (entry.status !== "waitlist") throw new FormError("Заявка не в листе ожидания");
      const counts = await entryCounts(comp.id, c);
      if (counts.active >= comp.capacity) throw new FormError("Нет свободных мест — увеличьте вместимость");
      await q("update entries set status = 'confirmed' where id = $1", [entryId], c);
      await notifyEntries(c, [entryId], "{comp}: вы в основном списке", "", `/c/${comp.slug}`, { comp: comp.name });
      await enqueueParticipantRole(c, entryId);
    } else {
      if (comp.draw_state === "preview") throw new FormError("Сначала сбросьте предварительную жеребьёвку");
      await deactivate(c, entryId, action === "reject" ? "rejected" : "cancelled");
      await notify(c, [entry.captain_id], action === "reject" ? "{comp}: заявка отклонена администратором" : "{comp}: заявка снята администратором", "", `/c/${comp.slug}`, { comp: comp.name });
      await promoteWaitlist(c, comp);
    }
    await logAction(c, actor.id, `entry.${action}`, `${comp.name}: #${entry.number} ${entry.name}`);
  });
}

// ---------------------------------------------------------------- draw

async function insertFixtures(c: PoolClient, comp: Competition, groupId: string, ids: string[], stage: "group" | "league", startNumber: number) {
  const fixtures = roundRobin(ids, { double: comp.double_round_robin });
  let n = startNumber;
  for (const f of fixtures.sort((a, b) => a.round - b.round)) {
    await q(
      `insert into matches (competition_id, number, stage, group_id, round, home_entry_id, away_entry_id, best_of, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'ready')`,
      [comp.id, n++, stage, groupId, f.round, f.home, f.away, comp.group_best_of],
      c,
    );
  }
  return n;
}

async function insertBracket(c: PoolClient, comp: Competition, seeded: string[], startNumber: number) {
  const bracket = buildKnockout(seeded, { thirdPlace: comp.third_place });
  const ordered = bracket.matches.slice().sort((a, b) => a.round - b.round || (a.stage === "third_place" ? -1 : 0) - (b.stage === "third_place" ? -1 : 0) || a.index - b.index);
  const ids = new Map<string, string>();
  let n = startNumber;
  for (const m of ordered) {
    const isFinal = m.stage === "knockout" && m.round === bracket.rounds;
    const bestOf = isFinal ? comp.final_best_of : comp.playoff_best_of;
    const status = m.isBye ? "completed" : m.home && m.away ? "ready" : "upcoming";
    const row = await one<{ id: string }>(
      `insert into matches (competition_id, number, stage, round, bracket_index, bracket_key, home_entry_id, away_entry_id, best_of, status, is_bye, winner_entry_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
      [comp.id, n++, m.stage, m.round, m.index, m.key, m.home, m.away, bestOf, status, m.isBye, m.winner],
      c,
    );
    ids.set(m.key, row!.id);
  }
  for (const m of bracket.matches) {
    if (!m.nextKey && !m.loserNextKey) continue;
    await q(
      "update matches set next_match_id = $2, next_side = $3, loser_next_match_id = $4, loser_next_side = $5 where id = $1",
      [ids.get(m.key), m.nextKey ? ids.get(m.nextKey) : null, m.nextSide, m.loserNextKey ? ids.get(m.loserNextKey) : null, m.loserNextSide],
      c,
    );
  }
}

/** Draw preview. Can be repeated until it is published; publishing locks it. */
export async function runDraw(competitionId: string, actor: User): Promise<string> {
  return tx(async (c) => {
    const comp = await compForUpdate(c, competitionId);
    if (comp.draw_state === "published") throw new FormError("Жеребьёвка уже опубликована и заблокирована");
    if (comp.status !== "closed") throw new FormError("Сначала закройте регистрацию");

    const eligible = await q<{ id: string; seed: number | null }>(
      `select id, seed from entries where competition_id = $1 and status = 'confirmed' and ($2 = false or checked_in_at is not null) order by number`,
      [comp.id, comp.checkin_required],
      c,
    );
    if (eligible.length < 2) {
      throw new FormError(comp.checkin_required ? "Для жеребьёвки нужно минимум 2 подтверждённых участника с пройденным чек-ином" : "Для жеребьёвки нужно минимум 2 подтверждённых участника");
    }

    await q("delete from matches where competition_id = $1", [comp.id], c);
    await q("delete from groups where competition_id = $1", [comp.id], c);
    const seed = randomSeed();

    if (comp.format === "groups_knockout") {
      const err = validateDraw(eligible.length, comp.group_count);
      if (err) throw new FormError(err);
      const minGroup = Math.floor(eligible.length / comp.group_count);
      if (comp.qualifiers_per_group >= minGroup) throw new FormError("Из группы на {size} участников не могут выйти {q}: уменьшите число выходящих или групп", { size: minGroup, q: comp.qualifiers_per_group });
      const result = drawGroups(eligible.map((e) => ({ id: e.id, seed: e.seed })), { groupCount: comp.group_count, seeded: comp.seeded_draw, seed });
      let n = 1;
      for (let i = 0; i < result.groups.length; i++) {
        const g = await one<{ id: string }>("insert into groups (competition_id, name, position) values ($1, $2, $3) returning id", [comp.id, `Группа ${GROUP_LETTERS[i]}`, i], c);
        for (const entryId of result.groups[i]) {
          await q("insert into group_entries (group_id, entry_id, competition_id) values ($1, $2, $3)", [g!.id, entryId, comp.id], c);
        }
        n = await insertFixtures(c, comp, g!.id, result.groups[i], "group", n);
      }
    } else if (comp.format === "round_robin") {
      const order = shuffle(eligible.map((e) => e.id), createRng(seed));
      const g = await one<{ id: string }>("insert into groups (competition_id, name, position) values ($1, 'Таблица', 0) returning id", [comp.id], c);
      for (const id of order) await q("insert into group_entries (group_id, entry_id, competition_id) values ($1, $2, $3)", [g!.id, id, comp.id], c);
      await insertFixtures(c, comp, g!.id, order, "league", 1);
    } else {
      const rng = createRng(seed);
      const seededList = comp.seeded_draw
        ? [...eligible.filter((e) => e.seed != null).sort((a, b) => a.seed! - b.seed!), ...shuffle(eligible.filter((e) => e.seed == null), rng)]
        : shuffle(eligible, rng);
      await insertBracket(c, comp, seededList.map((e) => e.id), 1);
    }

    await q("update competitions set draw_seed = $2, draw_state = 'preview', updated_at = now() where id = $1", [comp.id, seed], c);
    await logAction(c, actor.id, "draw.preview", `${comp.name}: ${eligible.length} участников, seed ${seed}`);
    return "Жеребьёвка проведена. Проверьте результат и опубликуйте.";
  });
}

export async function resetDraw(competitionId: string, actor: User) {
  return tx(async (c) => {
    const comp = await compForUpdate(c, competitionId);
    if (comp.draw_state !== "preview") throw new FormError("Сбросить можно только неопубликованную жеребьёвку");
    await q("delete from matches where competition_id = $1", [comp.id], c);
    await q("delete from groups where competition_id = $1", [comp.id], c);
    await q("update competitions set draw_state = 'none', draw_seed = null where id = $1", [comp.id], c);
    await logAction(c, actor.id, "draw.reset", comp.name);
  });
}

const addDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/**
 * Football-style calendar: spreads the league/group tours over the season length,
 * giving every tour a deadline (23:59 local time of its last day). Returns the tour count.
 */
export async function applySeasonCalendar(c: PoolClient, comp: Competition, days = comp.season_days): Promise<number> {
  if (!days || comp.format === "knockout") return 0;
  const stage = comp.format === "round_robin" ? "league" : "group";
  const rounds = (await one<{ r: number | null }>("select max(round)::int as r from matches where competition_id = $1 and stage = $2", [comp.id, stage], c))?.r ?? 0;
  const deadlines = seasonDeadlineDays(rounds, days);
  const startMs = Math.max(Date.now(), comp.start_at ? new Date(comp.start_at).getTime() : 0);
  const firstDay = toLocalInput(new Date(startMs), comp.timezone).slice(0, 10);
  for (let r = 1; r <= rounds; r++) {
    const at = fromLocalInput(`${addDays(firstDay, deadlines[r - 1] - 1)}T23:59`, comp.timezone);
    await q(
      "update matches set play_by = $4, auto_handled_at = null, updated_at = now() where competition_id = $1 and stage = $2 and round = $3 and status <> 'completed'",
      [comp.id, stage, r, at],
      c,
    );
  }
  return rounds;
}

export async function publishDraw(competitionId: string, actor: User) {
  return tx(async (c) => {
    const comp = await compForUpdate(c, competitionId);
    if (comp.draw_state !== "preview") throw new FormError("Нечего публиковать — сначала проведите жеребьёвку");
    const status = comp.format === "knockout" ? "playoffs" : "in_progress";
    await q(
      `update competitions set draw_state = 'published', draw_published_at = now(), status = $2, playoffs_generated = $3, checkin_open = false, updated_at = now() where id = $1`,
      [comp.id, status, comp.format === "knockout"],
      c,
    );
    await applySeasonCalendar(c, comp);
    const ids = await q<{ entry_id: string }>(
      "select distinct x.entry_id from (select home_entry_id as entry_id from matches where competition_id = $1 union select away_entry_id from matches where competition_id = $1) x where x.entry_id is not null",
      [comp.id],
      c,
    );
    await notifyEntries(c, ids.map((r) => r.entry_id), "{comp}: жеребьёвка опубликована", "Соперники и расписание уже на сайте", `/c/${comp.slug}/${comp.format === "knockout" ? "matches" : "calendar"}`, { comp: comp.name });
    const groupRows = await q<{ name: string; members: string }>(
      `select g.name, string_agg(e.name, E'\n' order by e.name) as members from groups g
         join group_entries ge on ge.group_id = g.id join entries e on e.id = ge.entry_id
        where g.competition_id = $1 group by g.id, g.name, g.position order by g.position`,
      [comp.id],
      c,
    );
    await enqueueChannel(c, "announce", {
      title: "{comp}: жеребьёвка опубликована",
      description: "Соперники и расписание уже на сайте",
      params: { comp: comp.name },
      link: `/c/${comp.slug}/${comp.format === "groups_knockout" ? "draw" : comp.format === "knockout" ? "bracket" : "matches"}`,
      fields: comp.format === "groups_knockout" ? groupRows.map((g) => ({ name: g.name, value: g.members, inline: true })) : undefined,
    });
    await logAction(c, actor.id, "draw.publish", comp.name);
  });
}

export async function generatePlayoffs(competitionId: string, actor: User) {
  return tx(async (c) => {
    const comp = await compForUpdate(c, competitionId);
    if (comp.format !== "groups_knockout") throw new FormError("Плей-офф генерируется только для формата «Группы + плей-офф»");
    if (comp.draw_state !== "published") throw new FormError("Сначала опубликуйте жеребьёвку");
    if (comp.playoffs_generated) throw new FormError("Сетка плей-офф уже создана");
    const left = await one<{ n: number }>("select count(*)::int as n from matches where competition_id = $1 and stage = 'group' and status <> 'completed'", [comp.id], c);
    if (left!.n > 0) throw new FormError("Групповой этап не завершён: осталось матчей: {n}", { n: left!.n });
    await buildPlayoffs(c, comp, actor.id);
  });
}

async function buildPlayoffs(c: PoolClient, comp: Competition, actorId: string | null) {
  const tables = await getStandings(comp, c);
  const rows: QualifierRow[] = [];
  for (const t of tables) {
    for (const r of t.rows.slice(0, comp.qualifiers_per_group)) {
      rows.push({ id: r.id, group: t.group?.name ?? "", position: r.position, points: r.points, goalDiff: r.goalDiff, goalsFor: r.goalsFor });
    }
  }
  const seeds = seedQualifiers(rows);
  await insertBracket(c, comp, seeds, await nextMatchNumber(c, comp.id));
  await q("update competitions set playoffs_generated = true, status = 'playoffs', updated_at = now() where id = $1", [comp.id], c);
  await notifyEntries(c, seeds, "{comp}: вы вышли в плей-офф!", "Сетка опубликована", `/c/${comp.slug}/bracket`, { comp: comp.name });
  await enqueueChannel(c, "announce", { title: "{comp}: сетка плей-офф готова", description: "Сетка опубликована", params: { comp: comp.name }, link: `/c/${comp.slug}/bracket` });
  await logAction(c, actorId, "playoffs.generate", `${comp.name}: ${seeds.length} участников`);
}

// ---------------------------------------------------------------- results

export type OfficialResult = { games: GameScore[]; forfeitWinner?: "home" | "away" };

/** Makes a result official, updates the bracket and finishes the competition when done. */
export async function applyResult(c: PoolClient, matchId: string, result: OfficialResult, actorId: string | null, note: string, noteParams: Params = {}) {
  const pre = await one<{ competition_id: string }>("select competition_id from matches where id = $1", [matchId], c);
  if (!pre) throw new FormError("Матч не найден");
  const comp = await compForUpdate(c, pre.competition_id);
  const m = await one<Match>("select * from matches where id = $1", [matchId], c);
  if (!m) throw new FormError("Матч не найден");
  if (m.is_bye) throw new FormError("Это проход без игры (bye)");
  if (!m.home_entry_id || !m.away_entry_id) throw new FormError("Соперники ещё не определены");
  if (comp.draw_state !== "published") throw new FormError("Жеребьёвка ещё не опубликована");

  let winnerSide: "home" | "away";
  let games: GameScore[] = [];
  let hw = 0, aw = 0, hg = 0, ag = 0;
  if (result.forfeitWinner) {
    winnerSide = result.forfeitWinner;
  } else {
    const s = validateSeries(result.games, m.best_of);
    if (!s.ok) throw new FormError(s.error, s.params);
    winnerSide = s.winner;
    games = result.games;
    hw = s.homeWins; aw = s.awayWins; hg = s.homeGoals; ag = s.awayGoals;
  }
  const winner = winnerSide === "home" ? m.home_entry_id : m.away_entry_id;
  const loser = winnerSide === "home" ? m.away_entry_id : m.home_entry_id;

  // Changing a knockout winner is only safe while the next match hasn't been played.
  for (const nextId of [m.next_match_id, m.loser_next_match_id]) {
    if (!nextId || m.winner_entry_id === null || m.winner_entry_id === winner) continue;
    const next = await one<{ status: string }>("select status from matches where id = $1", [nextId], c);
    if (next?.status === "completed") throw new FormError("Следующий матч сетки уже сыгран — сначала исправьте его результат");
  }

  await q(
    `update matches set games = $2, home_wins = $3, away_wins = $4, home_goals = $5, away_goals = $6, winner_entry_id = $7,
            forfeit = $8, status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now() where id = $1`,
    [m.id, JSON.stringify(games), hw, aw, hg, ag, winner, !!result.forfeitWinner],
    c,
  );
  await q("update match_reports set status = 'superseded' where match_id = $1 and status = 'pending'", [m.id], c);
  await matchEvent(c, m.id, actorId, note, noteParams);
  await rateMatch(c, m.id);

  if (m.next_match_id && m.next_side) await placeIntoSlot(c, m.next_match_id, m.next_side, winner);
  if (m.loser_next_match_id && m.loser_next_side) await placeIntoSlot(c, m.loser_next_match_id, m.loser_next_side, loser);

  await notifyEntries(c, [m.home_entry_id, m.away_entry_id], "{comp}: результат матча #{n} утверждён", "", `/match/${m.id}`, { comp: comp.name, n: m.number });
  const names = await q<{ id: string; name: string }>("select id, name from entries where id = any($1::uuid[])", [[m.home_entry_id, m.away_entry_id]], c);
  const nameOf = (id: string) => names.find((x) => x.id === id)?.name ?? "?";
  const elo = await eloLines(c, m.id);
  await enqueueChannel(c, "results", {
    title: "{home} {score} {away}",
    description: "{comp} · матч #{n}",
    params: { home: nameOf(m.home_entry_id), away: nameOf(m.away_entry_id), score: result.forfeitWinner ? (winnerSide === "home" ? "W:FF" : "FF:W") : `${hw}:${aw}`, comp: comp.name, n: m.number },
    fields: elo ? [{ name: "ELO", value: elo }] : undefined,
    image: `/api/match-card/${m.id}?v=${hw}-${aw}-${Date.now()}`,
    link: `/match/${m.id}`,
  });
  await discordAfterResult(c, m.id);
  await maybeFinish(c, comp);
}

async function placeIntoSlot(c: PoolClient, matchId: string, side: "home" | "away", entryId: string) {
  const col = side === "home" ? "home_entry_id" : "away_entry_id";
  const next = await one<Match>(`update matches set ${col} = $2, updated_at = now() where id = $1 returning *`, [matchId, entryId], c);
  if (next && next.home_entry_id && next.away_entry_id && next.status === "upcoming") {
    await q("update matches set status = 'ready' where id = $1", [matchId], c);
    await notifyEntries(c, [next.home_entry_id, next.away_entry_id], "Ваш следующий соперник определён (матч #{n})", "", `/match/${matchId}`, { n: next.number });
  }
}

async function maybeFinish(c: PoolClient, comp: Competition) {
  // Group stage over → playoffs are generated automatically.
  if (comp.format === "groups_knockout" && !comp.playoffs_generated) {
    const left = await one<{ n: number }>("select count(*)::int as n from matches where competition_id = $1 and stage = 'group' and status <> 'completed'", [comp.id], c);
    if (left!.n === 0) await buildPlayoffs(c, comp, null);
    return;
  }
  const places = new Map<number, string>();
  if (comp.format === "round_robin") {
    const left = await one<{ n: number }>("select count(*)::int as n from matches where competition_id = $1 and status <> 'completed'", [comp.id], c);
    if (left!.n > 0) return;
    const [table] = await getStandings(comp, c);
    table?.rows.forEach((r) => places.set(r.position, r.id));
  } else {
    if (!comp.playoffs_generated) return;
    const final = await one<Match>("select * from matches where competition_id = $1 and stage = 'knockout' and next_match_id is null order by round desc limit 1", [comp.id], c);
    if (!final || final.status !== "completed") return;
    const third = await one<Match>("select * from matches where competition_id = $1 and stage = 'third_place'", [comp.id], c);
    if (third && third.status !== "completed") return;
    places.set(1, final.winner_entry_id!);
    places.set(2, final.winner_entry_id === final.home_entry_id ? final.away_entry_id! : final.home_entry_id!);
    if (third?.winner_entry_id) places.set(3, third.winner_entry_id);
  }
  await q("update competitions set status = 'finished', champion_entry_id = $2, finished_at = now(), updated_at = now() where id = $1", [comp.id, places.get(1) ?? null], c);
  for (const [place, entryId] of places) {
    await q("update prizes set recipient_entry_id = $3 where competition_id = $1 and place = $2", [comp.id, place, entryId], c);
  }
  const champion = places.get(1);
  if (champion) {
    const name = await one<{ name: string }>("select name from entries where id = $1", [champion], c);
    const all = await q<{ user_id: string }>("select user_id from entry_members where competition_id = $1 and active", [comp.id], c);
    await notify(c, all.map((r) => r.user_id), "{comp} завершён", "Чемпион: {champion}", `/c/${comp.slug}`, { comp: comp.name, champion: name?.name ?? "" });
    await enqueueChannel(c, "announce", { title: "{comp} завершён", description: "Чемпион: {champion}", params: { comp: comp.name, champion: name?.name ?? "" }, link: `/c/${comp.slug}`, color: GOLD_COLOR });
  }
  await discordAfterFinish(c, comp.id);
}

/** Entry ids of the match sides the user belongs to. */
export async function userSide(m: Match, userId: string): Promise<"home" | "away" | null> {
  const r = await one<{ entry_id: string }>(
    "select entry_id from entry_members where user_id = $1 and active and entry_id = any($2::uuid[])",
    [userId, [m.home_entry_id, m.away_entry_id].filter(Boolean)],
  );
  if (!r) return null;
  return r.entry_id === m.home_entry_id ? "home" : "away";
}

/** Player submits a result. Matching reports from both sides make it official automatically. */
export async function submitReport(matchId: string, user: User, games: GameScore[], proofUrl: string, comment: string): Promise<string> {
  return tx(async (c) => {
    const m = await one<Match>("select * from matches where id = $1", [matchId], c);
    if (!m) throw new FormError("Матч не найден");
    await lockCompetition(c, m.competition_id);
    const comp = await getCompetition(m.competition_id, c);
    if (comp?.draw_state !== "published") throw new FormError("Жеребьёвка ещё не опубликована");
    if (comp.referee_only) throw new FormError("В этом соревновании счёт вносит судья матча");
    if (m.status === "completed") throw new FormError("Результат уже утверждён");
    if (m.status === "under_review") throw new FormError("Матч на рассмотрении у судьи");
    if (!m.home_entry_id || !m.away_entry_id) throw new FormError("Соперники ещё не определены");
    const side = await userSide(m, user.id);
    if (!side) throw new FormError("Отправить результат могут только участники этого матча");
    const check = validateSeries(games, m.best_of);
    if (!check.ok) throw new FormError(check.error, check.params);
    const myEntry = side === "home" ? m.home_entry_id : m.away_entry_id;
    const oppEntry = side === "home" ? m.away_entry_id : m.home_entry_id;

    const opp = await one<{ id: string; games: GameScore[] }>(
      "select id, games from match_reports where match_id = $1 and entry_id = $2 and status = 'pending' order by created_at desc limit 1",
      [m.id, oppEntry],
      c,
    );
    await q("update match_reports set status = 'superseded' where match_id = $1 and entry_id = $2 and status = 'pending'", [m.id, myEntry], c);
    const mine = await one<{ id: string }>(
      "insert into match_reports (match_id, entry_id, reporter_id, games, proof_url, comment) values ($1, $2, $3, $4, $5, $6) returning id",
      [m.id, myEntry, user.id, JSON.stringify(games), proofUrl, comment],
      c,
    );

    if (opp) {
      const same = opp.games.length === games.length && opp.games.every((g, i) => g.home === games[i].home && g.away === games[i].away);
      if (same) {
        await q("update match_reports set status = 'confirmed' where id = any($1::uuid[])", [[opp.id, mine!.id]], c);
        await applyResult(c, m.id, { games }, user.id, "Результат подтверждён обеими сторонами ({player})", { player: user.rl_nickname });
        return "Результаты совпали — матч утверждён";
      }
      await q("update match_reports set status = 'disputed' where id = any($1::uuid[])", [[opp.id, mine!.id]], c);
      await q("update matches set status = 'under_review', updated_at = now() where id = $1", [m.id], c);
      await matchEvent(c, m.id, user.id, "Стороны прислали разные результаты — матч передан судье");
      await notifyEntries(c, [m.home_entry_id, m.away_entry_id], "Матч #{n}: спор по результату", "Судья рассмотрит доказательства", `/match/${m.id}`, { n: m.number });
      return "Результаты не совпали — матч передан судье";
    }

    await matchEvent(c, m.id, user.id, "{player} отправил результат, ждём подтверждения соперника", { player: user.rl_nickname });
    await notifyEntries(c, [oppEntry], "Матч #{n}: подтвердите результат", "Соперник отправил счёт", `/match/${m.id}`, { n: m.number });
    return "Результат отправлен. Ждём подтверждения соперника";
  });
}

export async function respondToReport(reportId: string, user: User, accept: boolean, comment: string): Promise<string> {
  return tx(async (c) => {
    const r = await one<{ id: string; match_id: string; entry_id: string; games: GameScore[]; status: string }>("select * from match_reports where id = $1", [reportId], c);
    if (!r || r.status !== "pending") throw new FormError("Отчёт уже обработан");
    const m = await one<Match>("select * from matches where id = $1", [r.match_id], c);
    if (!m) throw new FormError("Матч не найден");
    await lockCompetition(c, m.competition_id);
    const side = await userSide(m, user.id);
    const myEntry = side === "home" ? m.home_entry_id : side === "away" ? m.away_entry_id : null;
    if (!myEntry || myEntry === r.entry_id) throw new FormError("Подтвердить может только соперник");

    if (accept) {
      await q("update match_reports set status = 'confirmed', responded_by = $2 where id = $1", [r.id, user.id], c);
      await applyResult(c, m.id, { games: r.games }, user.id, "{player} подтвердил результат", { player: user.rl_nickname });
      return "Результат подтверждён";
    }
    if (comment.length < 5) throw new FormError("Опишите, что не так с результатом");
    await q("update match_reports set status = 'disputed', responded_by = $2, response_comment = $3 where id = $1", [r.id, user.id, comment], c);
    await q("update matches set status = 'under_review', updated_at = now() where id = $1", [m.id], c);
    await matchEvent(c, m.id, user.id, "{player} оспорил результат: {comment}", { player: user.rl_nickname, comment });
    await notifyEntries(c, [m.home_entry_id, m.away_entry_id], "Матч #{n}: результат оспорен", "Судья рассмотрит спор", `/match/${m.id}`, { n: m.number });
    const staff = await q<{ id: string }>("select id from users where role in ('referee','admin','superadmin')", [], c);
    await notify(c, staff.map((s) => s.id), "Спор в матче #{n}", "", `/match/${m.id}`, { n: m.number });
    return "Результат оспорен — матч передан судье";
  });
}

export async function refereeResult(matchId: string, actor: User, result: OfficialResult, note: string, noteParams: Params = {}) {
  return tx(async (c) => {
    await applyResult(c, matchId, result, actor.id, note || "Результат установлен судьёй {player}", note ? noteParams : { player: actor.rl_nickname });
    await logAction(c, actor.id, "match.result", `матч ${matchId}: ${note}`);
  });
}
