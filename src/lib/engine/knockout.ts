// Single-elimination bracket with byes and an optional third-place match.

export type KnockoutMatch = {
  key: string; // "R1-0", "R2-1", ..., "3P"
  stage: "knockout" | "third_place";
  round: number; // 1 = first round; third place uses the final's round number
  index: number; // position inside the round (top to bottom)
  home: string | null;
  away: string | null;
  isBye: boolean;
  winner: string | null; // set at build time only for byes
  nextKey: string | null;
  nextSide: "home" | "away" | null;
  loserNextKey: string | null; // semi-finals feed the third-place match
  loserNextSide: "home" | "away" | null;
};

export type Bracket = { size: number; rounds: number; matches: KnockoutMatch[] };

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Standard seeding order: for 8 → [1,8,4,5,2,7,3,6]. Seed 1 and 2 can only meet in the final. */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

export function roundLabel(round: number, rounds: number, stage: "knockout" | "third_place" = "knockout"): string {
  if (stage === "third_place") return "Матч за 3-е место";
  const fromEnd = rounds - round; // 0 = final
  if (fromEnd === 0) return "Финал";
  if (fromEnd === 1) return "Полуфинал";
  return `1/${2 ** fromEnd} финала`;
}

/**
 * @param seeded entry ids ordered by seed (index 0 = top seed).
 */
export function buildKnockout(seeded: readonly string[], opts: { thirdPlace?: boolean } = {}): Bracket {
  if (seeded.length < 2) throw new Error("Для плей-офф нужно минимум 2 участника");
  if (new Set(seeded).size !== seeded.length) throw new Error("Повторяющиеся участники в сетке");

  const size = nextPowerOfTwo(seeded.length);
  const rounds = Math.log2(size);
  const order = seedOrder(size);
  const matches: KnockoutMatch[] = [];
  const byKey = new Map<string, KnockoutMatch>();

  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r;
    for (let i = 0; i < count; i++) {
      const isFinal = r === rounds;
      const m: KnockoutMatch = {
        key: `R${r}-${i}`,
        stage: "knockout",
        round: r,
        index: i,
        home: null,
        away: null,
        isBye: false,
        winner: null,
        nextKey: isFinal ? null : `R${r + 1}-${Math.floor(i / 2)}`,
        nextSide: isFinal ? null : i % 2 === 0 ? "home" : "away",
        loserNextKey: null,
        loserNextSide: null,
      };
      matches.push(m);
      byKey.set(m.key, m);
    }
  }

  if (opts.thirdPlace && rounds >= 2) {
    const third: KnockoutMatch = {
      key: "3P",
      stage: "third_place",
      round: rounds,
      index: 1,
      home: null,
      away: null,
      isBye: false,
      winner: null,
      nextKey: null,
      nextSide: null,
      loserNextKey: null,
      loserNextSide: null,
    };
    for (const m of matches) {
      if (m.round === rounds - 1) {
        m.loserNextKey = "3P";
        m.loserNextSide = m.index === 0 ? "home" : "away";
      }
    }
    matches.push(third);
    byKey.set(third.key, third);
  }

  // Fill round one; seeds beyond the field are byes (always against top seeds).
  for (let i = 0; i < size / 2; i++) {
    const m = byKey.get(`R1-${i}`)!;
    const a = order[2 * i];
    const b = order[2 * i + 1];
    m.home = seeded[a - 1] ?? null;
    m.away = seeded[b - 1] ?? null;
    if (!m.home || !m.away) {
      m.isBye = true;
      m.winner = m.home ?? m.away;
    }
  }

  // Byes advance immediately.
  for (const m of matches) {
    if (m.isBye && m.winner && m.nextKey) {
      const next = byKey.get(m.nextKey)!;
      next[m.nextSide!] = m.winner;
    }
  }

  return { size, rounds, matches };
}

/**
 * Orders group qualifiers into seeds: all group winners first, then all
 * runners-up, and so on. Inside a tier, better records seed higher. Then it
 * swaps within tiers so that two entries from the same group don't meet in
 * the first round when that can be avoided.
 */
export type QualifierRow = {
  id: string;
  group: string;
  position: number; // 1-based position inside the group
  points: number;
  goalDiff: number;
  goalsFor: number;
};

export function seedQualifiers(rows: readonly QualifierRow[]): string[] {
  const sorted = rows
    .slice()
    .sort(
      (a, b) =>
        a.position - b.position ||
        b.points - a.points ||
        b.goalDiff - a.goalDiff ||
        b.goalsFor - a.goalsFor ||
        a.group.localeCompare(b.group),
    );
  const size = nextPowerOfTwo(sorted.length);
  const order = seedOrder(size);
  const opponentSeed = new Map<number, number>();
  for (let i = 0; i < size; i += 2) {
    opponentSeed.set(order[i], order[i + 1]);
    opponentSeed.set(order[i + 1], order[i]);
  }

  const seeds = sorted.slice();
  const clash = (s: number) => {
    const o = opponentSeed.get(s + 1)! - 1;
    return o < seeds.length && seeds[o].group === seeds[s].group;
  };

  for (let s = 0; s < seeds.length; s++) {
    if (!clash(s)) continue;
    // Try swapping with another entry of the same tier (same group position).
    for (let t = 0; t < seeds.length; t++) {
      if (t === s || seeds[t].position !== seeds[s].position) continue;
      [seeds[s], seeds[t]] = [seeds[t], seeds[s]];
      if (!clash(s) && !clash(t)) break;
      [seeds[s], seeds[t]] = [seeds[t], seeds[s]];
    }
  }
  return seeds.map((r) => r.id);
}
