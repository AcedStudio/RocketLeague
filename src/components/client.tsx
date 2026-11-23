"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SubmitButton({
  children,
  className = "btn",
  confirm,
  pendingText = "Сохраняем…",
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
      {pending ? pendingText : children}
    </button>
  );
}

export function Countdown({ to }: { to: string }) {
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
    [d, "дней"],
    [h, "часов"],
    [m, "минут"],
    [s, "секунд"],
  ];
  return (
    <div className="countdown" role="timer" aria-label="До старта">
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
  return (
    <>
      <button className="icon-btn menu-btn" aria-expanded={open} aria-controls="mobile-nav" aria-label="Меню" onClick={() => setOpen(!open)}>
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
        {authed ? <Link href="/me">Мой кабинет</Link> : <Link href="/login">Войти</Link>}
        {!authed && <Link href="/signup">Создать аккаунт</Link>}
        {admin && <Link href="/admin">Админ-панель</Link>}
      </nav>
    </>
  );
}

/** Score inputs for each game of a Best-of-N series. */
export function GamesInput({ bestOf, homeName, awayName, initial }: { bestOf: number; homeName: string; awayName: string; initial?: { home: number; away: number }[] }) {
  const need = Math.floor(bestOf / 2) + 1;
  const [games, setGames] = useState<{ home: string; away: string }[]>(
    initial?.length ? initial.map((g) => ({ home: String(g.home), away: String(g.away) })) : [{ home: "", away: "" }],
  );
  const wins = games.reduce(
    (acc, g) => {
      const h = Number(g.home), a = Number(g.away);
      if (g.home !== "" && g.away !== "" && h !== a) h > a ? acc.h++ : acc.a++;
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
          <span className="small muted">Игра {i + 1}</span>
          <input className="input" inputMode="numeric" pattern="[0-9]*" maxLength={2} aria-label={`Игра ${i + 1}, голы ${homeName}`} value={g.home}
            onChange={(e) => setGames(games.map((x, j) => (j === i ? { ...x, home: e.target.value.replace(/\D/g, "") } : x)))} />
          <span className="faint" style={{ textAlign: "center" }}>:</span>
          <input className="input" inputMode="numeric" pattern="[0-9]*" maxLength={2} aria-label={`Игра ${i + 1}, голы ${awayName}`} value={g.away}
            onChange={(e) => setGames(games.map((x, j) => (j === i ? { ...x, away: e.target.value.replace(/\D/g, "") } : x)))} />
        </div>
      ))}
      <div className="row between">
        <span className="small muted">
          Серия Bo{bestOf}: {wins.h} – {wins.a} {decided ? "· серия завершена" : `· нужно ${need} побед`}
        </span>
        <div className="row">
          {games.length > 1 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGames(games.slice(0, -1))}>
              Убрать игру
            </button>
          )}
          {!decided && games.length < bestOf && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGames([...games, { home: "", away: "" }])}>
              Добавить игру
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
        {copied ? "Скопировано" : "Копировать"}
      </button>
    </div>
  );
}

/** Converts a UTC date to the viewer's local time after hydration. */
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setText(new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)));
  }, [iso]);
  return text ? <span className="faint small"> · у вас {text}</span> : null;
}

export function Tabs({ items, className = "tabs" }: { items: { href: string; label: string; exact?: boolean }[]; className?: string }) {
  const path = usePathname();
  return (
    <nav className={className} aria-label="Разделы">
      {items.map((t) => {
        const active = t.exact ? path === t.href : path === t.href || path.startsWith(t.href + "/");
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
