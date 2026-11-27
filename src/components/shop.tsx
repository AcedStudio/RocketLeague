import type { T } from "@/lib/i18n/core";
import { SubmitButton } from "@/components/client";
import { UserBadge, Nick, Avatar } from "@/components/Badge";
import { Icon } from "@/components/Icon";
import { Finisher } from "@/components/Finisher";
import { DEAL_DISCOUNT, RARITY_NAME, RARITIES, bannerClass, itemId, iconOf, type Item, type Crate, type Rarity } from "@/lib/engine/shop";
import { buyAction, equipAction, crateAction } from "@/app/actions/shop";

/** The site's coin: a small minted disc instead of an emoji. */
export function Coin({ size = 16 }: { size?: number }) {
  return (
    <svg className="coin" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#B8862B" />
      <circle cx="12" cy="12" r="9.2" fill="url(#coin-g)" />
      <circle cx="12" cy="12" r="6.4" fill="none" stroke="#9A6E1F" strokeWidth="1.2" opacity=".7" />
      <path d="M13.6 9.2a3.2 3.2 0 1 0 0 5.6" fill="none" stroke="#7A5414" strokeWidth="1.8" strokeLinecap="round" />
      <defs>
        <linearGradient id="coin-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE7A3" />
          <stop offset=".55" stopColor="#E3B552" />
          <stop offset="1" stopColor="#C8963A" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Price({ value, was }: { value: number; was?: number }) {
  return (
    <span className="it-price num">
      <Coin /> {value.toLocaleString("ru-RU")}
      {was && was !== value ? <s className="it-was">{was.toLocaleString("ru-RU")}</s> : null}
    </span>
  );
}

export type Look = { nick: string; badge: string | null; color: string | null; banner: string | null; avatar?: string | null };

/** A miniature profile nameplate — how the item looks on you. */
export function Nameplate({ look, compact }: { look: Look; compact?: boolean }) {
  return (
    <div className={`np${compact ? " np-compact" : ""}`}>
      <Avatar name={look.nick} avatar={look.avatar} size={compact ? 22 : 30} />
      <span className="np-name">
        <Nick name={look.nick} color={look.color} />
      </span>
      <UserBadge value={look.badge} size="sm" />
    </div>
  );
}

export const rarityClass = (r: Rarity) => `rar rar-${r}`;

const KIND_LABEL = { tag: "Тег", color: "Цвет ника", banner: "Баннер", avatar: "Аватар", finisher: "Эффект победы" } as const;

export type Owner = { signedIn: boolean; balance: number; owned: Set<string>; equipped: { badge: string | null; color: string | null; banner: string | null; avatar: string | null; finisher: string | null } };

/** A product tile: art on top (with the item applied to your nameplate), details and the action below. */
export function ItemTile({ item, price, me, look, ret, t, large }: { item: Item; price: number; me: Owner; look: Look; ret: string; t: T; large?: boolean }) {
  const id = itemId(item);
  const owned = me.owned.has(id);
  const worn =
    item.kind === "tag" ? me.equipped.badge === id : item.kind === "color" ? me.equipped.color === item.key : item.kind === "avatar" ? me.equipped.avatar === item.key : item.kind === "finisher" ? me.equipped.finisher === item.key : me.equipped.banner === item.key;
  const preview: Look =
    item.kind === "tag" ? { ...look, badge: id } : item.kind === "color" ? { ...look, color: item.key } : item.kind === "avatar" ? { ...look, avatar: item.key } : { ...look, banner: item.key };
  const afford = me.balance >= price;
  return (
    <article className={`it kind-${item.kind} ${rarityClass(item.rarity)}${large ? " it-large" : ""}${owned ? " is-owned" : ""}`}>
      <div className="it-art">
        {item.kind === "banner" && <span className={`it-banner ${bannerClass(item.key)}`} aria-hidden />}
        {item.kind === "tag" && (
          <span className="it-glyph" aria-hidden>
            <Icon name={iconOf("tag", item.key)} size={large ? 112 : 76} />
          </span>
        )}
        {item.kind === "finisher" && (
          <>
            <span className="it-fx"><Finisher kind={item.key} loop /></span>
            <span className="it-score num" aria-hidden>3 : 1</span>
          </>
        )}
        {item.kind === "avatar" && (
          <span className="it-glyph it-avatar" aria-hidden>
            <Avatar name={look.nick} avatar={item.key} size={large ? 128 : 88} />
          </span>
        )}
        {item.kind === "color" && (
          <span className="it-bignick" aria-hidden>
            <Nick name={look.nick} color={item.key} />
          </span>
        )}
        <Nameplate look={{ ...preview, banner: null }} compact />
        {worn && <span className="it-flag">{t("Надет")}</span>}
        {price < item.price && !owned && <span className="it-flag deal">−{Math.round(DEAL_DISCOUNT * 100)}%</span>}
      </div>
      <div className="it-body">
        <div className="it-meta">
          <span className="it-rarity">{RARITY_NAME[item.rarity]}</span>
          <span>{t(KIND_LABEL[item.kind])}</span>
        </div>
        <h3 className="it-name">{item.name}</h3>
        <div className="it-foot">
          {owned ? <span className="it-owned">✓ {t("В коллекции")}</span> : <Price value={price} was={item.price} />}
          {owned ? (
            worn ? null : (
              <form action={equipAction}>
                <input type="hidden" name="value" value={id} />
                <input type="hidden" name="ret" value={ret} />
                <SubmitButton className="btn btn-ghost btn-sm">{t("Надеть")}</SubmitButton>
              </form>
            )
          ) : me.signedIn ? (
            <form action={buyAction}>
              <input type="hidden" name="item" value={id} />
              <input type="hidden" name="ret" value={ret} />
              <SubmitButton className="btn btn-sm it-buy" disabled={!afford} confirm={t("Купить «{name}» за {price} монет?", { name: item.name, price })}>
                {afford ? t("Купить") : t("Мало монет")}
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function CrateCard({ crate, me, left, t }: { crate: Crate; me: Owner; left: number; t: T }) {
  const rar = RARITIES.filter((r) => crate.odds[r]);
  const top: Rarity = crate.key === "rookie" ? "rare" : crate.key === "elite" ? "epic" : "legendary";
  const afford = me.balance >= crate.price;
  return (
    <article className={`crate2 ${rarityClass(top)}`}>
      <div className="crate2-art">
        <span className="crate2-box" aria-hidden>
          <span className="lid" />
          <span className="body" />
          <span className="band" />
        </span>
      </div>
      <div className="it-body">
        <div className="it-meta">
          <span className="it-rarity">{t("Кейс")}</span>
          <span>{t("ещё не собрано: {n}", { n: left })}</span>
        </div>
        <h3 className="it-name">{crate.name}</h3>
        <div className="odds-bar" aria-label={t("Шансы")}>
          {rar.map((r) => (
            <i key={r} className={`rar-${r}`} style={{ flexGrow: crate.odds[r] }} />
          ))}
        </div>
        <ul className="odds-legend">
          {rar.map((r) => (
            <li key={r} className={`rar-${r}`}>
              {RARITY_NAME[r]} <b className="num">{crate.odds[r]}%</b>
            </li>
          ))}
        </ul>
        <div className="it-foot">
          <Price value={crate.price} />
          {me.signedIn && (
            <form action={crateAction}>
              <input type="hidden" name="crate" value={crate.key} />
              <SubmitButton className="btn btn-sm it-buy" disabled={!afford || left === 0} confirm={t("Открыть «{name}» за {price} монет?", { name: crate.name, price: crate.price })}>
                {left === 0 ? t("Всё собрано") : afford ? t("Открыть") : t("Мало монет")}
              </SubmitButton>
            </form>
          )}
        </div>
      </div>
    </article>
  );
}
