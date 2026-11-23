"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireReferee, type User } from "@/lib/auth";
import { q, one, tx, lockCompetition, isUniqueViolation } from "@/lib/db";
import { str, int, bool, oneOf, optionalNumber, url, guard, ok, FormError } from "@/lib/forms";
import { notify, logAction, matchEvent } from "@/lib/notify";
import { fromLocalInput, slugify } from "@/lib/format";
import { runDraw, resetDraw, publishDraw, generatePlayoffs, adminSetEntryStatus, promoteWaitlist } from "@/lib/tournament";
import { getCompetition, entryCounts } from "@/lib/data";
import { BEST_OF_OPTIONS } from "@/lib/engine/results.ts";
import type { Tiebreaker } from "@/lib/engine/standings.ts";
import { enqueueChannel, flushOutbox, discordApi, registerCommands, botConfigured, getDiscordSettings, DiscordError } from "@/lib/discord";
import { isLocale } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";

const uuid = (v: unknown) => {
  const s = String(v ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(s)) throw new FormError("Неверный идентификатор");
  return s;
};
const compPath = (id: string, tab = "settings") => `/admin/c/${id}?tab=${tab}`;
const TIEBREAKERS: Tiebreaker[] = ["points", "goal_diff", "goals_for", "head_to_head", "wins"];

function bestOf(fd: FormData, name: string, label: string) {
  const v = int(fd, name, label, 1, 9);
  if (!(BEST_OF_OPTIONS as readonly number[]).includes(v)) throw new FormError("«{label}»: выберите Bo1, Bo3, Bo5 или Bo7", { label });
  return v;
}

function validTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    throw new FormError("Неизвестный часовой пояс. Пример: Asia/Tashkent, Europe/Moscow");
  }
}

// ---------------------------------------------------------------- competitions

