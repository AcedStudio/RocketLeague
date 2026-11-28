// Monthly themed events: a time window, a pass-XP boost, points from activity and limited rewards.
// Names are English and never translated; descriptions are Russian i18n keys.
export type EventReward = { coins: number; item?: string };
export type GameEvent = {
  key: string;
  name: string;
  desc: string;
  start: string; // YYYY-MM-DD, Tashkent, inclusive
  end: string; // YYYY-MM-DD, Tashkent, inclusive
  boost: number; // pass XP multiplier for activity inside the window
  icon: string;
  theme: { c1: string; c2: string; glow: string };
  milestones: { points: number; reward: EventReward }[];
};

export const EVENT_POINTS = { match: 10, win: 10, duel: 6, duelWin: 6, refereed: 8, checkin: 5 } as const;

export const EVENTS: GameEvent[] = [
  {
    key: "frostbite",
    name: "Frostbite",
    desc: "Зимний ивент: каждый матч, дуэль и вход приносят очки события, а опыт пропуска растёт в полтора раза.",
    start: "2026-11-28",
    end: "2026-12-31",
    boost: 1.5,
    icon: "t-frostbite",
    theme: { c1: "#7FD8FF", c2: "#2A5BD7", glow: "rgba(127, 216, 255, 0.45)" },
    milestones: [
      { points: 50, reward: { coins: 50 } },
      { points: 150, reward: { coins: 0, item: "tag:frostbite" } },
      { points: 300, reward: { coins: 150 } },
      { points: 500, reward: { coins: 0, item: "avatar:frostbite" } },
      { points: 800, reward: { coins: 300 } },
    ],
  },
  {
    key: "newyear",
    name: "New Year Clash",
    desc: "Новогодний ивент: опыт пропуска ×1.5, салют наград и лимитированный аватар.",
    start: "2027-01-01",
    end: "2027-01-31",
    boost: 1.5,
    icon: "t-newyear",
    theme: { c1: "#FFD66B", c2: "#E0452B", glow: "rgba(255, 214, 107, 0.45)" },
    milestones: [
      { points: 50, reward: { coins: 60 } },
      { points: 150, reward: { coins: 0, item: "tag:newyear" } },
      { points: 300, reward: { coins: 150 } },
      { points: 500, reward: { coins: 0, item: "avatar:firework" } },
      { points: 800, reward: { coins: 300 } },
    ],
  },
  {
    key: "lovetap",
    name: "Love Tap",
    desc: "Февральский ивент: зовите друзей на дуэли, копите очки и забирайте тег Love Tap. Опыт ×1.5.",
    start: "2027-02-01",
    end: "2027-02-28",
    boost: 1.5,
    icon: "t-lovetap",
    theme: { c1: "#FF9CC2", c2: "#C2185B", glow: "rgba(255, 156, 194, 0.45)" },
    milestones: [
      { points: 50, reward: { coins: 60 } },
      { points: 150, reward: { coins: 0, item: "tag:lovetap" } },
      { points: 300, reward: { coins: 150 } },
      { points: 600, reward: { coins: 350 } },
    ],
  },
];

const TZ_OFFSET = "+05:00"; // Asia/Tashkent has no DST
export const eventStart = (e: GameEvent) => new Date(`${e.start}T00:00:00${TZ_OFFSET}`);
export const eventEnd = (e: GameEvent) => new Date(new Date(`${e.end}T00:00:00${TZ_OFFSET}`).getTime() + 86400_000);

export const currentEvent = (now = new Date()) => EVENTS.find((e) => eventStart(e) <= now && now < eventEnd(e)) ?? null;
export const nextEvent = (now = new Date()) => EVENTS.find((e) => eventStart(e) > now) ?? null;
export const findEvent = (key: string) => EVENTS.find((e) => e.key === key) ?? null;

export type EventActivity = { matches: number; wins: number; duels: number; duelWins: number; refereed: number; checkin: number };
export const eventPoints = (a: EventActivity) =>
  a.matches * EVENT_POINTS.match +
  a.wins * EVENT_POINTS.win +
  a.duels * EVENT_POINTS.duel +
  a.duelWins * EVENT_POINTS.duelWin +
  a.refereed * EVENT_POINTS.refereed +
  a.checkin * EVENT_POINTS.checkin;

/** Overlap of the event with another window (e.g. a pass season), or null. */
export function overlap(e: GameEvent, from: Date, to: Date) {
  const a = new Date(Math.max(eventStart(e).getTime(), from.getTime()));
  const b = new Date(Math.min(eventEnd(e).getTime(), to.getTime()));
  return a < b ? { from: a, to: b } : null;
}
