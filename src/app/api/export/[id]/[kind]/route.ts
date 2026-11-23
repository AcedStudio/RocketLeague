import { NextResponse } from "next/server";
import { getUser, isAdmin } from "@/lib/auth";
import { getCompetition, getEntries, getMatches, getStandings } from "@/lib/data";
import { ENTRY_STATUS_LABELS, MATCH_STATUS_LABELS, PLATFORM_LABELS } from "@/lib/format";

function csv(rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? "" : String(v);
    // Neutralise spreadsheet formulas.
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\n");
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const comp = await getCompetition(id);
  if (!comp) return new NextResponse("Not found", { status: 404 });
  const user = await getUser();
  const admin = isAdmin(user?.role);
  if (comp.status === "draft" && !admin) return new NextResponse("Not found", { status: 404 });

  let rows: (string | number | null | undefined)[][];
  if (kind === "participants") {
    // Contains contact details: admins only.
    if (!admin) return new NextResponse("Forbidden", { status: 403 });
    const entries = await getEntries(comp.id);
    rows = [["№", "Название", "Статус", "Посев", "Чек-ин", "Игрок", "RL ID", "Платформа", "Капитан"]];
    for (const e of entries) {
      for (const m of e.members.length ? e.members : [null]) {
        rows.push([e.number, e.name, ENTRY_STATUS_LABELS[e.status], e.seed, e.checked_in_at ? "да" : "", m?.rl_nickname, m?.rl_id, m ? PLATFORM_LABELS[m.platform] : "", m?.is_captain ? "да" : ""]);
      }
    }
  } else if (kind === "matches") {
    if (comp.draw_state !== "published" && !admin) return new NextResponse("Not found", { status: 404 });
    const matches = await getMatches(comp.id);
    rows = [["№", "Этап", "Группа", "Раунд", "Хозяева", "Гости", "Победы хозяев", "Победы гостей", "Голы хозяев", "Голы гостей", "Игры", "Статус", "Время (UTC)"]];
    for (const m of matches.filter((x) => !x.is_bye)) {
      rows.push([
        m.number, m.stage, m.group_name, m.round, m.home_name, m.away_name, m.home_wins, m.away_wins, m.home_goals, m.away_goals,
        (m.games ?? []).map((g) => `${g.home}-${g.away}`).join(" "), MATCH_STATUS_LABELS[m.status], m.scheduled_at ? new Date(m.scheduled_at).toISOString() : "",
      ]);
    }
  } else if (kind === "standings") {
    if (comp.draw_state !== "published" && !admin) return new NextResponse("Not found", { status: 404 });
    const tables = await getStandings(comp);
    rows = [["Группа", "Место", "Участник", "И", "В", "П", "ЗГ", "ПГ", "РГ", "Очки"]];
    for (const t of tables) for (const r of t.rows) rows.push([t.group?.name ?? "Лига", r.position, r.name, r.played, r.wins, r.losses, r.goalsFor, r.goalsAgainst, r.goalDiff, r.points]);
  } else {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${comp.slug}-${kind}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
