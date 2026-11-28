import "server-only";
import { q, one, tx } from "./db";
import { FormError } from "./errors";
import { titleFacts } from "./shop";
import { CHAINS, chapterDone, objectiveValue } from "./engine/story.ts";

export async function storyState(userId: string | null, chainKey = "champion") {
  const chain = CHAINS.find((c) => c.key === chainKey) ?? CHAINS[0];
  const [facts, claimedRows] = userId
    ? await Promise.all([titleFacts(userId), q<{ ref: string }>("select ref from coin_bonuses where user_id = $1 and reason = 'story' and ref like $2 || ':%'", [userId, chain.key])])
    : [null, []];
  const claimed = new Set(claimedRows.map((r) => r.ref));
  let open = true;
  const chapters = chain.chapters.map((c, i) => {
    const ref = `${chain.key}:${i + 1}`;
    const isClaimed = claimed.has(ref);
    const unlocked = open;
    const done = !!facts && chapterDone(c, facts);
    open = open && isClaimed;
    return { ...c, n: i + 1, ref, claimed: isClaimed, unlocked, done, progress: c.objectives.map((o) => ({ ...o, value: facts ? objectiveValue(o, facts) : 0 })) };
  });
  return { chain, chapters, finished: chapters.every((c) => c.claimed) };
}

export async function claimChapter(userId: string, ref: string) {
  const st = await storyState(userId, ref.split(":")[0]);
  const ch = st.chapters.find((c) => c.ref === ref);
  if (!ch) throw new FormError("Такой главы нет");
  if (!ch.unlocked) throw new FormError("Сначала пройдите предыдущую главу");
  if (!ch.done) throw new FormError("Глава ещё не пройдена");
  return tx(async (c) => {
    const amount = "coins" in ch.reward ? ch.reward.coins : 0;
    const row = await one("insert into coin_bonuses (user_id, amount, reason, ref) values ($1, $2, 'story', $3) on conflict do nothing returning id", [userId, amount, ref], c);
    if (!row) throw new FormError("Награда уже получена");
    if ("item" in ch.reward) await q("insert into purchases (user_id, item, price) values ($1, $2, 0) on conflict do nothing", [userId, ch.reward.item], c);
    return ch;
  });
}
