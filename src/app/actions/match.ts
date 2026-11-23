"use server";

import { requireUser, requireReferee } from "@/lib/auth";
import { str, url, guard, ok, oneOf, FormError } from "@/lib/forms";
import { submitReport, respondToReport, refereeResult } from "@/lib/tournament";
import { parseGames } from "@/lib/engine/results.ts";
import { one, q, tx } from "@/lib/db";
import { notifyEntries, logAction, matchEvent } from "@/lib/notify";
import { fromLocalInput, MATCH_STATUS_LABELS } from "@/lib/format";

function matchId(fd: FormData) {
  const id = String(fd.get("match_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("bad id");
  return id;
}

function games(fd: FormData) {
  const g = parseGames(String(fd.get("games") ?? ""));
  if (!g || g.length === 0) throw new FormError("Введите счёт каждой игры");
  return g;
}

export async function reportAction(fd: FormData) {
  const id = matchId(fd);
  const path = `/match/${id}`;
  const user = await requireUser(path);
  let message = "";
  await guard(path, async () => {
    message = await submitReport(id, user, games(fd), url(fd, "proof_url", "Ссылка на доказательство"), str(fd, "comment", "Комментарий", { optional: true, max: 500 }));
  });
  ok(path, message);
}

export async function respondAction(fd: FormData) {
  const id = matchId(fd);
  const path = `/match/${id}`;
  const user = await requireUser(path);
  let message = "";
  await guard(path, async () => {
    const accept = fd.get("decision") === "accept";
    message = await respondToReport(String(fd.get("report_id")), user, accept, str(fd, "comment", "Причина", { optional: true, max: 500 }));
  });
  ok(path, message);
}

export async function refereeResultAction(fd: FormData) {
  const id = matchId(fd);
  const path = `/match/${id}`;
  const user = await requireReferee();
  await guard(path, async () => {
    const forfeit = String(fd.get("forfeit") ?? "");
    const note = str(fd, "note", "Решение", { optional: true, max: 500 });
    if (forfeit === "home" || forfeit === "away") {
      await refereeResult(id, user, { games: [], forfeitWinner: forfeit }, note || "Техническая победа назначена судьёй {player}", note ? {} : { player: user.rl_nickname });
    } else {
      await refereeResult(id, user, { games: games(fd) }, note);
    }
  });
  ok(path, "Результат утверждён");
}

export async function matchStatusAction(fd: FormData) {
  const id = matchId(fd);
  const path = `/match/${id}`;
  const user = await requireReferee();
  await guard(path, async () => {
    const status = oneOf(fd, "status", "Статус", ["upcoming", "ready", "live", "under_review", "postponed"] as const);
    await tx(async (c) => {
      const m = await one<{ status: string; number: number; home_entry_id: string | null; away_entry_id: string | null }>(
        "select status, number, home_entry_id, away_entry_id from matches where id = $1 for update",
        [id],
        c,
      );
      if (!m) throw new FormError("Матч не найден");
      if (m.status === "completed") throw new FormError("Матч завершён. Чтобы исправить счёт, установите новый результат.");
      await q("update matches set status = $2, updated_at = now() where id = $1", [id, status], c);
      await matchEvent(c, id, user.id, "Статус изменён: {status}", { status: MATCH_STATUS_LABELS[status] });
      if (status === "postponed" || status === "live") {
        await notifyEntries(c, [m.home_entry_id, m.away_entry_id], "Матч #{n}: {status}", "", path, { n: m.number, status: MATCH_STATUS_LABELS[status] });
      }
      await logAction(c, user.id, "match.status", `#${m.number} → ${status}`);
    });
  });
  ok(path, "Статус обновлён");
}

export async function scheduleAction(fd: FormData) {
  const id = matchId(fd);
  const back = String(fd.get("back") ?? "") || `/match/${id}`;
  const path = back.startsWith("/") ? back : `/match/${id}`;
  const user = await requireReferee();
  await guard(path, async () => {
    await tx(async (c) => {
      const m = await one<{ number: number; home_entry_id: string | null; away_entry_id: string | null; timezone: string }>(
        "select m.number, m.home_entry_id, m.away_entry_id, c.timezone from matches m join competitions c on c.id = m.competition_id where m.id = $1",
        [id],
        c,
      );
      if (!m) throw new FormError("Матч не найден");
      const raw = String(fd.get("scheduled_at") ?? "");
      const at = raw ? fromLocalInput(raw, m.timezone) : null;
      if (raw && !at) throw new FormError("Неверная дата");
      await q("update matches set scheduled_at = $2, reminded_at = null, updated_at = now() where id = $1", [id, at], c);
      const text = at ? "Новое время: {when}" : "Время матча снято";
      const params = at ? { at: at.toISOString(), tz: m.timezone } : {};
      await matchEvent(c, id, user.id, text, params);
      await notifyEntries(c, [m.home_entry_id, m.away_entry_id], "Матч #{n}: изменение расписания", text, `/match/${id}`, { n: m.number, ...params });
      await logAction(c, user.id, "match.schedule", `#${m.number}: ${at ? at.toISOString() : "—"}`);
    });
  });
  ok(path, "Расписание обновлено");
}
