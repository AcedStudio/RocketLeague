import "server-only";
import { q, one, tx, isUniqueViolation } from "./db";
import { FormError } from "./errors";
import { wallet } from "./shop";
import { activityIn } from "./pass";
import { notify } from "./notify";
import { CLUB_PRICE, CLUB_MAX, CREST_ICONS, CREST_COLORS, CREST_SHAPES, cleanTag, validTag, validName, clubGoal, CLUB_GOAL_REWARD, type CrestShape } from "./engine/clubs.ts";
import { activityXp, currentSeason, seasonStart, seasonEnd, tashkentDay, weekOf, dayStart, addDays } from "./engine/pass.ts";

export type Club = {
  id: string; name: string; tag: string; motto: string; crest_icon: string; crest_color: string; crest_shape: CrestShape;
  open: boolean; invite_code: string; owner_id: string | null; created_at: Date; members?: number;
};

export type ClubInput = { name: string; tag: string; motto: string; icon: string; color: string; shape: string };

function check(input: ClubInput) {
  const tag = cleanTag(input.tag);
  if (!validName(input.name)) throw new FormError("Название клуба — от 3 до 24 символов");
  if (!validTag(tag)) throw new FormError("Тег — от 2 до 5 латинских букв или цифр");
  if (!CREST_ICONS.includes(input.icon)) throw new FormError("Выберите эмблему");
  if (!(input.color in CREST_COLORS)) throw new FormError("Выберите цвет");
  if (!(CREST_SHAPES as readonly string[]).includes(input.shape)) throw new FormError("Выберите форму герба");
  return { name: input.name.trim(), tag, motto: input.motto.trim().slice(0, 80) };
}

export async function clubOf(userId: string) {
  return one<Club & { role: string }>(
    "select c.*, cm.role from club_members cm join clubs c on c.id = cm.club_id where cm.user_id = $1",
    [userId],
  );
}

export async function clubByTag(tag: string) {
  return one<Club>("select c.*, (select count(*)::int from club_members where club_id = c.id) as members from clubs c where lower(c.tag) = lower($1)", [tag]);
}