export async function saveCompetition(fd: FormData) {
  const user = await requireAdmin();
  const existingId = fd.get("id") ? uuid(fd.get("id")) : null;
  const back = existingId ? compPath(existingId) : "/admin/competitions/new";
  let id = existingId;
  await guard(back, async () => {
    const name = str(fd, "name", "Название", { min: 3, max: 80 });
    const timezone = validTimezone(str(fd, "timezone", "Часовой пояс", { max: 60 }));
    const kind = oneOf(fd, "kind", "Тип", ["league", "cup"] as const);
    const mode = oneOf(fd, "mode", "Режим", ["1v1", "2v2"] as const);
    const format = oneOf(fd, "format", "Формат", ["groups_knockout", "knockout", "round_robin"] as const);
    const platforms = ["pc", "playstation", "xbox"].filter((p) => fd.getAll("platforms").includes(p));
    if (!platforms.length) throw new FormError("Выберите хотя бы одну платформу");
    const tiebreakers = String(fd.get("tiebreakers") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is Tiebreaker => (TIEBREAKERS as string[]).includes(s));
    const deadlineRaw = String(fd.get("registration_deadline") ?? "");
    const startRaw = String(fd.get("start_at") ?? "");
    const deadline = deadlineRaw ? fromLocalInput(deadlineRaw, timezone) : null;
    const start = startRaw ? fromLocalInput(startRaw, timezone) : null;
    if (deadlineRaw && !deadline) throw new FormError("Неверная дата окончания регистрации");
    if (startRaw && !start) throw new FormError("Неверная дата старта");

    const v = {
      name,
      kind,
      mode,
      format,
      season: str(fd, "season", "Сезон", { optional: true, max: 60 }),
      description: str(fd, "description", "Описание", { optional: true, max: 4000 }),
      capacity: int(fd, "capacity", "Максимум участников", 2, 256),
      registration_deadline: deadline,
      start_at: start,
      timezone,
      region: str(fd, "region", "Регион сервера", { max: 40 }),
      platforms,
      require_approval: bool(fd, "require_approval"),
      checkin_required: bool(fd, "checkin_required"),
      group_count: int(fd, "group_count", "Количество групп", 1, 16),
      qualifiers_per_group: int(fd, "qualifiers_per_group", "Выходят из группы", 1, 16),
      seeded_draw: bool(fd, "seeded_draw"),
      double_round_robin: bool(fd, "double_round_robin"),
      third_place: bool(fd, "third_place"),
      group_best_of: bestOf(fd, "group_best_of", "Серия в группах/туре"),
      playoff_best_of: bestOf(fd, "playoff_best_of", "Серия в плей-офф"),
      final_best_of: bestOf(fd, "final_best_of", "Серия в финале"),
      points_win: int(fd, "points_win", "Очки за победу", 0, 10),
      points_loss: int(fd, "points_loss", "Очки за поражение", 0, 10),
      tiebreakers: tiebreakers.length ? tiebreakers : ["points", "goal_diff", "goals_for", "head_to_head"],
      featured: bool(fd, "featured"),
    };

    await tx(async (c) => {
      if (existingId) {
        await lockCompetition(c, existingId);
        const cur = await getCompetition(existingId, c);
        if (!cur) throw new FormError("Соревнование не найдено");
        const counts = await entryCounts(existingId, c);
        const anyEntries = Object.entries(counts).some(([k, n]) => k !== "active" && n > 0);
        if (anyEntries && cur.mode !== v.mode) throw new FormError("Нельзя менять режим 1v1/2v2, когда уже есть заявки");
        if (cur.draw_state !== "none") {
          const locked = ["format", "group_count", "qualifiers_per_group", "double_round_robin", "third_place", "group_best_of", "playoff_best_of", "final_best_of", "seeded_draw"] as const;
          for (const k of locked) if (cur[k] !== v[k]) throw new FormError("После жеребьёвки нельзя менять формат, группы и серии");
        }
        if (v.capacity < counts.active) throw new FormError("Уже {n} активных заявок: вместимость не может быть меньше", { n: counts.active });
        await q(
          `update competitions set name=$2, kind=$3, mode=$4, format=$5, season=$6, description=$7, capacity=$8, registration_deadline=$9, start_at=$10,
             timezone=$11, region=$12, platforms=$13, require_approval=$14, checkin_required=$15, group_count=$16, qualifiers_per_group=$17,
             seeded_draw=$18, double_round_robin=$19, third_place=$20, group_best_of=$21, playoff_best_of=$22, final_best_of=$23,
             points_win=$24, points_loss=$25, tiebreakers=$26, featured=$27, updated_at=now() where id=$1`,
          [existingId, ...Object.values(v)],
          c,
        );
        if (v.featured) await q("update competitions set featured = false where id <> $1", [existingId], c);
        if (v.capacity > cur.capacity) await promoteWaitlist(c, { ...cur, ...v, capacity: v.capacity } as typeof cur);
        await logAction(c, user.id, "competition.update", name);
      } else {
        let slug = slugify(name) || "competition";
        if (await one("select 1 from competitions where slug = $1", [slug], c)) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
        const row = await one<{ id: string }>(
          `insert into competitions (slug, name, kind, mode, format, season, description, capacity, registration_deadline, start_at, timezone, region, platforms,
             require_approval, checkin_required, group_count, qualifiers_per_group, seeded_draw, double_round_robin, third_place, group_best_of, playoff_best_of,
             final_best_of, points_win, points_loss, tiebreakers, featured)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) returning id`,
          [slug, ...Object.values(v)],
          c,
        );
        id = row!.id;
        if (v.featured) await q("update competitions set featured = false where id <> $1", [id], c);
        await logAction(c, user.id, "competition.create", name);
      }
    });
  });
  revalidatePath("/", "layout");
  ok(compPath(id!), existingId ? "Настройки сохранены" : "Соревнование создано. Откройте регистрацию, когда будете готовы.");
}

