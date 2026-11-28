import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Badge";
import { Unbounded, Onest } from "next/font/google";
import "./globals.css";
import { getUser, isAdmin, isReferee } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { siteUrl } from "@/lib/discord";
import { one, dbConfigured } from "@/lib/db";
import { LogoMark, BellIcon } from "@/components/Art";
import { Suspense } from "react";
import { MobileMenu, I18nProvider, LangSwitch, Dropdown, InstallApp, ServiceWorker } from "@/components/client";
import { getT } from "@/lib/i18n/server";
import { DICTS } from "@/lib/i18n/dicts";
import { logout } from "./actions/auth";

const display = Unbounded({ subsets: ["latin", "cyrillic"], variable: "--font-unbounded", weight: ["500", "700"], display: "swap" });
const text = Onest({ subsets: ["latin", "cyrillic"], variable: "--font-onest", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const [s, t] = await Promise.all([getSettings(), getT()]);
  const description = t(s.tagline);
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: s.site_name, template: `%s · ${s.site_name}` },
    description,
    openGraph: { type: "website", siteName: s.site_name, description, images: [{ url: "/brand/hero-1672.jpg", width: 1672, height: 941 }] },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = { themeColor: "#081A32", width: "device-width", initialScale: 1 };


export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, settings, t] = await Promise.all([getUser(), getSettings(), getT()]);
  const judging = user
    ? isAdmin(user.role) ||
      !!(await one("select 1 from matches where referee_user_id = $1 and status <> 'completed' limit 1", [user.id]).catch(() => null))
    : false;
  const LINKS = [
    { href: "/competitions", label: t("Соревнования"), icon: "ui-competitions" },
    { href: "/players", label: t("Игроки"), icon: "ui-players" },
    { href: "/stats", label: t("Статистика"), icon: "ui-stats" },
    { href: "/hall", label: t("Зал славы"), icon: "ui-hall" },
    { href: "/clubs", label: t("Клубы"), icon: "ui-clubs" },
    { href: "/live", label: t("Эфир"), icon: "ui-live" },
    { href: "/pass", label: t("Пропуск"), icon: "ui-pass" },
    { href: "/duels", label: t("Дуэли"), icon: "ui-duels" },
    { href: "/rules", label: t("Правила"), icon: "ui-rules" },
  ];
  const me = user && dbConfigured()
    ? await one<{ n: number; avatar: string | null }>(
        "select (select count(*)::int from notifications where user_id = $1 and read_at is null) as n, (select avatar from users where id = $1) as avatar",
        [user.id],
      )
    : null;
  const unread = me?.n ?? 0;

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
              {LINKS.filter((l) => l.href !== "/rules").map((l) => (
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
                        <Avatar name={user.rl_nickname} avatar={me?.avatar} size={24} />
                        {user.rl_nickname}
                      </summary>
                    }
                  >
                    <div className="user-menu-list">
                      <Link href="/me"><Icon name="ui-user" /> {t("Профиль")}</Link>
                      <Link href={`/players/${user.id}`}><Icon name="ui-card" /> {t("Моя карточка")}</Link>
                      <Link href="/duels"><Icon name="ui-duels" /> {t("Мои дуэли")}</Link>
                      <Link href="/pass"><Icon name="ui-pass" /> {t("Боевой пропуск")}</Link>
                      <Link href="/story"><Icon name="ui-story" /> {t("Путь чемпиона")}</Link>
                      <Link href="/bets"><Icon name="ui-bets" /> {t("Прогнозы")}</Link>
                      <Link href="/shop"><Icon name="ui-shop" /> {t("Магазин")}</Link>
                      {judging && <Link href="/referee"><Icon name="ui-referee" /> {t("Кабинет судьи")}</Link>}
                      {isReferee(user.role) && <Link href="/admin"><Icon name="ui-admin" /> {isAdmin(user.role) ? t("Админка") : t("Судейская")}</Link>}
                      <form action={logout}>
                        <button type="submit"><Icon name="ui-logout" /> {t("Выйти")}</button>
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
              <ServiceWorker />
              {settings.discord_url && <a href={settings.discord_url} rel="noopener noreferrer" target="_blank">Discord</a>}
              {settings.contact_email && <a href={`mailto:${settings.contact_email}`}>{settings.contact_email}</a>}
              <Link href="/rules">{t("Правила")}</Link>
              <Link href="/faq">{t("Контакты")}</Link>
            </span>
          </div>
        </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