export async function createClub(userId: string, input: ClubInput) {
  const v = check(input);
  try {
    return await tx(async (c) => {
      await q("select id from users where id = $1 for update", [userId], c);
      if (await one("select 1 from club_members where user_id = $1", [userId], c)) throw new FormError("Вы уже состоите в клубе");
      const w = await wallet(userId);
      if (w.balance < CLUB_PRICE) throw new FormError("Не хватает монет: нужно {price}, у вас {have}", { price: CLUB_PRICE, have: w.balance });
      const club = await one<{ id: string; tag: string }>(
        `insert into clubs (name, tag, motto, crest_icon, crest_color, crest_shape, owner_id) values ($1, $2, $3, $4, $5, $6, $7) returning id, tag`,
        [v.name, v.tag, v.motto, input.icon, input.color, input.shape, userId],
        c,
      );
      await q("insert into club_members (club_id, user_id, role) values ($1, $2, 'owner')", [club!.id, userId], c);
      await q("insert into purchases (user_id, item, price) values ($1, $2, $3)", [userId, `club:${club!.id}`, CLUB_PRICE], c);
      return club!;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new FormError("Клуб с таким названием или тегом уже есть");
    throw e;
  }
}

export async function joinClub(userId: string, clubId: string, code?: string) {
  return tx(async (c) => {
    const club = await one<Club>("select * from clubs where id = $1 for update", [clubId], c);
    if (!club) throw new FormError("Клуб не найден");
    if (!club.open && code !== club.invite_code) throw new FormError("Клуб закрыт — вступить можно только по приглашению");
    if (await one("select 1 from club_members where user_id = $1", [userId], c)) throw new FormError("Вы уже состоите в клубе");
    const n = await one<{ n: number }>("select count(*)::int as n from club_members where club_id = $1", [clubId], c);
    if ((n?.n ?? 0) >= CLUB_MAX) throw new FormError("В клубе уже {n} человек — мест нет", { n: CLUB_MAX });
    await q("insert into club_members (club_id, user_id) values ($1, $2)", [clubId, userId], c);
    if (club.owner_id) await notify(c, [club.owner_id], "Новый участник клуба {club}", "", `/clubs/${club.tag}`, { club: club.name });
    return club;
  });
}

/** Leaving: the owner hands the club to the longest-standing member; the last one out closes it. */
export async function leaveClub(userId: string) {
  return tx(async (c) => {
    const me = await one<{ club_id: string; role: string }>("select club_id, role from club_members where user_id = $1", [userId], c);
    if (!me) throw new FormError("Вы не состоите в клубе");
    await q("delete from club_members where user_id = $1", [userId], c);
    const next = await one<{ user_id: string }>("select user_id from club_members where club_id = $1 order by role = 'officer' desc, joined_at limit 1", [me.club_id], c);
    if (!next) {
      await q("delete from clubs where id = $1", [me.club_id], c);
      return;
    }
    if (me.role === "owner") {
      await q("update club_members set role = 'owner' where club_id = $1 and user_id = $2", [me.club_id, next.user_id], c);
      await q("update clubs set owner_id = $2 where id = $1", [me.club_id, next.user_id], c);
    }
  });
}

async function requireOwner(userId: string, clubId: string) {
  const r = await one<{ role: string }>("select role from club_members where club_id = $1 and user_id = $2", [clubId, userId]);
  if (r?.role !== "owner") throw new FormError("Это может только владелец клуба");
}

export async function kickMember(ownerId: string, clubId: string, userId: string) {
  await requireOwner(ownerId, clubId);
  if (ownerId === userId) throw new FormError("Себя исключить нельзя — используйте «Покинуть клуб»");
  await q("delete from club_members where club_id = $1 and user_id = $2", [clubId, userId]);
}

export async function updateClub(ownerId: string, clubId: string, input: ClubInput & { open: boolean }) {
  await requireOwner(ownerId, clubId);
  const v = check(input);
  try {
    await q(
      "update clubs set name = $2, tag = $3, motto = $4, crest_icon = $5, crest_color = $6, crest_shape = $7, open = $8 where id = $1",
      [clubId, v.name, v.tag, v.motto, input.icon, input.color, input.shape, input.open],
    );
  } catch (e) {
    if (isUniqueViolation(e)) throw new FormError("Клуб с таким названием или тегом уже есть");
    throw e;
  }
  return v.tag;
}

export type ClubMember = { user_id: string; nick: string; avatar: string | null; name_color: string | null; badge: string | null; role: string; rating: number; games: number; points: number; week: number };

/** Members with their 1v1 rating, season points (pass activity XP) and games this week. */
export async function clubMembers(clubId: string): Promise<ClubMember[]> {
  const rows = await q<Omit<ClubMember, "points" | "week">>(
    `select u.id as user_id, u.rl_nickname as nick, u.avatar, u.name_color, u.equipped_badge as badge, cm.role,
            (1000 + coalesce((select sum(delta) from rating_changes r where r.user_id = u.id and r.mode = '1v1'), 0))::int as rating,
            (select count(*)::int from rating_changes r where r.user_id = u.id and r.mode = '1v1') as games
       from club_members cm join users u on u.id = cm.user_id where cm.club_id = $1
      order by cm.role = 'owner' desc, cm.joined_at`,
    [clubId],
  );
  const season = currentSeason();
  const day = tashkentDay();
  const week = weekOf(day);
  const out: ClubMember[] = [];
  for (const r of rows) {
    const [s, w] = await Promise.all([
      season ? activityIn(r.user_id, seasonStart(season), seasonEnd(season)) : null,
      activityIn(r.user_id, dayStart(week), dayStart(addDays(week, 7))),
    ]);
    out.push({ ...r, points: s ? activityXp(s) : 0, week: w.matches + w.duels });
  }
  return out;
}

export async function clubGoalState(clubId: string, userId: string | null, members: ClubMember[]) {
  const week = weekOf(tashkentDay());
  const target = clubGoal(members.length);
  const value = Math.min(target, members.reduce((s, m) => s + m.week, 0));
  const ref = `${clubId}:${week}`;
  const claimed = userId ? !!(await one("select 1 from coin_bonuses where user_id = $1 and reason = 'club-goal' and ref = $2", [userId, ref])) : false;
  return { target, value, done: value >= target, claimed, reward: CLUB_GOAL_REWARD, ref };
}

export async function claimClubGoal(userId: string) {
  const club = await clubOf(userId);
  if (!club) throw new FormError("Вы не состоите в клубе");
  const members = await clubMembers(club.id);
  const g = await clubGoalState(club.id, userId, members);
  if (!g.done) throw new FormError("Цель недели ещё не выполнена");
  const row = await one("insert into coin_bonuses (user_id, amount, reason, ref) values ($1, $2, 'club-goal', $3) on conflict do nothing returning id", [userId, g.reward, g.ref]);
  if (!row) throw new FormError("Награда уже получена");
  return club.tag;
}

/** All clubs ranked by season points (sum of members' pass activity XP). */
export async function clubTable() {
  const clubs = await q<Club>("select c.*, (select count(*)::int from club_members where club_id = c.id) as members from clubs c order by c.created_at");
  const season = currentSeason();
  const out: (Club & { points: number })[] = [];
  for (const c of clubs) {
    let points = 0;
    if (season) {
      const ids = await q<{ user_id: string }>("select user_id from club_members where club_id = $1", [c.id]);
      for (const m of ids) points += activityXp(await activityIn(m.user_id, seasonStart(season), seasonEnd(season)));
    }
    out.push({ ...c, points });
  }
  return out.sort((a, b) => b.points - a.points || (b.members ?? 0) - (a.members ?? 0));
}