export async function setCompetitionStatus(fd: FormData) {
  const user = await requireAdmin();
  const id = uuid(fd.get("id"));
  const action = String(fd.get("action"));
  let message = "";
  await guard(compPath(id), async () => {
    await tx(async (c) => {
      await lockCompetition(c, id);
      const comp = await getCompetition(id, c);
      if (!comp) throw new FormError("Соревнование не найдено");
      const set = (status: string) => q("update competitions set status = $2, updated_at = now() where id = $1", [id, status], c);
      switch (action) {
        case "open":
          if (!["draft", "closed"].includes(comp.status) || comp.draw_state !== "none") throw new FormError("Открыть регистрацию сейчас нельзя");
          await set("registration");
          await enqueueChannel(c, "announce", { title: "{comp}: регистрация открыта", description: "Регистрируйтесь на сайте", params: { comp: comp.name }, link: `/c/${comp.slug}/register` });
          message = "Регистрация открыта";
          break;
        case "close":
          if (comp.status !== "registration") throw new FormError("Регистрация уже закрыта");
          await set("closed");
          message = "Регистрация закрыта. Можно проводить жеребьёвку.";
          break;
        case "unpublish":
          if (comp.status !== "registration" && comp.status !== "closed") throw new FormError("Нельзя скрыть идущее соревнование");
          if (comp.draw_state !== "none") throw new FormError("Сначала сбросьте жеребьёвку");
          await set("draft");
          message = "Соревнование скрыто (черновик)";
          break;
        case "checkin_open":
        case "checkin_close":
          if (comp.draw_state === "published") throw new FormError("Жеребьёвка уже опубликована");
          await q("update competitions set checkin_open = $2 where id = $1", [id, action === "checkin_open"], c);
          if (action === "checkin_open") {
            const members = await q<{ user_id: string }>(
              "select em.user_id from entry_members em join entries e on e.id = em.entry_id where e.competition_id = $1 and e.status = 'confirmed' and em.active",
              [id],
              c,
            );
            await notify(c, members.map((m) => m.user_id), "{comp}: открыт чек-ин", "Подтвердите участие, иначе не попадёте в жеребьёвку", `/c/${comp.slug}`, { comp: comp.name });
          }
          message = action === "checkin_open" ? "Чек-ин открыт, участники уведомлены" : "Чек-ин закрыт";
          break;
        default:
          throw new FormError("Неизвестное действие");
      }
      await logAction(c, user.id, `competition.${action}`, comp.name);
    });
  });
  revalidatePath("/", "layout");
  ok(compPath(id), message);
}

export async function deleteCompetition(fd: FormData) {
  const user = await requireAdmin();
  const id = uuid(fd.get("id"));
  await guard(compPath(id), async () => {
    if (user.role !== "superadmin") throw new FormError("Удалять соревнования может только супер-администратор");
    if (String(fd.get("confirm") ?? "") !== "УДАЛИТЬ") throw new FormError("Введите УДАЛИТЬ для подтверждения");
    const comp = await getCompetition(id);
    await q("delete from competitions where id = $1", [id]);
    await logAction(undefined, user.id, "competition.delete", comp?.name ?? id);
  });
  revalidatePath("/", "layout");
  ok("/admin/competitions", "Соревнование удалено");
}

// ---------------------------------------------------------------- entries

export async function entryAction(fd: FormData) {
  const user = await requireAdmin();
  const compId = uuid(fd.get("competition_id"));
  const action = oneOf(fd, "action", "Действие", ["approve", "reject", "remove", "confirm_waitlist"] as const);
  await guard(compPath(compId, "participants"), async () => {
    await adminSetEntryStatus(uuid(fd.get("entry_id")), action, user);
  });
  ok(compPath(compId, "participants"), "Готово");
}

