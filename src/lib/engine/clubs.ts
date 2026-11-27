// Clubs: tags, crests and the weekly club goal. Pure rules.

export const CLUB_PRICE = 300;
export const CLUB_MAX = 20;
export const CREST_ICONS = ["t-fire", "t-bolt", "t-crown", "t-dragon", "t-skull", "t-phoenix", "t-rocket", "t-ghost", "t-diamond", "t-ninja", "t-viking", "t-katana", "t-sakura", "t-alien", "t-void", "t-goat", "t-nova", "t-gc"];
export const CREST_COLORS: Record<string, [string, string]> = {
  sky: ["#37BEFE", "#0B5FD6"],
  gold: ["#F5C443", "#A86C0E"],
  red: ["#FF4D5E", "#9B0E26"],
  purple: ["#B36BFF", "#5A1FC9"],
  green: ["#5CEB8B", "#0E8F4C"],
  teal: ["#2EE5C5", "#087C80"],
  orange: ["#FFA23A", "#B54B05"],
  pink: ["#FF6BB5", "#B3155F"],
  steel: ["#9FB2D1", "#3B4A66"],
  void: ["#6A4BE0", "#170A45"],
};
export const CREST_SHAPES = ["shield", "circle", "hex", "diamond"] as const;
export type CrestShape = (typeof CREST_SHAPES)[number];

export function cleanTag(raw: string) {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
export function validTag(tag: string) {
  return /^[A-Z0-9]{2,5}$/.test(tag);
}
export function validName(name: string) {
  const n = name.trim();
  return n.length >= 3 && n.length <= 24;
}

/** The weekly goal grows with the club: games played together (matches + duels) by all members. */
export const clubGoal = (members: number) => Math.min(60, Math.max(10, members * 4));
export const CLUB_GOAL_REWARD = 40;
