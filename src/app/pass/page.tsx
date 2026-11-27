import Link from "next/link";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/core";
import { Flash, type SP } from "@/components/ui";
import { SubmitButton, ScrollToMark } from "@/components/client";
import { Icon } from "@/components/Icon";
import { Nick, Avatar } from "@/components/Badge";
import { Coin, rarityClass } from "@/components/shop";
import { passState, questsState, checkinDays, type QuestState } from "@/lib/pass";
import { TIER_XP, PASS_XP, tashkentDay, streakOf, streakBonus, rewardRef, type Reward } from "@/lib/engine/pass";
import { findItem, iconOf, bannerClass, CRATES, RARITY_NAME } from "@/lib/engine/shop";
import { claimTierAction, buyEliteAction, claimQuestAction } from "@/app/actions/pass";
import { dailyAction } from "@/app/actions/shop";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Боевой пропуск") };
}

function untilMidnight() {
  const now = new Date(Date.now() + 5 * 3600_000);
  const mins = 24 * 60 - (now.getUTCHours() * 60 + now.getUTCMinutes());
  return { h: Math.floor(mins / 60), m: mins % 60 };
}

/** The art and label of a tier reward. */
function RewardArt({ reward, nick, t }: { reward: Reward; nick: string; t: T }) {
  if ("coins" in reward) {
    return (
      <>
        <span className="rw-art"><Icon name="r-coins" size={46} /></span>
        <span className="rw-name num">{reward.coins} <Coin size={13} /></span>
      </>
    );
  }
  if ("crate" in reward) {
    const crate = CRATES.find((c) => c.key === reward.crate);
    return (
      <>
        <span className="rw-art"><Icon name={`r-crate-${reward.crate}`} size={46} /></span>
        <span className="rw-name">{crate?.name}</span>
      </>
    );
  }
  const item = findItem(reward.item);
  if (!item) return null;
  return (
    <>
      <span className={`rw-art ${item.kind === "banner" ? bannerClass(item.key) : ""}`}>
        {item.kind === "tag" && <Icon name={iconOf("tag", item.key)} size={50} />}
        {item.kind === "avatar" && <Avatar name={nick} avatar={item.key} size={56} />}
        {item.kind === "color" && <b className="rw-nick"><Nick name={nick.slice(0, 7)} color={item.key} /></b>}
      </span>
      <span className="rw-name">{item.name}</span>
      <span className="rw-kind">{t(item.kind === "tag" ? "Тег" : item.kind === "color" ? "Цвет ника" : item.kind === "avatar" ? "Аватар" : "Баннер")}</span>
    </>
  );
}

function rewardRarity(r: Reward) {
  if ("item" in r) return findItem(r.item)?.rarity ?? "common";
  if ("crate" in r) return r.crate === "mythic" ? "legendary" : r.crate === "elite" ? "epic" : "rare";
  return "common";
}

function QuestRow({ q, t }: { q: QuestState; t: T }) {
  return (
    <div className={`quest${q.done ? " is-done" : ""}${q.claimed ? " is-claimed" : ""}`}>
      <span className="quest-icon"><Icon name={q.icon} size={38} /></span>
      <div className="quest-main">
        <b>{t(q.desc, { n: q.target })}</b>
        <span className="meter-row">
          <span className="meter"><i style={{ width: `${Math.round((q.value / q.target) * 100)}%` }} /></span>
          <span className="small num faint">{q.value} / {q.target}</span>
        </span>
      </div>
      <div className="quest-reward">
        <span className="chip-xp num">+{q.xp} XP</span>
        <span className="chip-coin num">+{q.coins} <Coin size={12} /></span>
      </div>
      <div className="quest-act">
        {q.claimed ? (
          <span className="quest-ok"><Icon name="r-check" size={26} /></span>
        ) : q.done ? (
          <form action={claimQuestAction}>
            <input type="hidden" name="ref" value={q.ref} />
            <SubmitButton className="btn btn-gold btn-sm">{t("Забрать")}</SubmitButton>
          </form>
        ) : (
          <span className="small faint">{t("В процессе")}</span>
        )}
      </div>
    </div>
  );
}