export async function editEntry(fd: FormData) {
  const user = await requireAdmin();
  const compId = uuid(fd.get("competition_id"));
  await guard(compPath(compId, "participants"), async () => {
    const entryId = uuid(fd.get("entry_id"));
    const name = str(fd, "name", "Название", { min: 2, max: 32 });
    const seedRaw = String(fd.get("seed") ?? "").trim();
    const seed = seedRaw ? Number(seedRaw) : null;
    if (seed !== null && (!Number.isInteger(seed) || seed < 1 || seed > 256)) throw new FormError("Посев: целое число от 1");
    try {
      await q("update entries set name = $2, seed = $3 where id = $1 and competition_id = $4", [entryId, name, seed, compId]);
    } catch (err) {
      if (isUniqueViolation(err)) throw new FormError("Такое название уже есть");
      throw err;
    }
    await logAction(undefined, user.id, "entry.edit", `${name}, посев ${seed ?? "—"}`);
  });
  ok(compPath(compId, "participants"), "Сохранено");
}

// ---------------------------------------------------------------- draw & playoffs

export async function drawAction(fd: FormData) {
  const user = await requireAdmin();
  const id = uuid(fd.get("id"));
  const action = oneOf(fd, "action", "Действие", ["run", "reset", "publish", "playoffs"] as const);
  let message = "";
  await guard(compPath(id, "draw"), async () => {
    if (action === "run") message = await runDraw(id, user);
    if (action === "reset") {
      await resetDraw(id, user);
      message = "Жеребьёвка сброшена";
    }
    if (action === "publish") {
      if (String(fd.get("confirm") ?? "") !== "on") throw new FormError("Подтвердите публикацию: после неё жеребьёвку нельзя изменить");
      await publishDraw(id, user);
      message = "Жеребьёвка опубликована. Участники получили уведомления.";
    }
    if (action === "playoffs") {
      await generatePlayoffs(id, user);
      message = "Сетка плей-офф создана";
    }
  });
  revalidatePath("/", "layout");
  ok(compPath(id, "draw"), message);
}

export async function scheduleRound(fd: FormData) {
  const user = await requireReferee();
  const id = uuid(fd.get("id"));
  await guard(compPath(id, "matches"), async () => {
    const comp = await getCompetition(id);
    if (!comp) throw new FormError("Соревнование не найдено");
    const [stage, roundStr] = String(fd.get("round_key") ?? "").split(":");
    const round = Number(roundStr);
    if (!["group", "league", "knockout", "third_place"].includes(stage) || !Number.isInteger(round)) throw new FormError("Выберите тур");
    const at = fromLocalInput(String(fd.get("scheduled_at") ?? ""), comp.timezone);
    if (!at) throw new FormError("Укажите дату и время");
    await tx(async (c) => {
      const rows = await q<{ id: string; home_entry_id: string | null; away_entry_id: string | null }>(
        "update matches set scheduled_at = $4, reminded_at = null, updated_at = now() where competition_id = $1 and stage = $2 and round = $3 and status <> 'completed' and not is_bye returning id, home_entry_id, away_entry_id",
        [id, stage, round, at],
        c,
      );
      const when = { at: at.toISOString(), tz: comp.timezone };
      for (const r of rows) await matchEvent(c, r.id, user.id, "Новое время: {when}", when);
      const members = await q<{ user_id: string }>(
        "select distinct user_id from entry_members where active and entry_id = any($1::uuid[])",
        [rows.flatMap((r) => [r.home_entry_id, r.away_entry_id]).filter(Boolean)],
        c,
      );
      await notify(c, members.map((m) => m.user_id), "{comp}: расписание обновлено", "Новое время: {when}", `/c/${comp.slug}/matches`, { comp: comp.name, ...when });
      await logAction(c, user.id, "schedule.round", `${comp.name} ${stage} ${round}: ${rows.length} матчей, ${at.toISOString()}`);
    });
  });
  ok(compPath(id, "matches"), "Расписание тура обновлено");
}

// ---------------------------------------------------------------- prizes

