import { NextResponse, type NextRequest } from "next/server";
import { checkWebhookSecret, handleUpdate, telegramConfigured } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/** Telegram webhook. Only Telegram knows the secret header (generated server-side). */
export async function POST(req: NextRequest) {
  if (!telegramConfigured() || !(await checkWebhookSecret(req.headers.get("x-telegram-bot-api-secret-token")))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = await req.json().catch(() => null);
  if (update) await handleUpdate(update).catch((e) => console.error("[telegram]", e));
  return NextResponse.json({ ok: true });
}
