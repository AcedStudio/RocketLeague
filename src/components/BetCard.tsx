import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { SubmitButton } from "@/components/client";
import { Icon } from "@/components/Icon";
import { Coin } from "@/components/shop";
import { betAction } from "@/app/actions/bets";
import type { BetPanel } from "@/lib/bets";

/** "Call the winner": a free prediction. Two buttons, the reward for a correct call, and how the community picked. */
export async function BetCard({ matchId, panel, home, away, signedIn }: { matchId: string; panel: BetPanel; home: string; away: string; signedIn: boolean }) {
  const t = await getT();
  const total = panel.pool.home + panel.pool.away;
  const homeShare = total ? Math.round((panel.pool.home / total) * 100) : 50;
  const mine = panel.mine;
  const name = (side: "home" | "away") => (side === "home" ? home : away);
  return (
    <section id="predict" className="bet-card">
      <div className="bet-head">
        <span className="bet-title"><Icon name="ui-bets" size={30} /> {t("Кто победит?")}</span>
        <span className="small muted">{t("Бесплатно · угадаете — получите монеты")}</span>
      </div>

      {mine ? (
        <div className={`bet-mine${mine.won === true ? " won" : mine.won === false ? " lost" : ""}`}>
          {mine.won === null ? (
            <span>
              {t("Ваш прогноз: победит {team}", { team: name(mine.pick) })} · {t("награда {n}", { n: mine.reward })} <Coin size={13} />
            </span>
          ) : mine.won ? (
            <span><Icon name="r-check" size={20} /> {t("Прогноз сыграл: +{n} монет", { n: mine.payout })}</span>
          ) : (
            <span>{t("Прогноз не сыграл — в следующий раз повезёт")}</span>
          )}
        </div>
      ) : panel.open ? (
        <form action={betAction} className="bet-buttons">
          <input type="hidden" name="match" value={matchId} />
          {(["home", "away"] as const).map((side) => (
            <SubmitButton key={side} className="bet-pick" name="pick" value={side} quiet>
              <span className="bet-name">{t("Победит {team}", { team: name(side) })}</span>
              <span className="bet-reward num">+{panel.odds[side]} <Coin size={14} /></span>
            </SubmitButton>
          ))}
        </form>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          {signedIn ? t(panel.reason ?? "Прогнозы на этот матч закрыты") : <Link href="/login">{t("Войдите, чтобы сделать прогноз")}</Link>}
        </p>
      )}

      <div className="bet-crowd-wrap">
        <div className="bet-crowd" aria-label={t("Распределение прогнозов")}>
          <i style={{ flex: Math.max(homeShare, 3) }} />
          <i style={{ flex: Math.max(100 - homeShare, 3) }} />
        </div>
        <div className="row between small muted">
          <span className="num">{home} · {homeShare}%</span>
          <span>{t("Прогнозов: {n}", { n: panel.pool.people })}</span>
          <span className="num">{100 - homeShare}% · {away}</span>
        </div>
      </div>
    </section>
  );
}