export async function savePrizeSettings(fd: FormData) {
  const user = await requireAdmin();
  const id = uuid(fd.get("id"));
  await guard(compPath(id, "prizes"), async () => {
    const currency = str(fd, "prize_currency", "Валюта", { min: 3, max: 3 }).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new FormError("Валюта: трёхбуквенный код, например USD или UZS");
    await q("update competitions set prize_pool = $2, prize_currency = $3, prize_notes = $4, payout_status = $5, updated_at = now() where id = $1", [
      id,
      optionalNumber(fd, "prize_pool", "Призовой фонд"),
      currency,
      str(fd, "prize_notes", "Условия", { optional: true, max: 2000 }),
      oneOf(fd, "payout_status", "Статус выплат", ["not_configured", "pending", "partially_paid", "paid"] as const),
    ]);
    await logAction(undefined, user.id, "prizes.settings", id);
  });
  ok(compPath(id, "prizes"), "Сохранено");
}

export async function addPrize(fd: FormData) {
  const user = await requireAdmin();
  const id = uuid(fd.get("id"));
  await guard(compPath(id, "prizes"), async () => {
    const placeRaw = String(fd.get("place") ?? "");
    const place = placeRaw ? Number(placeRaw) : null;
    if (place !== null && (!Number.isInteger(place) || place < 1 || place > 64)) throw new FormError("Место: число от 1");
    await q("insert into prizes (competition_id, place, title, amount, description) values ($1, $2, $3, $4, $5)", [
      id,
      place,
      str(fd, "title", "Название награды", { max: 80 }),
      optionalNumber(fd, "amount", "Сумма"),
      str(fd, "description", "Описание", { optional: true, max: 300 }),
    ]);
    await logAction(undefined, user.id, "prizes.add", id);
  });
  ok(compPath(id, "prizes"), "Награда добавлена");
}

export async function prizeAction(fd: FormData) {
  const user = await requireAdmin();
  const id = uuid(fd.get("id"));
  await guard(compPath(id, "prizes"), async () => {
    const prizeId = uuid(fd.get("prize_id"));
    const action = String(fd.get("action"));
    if (action === "delete") await q("delete from prizes where id = $1 and competition_id = $2", [prizeId, id]);
    else if (action === "paid") await q("update prizes set paid = not paid where id = $1 and competition_id = $2", [prizeId, id]);
    else if (action === "recipient") {
      const entry = String(fd.get("entry_id") ?? "");
      await q("update prizes set recipient_entry_id = $3 where id = $1 and competition_id = $2", [prizeId, id, entry ? uuid(entry) : null]);
    }
    await logAction(undefined, user.id, `prizes.${action}`, prizeId);
  });
  ok(compPath(id, "prizes"), "Готово");
}

// ---------------------------------------------------------------- rules

export async function saveRule(fd: FormData) {
  const user = await requireAdmin();
  await guard("/admin/rules", async () => {
    const id = fd.get("rule_id") ? uuid(fd.get("rule_id")) : null;
    const category = str(fd, "category", "Раздел", { max: 80 });
    const title = str(fd, "title", "Заголовок", { max: 140 });
    const body = str(fd, "body", "Текст", { max: 8000 });
    const published = bool(fd, "published");
    if (id) {
      await q("update rules set category=$2, title=$3, body=$4, published=$5, updated_at=now() where id=$1", [id, category, title, body, published]);
    } else {
      const pos = await one<{ n: number }>("select coalesce(max(position), 0)::int + 1 as n from rules where category = $1", [category]);
      await q("insert into rules (category, title, body, position, published) values ($1, $2, $3, $4, $5)", [category, title, body, pos!.n, published]);
    }
    await logAction(undefined, user.id, id ? "rules.edit" : "rules.add", title);
  });
  revalidatePath("/rules");
  ok("/admin/rules", "Правило сохранено");
}

