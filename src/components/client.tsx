"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  disabled,
  quiet,
}: {
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  pendingText?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
  /** Keep the label while sending (for groups of option buttons). */
  quiet?: boolean;
}) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending || disabled}
      name={name}
      value={value}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending && !quiet ? pendingText ?? t("Сохраняем…") : children}
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

type NavLink = { href: string; label: string; icon?: string };
const isHere = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

/** The full menu as a sheet: grouped tiles + language. Opened from the bottom tab bar on phones. */
export function MobileMenu({ groups, authed, admin }: { groups: { title: string; links: NavLink[] }[]; authed: boolean; admin: boolean }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [open]);
  const account: NavLink[] = [
    authed ? { href: "/me", label: t("Мой кабинет"), icon: "ui-user" } : { href: "/login", label: t("Войти"), icon: "ui-login" },
    ...(authed ? [] : [{ href: "/signup", label: t("Создать аккаунт"), icon: "ui-signup" }]),
    ...(admin ? [{ href: "/admin", label: t("Админ-панель"), icon: "ui-admin" }] : []),
  ];
  const tile = (l: NavLink) => (
    <Link key={l.href} href={l.href} className="mnav-tile" aria-current={isHere(path, l.href) ? "page" : undefined}>
      <span className="mnav-ico" aria-hidden="true">{l.icon && <Icon name={l.icon} size={22} />}</span>
      <span>{l.label}</span>
    </Link>
  );
  return (
    <>
      <button className="tab" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(!open)}>
        <Icon name="ui-more" size={24} />
        <span>{t("Меню")}</span>
      </button>
      {open && <div className="mnav-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <nav id="mobile-nav" className="mobile-nav" data-open={open} aria-label={t("Меню")} onClick={() => setOpen(false)}>
        <span className="mnav-handle" aria-hidden />
        {groups.map((g) => (
          <div key={g.title} className="mnav-group">
            <span className="mnav-title">{g.title}</span>
            <div className="mnav-grid">{g.links.map(tile)}</div>
          </div>
        ))}
        <div className="mnav-group">
          <span className="mnav-title">{t("Аккаунт")}</span>
          <div className="mnav-grid">{account.map(tile)}</div>
        </div>
        <div className="mnav-lang" onClick={(e) => e.stopPropagation()}>
          <span className="small faint">{t("Язык")}</span>
          <LangSwitch />
        </div>
      </nav>
    </>
  );
}

/** Phone navigation: four destinations + the menu, always at the thumb. */
export function BottomNav({ tabs, groups, authed, admin, badge }: { tabs: NavLink[]; groups: { title: string; links: NavLink[] }[]; authed: boolean; admin: boolean; badge?: number }) {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="Tabs">
      {tabs.map((l) => (
        <Link key={l.href} href={l.href} className="tab" aria-current={isHere(path, l.href) ? "page" : undefined}>
          <span className="tab-ico">
            {l.icon && <Icon name={l.icon} size={24} />}
            {l.href === "/play" && badge ? <i className="tab-badge">{badge > 9 ? "9+" : badge}</i> : null}
          </span>
          <span>{l.label}</span>
        </Link>
      ))}
      <MobileMenu groups={groups} authed={authed} admin={admin} />
    </nav>
  );
}

/** Desktop "More" menu. */
export function MoreMenu({ label, links }: { label: string; links: NavLink[] }) {
  const path = usePathname();
  const active = links.some((l) => isHere(path, l.href));
  return (
    <Dropdown
      className="more-menu"
      summary={<summary className={active ? "active" : undefined}>{label}</summary>}
    >
      <div className="more-list">
        {links.map((l) => (
          <Link key={l.href} href={l.href} aria-current={isHere(path, l.href) ? "page" : undefined}>
            {l.icon && <Icon name={l.icon} size={20} />} {l.label}
          </Link>
        ))}
      </div>
    </Dropdown>
  );
}

