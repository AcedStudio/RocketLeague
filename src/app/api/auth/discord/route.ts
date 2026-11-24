import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authorizeUrl, oauthConfigured } from "@/lib/discord";
import { signShort } from "@/lib/auth";

// Starts Discord OAuth. mode=login (sign in / sign up) or mode=link (attach to the current account).
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!oauthConfigured()) return NextResponse.redirect(new URL("/login?err=" + encodeURIComponent("Вход через Discord ещё не настроен"), url));
  const mode = url.searchParams.get("mode") === "link" ? "link" : "login";
  const nextRaw = url.searchParams.get("next") ?? "/me";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/me";
  const nonce = crypto.randomUUID();
  (await cookies()).set("rla_discord_state", await signShort({ nonce, mode, next }, "10m"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(authorizeUrl(nonce));
}
