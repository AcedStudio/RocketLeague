import { createRng, shuffle } from "./rng.ts";

export type DrawEntry = { id: string; seed?: number | null };

export type DrawOptions = {
  groupCount: number;
  /** Use entry.seed to build pots (like a football draw). */
  seeded: boolean;
  seed: number;
};

export type DrawResult = { seed: number; groups: string[][] };

export const GROUP_LETTERS = "ABCDEFGHIJKLMNOP";

export function validateDraw(entryCount: number, groupCount: number): string | null {
  if (!Number.isInteger(groupCount) || groupCount < 1) return "Количество групп должно быть не меньше 1";
  if (groupCount > GROUP_LETTERS.length) return `Максимум ${GROUP_LETTERS.length} групп`;
  if (entryCount < 2) return "Нужно минимум 2 участника";
  if (entryCount < groupCount * 2) return `Для ${groupCount} групп нужно минимум ${groupCount * 2} участников`;
  return null;
}

/**
 * Pot-based draw. Entries are split into pots of `groupCount`; every group takes
 * exactly one entry from each full pot, and the last (partial) pot goes to
 * randomly chosen groups. Group sizes therefore never differ by more than one.
 *
 * Seeded: pots are formed by seed order (1 = strongest), so top seeds never
 * share a group. Unseeded: pots are formed from a shuffled list.
 */
export function drawGroups(entries: readonly DrawEntry[], opts: DrawOptions): DrawResult {
  const err = validateDraw(entries.length, opts.groupCount);
  if (err) throw new Error(err);
  const ids = new Set(entries.map((e) => e.id));
  if (ids.size !== entries.length) throw new Error("В жеребьёвке есть повторяющиеся участники");

  const rng = createRng(opts.seed);
  const G = opts.groupCount;

  let ordered: DrawEntry[];
  if (opts.seeded) {
    const withSeed = entries.filter((e) => e.seed != null).sort((a, b) => (a.seed as number) - (b.seed as number));
    const withoutSeed = shuffle(entries.filter((e) => e.seed == null), rng);
    ordered = [...withSeed, ...withoutSeed];
  } else {
    ordered = shuffle(entries, rng);
  }

  const groups: string[][] = Array.from({ length: G }, () => []);
  for (let start = 0; start < ordered.length; start += G) {
    const pot = shuffle(ordered.slice(start, start + G), rng);
    // Which groups receive this pot's entries. For a full pot that is all of them.
    const targets = shuffle(
      Array.from({ length: G }, (_, i) => i),
      rng,
    ).slice(0, pot.length);
    pot.forEach((entry, i) => groups[targets[i]].push(entry.id));
  }
  return { seed: opts.seed, groups };
}
