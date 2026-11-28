import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { vapid, saveSubscription, removeSubscription } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Public VAPID key for PushManager.subscribe(). */
export async function GET() {
  const { publicKey } = await vapid();
  return NextResponse.json({ key: publicKey });
}

/** Saves this browser's subscription for the signed-in user. */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => null);
  const ok = body && (await saveSubscription(user.id, body));
  return NextResponse.json({ ok: !!ok }, { status: ok ? 200 : 400 });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (body?.endpoint) await removeSubscription(user.id, String(body.endpoint));
  return NextResponse.json({ ok: true });
}