export async function ruleAction(fd: FormData) {
  const user = await requireAdmin();
  await guard("/admin/rules", async () => {
    const action = String(fd.get("action"));
    if (action === "publish_all") {
      await q("update rules set published = true, updated_at = now() where not published");
      const all = await q<{ id: string }>("select id from users");
      await notify(undefined, all.map((u) => u.id), "Опубликованы правила соревнований", "", "/rules");
    } else {
      const id = uuid(fd.get("rule_id"));
      if (action === "delete") await q("delete from rules where id = $1", [id]);
      if (action === "toggle") await q("update rules set published = not published, updated_at = now() where id = $1", [id]);
      if (action === "up" || action === "down") {
        await tx(async (c) => {
          const r = await one<{ category: string; position: number }>("select category, position from rules where id = $1", [id], c);
          if (!r) return;
          const other = await one<{ id: string; position: number }>(
            action === "up"
              ? "select id, position from rules where category = $1 and position < $2 order by position desc limit 1"
              : "select id, position from rules where category = $1 and position > $2 order by position asc limit 1",
            [r.category, r.position],
            c,
          );
          if (!other) return;
          await q("update rules set position = $2 where id = $1", [id, other.position], c);
          await q("update rules set position = $2 where id = $1", [other.id, r.position], c);
        });
      }
    }
    await logAction(undefined, user.id, `rules.${action}`, "");
  });
  revalidatePath("/rules");
  ok("/admin/rules", "Готово");
}

// ---------------------------------------------------------------- announcements

export async function saveAnnouncement(fd: FormData) {
  const user = await requireAdmin();
  await guard("/admin/announcements", async () => {
    const compRaw = String(fd.get("competition_id") ?? "");
    const competitionId = compRaw ? uuid(compRaw) : null;
    const title = str(fd, "title", "Заголовок", { max: 140 });
    const body = str(fd, "body", "Текст", { max: 4000 });
    await q("insert into announcements (competition_id, title, body, pinned, author_id) values ($1, $2, $3, $4, $5)", [competitionId, title, body, bool(fd, "pinned"), user.id]);
    if (bool(fd, "notify")) {
      const targets = competitionId
        ? await q<{ user_id: string }>("select user_id from entry_members where competition_id = $1 and active", [competitionId])
        : await q<{ user_id: string }>("select id as user_id from users");
      await notify(undefined, targets.map((t) => t.user_id), title, body.slice(0, 200), "/");
    }
    if (bool(fd, "discord")) await enqueueChannel(undefined, "announce", { title, description: body.slice(0, 3800), link: "/" });
    await logAction(undefined, user.id, "announcement.add", title);
  });
  revalidatePath("/", "layout");
  ok("/admin/announcements", "Объявление опубликовано");
}

export async function announcementAction(fd: FormData) {
  const user = await requireAdmin();
  await guard("/admin/announcements", async () => {
    const id = uuid(fd.get("announcement_id"));
    const action = String(fd.get("action"));
    if (action === "delete") await q("delete from announcements where id = $1", [id]);
    if (action === "pin") await q("update announcements set pinned = not pinned where id = $1", [id]);
    await logAction(undefined, user.id, `announcement.${action}`, id);
  });
  revalidatePath("/", "layout");
  ok("/admin/announcements", "Готово");
}

// ---------------------------------------------------------------- users & settings

export async function setRole(fd: FormData) {
  const user: User = await requireAdmin();
  await guard("/admin/users", async () => {
    if (user.role !== "superadmin") throw new FormError("Роли меняет только супер-администратор");
    const id = uuid(fd.get("user_id"));
    if (id === user.id) throw new FormError("Нельзя изменить собственную роль");
    const role = oneOf(fd, "role", "Роль", ["superadmin", "admin", "referee", "participant"] as const);
    const target = await one<{ rl_nickname: string }>("update users set role = $2 where id = $1 returning rl_nickname", [id, role]);
    await logAction(undefined, user.id, "user.role", `${target?.rl_nickname} → ${role}`);
  });
  ok("/admin/users", "Роль обновлена");
}

