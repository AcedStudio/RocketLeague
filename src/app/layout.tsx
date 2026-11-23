import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Unbounded, Onest } from "next/font/google";
import "./globals.css";
import { getUser, isAdmin, isReferee } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { one, dbConfigured } from "@/lib/db";
import { LogoMark, BellIcon } from "@/components/Art";
import { MobileMenu } from "@/components/client";
import { logout } from "./actions/auth";

const display = Unbounded({ subsets: ["latin", "cyrillic"], variable: "--font-unbounded", weight: ["500", "700"], display: "swap" });
const text = Onest({ subsets: ["latin", "cyrillic"], variable: "--font-onest", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    title: { default: s.site_name, template: `%s · ${s.site_name}` },
    description: s.tagline,
  };
}

export const viewport: Viewport = { themeColor: "#081A32", width: "device-width", initialScale: 1 };

const LINKS = [
  { href: "/competitions", label: "Соревнования" },
  { href: "/players", label: "Игроки" },
  { href: "/stats", label: "Статистика" },
  { href: "/rules", label: "Правила" },
  { href: "/faq", label: "FAQ" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([getUser(), getSettings()]);
  const unread = user && dbConfigured()
    ? (await one<{ n: number }>("select count(*)::int as n from notifications where user_id = $1 and read_at is null", [user.id]))?.n ?? 0
    : 0;

  return (
    <html lang="ru" className={`${display.variable} ${text.variable}`}>
      <body>
        <header className="topbar">
          <div className="wrap">
            <Link href="/" className="brand">
              {settings.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.logo_url} alt="" />
              ) : (
                <LogoMark />
              )}
              <span>{settings.site_name}</span>
            </Link>
            <nav className="nav" aria-label="Основная навигация">
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="top-actions">
              {user ? (
                <>
                  {isReferee(user.role) && (
                    <Link href="/admin" className="btn btn-ghost btn-sm hide-m">
                      {isAdmin(user.role) ? "Админка" : "Судейская"}
                    </Link>
                  )}
                  <Link href="/me/notifications" className="bell" aria-label={`Уведомления${unread ? `: ${unread} новых` : ""}`}>
                    <BellIcon />
                    {unread > 0 && <span className="dot">{unread > 99 ? "99+" : unread}</span>}
                  </Link>
                  <Link href="/me" className="btn btn-ghost btn-sm hide-m">
                    {user.rl_nickname}
                  </Link>
                  <form action={logout} className="hide-m">
                    <button className="btn btn-ghost btn-sm" type="submit">
                      Выйти
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" className="btn btn-ghost btn-sm hide-m">
                    Войти
                  </Link>
                  <Link href="/signup" className="btn btn-sm">
                    Регистрация
                  </Link>
                </>
              )}
              <MobileMenu links={LINKS} authed={!!user} admin={isReferee(user?.role)} />
            </div>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="footer">
          <div className="wrap">
            <span>
              © {new Date().getFullYear()} {settings.site_name}. Фан-платформа, не связана с Psyonix и Epic Games.
            </span>
            <span className="row">
              {settings.discord_url && <a href={settings.discord_url} rel="noopener noreferrer" target="_blank">Discord</a>}
              {settings.contact_email && <a href={`mailto:${settings.contact_email}`}>{settings.contact_email}</a>}
              <Link href="/faq">Контакты</Link>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
