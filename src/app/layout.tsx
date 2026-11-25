import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Unbounded, Onest } from "next/font/google";
import "./globals.css";
import { getUser, isAdmin, isReferee } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { one, dbConfigured } from "@/lib/db";
import { LogoMark, BellIcon } from "@/components/Art";
import { Suspense } from "react";
import { MobileMenu, I18nProvider, LangSwitch, Dropdown, InstallApp } from "@/components/client";
import { getT } from "@/lib/i18n/server";
import { DICTS } from "@/lib/i18n/dicts";
import { logout } from "./actions/auth";

const display = Unbounded({ subsets: ["latin", "cyrillic"], variable: "--font-unbounded", weight: ["500", "700"], display: "swap" });
const text = Onest({ subsets: ["latin", "cyrillic"], variable: "--font-onest", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const [s, t] = await Promise.all([getSettings(), getT()]);
  return {
    title: { default: s.site_name, template: `%s · ${s.site_name}` },
    description: t(s.tagline),
  };
}

export const viewport: Viewport = { themeColor: "#081A32", width: "device-width", initialScale: 1 };


export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, settings, t] = await Promise.all([getUser(), getSettings(), getT()]);
  const LINKS = [
    { href: "/competitions", label: t("Соревнования") },
    { href: "/players", label: t("Игроки") },
    { href: "/stats", label: t("Статистика") },
    { href: "/hall", label: t("Зал славы") },
    { href: "/rules", label: t("Правила") },
    { href: "/faq", label: "FAQ" },
  ];
  const unread = user && dbConfigured()
    ? (await one<{ n: number }>("select count(*)::int as n from notifications where user_id = $1 and read_at is null", [user.id]))?.n ?? 0
    : 0;

  return (
    <html lang={t.locale} className={`${display.variable} ${text.variable}`}>
      <body>
        <I18nProvider locale={t.locale} dict={DICTS[t.locale]}>
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
            <nav className="nav" aria-label={t("Основная навигация")}>
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="top-actions">
              <div className="hide-m">
                <Suspense>
                  <LangSwitch />
                </Suspense>
              </div>
              {user ? (
                <>
                  <Link href="/me/notifications" className="bell" aria-label={unread ? t("Уведомления: {n} новых", { n: unread }) : t("Уведомления")}>
                    <BellIcon />
                    {unread > 0 && <span className="dot">{unread > 99 ? "99+" : unread}</span>}
                  </Link>
                  <Dropdown
                    className="user-menu hide-m"
                    summary={
                      <summary className="btn btn-ghost btn-sm">
                        <span className="user-dot" aria-hidden>{user.rl_nickname.slice(0, 1).toUpperCase()}</span>
                        {user.rl_nickname}
                      </summary>
                    }
                  >
                    <div className="user-menu-list">
                      <Link href="/me">{t("Профиль")}</Link>
                      <Link href={`/players/${user.id}`}>{t("Моя карточка")}</Link>
                      {isReferee(user.role) && <Link href="/admin">{isAdmin(user.role) ? t("Админка") : t("Судейская")}</Link>}
                      <form action={logout}>
                        <button type="submit">{t("Выйти")}</button>
                      </form>
                    </div>
                  </Dropdown>
                </>
              ) : (
                <>
                  <Link href="/login" className="btn btn-ghost btn-sm hide-m">
                    {t("Войти")}
                  </Link>
                  <Link href="/signup" className="btn btn-sm">
                    {t("Регистрация")}
                  </Link>
                </>
              )}
              <Suspense>
                <MobileMenu links={LINKS} authed={!!user} admin={isReferee(user?.role)} />
              </Suspense>
            </div>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="footer">
          <div className="wrap">
            <span>
              © {new Date().getFullYear()} {settings.site_name}. {t("Фан-платформа, не связана с Psyonix и Epic Games.")}
            </span>
            <span className="row">
              <InstallApp />
              {settings.discord_url && <a href={settings.discord_url} rel="noopener noreferrer" target="_blank">Discord</a>}
              {settings.contact_email && <a href={`mailto:${settings.contact_email}`}>{settings.contact_email}</a>}
              <Link href="/faq">{t("Контакты")}</Link>
            </span>
          </div>
        </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
