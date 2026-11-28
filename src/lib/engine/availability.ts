// Weekly availability: for each weekday (0 = Monday … 6 = Sunday) the local hours a player can usually play.
export type Availability = Record<string, number[]>;
export const DAYS = 7;
/** Hours shown in the grid (evening-friendly; 24..26 mean 00:00..02:00 of the next night, stored as 0..2 of that weekday). */
export const GRID_HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1];

export function cleanAvailability(raw: unknown): Availability {
  const out: Availability = {};
  if (!raw || typeof raw !== "object") return out;
  for (let d = 0; d < DAYS; d++) {
    const hours = (raw as Record<string, unknown>)[String(d)];
    if (!Array.isArray(hours)) continue;
    const ok = [...new Set(hours.map(Number).filter((h) => Number.isInteger(h) && h >= 0 && h <= 23))].sort((a, b) => a - b);
    if (ok.length) out[String(d)] = ok;
  }
  return out;
}

export const hasAvailability = (a: Availability | null | undefined) => !!a && Object.values(a).some((h) => h.length > 0);

/** Local weekday (0 = Monday) and hour of a moment in a timezone. */
export function localParts(at: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", hour: "2-digit", hour12: false }).formatToParts(at);
  const wd = f.find((p) => p.type === "weekday")!.value;
  const hour = Number(f.find((p) => p.type === "hour")!.value) % 24;
  return { day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd), hour };
}

/** Whole hours between `from` and `to` when every player is free; evenings first within each day, at most `limit`. */
export function commonSlots(players: Availability[], from: Date, to: Date, timeZone: string, limit = 6): Date[] {
  if (!players.length || players.some((p) => !hasAvailability(p))) return [];
  const start = new Date(Math.ceil(from.getTime() / 3600_000) * 3600_000);
  const found: Date[] = [];
  for (let t = start.getTime(); t < to.getTime() && found.length < 60; t += 3600_000) {
    const at = new Date(t);
    const { day, hour } = localParts(at, timeZone);
    if (players.every((p) => (p[String(day)] ?? []).includes(hour))) found.push(at);
  }
  // Prefer one slot per day (the latest evening hour up to 22:00 that fits), so the choice is spread out.
  const byDay = new Map<string, Date[]>();
  for (const s of found) {
    const k = s.toISOString().slice(0, 10);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const picks: Date[] = [];
  for (const list of byDay.values()) {
    const evening = list.filter((s) => {
      const h = localParts(s, timeZone).hour;
      return h >= 18 && h <= 22;
    });
    picks.push((evening.length ? evening : list)[0]);
  }
  return picks.slice(0, limit);
}
