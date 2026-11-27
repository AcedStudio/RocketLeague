import Link from "next/link";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/core";
import { Flash, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { UserBadge, Nick } from "@/components/Badge";
import { wallet, earnedTitles, type Wallet } from "@/lib/shop";
import { TAGS, COLORS, BANNERS, CRATES, ITEMS, RARITY_NAME, RARITIES, DAILY_BONUS, findItem, itemId, bannerClass, type Item } from "@/lib/engine/shop";
import { XP } from "@/lib/engine/levels";
import { dailyAction, buyAction, equipAction, crateAction } from "@/app/actions/shop";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Магазин") };
}

/** What the item looks like on the site: the tag chip, the painted nickname or a mini banner. */
function Preview({ item, nick }: { item: Item; nick: string }) {
  if (item.kind === "tag") {
    return (
      <span className="shop-icon" aria-hidden>
        {item.icon}
      </span>
    );
  }
  if (item.kind === "color") return <span className="shop-nick"><Nick name={nick} color={item.key} /></span>;
  return <span className={`shop-banner ${bannerClass(item.key)}`} aria-hidden />;
}

function ItemCard({ item, w, signedIn, nick, hash, t }: { item: Item; w: Wallet | null; signedIn: boolean; nick: string; hash: string; t: T }) {
  const id = itemId(item);
  const owned = w?.owned.has(id);
  const worn = item.kind === "tag" ? w?.equipped === id : item.kind === "color" ? w?.nameColor === item.key : w?.banner === item.key;
  const afford = (w?.balance ?? 0) >= item.price;
  return (
    <article className={`shop-item kind-${item.kind} r-${item.rarity}${owned ? " owned" : ""}${worn ? " worn" : ""}`}>
      <span className="shop-rarity">{RARITY_NAME[item.rarity]}</span>
      <Preview item={item} nick={nick} />
      <b className="shop-name">{item.kind === "tag" ? item.name : `${item.icon} ${item.name}`}</b>
      {owned ? (
        worn ? (
          <span className="badge ok plain">✓ {t("Надет")}</span>
        ) : (
          <form action={equipAction}>
            <input type="hidden" name="value" value={id} />
            <input type="hidden" name="hash" value={hash} />
            <SubmitButton className="btn btn-ghost btn-sm">{t("Надеть")}</SubmitButton>
          </form>
        )
      ) : signedIn ? (
        <form action={buyAction}>
          <input type="hidden" name="item" value={id} />
          <input type="hidden" name="hash" value={hash} />
          <SubmitButton className={`btn btn-sm${afford ? "" : " btn-ghost"}`} disabled={!afford} confirm={t("Купить «{name}» за {price} монет?", { name: item.name, price: item.price })}>
            🪙 {item.price}
          </SubmitButton>
        </form>
      ) : (
        <span className="price num">🪙 {item.price}</span>
      )}
    </article>
  );
}

