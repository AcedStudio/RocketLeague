import { NextResponse, type NextRequest } from "next/server";

// The site lives at rlchamp.uz. Pages opened on the old production address are sent there,
// so sign-in cookies and Discord login stay on one domain. API routes (Discord bot, cron) keep working on both.
const OLD_HOSTS = new Set(["rl-arena-eight.vercel.app"]);

export function middleware(req: NextRequest) {
  const site = process.env.SITE_URL;
  const host = req.headers.get("host") ?? "";
  if (!site || !OLD_HOSTS.has(host) || new URL(site).host === host) return NextResponse.next();
  const target = new URL(req.nextUrl.pathname + req.nextUrl.search, site);
  return NextResponse.redirect(target, 308);
}

export const config = {
  matcher: ["/((?!api/|_next/|brand/|favicon|icon|apple-icon|manifest).*)"],
};
