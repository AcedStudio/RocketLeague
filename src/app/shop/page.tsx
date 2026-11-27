import Link from "next/link";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { Flash, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { UserBadge } from "@/components/Badge";
import { wallet, earnedTitles } from "@/lib/shop";
import { TAGS, DAILY_BONUS, type Rarity } from "@/lib/engine/shop";
import { XP } from "@/lib/engine/levels";
import { dailyAction, buyAction, equipAction } from "@/app/actions/shop";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Магазин") };
}

const RARITY: Record<Rarity, string> = { common: "Обычный", rare: "Редкий", epic: "Эпический", legendary: "Легендарный" };

export default async function Shop({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const user = await getUser();
  const [w, titles] = user ? await Promise.all([wallet(user.id), earnedTitles(user.id)]) : [null, null];

  return (
    <div className="wrap section stack-lg">
      <Flash sp={sp} />
      <div className="shop-hero">
        <div className="stack-sm">
          <h1>🛍️ {t("Магазин")}</h1>
          <p className="muted" style={{ margin: 0, maxWidth: 560 }}>
            {t("Играйте, судите и побеждайте — за это начисляются монеты 🪙. Тратьте их на теги, которые видны рядом с вашим ником. Титулы не продаются — их можно только заработать.")}
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

      {user && w && (
        <section className="panel stack-sm">
          <div className="row between">
            <b>{t("Сейчас рядом с ником:")}</b>
            {w.equipped ? <UserBadge value={w.equipped} t={t} /> : <span className="small muted">{t("ничего")}</span>}
          </div>
          {w.equipped && (
            <form action={equipAction}>
              <input type="hidden" name="badge" value="" />
              <SubmitButton className="btn btn-ghost btn-sm">{t("Снять")}</SubmitButton>
            </form>
          )}
        </section>
      )}

      <section className="stack">
        <h2 style={{ fontSize: "1.4rem" }}>🏷️ {t("Теги")}</h2>
        <div className="shop-grid">
          {TAGS.map((tag) => {
            const key = `tag:${tag.key}`;
            const owned = w?.owned.has(key);
            const worn = w?.equipped === key;
            const afford = (w?.balance ?? 0) >= tag.price;
            return (
              <article key={tag.key} className={`shop-item r-${tag.rarity}${owned ? " owned" : ""}`}>
                <span className="shop-rarity">{t(RARITY[tag.rarity])}</span>
                <span className="shop-icon" aria-hidden>{tag.icon}</span>
                <b>{t(tag.name)}</b>
                {owned ? (
                  worn ? (
                    <span className="badge ok plain">✓ {t("Надет")}</span>
                  ) : (
                    <form action={equipAction}>
                      <input type="hidden" name="badge" value={key} />
                      <SubmitButton className="btn btn-ghost btn-sm">{t("Надеть")}</SubmitButton>
                    </form>
                  )
                ) : user ? (
                  <form action={buyAction}>
                    <input type="hidden" name="tag" value={tag.key} />
                    <SubmitButton className={`btn btn-sm${afford ? "" : " btn-ghost"}`} disabled={!afford} confirm={t("Купить «{name}» за {price} монет?", { name: t(tag.name), price: tag.price })}>
                      🪙 {tag.price}
                    </SubmitButton>
                  </form>
                ) : (
                  <span className="price num">🪙 {tag.price}</span>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="stack">
        <h2 style={{ fontSize: "1.4rem" }}>🎖️ {t("Титулы")}</h2>
        <p className="small muted" style={{ margin: 0 }}>{t("Титул тоже можно показывать рядом с ником — вместо тега.")}</p>
        <div className="shop-grid">
          {(titles ?? []).map((ti) => {
            const key = `title:${ti.key}`;
            const worn = w?.equipped === key;
            return (
              <article key={ti.key} className={`shop-item r-${ti.rarity}${ti.has ? " owned" : " locked"}`}>
                <span className="shop-rarity">{t(RARITY[ti.rarity])}</span>
                <span className="shop-icon" aria-hidden>{ti.icon}</span>
                <b>{t(ti.name)}</b>
                <small className="muted">{t(ti.desc)}</small>
                {ti.has ? (
                  worn ? (
                    <span className="badge ok plain">✓ {t("Надет")}</span>
                  ) : (
                    <form action={equipAction}>
                      <input type="hidden" name="badge" value={key} />
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

      <section className="panel stack-sm">
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