export default async function Shop({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const user = await getUser();
  const [w, titles] = user ? await Promise.all([wallet(user.id), earnedTitles(user.id)]) : [null, null];
  const nick = user?.rl_nickname ?? "Nickname";
  const drop = findItem(typeof sp.drop === "string" ? sp.drop : null);
  const ownedCount = w ? ITEMS.filter((i) => w.owned.has(itemId(i))).length : 0;
  const titleCount = titles?.filter((x) => x.has).length ?? 0;
  const section = (id: string, icon: string, title: string, note: string, items: Item[]) => (
    <section id={id} className="stack shop-section">
      <div className="shop-section-head">
        <h2>{icon} {title}</h2>
        <span className="small muted">{note}</span>
      </div>
      <div className={`shop-grid${id === "banners" ? " wide" : ""}`}>
        {items.map((i) => (
          <ItemCard key={i.key} item={i} w={w} signedIn={!!user} nick={nick} hash={`#${id}`} t={t} />
        ))}
      </div>
    </section>
  );

  return (
    <div className="wrap section stack-lg">
      <Flash sp={sp} />
      <div className="shop-hero">
        <div className="stack-sm">
          <h1>🛍️ {t("Магазин")}</h1>
          <p className="muted" style={{ margin: 0, maxWidth: 560 }}>
            {t("Играйте, судите и побеждайте — за это начисляются монеты 🪙. Тратьте их на теги, цвет ника, баннеры профиля и кейсы. Титулы не продаются — их можно только заработать.")}
          </p>
        </div>
        {user && w ? (
          <div className="wallet">
            <span className="small muted">{t("Ваш баланс")}</span>
            <b className="num">🪙 {w.balance}</b>
            {w.dailyClaimed ? (
              <span className="small faint">{t("Ежедневный бонус уже получен")}</span>
            ) : (
              <form action={dailyAction}>
                <SubmitButton className="btn btn-gold btn-sm">🎁 {t("Забрать +{n} сегодня", { n: DAILY_BONUS })}</SubmitButton>
              </form>
            )}
          </div>
        ) : (
          <Link className="btn" href="/login?next=/shop">{t("Войдите, чтобы покупать")}</Link>
        )}
      </div>

      {drop && (
        <div className={`drop-reveal r-${drop.rarity}`} role="status">
          <span className="drop-rays" aria-hidden />
          <span className="small muted">{t("Из кейса выпало:")}</span>
          <Preview item={drop} nick={nick} />
          <b className="drop-name">{drop.kind === "tag" ? `${drop.icon} ${drop.name}` : drop.name}</b>
          <span className="shop-rarity static">{RARITY_NAME[drop.rarity]}</span>
          <form action={equipAction}>
            <input type="hidden" name="value" value={itemId(drop)} />
            <input type="hidden" name="hash" value="#look" />
            <SubmitButton className="btn btn-gold btn-sm">✨ {t("Надеть")}</SubmitButton>
          </form>
        </div>
      )}

      {user && w && (
        <section id="look" className={`look-card ${bannerClass(w.banner)}`}>
          <div className="look-main">
            <span className="small look-label">{t("Так вас видят другие")}</span>
            <div className="name-row">
              <b className="look-nick"><Nick name={nick} color={w.nameColor} /></b>
              <UserBadge value={w.equipped} />
            </div>
          </div>
          <div className="look-slots">
            {(
              [
                ["badge", "🏷️", t("Тег / титул"), w.equipped],
                ["color", "🎨", t("Цвет ника"), w.nameColor],
                ["banner", "🖼️", t("Баннер"), w.banner],
              ] as const
            ).map(([slot, icon, label, value]) => (
              <div key={slot} className="look-slot">
                <span className="small muted">{icon} {label}</span>
                {value ? (
                  <form action={equipAction}>
                    <input type="hidden" name="value" value={`${slot}:`} />
                    <input type="hidden" name="hash" value="#look" />
                    <SubmitButton className="btn btn-ghost btn-sm">{t("Снять")}</SubmitButton>
                  </form>
                ) : (
                  <span className="small faint">{t("пусто")}</span>
                )}
              </div>
            ))}
          </div>
          <div className="look-progress">
            <span className="small">{t("Коллекция: {n} из {total}", { n: ownedCount, total: ITEMS.length })} · {t("титулов: {n} из {total}", { n: titleCount, total: titles?.length ?? 0 })}</span>
            <span className="xp-bar"><i style={{ width: `${Math.round((ownedCount / ITEMS.length) * 100)}%` }} /></span>
          </div>
        </section>
      )}

      <nav className="shop-nav" aria-label={t("Разделы магазина")}>
        <a href="#crates">📦 {t("Кейсы")}</a>
        <a href="#tags">🏷️ {t("Теги")} <small>{TAGS.length}</small></a>
        <a href="#colors">🎨 {t("Цвет ника")} <small>{COLORS.length}</small></a>
        <a href="#banners">🖼️ {t("Баннеры")} <small>{BANNERS.length}</small></a>
        <a href="#titles">🎖️ {t("Титулы")} <small>{titles?.length ?? ""}</small></a>
        <a href="#earn">💡 {t("Как заработать")}</a>
      </nav>

      <section id="crates" className="stack shop-section">
        <div className="shop-section-head">
          <h2>📦 {t("Кейсы")}</h2>
          <span className="small muted">{t("Случайный предмет, которого у вас ещё нет. В среднем дешевле, чем покупать напрямую.")}</span>
        </div>
        <div className="crate-grid">
          {CRATES.map((c) => {
            const afford = (w?.balance ?? 0) >= c.price;
            return (
              <article key={c.key} className={`crate crate-${c.key}`}>
                <span className="crate-icon" aria-hidden>{c.icon}</span>
                <b className="crate-name">{c.name}</b>
                <ul className="crate-odds">
                  {RARITIES.filter((r) => c.odds[r]).map((r) => (
                    <li key={r} className={`r-${r}`}>
                      <span>{RARITY_NAME[r]}</span>
                      <b className="num">{c.odds[r]}%</b>
                    </li>
                  ))}
                </ul>
                {user ? (
                  <form action={crateAction}>
                    <input type="hidden" name="crate" value={c.key} />
                    <SubmitButton className={`btn btn-sm${afford ? " btn-gold" : " btn-ghost"}`} disabled={!afford} confirm={t("Открыть «{name}» за {price} монет?", { name: c.name, price: c.price })}>
                      {t("Открыть")} · 🪙 {c.price}
                    </SubmitButton>
                  </form>
                ) : (
                  <span className="price num">🪙 {c.price}</span>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {section("tags", "🏷️", t("Теги"), t("Значок рядом с ником — в рейтинге, профиле и дуэлях."), TAGS)}
      {section("colors", "🎨", t("Цвет ника"), t("Ваш ник окрашивается в рейтинге, профиле и дуэлях."), COLORS)}
      {section("banners", "🖼️", t("Баннеры"), t("Фон шапки вашего профиля."), BANNERS)}

      <section id="titles" className="stack shop-section">
        <div className="shop-section-head">
          <h2>🎖️ {t("Титулы")}</h2>
          <span className="small muted">{t("Не продаются — только заслужить. Титул можно показывать вместо тега.")}</span>
        </div>
        <div className="shop-grid">
          {(titles ?? []).map((ti) => {
            const key = `title:${ti.key}`;
            const worn = w?.equipped === key;
            return (
              <article key={ti.key} className={`shop-item r-${ti.rarity}${ti.has ? " owned" : " locked"}${worn ? " worn" : ""}`}>
                <span className="shop-rarity">{RARITY_NAME[ti.rarity]}</span>
                <span className="shop-icon" aria-hidden>{ti.icon}</span>
                <b className="shop-name">{ti.name}</b>
                <small className="muted">{t(ti.desc)}</small>
                {ti.has ? (
                  worn ? (
                    <span className="badge ok plain">✓ {t("Надет")}</span>
                  ) : (
                    <form action={equipAction}>
                      <input type="hidden" name="value" value={key} />
                      <input type="hidden" name="hash" value="#titles" />
                      <SubmitButton className="btn btn-ghost btn-sm">{t("Надеть")}</SubmitButton>
                    </form>
                  )
                ) : (
                  <span className="small faint">🔒 {t("не заработан")}</span>
                )}
              </article>
            );
          })}
          {!titles && <div className="empty">{t("Войдите, чтобы увидеть свои титулы")}</div>}
        </div>
      </section>

      <section id="earn" className="panel stack-sm">
        <h3>💡 {t("Как заработать монеты")}</h3>
        <div className="earn-grid small">
          <span>🎮 {t("Матч")} <b>+{XP.match / 2}</b></span>
          <span>🏆 {t("Победа")} <b>+{Math.floor(XP.win / 2)}</b></span>
          <span>🧱 {t("Сухая победа")} <b>+{XP.cleanSheet / 2}</b></span>
          <span>⚖️ {t("Отсуженный матч")} <b>+{XP.refereed / 2}</b></span>
          <span>🃏 {t("Команда тура")} <b>+{XP.teamOfRound / 2}</b></span>
          <span>⭐ {t("Игрок тура")} <b>+{XP.playerOfRound / 2}</b></span>
          <span>🏅 {t("Значок")} <b>+{Math.floor(XP.achievement / 2)}</b></span>
          <span>⚔️ {t("Дуэль / победа в дуэли")} <b>+{XP.duel / 2} / +{XP.duelWin / 2}</b></span>
          <span>👑 {t("Титул чемпиона")} <b>+{XP.title / 2}</b></span>
          <span>🎁 {t("Ежедневный бонус")} <b>+{DAILY_BONUS}</b></span>
        </div>
      </section>
    </div>
  );
}
