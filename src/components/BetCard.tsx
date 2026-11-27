import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { SubmitButton } from "@/components/client";
import { Icon } from "@/components/Icon";
import { Coin } from "@/components/shop";
import { betAction } from "@/app/actions/bets";
import { payout, STAKE_CHIPS } from "@/lib/engine/bets";
import type { BetPanel } from "@/lib/bets";

/** Coin prediction on a match: odds, stake chips, how the crowd has picked, and my result. */
export async function BetCard({ matchId, panel, home, away, balance, signedIn }: { matchId: string; panel: BetPanel; home: string; away: string; balance: number; signedIn: boolean }) {
  const t = await getT();
  const total = panel.pool.home + panel.pool.away;
  const homeShare = total ? Math.round((panel.pool.home / total) * 100) : 50;
  const mine = panel.mine;
  return (
    <section id="predict" className="bet-card">
      <div className="bet-head">
        <span className="bet-title"><Icon name="ui-bets" size={30} /> {t("Прогноз на монеты")}</span>
        <span className="small muted">{t("Прогнозов: {n} · в банке {c}", { n: panel.pool.people, c: total })}</span>
      </div>

      <div className="bet-sides">
        {(["home", "away"] as const).map((side) => (
          <div key={side} className={`bet-side${mine?.pick === side ? " picked" : ""}`}>
            <span className="bet-name">{side === "home" ? home : away}</span>
            <b className="bet-odds num">×{panel.odds[side].toFixed(2)}</b>
          </div>
        ))}
      </div>
      <div className="bet-crowd" aria-label={t("Распределение прогнозов")}>
        <i style={{ flex: Math.max(homeShare, 3) }} />
        <i style={{ flex: Math.max(100 - homeShare, 3) }} />
      </div>

      {mine ? (
        <div className={`bet-mine${mine.won === true ? " won" : mine.won === false ? " lost" : ""}`}>
          {mine.won === null ? (
            <span>
              {t("Ваш прогноз: {team} · ставка {stake}", { team: mine.pick === "home" ? home : away, stake: mine.stake })} <Coin size={13} />{" "}
              · {t("выигрыш {win}", { win: payout(mine.stake, mine.odds) })} <Coin size={13} />
            </span>
          ) : mine.won ? (
            <span><Icon name="r-check" size={20} /> {t("Прогноз сыграл: +{n} монет", { n: mine.payout })}</span>
          ) : (
            <span>{t("Прогноз не сыграл: −{n} монет", { n: mine.stake })}</span>
          )}
        </div>
      ) : panel.open ? (
        <form action={betAction} className="bet-form">
          <input type="hidden" name="match" value={matchId} />
          <div className="stake-chips" role="radiogroup" aria-label={t("Ставка")}>
            {STAKE_CHIPS.map((s, i) => (
              <label key={s} className={`stake-chip${s > balance ? " off" : ""}`}>
                <input type="radio" name="stake" value={s} defaultChecked={i === 1} disabled={s > balance} />
                <span className="num">{s}</span>
              </label>
            ))}
          </div>
          <div className="bet-buttons">
            <SubmitButton className="btn btn-sm" name="pick" value="home" quiet>{t("На {team}", { team: home })}</SubmitButton>
            <SubmitButton className="btn btn-sm" name="pick" value="away" quiet>{t("На {team}", { team: away })}</SubmitButton>
          </div>
          <p className="small faint" style={{ margin: 0 }}>{t("Выигрыш = ставка × коэффициент. Приём прогнозов закрывается в момент начала матча.")}</p>
        </form>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          {signedIn ? t(panel.reason ?? "Прогнозы на этот матч закрыты") : <Link href="/login">{t("Войдите, чтобы сделать прогноз")}</Link>}
        </p>
      )}
    </section>
  );
}
