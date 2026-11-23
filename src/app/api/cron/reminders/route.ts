import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { notifyEntries } from "@/lib/notify";
import { fmtDateTime } from "@/lib/format";

// Daily (Vercel Hobby allows one cron per day): reminds about matches in the next 36 hours.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const due = await q<{ id: string; number: number; scheduled_at: Date; home_entry_id: string; away_entry_id: string; timezone: string; comp: string }>(
    `select m.id, m.number, m.scheduled_at, m.home_entry_id, m.away_entry_id, c.timezone, c.name as comp
       from matches m join competitions c on c.id = m.competition_id
      where m.status in ('ready', 'upcoming') and not m.is_bye and m.reminded_at is null
        and m.home_entry_id is not null and m.away_entry_id is not null
        and m.scheduled_at between now() and now() + interval '36 hours'`,
  );
  for (const m of due) {
    await notifyEntries(undefined, [m.home_entry_id, m.away_entry_id], `Напоминание: матч #${m.number}`, `${m.comp} · ${fmtDateTime(m.scheduled_at, m.timezone)}`, `/match/${m.id}`);
    await q("update matches set reminded_at = now() where id = $1", [m.id]);
  }
  return NextResponse.json({ reminded: due.length });
}
