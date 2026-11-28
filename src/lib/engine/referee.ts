// Referee recognition: reliability score, pay per match, and the referee track.
export const FAST_MINUTES = 6 * 60;
export const PAY_FAST = 25;
export const PAY_NORMAL = 10;

/** Coins for scoring a match: quick work (within 6h of kick-off) pays more. */
export const payFor = (minutes: number | null) => (minutes !== null && minutes <= FAST_MINUTES ? PAY_FAST : PAY_NORMAL);

export type RefLog = { minutes: number | null; corrected: boolean };

/**
 * Reliability 0..100: speed (share of fast results) 50%, accuracy (no staff corrections) 40%,
 * experience 10% (full at 20 matches). Shrinks towards 70 for a handful of matches so one game can't make 100.
 */
export function reliability(logs: RefLog[], overdue = 0) {
  const n = logs.length;
  if (!n) return null;
  const timed = logs.filter((l) => l.minutes !== null);
  const speed = timed.length ? timed.filter((l) => l.minutes! <= FAST_MINUTES).length / timed.length : 0.7;
  const accuracy = 1 - logs.filter((l) => l.corrected).length / n;
  const exp = Math.min(1, n / 20);
  const raw = (speed * 0.5 + accuracy * 0.4 + exp * 0.1) * 100;
  const k = Math.min(1, n / 5);
  const score = Math.round(raw * k + 70 * (1 - k)) - overdue * 5;
  return Math.max(0, Math.min(100, score));
}

export const reliabilityLabel = (s: number) => (s >= 90 ? "Эталон" : s >= 75 ? "Надёжный" : s >= 55 ? "Стабильный" : "Нужно быстрее");

export type RefTier = { key: string; name: string; need: number; icon: string; reward: { coins: number; item?: string } };

/** Referee track: names are titles in English (not translated). */
export const REF_TRACK: RefTier[] = [
  { key: "whistle", name: "First Whistle", need: 1, icon: "q-ref", reward: { coins: 50 } },
  { key: "trusted", name: "Trusted Official", need: 5, icon: "a-referee", reward: { coins: 120 } },
  { key: "senior", name: "Senior Referee", need: 15, icon: "t-whistle", reward: { coins: 200, item: "tag:whistle" } },
  { key: "elite", name: "Elite Panel", need: 30, icon: "t-var", reward: { coins: 300, item: "tag:var" } },
  { key: "legend", name: "Arbiter Legend", need: 60, icon: "av-arbiter", reward: { coins: 500, item: "avatar:arbiter" } },
];
