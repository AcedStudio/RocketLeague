import Link from "next/link";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { Flash, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Icon } from "@/components/Icon";
import { Coin, Nameplate, ItemTile, CrateCard, rarityClass, type Owner, type Look } from "@/components/shop";
import { wallet, earnedTitles, today } from "@/lib/shop";
import { streakNow } from "@/lib/pass";
import { streakBonus } from "@/lib/engine/pass";
import { TAGS, COLORS, BANNERS, CRATES, SHOP_ITEMS, RARITY_NAME, RARITIES, dailyDeals, featured, findItem, itemId, priceToday, iconOf, type Item, type Rarity } from "@/lib/engine/shop";
import { XP } from "@/lib/engine/levels";
import { dailyAction, equipAction } from "@/app/actions/shop";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Магазин") };
}

const TABS = ["featured", "tags", "colors", "banners", "crates", "titles"] as const;
type Tab = (typeof TABS)[number];

/** Monday of the current week in Tashkent, for the weekly featured items. */
function weekKey(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Hours and minutes until midnight in Tashkent (UTC+5), when the deals change. */
function untilReset() {
  const now = new Date(Date.now() + 5 * 3600_000);
  const mins = 24 * 60 - (now.getUTCHours() * 60 + now.getUTCMinutes());
  return { h: Math.floor(mins / 60), m: mins % 60 };
}

export default async function Shop({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "featured";
  const rarity = RARITIES.includes(sp.r as Rarity) ? (sp.r as Rarity) : null;
  const hideOwned = sp.own === "hide";
  const user = await getUser();
  const [w, titles, streak] = user ? await Promise.all([wallet(user.id), earnedTitles(user.id), streakNow(user.id)]) : [null, null, 0];
  const day = today();
  const deals = dailyDeals(day);
  const feat = featured(weekKey(day));
  const drop = findItem(typeof sp.drop === "string" ? sp.drop : null);
  const reset = untilReset();

  const me: Owner = {
    signedIn: !!user,
    balance: w?.balance ?? 0,
    owned: w?.owned ?? new Set(),
    equipped: { badge: w?.equipped ?? null, color: w?.nameColor ?? null, banner: w?.banner ?? null },
  };
  const look: Look = { nick: user?.rl_nickname ?? "Player", badge: me.equipped.badge, color: me.equipped.color, banner: me.equipped.banner };
  const ownedCount = SHOP_ITEMS.filter((i) => me.owned.has(itemId(i))).length;

  const href = (p: { tab?: Tab; r?: Rarity | null; own?: boolean }) => {
    const q = new URLSearchParams();
    const nt = p.tab ?? tab;
    if (nt !== "featured") q.set("tab", nt);
    const nr = p.r === undefined ? rarity : p.r;
    if (nr) q.set("r", nr);
    if (p.own ?? hideOwned) q.set("own", "hide");
    const s = q.toString();
    return s ? `/shop?${s}` : "/shop";
  };
  const ret = href({}).replace("/shop", "") || "";
  const tile = (i: Item, large?: boolean) => <ItemTile key={itemId(i)} item={i} price={priceToday(i, day)} me={me} look={look} ret={ret} t={t} large={large} />;

  const catalog: Record<"tags" | "colors" | "banners", Item[]> = { tags: TAGS, colors: COLORS, banners: BANNERS };
  const list = tab in catalog ? catalog[tab as keyof typeof catalog].filter((i) => (!rarity || i.rarity === rarity) && (!hideOwned || !me.owned.has(itemId(i)))) : [];
  const tabLabel: Record<Tab, string> = {
    featured: t("Витрина"),
    tags: t("Теги"),
    colors: t("Цвет ника"),
    banners: t("Баннеры"),
    crates: t("Кейсы"),
    titles: t("Титулы"),
  };
  const count: Partial<Record<Tab, string>> = {
    tags: `${TAGS.filter((i) => me.owned.has(itemId(i))).length}/${TAGS.length}`,
    colors: `${COLORS.filter((i) => me.owned.has(itemId(i))).length}/${COLORS.length}`,
    banners: `${BANNERS.filter((i) => me.owned.has(itemId(i))).length}/${BANNERS.length}`,
    titles: titles ? `${titles.filter((x) => x.has).length}/${titles.length}` : undefined,
  };

  return (
    <div className="wrap section stack-lg store">
      <Flash sp={sp} />

      <header className="store-head">
        <div>
          <p className="eyebrow">{t("Магазин")}</p>
          <h1 className="store-title">{t("Предметы для вашего профиля")}</h1>
          <p className="muted store-sub">{t("Монеты начисляются за матчи, победы и судейство. Титулы не продаются — их можно только заслужить.")}</p>
        </div>
        {user && w ? (
          <div className="balance">
            <div>
              <span className="balance-label">{t("Баланс")}</span>
              <span className="balance-value num">
                <Coin size={22} /> {w.balance.toLocaleString("ru-RU")}
              </span>
            </div>
            {w.dailyClaimed ? (
              <span className="balance-note">{t("Бонус дня получен")}</span>
            ) : (
              <form action={dailyAction}>
                <SubmitButton className="btn btn-sm btn-gold">{t("Бонус дня +{n}", { n: streakBonus(streak + 1) })}</SubmitButton>
              </form>
            )}
          </div>
        ) : (
          <Link className="btn" href="/login?next=/shop">{t("Войдите, чтобы покупать")}</Link>
        )}
      </header>

      {drop && (
        <div className={`reveal ${rarityClass(drop.rarity)}`} role="status">
          <div className="reveal-text">
            <span className="eyebrow">{t("Из кейса выпало")}</span>
            <b className="reveal-name">{drop.name}</b>
            <span className="it-rarity">{RARITY_NAME[drop.rarity]}</span>
            <form action={equipAction}>
              <input type="hidden" name="value" value={itemId(drop)} />
              <input type="hidden" name="ret" value="?tab=crates" />
              <SubmitButton className="btn btn-sm btn-gold">{t("Надеть сейчас")}</SubmitButton>
            </form>
          </div>
          <div className="reveal-art">{tileFor(drop)}</div>
        </div>
      )}

      {user && (
        <section className="loadout">
          <div className={`loadout-plate ${me.equipped.banner ? `bn bn-${me.equipped.banner}` : ""}`}>
            <span className="eyebrow">{t("Так вас видят другие")}</span>
            <Nameplate look={look} />
          </div>
          <div className="loadout-slots">
            {(
              [
                ["badge", t("Тег / титул"), findItem(me.equipped.badge)?.name ?? titles?.find((x) => `title:${x.key}` === me.equipped.badge)?.name],
                ["color", t("Цвет ника"), findItem(me.equipped.color ? `color:${me.equipped.color}` : null)?.name],
                ["banner", t("Баннер"), findItem(me.equipped.banner ? `banner:${me.equipped.banner}` : null)?.name],
              ] as const
            ).map(([slot, label, name]) => (
              <div key={slot} className="slot">
                <span className="slot-label">{label}</span>
                <span className="slot-value">{name ?? <span className="faint">—</span>}</span>
                {name && (
                  <form action={equipAction}>
                    <input type="hidden" name="value" value={`${slot}:`} />
                    <input type="hidden" name="ret" value={ret} />
                    <SubmitButton className="slot-clear">{t("Снять")}</SubmitButton>
                  </form>
                )}
              </div>
            ))}
            <div className="slot slot-progress">
              <span className="slot-label">{t("Коллекция")}</span>
              <span className="slot-value num">{ownedCount} / {SHOP_ITEMS.length}</span>
              <span className="meter"><i style={{ width: `${Math.round((ownedCount / SHOP_ITEMS.length) * 100)}%` }} /></span>
            </div>
          </div>
        </section>
      )}

      <nav className="store-tabs" aria-label={t("Разделы магазина")}>
        {TABS.map((k) => (
          <Link key={k} href={href({ tab: k, r: null })} aria-current={tab === k ? "page" : undefined} scroll={false}>
            {tabLabel[k]}
            {count[k] && <small className="num">{count[k]}</small>}
          </Link>
        ))}
      </nav>

      {tab === "featured" && (
        <>
          <section className="stack">
            <div className="store-section-head">
              <h2>{t("Сегодня в магазине")}</h2>
              <span className="timer">
                {t("Скидка {p}% · обновится через {h} ч {m} мин", { p: 25, h: reset.h, m: reset.m })}
              </span>
            </div>
            <div className="it-grid">{deals.map((d) => tile(d.item))}</div>
          </section>
          <section className="stack">
            <div className="store-section-head">
              <h2>{t("Предметы недели")}</h2>
            </div>
            <div className="it-grid it-grid-2">{feat.map((i) => tile(i, true))}</div>
          </section>
          <section className="stack">
            <div className="store-section-head">
              <h2>{t("Кейсы")}</h2>
              <Link className="small" href={href({ tab: "crates" })}>{t("Все кейсы →")}</Link>
            </div>
            <div className="it-grid">
              {CRATES.map((c) => (
                <CrateCard key={c.key} crate={c} me={me} left={crateLeft(c.odds, me.owned)} t={t} />
              ))}
            </div>
          </section>
        </>
      )}

      {(tab === "tags" || tab === "colors" || tab === "banners") && (
        <section className="stack">
          <div className="filters">
            <div className="chips">
              <Link href={href({ r: null })} aria-current={!rarity ? "true" : undefined}>{t("Все")}</Link>
              {RARITIES.map((r) => (
                <Link key={r} href={href({ r })} className={`rar-${r}`} aria-current={rarity === r ? "true" : undefined}>
                  <i className="dot" /> {RARITY_NAME[r]}
                </Link>
              ))}
            </div>
            {user && (
              <Link className="toggle" href={href({ own: !hideOwned })} aria-pressed={hideOwned}>
                <span className="toggle-box" aria-hidden /> {t("Скрыть купленное")}
              </Link>
            )}
          </div>
          {list.length ? <div className={`it-grid${tab === "banners" ? " it-grid-wide" : ""}`}>{list.map((i) => tile(i))}</div> : <div className="empty">{t("Здесь пусто — попробуйте другой фильтр.")}</div>}
        </section>
      )}

      {tab === "crates" && (
        <section className="stack">
          <p className="muted" style={{ margin: 0 }}>{t("Из кейса выпадает случайный предмет, которого у вас ещё нет. Шансы по редкости указаны на карточке.")}</p>
          <div className="it-grid">
            {CRATES.map((c) => (
              <CrateCard key={c.key} crate={c} me={me} left={crateLeft(c.odds, me.owned)} t={t} />
            ))}
          </div>
        </section>
      )}

      {tab === "titles" && (
        <section className="stack">
          {!titles ? (
            <div className="empty">{t("Войдите, чтобы увидеть свои титулы")}</div>
          ) : (
            <div className="title-list">
              {[...titles]
                .sort((a, b) => Number(b.has) - Number(a.has) || RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity))
                .map((ti) => {
                  const key = `title:${ti.key}`;
                  const worn = me.equipped.badge === key;
                  const [cur, target] = ti.progress;
                  return (
                    <div key={ti.key} className={`title-row ${rarityClass(ti.rarity)}${ti.has ? " is-owned" : " is-locked"}`}>
                      <span className="title-icon" aria-hidden><Icon name={iconOf("title", ti.key)} size={40} /></span>
                      <div className="title-main">
                        <div className="title-top">
                          <b className="it-name">{ti.name}</b>
                          <span className="it-rarity">{RARITY_NAME[ti.rarity]}</span>
                        </div>
                        <span className="small muted">{t(ti.desc)}</span>
                        {!ti.has && (
                          <span className="meter-row">
                            <span className="meter"><i style={{ width: `${Math.round((cur / target) * 100)}%` }} /></span>
                            <span className="small num faint">{cur} / {target}</span>
                          </span>
                        )}
                      </div>
                      <div className="title-act">
                        {ti.has ? (
                          worn ? (
                            <span className="it-owned">✓ {t("Надет")}</span>
                          ) : (
                            <form action={equipAction}>
                              <input type="hidden" name="value" value={key} />
                              <input type="hidden" name="ret" value="?tab=titles" />
                              <SubmitButton className="btn btn-ghost btn-sm">{t("Надеть")}</SubmitButton>
                            </form>
                          )
                        ) : (
                          <span className="small faint">{t("Не получен")}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </section>
      )}

      <section className="earn">
        <h3>{t("Как заработать монеты")}</h3>
        <dl className="earn-list">
          {(
            [
              [t("Матч"), XP.match / 2],
              [t("Победа"), Math.floor(XP.win / 2)],
              [t("Сухая победа"), XP.cleanSheet / 2],
              [t("Отсуженный матч"), XP.refereed / 2],
              [t("Команда тура"), XP.teamOfRound / 2],
              [t("Игрок тура"), XP.playerOfRound / 2],
              [t("Значок"), Math.floor(XP.achievement / 2)],
              [t("Победа в дуэли"), XP.duelWin / 2],
              [t("Титул чемпиона"), XP.title / 2],
              [t("Ежедневный бонус"), "10–40"],
            ] as const
          ).map(([label, n]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className="num">
                +{n} <Coin size={13} />
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );

  function tileFor(i: Item) {
    return <ItemTile item={i} price={priceToday(i, day)} me={me} look={look} ret="?tab=crates" t={t} />;
  }
}

function crateLeft(odds: Partial<Record<Rarity, number>>, owned: Set<string>) {
  return SHOP_ITEMS.filter((i) => odds[i.rarity] && !owned.has(itemId(i))).length;
}