export default async function PassPage({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const user = await getUser();
  const [st, quests, days] = await Promise.all([
    passState(user?.id ?? null),
    user ? questsState(user.id) : null,
    user ? checkinDays(user.id) : null,
  ]);
  const nick = user?.rl_nickname ?? "Player";
  const reset = untilMidnight();
  const today = tashkentDay();
  const streak = days ? streakOf(days, today) : 0;
  const claimedToday = !!days?.has(today);
  const got = findItem(typeof sp.got === "string" ? sp.got : null);
  const next = st.rewards.find((r) => r.tier > st.tier);
  const claimable = user
    ? st.rewards.filter((r) => r.tier <= st.tier && ((r.free && !st.claimed.has(rewardRef(st.season.key, r.tier, "free"))) || (st.elite && r.elite && !st.claimed.has(rewardRef(st.season.key, r.tier, "elite"))))).length
    : 0;

  return (
    <div className="wrap section stack-lg pass">
      <Flash sp={sp} />

      <header className="pass-hero">
        <div className="pass-hero-text">
          <p className="eyebrow">{t("Боевой пропуск")}</p>
          <h1 className="pass-title">
            {st.season.name} <span>· {st.season.tagline}</span>
          </h1>
          <p className="muted">{t("Играйте матчи и дуэли, выполняйте задания — и открывайте эксклюзивные награды, которых нет в магазине.")}</p>
          <div className="pass-facts">
            <span><b className="num">{st.endsInDays}</b> {t("дн. до конца сезона")}</span>
            <span><b className="num">{st.season.tiers}</b> {t("уровней")}</span>
            {claimable > 0 && <a href="#track" className="pass-claim-hint">{t("Можно забрать наград: {n}", { n: claimable })}</a>}
          </div>
        </div>
        <div className="tier-ring" style={{ ["--p" as string]: `${Math.round(st.progress * 100)}` }}>
          <div className="tier-ring-inner">
            <span className="tier-label">{t("Уровень")}</span>
            <b className="tier-num num">{st.tier}</b>
            <span className="tier-xp num">{st.maxed ? t("Максимум!") : `${st.into} / ${TIER_XP} XP`}</span>
          </div>
        </div>
      </header>

      {got && (
        <div className={`reveal ${rarityClass(got.rarity)}`} role="status">
          <div className="reveal-text">
            <span className="eyebrow">{t("Новая награда")}</span>
            <b className="reveal-name">{got.name}</b>
            <span className="it-rarity">{RARITY_NAME[got.rarity]}</span>
            <Link className="btn btn-sm btn-gold" href="/shop">{t("Надеть в магазине")}</Link>
          </div>
          <div className="reveal-art pass-reveal-art">
            <RewardArt reward={{ item: `${got.kind}:${got.key}` }} nick={nick} t={t} />
          </div>
        </div>
      )}

      {!user && (
        <div className="panel row between">
          <span>{t("Войдите, чтобы копить опыт пропуска и выполнять задания.")}</span>
          <Link className="btn" href="/login?next=/pass">{t("Войти")}</Link>
        </div>
      )}

      {user && !st.elite && (
        <section className="elite-cta">
          <div className="elite-cta-text">
            <span className="eyebrow gold">Elite Pass</span>
            <h2>{t("Откройте вторую дорожку наград")}</h2>
            <p className="muted">{t("Эксклюзивные теги, цвета, баннеры и кейсы на каждом уровне. Монеты с наград Elite почти окупают покупку.")}</p>
          </div>
          <form action={buyEliteAction}>
            <SubmitButton className="btn btn-gold" confirm={t("Купить Elite-пропуск за {price} монет?", { price: st.season.elitePrice })}>
              {t("Активировать")} · <Coin size={15} /> {st.season.elitePrice}
            </SubmitButton>
          </form>
        </section>
      )}

      {quests && (
        <section id="quests" className="pass-grid">
          <div className="pass-card">
            <div className="pass-card-head">
              <h2>{t("Задания дня")}</h2>
              <span className="timer">{t("Новые через {h} ч {m} мин", reset)}</span>
            </div>
            <div className="quest-list">{quests.daily.map((q) => <QuestRow key={q.ref} q={q} t={t} />)}</div>
          </div>
          <div className="pass-card">
            <div className="pass-card-head">
              <h2>{t("Задания недели")}</h2>
              <span className="timer">{t("Обновятся в понедельник")}</span>
            </div>
            <div className="quest-list">{quests.weekly.map((q) => <QuestRow key={q.ref} q={q} t={t} />)}</div>
            <div className="streak">
              <div className="streak-head">
                <Icon name="r-streak" size={30} />
                <div>
                  <b>{t("Серия входов: {n} дн.", { n: streak })}</b>
                  <span className="small muted">{claimedToday ? t("Возвращайтесь завтра — бонус вырастет") : t("Сегодня: +{n} монет", { n: streakBonus(streak + 1) })}</span>
                </div>
                {!claimedToday && (
                  <form action={dailyAction}>
                    <input type="hidden" name="back" value="/pass#quests" />
                    <SubmitButton className="btn btn-sm btn-gold">{t("Забрать")}</SubmitButton>
                  </form>
                )}
              </div>
              <div className="streak-days">
                {Array.from({ length: 7 }, (_, i) => {
                  const n = i + 1;
                  const filled = Math.min(streak, 7);
                  const on = n <= filled;
                  const nextDay = !claimedToday && n === Math.min(filled + 1, 7);
                  return (
                    <span key={n} className={`sd${on ? " on" : ""}${nextDay ? " today" : ""}`}>
                      <small>{t("День {n}", { n })}</small>
                      <b className="num">+{streakBonus(n)}</b>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      <section id="track" className="stack">
        <div className="store-section-head">
          <h2>{t("Награды сезона")}</h2>
          {next && !st.maxed && <span className="timer">{t("До уровня {n}: {xp} XP", { n: st.tier + 1, xp: TIER_XP - st.into })}</span>}
        </div>
        <div className="track">
          <div className="track-labels">
            <span>Free</span>
            <span className="gold">Elite</span>
          </div>
          <div className="track-scroll">
            {st.rewards.map((r) => {
              const reached = st.tier >= r.tier;
              const cell = (track: "free" | "elite") => {
                const reward = r[track];
                if (!reward) return <div className="rw rw-empty" />;
                const ref = rewardRef(st.season.key, r.tier, track);
                const claimed = st.claimed.has(ref);
                const lockedElite = track === "elite" && !st.elite;
                const can = !!user && reached && !claimed && !lockedElite;
                return (
                  <div className={`rw ${rarityClass(rewardRarity(reward))}${claimed ? " is-claimed" : ""}${can ? " is-ready" : ""}${!reached || lockedElite ? " is-locked" : ""}${track === "elite" ? " rw-elite" : ""}`}>
                    <RewardArt reward={reward} nick={nick} t={t} />
                    {claimed ? (
                      <span className="rw-state"><Icon name="r-check" size={22} /></span>
                    ) : can ? (
                      <form action={claimTierAction}>
                        <input type="hidden" name="tier" value={r.tier} />
                        <input type="hidden" name="track" value={track} />
                        <SubmitButton className="btn btn-gold btn-sm rw-btn">{t("Забрать")}</SubmitButton>
                      </form>
                    ) : (!reached || lockedElite) ? (
                      <span className="rw-state"><Icon name="r-lock" size={20} /></span>
                    ) : null}
                  </div>
                );
              };
              return (
                <div key={r.tier} id={`t${r.tier}`} className={`tier-col${reached ? " reached" : ""}${r.tier === st.tier ? " current" : ""}${r.tier % 5 === 0 ? " milestone" : ""}`}>
                  <span className="tier-no num">{r.tier}</span>
                  {cell("free")}
                  {cell("elite")}
                </div>
              );
            })}
          </div>
          <ScrollToMark target={`#t${Math.max(1, st.tier)}`} />
        </div>
      </section>

      <section className="earn">
        <h3>{t("Как получить опыт пропуска")}</h3>
        <dl className="earn-list">
          {(
            [
              [t("Матч соревнования"), PASS_XP.match],
              [t("Победа в матче"), PASS_XP.win],
              [t("Сухая победа"), PASS_XP.cleanSheet],
              [t("Каждый гол"), PASS_XP.goal],
              [t("Отсуженный матч"), PASS_XP.refereed],
              [t("Дуэль"), PASS_XP.duel],
              [t("Победа в дуэли"), PASS_XP.duelWin],
              [t("Задание дня"), "40–120"],
              [t("Задание недели"), "300–450"],
            ] as const
          ).map(([label, n]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className="num">+{n} XP</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
