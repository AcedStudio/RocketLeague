import "server-only";
import { q, one, tx } from "./db";
import { FormError } from "./errors";
import { STEPS, FINAL_ITEM, ONBOARD_DAYS, type OnboardFacts } from "./engine/onboarding.ts";

export async function onboardFacts(userId: string): Promise<OnboardFacts & { created: Date }> {
  const r = await one<OnboardFacts & { created: Date }>(
    `select u.created_at as created,
            exists (select 1 from coin_bonuses where user_id = u.id and reason = 'daily') as checkin,
            (u.avatar is not null or u.equipped_badge is not null or u.name_color is not null or u.banner is not null) as look,
            u.discord_id is not null as discord,
            exists (select 1 from club_members where user_id = u.id) as club,
            (exists (select 1 from duels d where u.id in (d.challenger_id, d.opponent_id) and d.status = 'completed')
              or exists (select 1 from entry_members em join entries e on e.id = em.entry_id where em.user_id = u.id and e.status in ('confirmed', 'pending', 'waitlist', 'incomplete'))) as play,
            exists (select 1 from bets where user_id = u.id) as predict
       from users u where u.id = $1`,
    [userId],
  );
  if (!r) throw new FormError("Игрок не найден");
  return r;
}

export async function onboardState(userId: string) {
  const [facts, claimedRows] = await Promise.all([
    onboardFacts(userId),
    q<{ ref: string }>("select ref from coin_bonuses where user_id = $1 and reason = 'onboard'", [userId]),
  ]);
  const claimed = new Set(claimedRows.map((r) => r.ref));
  const steps = STEPS.map((s) => ({ ...s, done: s.key === "gift" ? true : facts[s.key], claimed: claimed.has(s.key) }));
  const finished = claimed.has("final");
  const fresh = Date.now() - new Date(facts.created).getTime() < ONBOARD_DAYS * 86400_000;
  return { steps, finished, show: !finished && fresh, allClaimed: steps.every((s) => s.claimed) };
}

export async function claimStep(userId: string, key: string) {
  const st = await onboardState(userId);
  if (key === "final") {
    if (!st.allClaimed) throw new FormError("Сначала пройдите все шаги");
    return tx(async (c) => {
      const row = await one("insert into coin_bonuses (user_id, amount, reason, ref) values ($1, 0, 'onboard', 'final') on conflict do nothing returning id", [userId], c);
      if (!row) throw new FormError("Награда уже получена");
      await q("insert into purchases (user_id, item, price) values ($1, $2, 0) on conflict do nothing", [userId, FINAL_ITEM], c);
      await q("update users set equipped_badge = $2 where id = $1 and equipped_badge is null", [userId, FINAL_ITEM], c);
    });
  }
  const step = st.steps.find((s) => s.key === key);
  if (!step) throw new FormError("Такого шага нет");
  if (!step.done) throw new FormError("Этот шаг ещё не выполнен");
  const row = await one("insert into coin_bonuses (user_id, amount, reason, ref) values ($1, $2, 'onboard', $3) on conflict do nothing returning id", [userId, step.coins, key]);
  if (!row) throw new FormError("Награда уже получена");
}