export async function saveSettings(fd: FormData) {
  const user = await requireAdmin();
  await guard("/admin/settings", async () => {
    const values: Record<string, string> = {
      site_name: str(fd, "site_name", "Название платформы", { max: 40 }),
      tagline: str(fd, "tagline", "Подзаголовок", { optional: true, max: 120 }),
      contact_email: str(fd, "contact_email", "Email", { optional: true, max: 120 }),
      discord_url: url(fd, "discord_url", "Discord"),
      logo_url: url(fd, "logo_url", "Логотип"),
    };
    if (values.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contact_email)) throw new FormError("Неверный email");
    for (const [k, v] of Object.entries(values)) {
      await q("insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [k, v]);
    }
    await logAction(undefined, user.id, "settings.save", "");
  });
  revalidatePath("/", "layout");
  ok("/admin/settings", "Настройки сохранены");
}

// ---------------------------------------------------------------- discord

const SNOWFLAKE = /^\d{15,22}$/;

export async function saveDiscordSettings(fd: FormData) {
  const user = await requireAdmin();
  await guard("/admin/discord", async () => {
    const vals: Record<string, string> = {};
    for (const k of ["discord_guild_id", "discord_announce_channel", "discord_results_channel", "discord_participant_role"]) {
      const v = String(fd.get(k) ?? "").trim();
      if (v && !SNOWFLAKE.test(v)) throw new FormError("Discord ID состоит только из цифр (включите режим разработчика в Discord и скопируйте ID)");
      vals[k] = v;
    }
    const loc = String(fd.get("discord_locale") ?? "ru");
    vals.discord_locale = isLocale(loc) ? loc : "ru";
    for (const [k, v] of Object.entries(vals)) {
      await q("insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [k, v]);
    }
    await logAction(undefined, user.id, "discord.settings", "");
  });
  ok("/admin/discord", "Настройки сохранены");
}

export async function discordAction(fd: FormData) {
  const user = await requireAdmin();
  const action = String(fd.get("action"));
  let message = "Готово";
  await guard("/admin/discord", async () => {
    if (!botConfigured()) throw new FormError("Бот не настроен: добавьте DISCORD_BOT_TOKEN в Vercel");
    const s = await getDiscordSettings();
    try {
      if (action === "check") {
        if (!s.guildId) throw new FormError("Укажите ID сервера");
        const g = await discordApi<{ name: string }>(`/guilds/${s.guildId}`);
        message = (await getT())("Бот видит сервер «{name}»", { name: g.name });
      } else if (action === "commands") {
        await registerCommands();
        message = "Команды /matches, /table, /profile зарегистрированы";
      } else if (action === "test") {
        if (!s.announceChannel) throw new FormError("Укажите канал для объявлений");
        await enqueueChannel(undefined, "announce", { title: "Тестовое сообщение", description: "Бот подключён к сайту и может публиковать объявления.", link: "/" });
        const r = await flushOutbox();
        if (r.failed) throw new FormError("Discord не принял сообщение: проверьте права бота в канале");
        message = "Тестовое сообщение отправлено";
      } else if (action === "flush") {
        const r = await flushOutbox(200);
        message = (await getT())("Отправлено: {sent}, ошибок: {failed}", { sent: r.sent, failed: r.failed });
      }
    } catch (err) {
      if (err instanceof DiscordError) {
        const hint = err.status === 401 ? "неверный токен бота" : err.status === 403 ? "у бота нет прав (проверьте роль бота и доступ к каналу)" : err.status === 404 ? "сервер или канал не найден, либо бот не добавлен на сервер" : err.message;
        throw new FormError("Ошибка Discord: {hint}", { hint });
      }
      throw err;
    }
    await logAction(undefined, user.id, `discord.${action}`, message);
  });
  ok("/admin/discord", message);
}
