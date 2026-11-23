"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { makeT, LOCALES, LOCALE_SHORT, LOCALE_NAMES, type Dict, type Locale, type T } from "@/lib/i18n/core";
import { setLocale } from "@/app/actions/locale";

const I18nCtx = createContext<{ locale: Locale; dict: Dict | null }>({ locale: "ru", dict: null });

export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Dict | null; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, dict }), [locale, dict]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useT(): T {
  const { locale, dict } = useContext(I18nCtx);
  return useMemo(() => makeT(locale, dict), [locale, dict]);
}

export function LangSwitch() {
  const t = useT();
  const path = usePathname();
  const sp = useSearchParams();
  const qs = new URLSearchParams(sp);
  qs.delete("ok");
  qs.delete("err");
  const back = path + (qs.size ? `?${qs}` : "");
  return (
    <form action={setLocale} className="lang" aria-label={t("Язык")}>
      <input type="hidden" name="back" value={back} />
      {LOCALES.map((l) => (
        <button key={l} name="lang" value={l} type="submit" aria-pressed={t.locale === l} title={LOCALE_NAMES[l]} lang={l}>
          {LOCALE_SHORT[l]}
        </button>
      ))}
    </form>
  );
}

export function SubmitButton({
  children,
  className = "btn",
  confirm,
  pendingText,
  name,
  value,
}: {
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  pendingText?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      name={name}
      value={value}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? pendingText ?? t("Сохраняем…") : children}
    </button>
  );
}

export function Countdown({ to }: { to: string }) {
  const t = useT();
  const target = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, target - (now ?? target));
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const cells: [number, string][] = [
    [d, t("дней")],
    [h, t("часов")],
    [m, t("минут")],
    [s, t("секунд")],
  ];
  return (
    <div className="countdown" role="timer" aria-label={t("До старта")}>
      {cells.map(([v, l]) => (
        <div key={l}>
          <b suppressHydrationWarning>{now === null ? "–" : String(v).padStart(2, "0")}</b>
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}

export function MobileMenu({ links, authed, admin }: { links: { href: string; label: string }[]; authed: boolean; admin: boolean }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <>
      <button className="icon-btn menu-btn" aria-expanded={open} aria-controls="mobile-nav" aria-label={t("Меню")} onClick={() => setOpen(!open)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      <nav id="mobile-nav" className="mobile-nav" data-open={open} style={{ position: "absolute", left: 0, right: 0, top: 64, background: "var(--canvas)" }} onClick={() => setOpen(false)}>
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            {l.label}
          </Link>
        ))}
        {authed ? <Link href="/me">{t("Мой кабинет")}</Link> : <Link href="/login">{t("Войти")}</Link>}
        {!authed && <Link href="/signup">{t("Создать аккаунт")}</Link>}
        {admin && <Link href="/admin">{t("Админ-панель")}</Link>}
        <div style={{ padding: "12px 0" }} onClick={(e) => e.stopPropagation()}>
          <LangSwitch />
        </div>
      </nav>
    </>
  );
}

/** Score inputs for each game of a Best-of-N series. */
export function GamesInput({ bestOf, homeName, awayName, initial }: { bestOf: number; homeName: string; awayName: string; initial?: { home: number; away: number }[] }) {
  const t = useT();
  const need = Math.floor(bestOf / 2) + 1;
  const [games, setGames] = useState<{ home: string; away: string }[]>(
    initial?.length ? initial.map((g) => ({ home: String(g.home), away: String(g.away) })) : [{ home: "", away: "" }],
  );
  const wins = games.reduce(
    (acc, g) => {
      const h = Number(g.home), a = Number(g.away);
      if (g.home !== "" && g.away !== "" && h !== a) {
        if (h > a) acc.h++;
        else acc.a++;
      }
      return acc;
    },
    { h: 0, a: 0 },
  );
  const decided = wins.h >= need || wins.a >= need;
  const value = games
    .filter((g) => g.home !== "" && g.away !== "")
    .map((g) => `${g.home}-${g.away}`)
    .join(",");
  return (
    <div className="games-input">
      <div className="game-row small muted">
        <span />
        <span style={{ textAlign: "center" }}>{homeName}</span>
        <span />
        <span style={{ textAlign: "center" }}>{awayName}</span>
      </div>
      {games.map((g, i) => (
        <div className="game-row" key={i}>
          <span className="small muted">{t("Игра {n}", { n: i + 1 })}</span>
          <input className="input" inputMode="numeric" pattern="[0-9]*" maxLength={2} aria-label={t("Игра {n}, голы: {team}", { n: i + 1, team: homeName })} value={g.home}
            onChange={(e) => setGames(games.map((x, j) => (j === i ? { ...x, home: e.target.value.replace(/\D/g, "") } : x)))} />
          <span className="faint" style={{ textAlign: "center" }}>:</span>
          <input className="input" inputMode="numeric" pattern="[0-9]*" maxLength={2} aria-label={t("Игра {n}, голы: {team}", { n: i + 1, team: awayName })} value={g.away}
            onChange={(e) => setGames(games.map((x, j) => (j === i ? { ...x, away: e.target.value.replace(/\D/g, "") } : x)))} />
        </div>
      ))}
      <div className="row between">
        <span className="small muted">
          {t("Серия Bo{bo}: {h} – {a}", { bo: bestOf, h: wins.h, a: wins.a })} · {decided ? t("серия завершена") : t("нужно побед: {n}", { n: need })}
        </span>
        <div className="row">
          {games.length > 1 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGames(games.slice(0, -1))}>
              {t("Убрать игру")}
            </button>
          )}
          {!decided && games.length < bestOf && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGames([...games, { home: "", away: "" }])}>
              {t("Добавить игру")}
            </button>
          )}
        </div>
      </div>
      <input type="hidden" name="games" value={value} />
    </div>
  );
}

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const t = useT();
  return (
    <div className="row" style={{ flexWrap: "nowrap" }}>
      <input className="input" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn btn-ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            /* clipboard blocked: the field is selectable */
          }
        }}
      >
        {copied ? t("Скопировано") : t("Копировать")}
      </button>
    </div>
  );
}

/** Converts a UTC date to the viewer's local time after hydration. */
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState<string | null>(null);
  const t = useT();
  useEffect(() => {
    setText(new Intl.DateTimeFormat(t.intl, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)));
  }, [iso, t.intl]);
  return text ? <span className="faint small"> · {t("у вас {time}", { time: text })}</span> : null;
}

export function Tabs({ items, className = "tabs" }: { items: { href: string; label: string; exact?: boolean }[]; className?: string }) {
  const path = usePathname();
  const t = useT();
  return (
    <nav className={className} aria-label={t("Разделы")}>
      {items.map((it) => {
        const active = it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/");
        return (
          <Link key={it.href} href={it.href} aria-current={active ? "page" : undefined}>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
