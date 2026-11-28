import { NextResponse } from "next/server";
import { sweep } from "@/lib/scheduling";
import { flushOutbox } from "@/lib/discord";
import { flushPush } from "@/lib/push";
import { ensureTelegram, flushTelegram } from "@/lib/telegram";

// Called every 5 minutes by GitHub Actions (.github/workflows/tick.yml).
// Public on purpose: it only performs work that is already due, is idempotent and
// throttled to one run per ~minute, so extra calls do nothing.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const swept = await sweep();
  const discord = await flushOutbox(100);
  const push = await flushPush(100);
  const telegram = { ...(await ensureTelegram().catch(() => ({}))), ...(await flushTelegram(100)) };
  return NextResponse.json({ ok: true, swept, discord, push, telegram });
}