/** Desktop primary links with the active one highlighted. */
export function NavLinks({ links }: { links: NavLink[] }) {
  const path = usePathname();
  return (
    <>
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={isHere(path, l.href) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
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
          <span className="small muted">{bestOf === 1 ? t("Счёт") : t("Игра {n}", { n: i + 1 })}</span>
          <input className="input" inputMode="numeric" pattern="[0-9]*" maxLength={2} aria-label={t("Игра {n}, голы: {team}", { n: i + 1, team: homeName })} value={g.home}
            onChange={(e) => setGames(games.map((x, j) => (j === i ? { ...x, home: e.target.value.replace(/\D/g, "") } : x)))} />
          <span className="faint" style={{ textAlign: "center" }}>:</span>
          <input className="input" inputMode="numeric" pattern="[0-9]*" maxLength={2} aria-label={t("Игра {n}, голы: {team}", { n: i + 1, team: awayName })} value={g.away}
            onChange={(e) => setGames(games.map((x, j) => (j === i ? { ...x, away: e.target.value.replace(/\D/g, "") } : x)))} />
        </div>
      ))}
      {(() => {
        const winner = bestOf === 1
          ? games[0] && games[0].home !== "" && games[0].away !== "" && games[0].home !== games[0].away
            ? Number(games[0].home) > Number(games[0].away) ? homeName : awayName
            : null
          : decided ? (wins.h > wins.a ? homeName : awayName) : null;
        const draw = bestOf === 1 && games[0] && games[0].home !== "" && games[0].home === games[0].away;
        return winner ? (
          <p className="games-winner">🏆 {t("Победитель: {name}", { name: winner })}</p>
        ) : draw ? (
          <p className="games-winner warn">{t("Ничьих не бывает — впишите счёт после овертайма")}</p>
        ) : null;
      })()}
      <div className="row between">
        <span className="small muted">
          {bestOf === 1
            ? t("Одна игра — впишите итоговый счёт (с овертаймом)")
            : `${t("Серия Bo{bo}: {h} – {a}", { bo: bestOf, h: wins.h, a: wins.a })} · ${decided ? t("серия завершена") : t("нужно побед: {n}", { n: need })}`}
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

/** <details> dropdown that closes on navigation, outside click and Escape. */
export function Dropdown({ className, summary, children }: { className?: string; summary: React.ReactNode; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const path = usePathname();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [path]);
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  return (
    <details ref={ref} className={className}>
      {summary}
      {children}
    </details>
  );
}

/** GET form that navigates as soon as a select changes; keeps the #anchor so the view stays in place. */
export function AutoSubmitForm({ action, className, children, anchor = "view" }: { action: string; className?: string; children: React.ReactNode; anchor?: string }) {
  const router = useRouter();
  const go = (form: HTMLFormElement) => {
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(form)) if (typeof v === "string" && v) params.set(k, v);
    const qs = params.toString();
    router.push(`${action}${qs ? `?${qs}` : ""}#${anchor}`, { scroll: false });
  };
  return (
    <form
      action={action}
      method="get"
      className={className}
      onChange={(e) => {
        const form = e.currentTarget;
        // Changing the player clears the opponent, so the two never point at the same entry.
        if ((e.target as unknown as HTMLSelectElement).name === "p") {
          const vs = form.elements.namedItem("vs") as HTMLSelectElement | null;
          if (vs) vs.value = "";
        }
        go(form);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        go(e.currentTarget);
      }}
    >
      {children}
    </form>
  );
}

