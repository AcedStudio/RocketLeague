import "server-only";
import { q, one } from "./db";
import { FormError } from "./errors";
import { titleFacts } from "./shop";
import { passState } from "./pass";
import { storyState } from "./story";
import { SPECIALS, monthWinners, type SpecialFacts } from "./engine/specials.ts";

export async function monthsTopped(userId: string) {
  const rows = await q<{ month: string; user_id: string; wins: number }>(
    `select to_char(m.completed_at at time zone 'Asia/Tashkent', 'YYYY-MM') as month, em.user_id, count(*)::int as wins
       from matches m join entry_members em on em.entry_id = m.winner_entry_id and em.active
      where m.status = 'completed' and not m.is_bye and not m.forfeit and m.completed_at is not null
        and m.completed_at < date_trunc('month', now() at time zone 'Asia/Tashkent') at time zone 'Asia/Tashkent'
      group by 1, 2`,
  );
  return [...monthWinners(rows).values()].filter((w) => w.user_id === userId).length;
}

export async function specialFacts(userId: string): Promise<SpecialFacts> {
  const [f, months, pass, story] = await Promise.all([titleFacts(userId), monthsTopped(userId), passState(userId), storyState(userId)]);
  return { ...f, months, passTier: pass.tier, storyDone: story.finished };
}

export async function specialsFor(userId: string) {
  const f = await specialFacts(userId);
  const sel = await one<{ v: string | null }>("select card_version as v from users where id = $1", [userId]);
  return { list: SPECIALS.map((s) => ({ ...s, has: s.earned(f) })), selected: sel?.v ?? null };
}

export async function chooseVersion(userId: string, key: string) {
  if (key === "") {
    await q("update users set card_version = null where id = $1", [userId]);
    return;
  }
  const s = SPECIALS.find((x) => x.key === key);
  if (!s || !s.earned(await specialFacts(userId))) throw new FormError("Эта карточка ещё не получена");
  await q("update users set card_version = $2 where id = $1", [userId, key]);
}
