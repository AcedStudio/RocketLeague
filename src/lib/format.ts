// Labels and time-zone aware date helpers. Safe for server and client.

export const PLATFORM_LABELS: Record<string, string> = { pc: "PC", playstation: "PlayStation", xbox: "Xbox" };

export const KIND_LABELS: Record<string, string> = { league: "Лига", cup: "Кубок" };

export const FORMAT_LABELS: Record<string, string> = {
  groups_knockout: "Группы + плей-офф",
  knockout: "Плей-офф (на выбывание)",
  round_robin: "Круговой турнир (каждый с каждым)",
};

export const COMP_STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  registration: "Регистрация открыта",
  closed: "Регистрация закрыта",
  in_progress: "Идёт турнир",
  playoffs: "Плей-офф",
  finished: "Завершён",
};

export const ENTRY_STATUS_LABELS: Record<string, string> = {
  incomplete: "Ждёт второго игрока",
  pending: "На проверке",
  confirmed: "Подтверждён",
  waitlist: "Лист ожидания",
  cancelled: "Отменён",
  rejected: "Отклонён",
};

export const MATCH_STATUS_LABELS: Record<string, string> = {
  upcoming: "Скоро",
  ready: "Готов к игре",
  live: "Идёт",
  completed: "Завершён",
  under_review: "На рассмотрении",
  postponed: "Перенесён",
};

export const PAYOUT_LABELS: Record<string, string> = {
  not_configured: "Не настроено",
  pending: "Ожидает выплаты",
  partially_paid: "Выплачено частично",
  paid: "Выплачено",
};

function wallClock(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}

/** "2026-12-01T18:30" interpreted in `tz` → Date (UTC instant). */
export function fromLocalInput(value: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let guess = asUtc - (wallClock(new Date(asUtc), tz) - asUtc);
  guess = asUtc - (wallClock(new Date(guess), tz) - guess);
  const d = new Date(guess);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → "YYYY-MM-DDTHH:mm" in `tz`, for <input type="datetime-local">. */
export function toLocalInput(value: string | Date | null | undefined, tz: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(wallClock(d, tz)).toISOString().slice(0, 16);
}

type Fmt = { intl: string; (key: string, params?: Record<string, string | number>): string };

export function fmtDateTime(value: string | Date | null | undefined, tz: string, t: Fmt): string {
  if (!value) return t("Время не назначено");
  return new Intl.DateTimeFormat(t.intl, {
    timeZone: tz,
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function fmtDate(value: string | Date | null | undefined, tz: string, t: Fmt): string {
  if (!value) return t("Дата не назначена");
  return new Intl.DateTimeFormat(t.intl, { timeZone: tz, day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

export function fmtMoney(amount: number | string | null | undefined, currency: string, intl = "ru-RU"): string | null {
  if (amount === null || amount === undefined || amount === "") return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  try {
    return new Intl.NumberFormat(intl, { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${n.toLocaleString(intl)} ${currency}`;
  }
}

/** Group names are stored as "Группа A" / "Таблица"; translate at render time. */
export function groupLabel(name: string | null | undefined, t: Fmt): string {
  if (!name) return t("Группа");
  const m = /^Группа (\w+)$/.exec(name);
  if (m) return t("Группа {letter}", { letter: m[1] });
  return t(name);
}

export function slugify(s: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
    н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return s
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Renders a stored template (notification, match event) in the reader's language. */
export function renderStored(t: Fmt, text: string, params: Record<string, unknown> | null | undefined): string {
  const p: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params ?? {})) if (typeof v === "string" || typeof v === "number") p[k] = typeof v === "string" ? t(v) : v;
  if (typeof params?.at === "string") p.when = fmtDateTime(params.at, typeof params.tz === "string" ? params.tz : "Asia/Tashkent", t);
  return t(text, p);
}

/** The score to show: goals for a single-game match, otherwise the series score. */
export function scoreOf(m: { best_of: number; games?: { home: number; away: number }[] | null; home_wins: number | null; away_wins: number | null }): [number, number] {
  if (m.best_of === 1 && m.games?.length === 1) return [m.games[0].home, m.games[0].away];
  return [m.home_wins ?? 0, m.away_wins ?? 0];
}

/** "Сегодня, 20:00" / "Завтра, 19:30" / "2 декабря, 18:00" in the competition's time zone. */
export function fmtWhen(value: string | Date, tz: string, t: Fmt, now = new Date()): string {
  const d = new Date(value);
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: tz });
  const time = new Intl.DateTimeFormat(t.intl, { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);
  if (day(d) === day(now)) return t("Сегодня, {time}", { time });
  if (day(d) === day(new Date(now.getTime() + 86400_000))) return t("Завтра, {time}", { time });
  return fmtDateTime(d, tz, t);
}