/** Picks screenshots, shrinks them in the browser (≤1600px WEBP) and swaps them into the form before upload. */
export function ShotPicker({ left }: { left: number }) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function shrink(f: File): Promise<File> {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    for (const quality of [0.82, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", quality));
      if (blob && blob.type === "image/webp" && blob.size <= 1_400_000) return new File([blob], f.name.replace(/\.\w+$/, "") + ".webp", { type: "image/webp" });
      if (blob && blob.type !== "image/webp") {
        // Safari without WEBP encoding: fall back to JPEG.
        const jpg = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
        if (jpg && jpg.size <= 1_400_000) return new File([jpg], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
      }
    }
    throw new Error("too big");
  }

  async function onChange() {
    const input = ref.current!;
    const files = [...(input.files ?? [])].slice(0, left);
    previews.forEach(URL.revokeObjectURL);
    setErr("");
    if (!files.length) return setPreviews([]);
    setBusy(true);
    try {
      const out = await Promise.all(files.map(shrink));
      const dt = new DataTransfer();
      out.forEach((f) => dt.items.add(f));
      input.files = dt.files;
      setPreviews(out.map((f) => URL.createObjectURL(f)));
    } catch {
      input.value = "";
      setPreviews([]);
      setErr(t("Не удалось обработать картинку — попробуйте другой файл"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-sm">
      <label className="shot-drop">
        <input ref={ref} type="file" name="shots" accept="image/png,image/jpeg,image/webp" multiple onChange={onChange} required />
        <span>📷 {busy ? t("Сжимаем…") : previews.length ? t("Выбрано: {n}", { n: previews.length }) : t("Выберите скриншоты (до {n})", { n: left })}</span>
      </label>
      {err && <p className="small" style={{ color: "var(--danger)", margin: 0 }}>{err}</p>}
      {previews.length > 0 && (
        <div className="shot-grid">
          {previews.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" />
          ))}
        </div>
      )}
    </div>
  );
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** "Install the app" button: Android/desktop Chrome get the real prompt, iPhone gets a one-line hint. */
export function InstallApp() {
  const t = useT();
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hint, setHint] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (standalone) return;
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const on = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", on);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);
  if (!evt && !ios) return null;
  return (
    <span className="install-app">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={async () => {
          if (evt) {
            await evt.prompt();
            await evt.userChoice;
            setEvt(null);
          } else setHint((v) => !v);
        }}
      >
        <Icon name="ui-install" size={16} /> {t("Установить приложение")}
      </button>
      {hint && <small className="muted">{t("В Safari нажмите «Поделиться» → «На экран Домой»")}</small>}
    </span>
  );
}


/** Scrolls a horizontal strip so that the marked child is in view (e.g. the current pass tier). */
export function ScrollToMark({ target }: { target: string }) {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(target);
    const box = el?.parentElement;
    if (el && box) box.scrollLeft = Math.max(0, el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2);
  }, [target]);
  return null;
}


/** Re-fetches the server page every few seconds and shows how fresh the data is. */
export function AutoRefresh({ seconds = 20, label }: { seconds?: number; label: string }) {
  const router = useRouter();
  const [ago, setAgo] = useState(0);
  useEffect(() => {
    const tick = setInterval(() => setAgo((a) => a + 1), 1000);
    const pull = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
        setAgo(0);
      }
    }, seconds * 1000);
    return () => {
      clearInterval(tick);
      clearInterval(pull);
    };
  }, [router, seconds]);
  return (
    <span className="live-fresh" suppressHydrationWarning>
      <i className="live-dot" aria-hidden /> {label.replace("{n}", String(ago))}
    </span>
  );
}

/** "in 2 h 10 min" ticking down to a moment. */
export function TimeTo({ iso, soon, now: nowLabel, units }: { iso: string; soon: string; now: string; units: [string, string] }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return <span className="num">…</span>;
  const mins = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (mins <= 0) return <span>{nowLabel}</span>;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return <span className="num">{soon.replace("{t}", h ? `${h} ${units[0]} ${m} ${units[1]}` : `${m} ${units[1]}`)}</span>;
}


/** Registers the service worker (offline page + push). */
export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

const toKey = (b64: string) => {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Turns phone/desktop push notifications on or off for this browser. */
export function PushToggle() {
  const t = useT();
  const [state, setState] = useState<"loading" | "unsupported" | "denied" | "off" | "on" | "ios">("loading");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    (async () => {
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone ? "ios" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);
  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.ready;
      const { key } = await (await fetch("/api/push")).json();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) });
      const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      setState(res.ok ? "on" : "off");
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  };
  if (state === "loading") return <span className="small muted">…</span>;
  if (state === "unsupported") return <span className="small muted">{t("Этот браузер не поддерживает push-уведомления.")}</span>;
  if (state === "ios") return <span className="small muted">{t("На iPhone: сначала добавьте сайт на экран «Домой» (Поделиться → На экран Домой), затем откройте его оттуда и включите уведомления.")}</span>;
  if (state === "denied") return <span className="small muted">{t("Уведомления заблокированы в настройках браузера для этого сайта.")}</span>;
  return (
    <div className="row between push-row">
      <span className="small">
        {state === "on" ? <b className="push-on">{t("Включены на этом устройстве")}</b> : t("Матчи, результаты и напоминания — прямо на телефон.")}
      </span>
      <button type="button" className={`btn btn-sm ${state === "on" ? "btn-ghost" : ""}`} disabled={busy} onClick={state === "on" ? disable : enable}>
        {state === "on" ? t("Выключить") : t("Включить")}
      </button>
    </div>
  );
}
