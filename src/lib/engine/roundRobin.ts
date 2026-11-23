// Round-robin fixtures ("каждый с каждым") using the circle method.
// Odd participant counts get a rest slot each round instead of a fake match.

export type Fixture = { round: number; home: string; away: string };

export function roundRobin(ids: readonly string[], opts: { double?: boolean } = {}): Fixture[] {
  if (new Set(ids).size !== ids.length) throw new Error("Повторяющиеся участники в круговом турнире");
  if (ids.length < 2) return [];

  const REST = "__rest__";
  const list = ids.length % 2 === 0 ? ids.slice() : [...ids, REST];
  const n = list.length;
  const rounds = n - 1;
  const fixtures: Fixture[] = [];

  let rotation = list.slice();
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < n / 2; i++) {
      let a = rotation[i];
      let b = rotation[n - 1 - i];
      if (a === REST || b === REST) continue;
      // Alternate home/away so nobody plays "home" every week.
      const swap = i === 0 ? r % 2 === 1 : i % 2 === 1;
      if (swap) [a, b] = [b, a];
      fixtures.push({ round: r + 1, home: a, away: b });
    }
    // Keep the first element fixed and rotate the rest clockwise.
    rotation = [rotation[0], rotation[n - 1], ...rotation.slice(1, n - 1)];
  }

  if (opts.double) {
    const second = fixtures.map((f) => ({ round: f.round + rounds, home: f.away, away: f.home }));
    return [...fixtures, ...second];
  }
  return fixtures;
}
