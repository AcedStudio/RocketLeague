import Link from "next/link";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { Flash, type SP } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { Avatar, Nick } from "@/components/Badge";
import { Coin } from "@/components/shop";
import { myBets, topPredictors, oddsForMatches } from "@/lib/bets";
import { liveBoard } from "@/lib/live";
import { payout } from "@/lib/engine/bets";
import { fmtDateTime } from "@/lib/format";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Прогнозы") };
}

export default async function BetsPage({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const user = await getUser();
  const [mine, top, board] = await Promise.all([user ? myBets(user.id) : Promise.resolve([]), topPredictors(10), liveBoard()]);
  const open = board.flatMap((b) => b.matches.filter((m) => m.state === "soon" || m.state === "unscheduled").map((m) => ({ ...m, tz: b.comp.timezone, comp: b.comp.name })));
  const odds = await oddsForMatches(open);
  const settled = mine.filter((b) => b.won !== null);
  const profit = settled.reduce((s, b) => s + b.payout - b.stake, 0);
  const hit = settled.length ? Math.round((settled.filter((b) => b.won).length / settled.length) * 100) : 0;

  return (
    <div className="wrap section stack-lg">
      <Flash sp={sp} />
      <header className="store-head">
        <div>
          <p className="eyebrow">{t("Прогнозы")}</p>
          <h1 className="store-title">{t("Угадай победителя — забери монеты")}</h1>
          <p className="muted store-sub">{t("Ставьте монеты на матчи других игроков. Чем неожиданнее исход, тем выше коэффициент. Выигрыш начисляется сам, как только результат утверждён.")}</p>
        </div>
        {user && (
          <div className="bet-stats">
            <div><span className="balance-label">{t("Прогнозов")}</span><b className="num">{mine.length}</b></div>
            <div><span className="balance-label">{t("Точность")}</span><b className="num">{hit}%</b></div>
            <div><span className="balance-label">{t("Итог")}</span><b className={`num ${profit >= 0 ? "up" : "down"}`}>{profit >= 0 ? "+" : ""}{profit} <Coin size={16} /></b></div>
          </div>
        )}
      </header>

      <div className="bets-layout">
        <div className="stack-lg">
          <section className="stack">
            <h2 className="section-title">{t("Можно сделать прогноз")}</h2>
            {open.length === 0 ? (
              <div className="empty">{t("Сейчас нет матчей, открытых для прогноза.")}</div>
            ) : (
              <div className="lm-grid">
                {open.map((m) => {
                  const o = odds.get(m.id);
                  return (
                    <Link key={m.id} href={`/match/${m.id}#predict`} className="lm bet-open">
                      <div className="lm-top">
                        <span className="small muted">{m.comp}</span>
                        <span className="small faint">{m.scheduled_at ? fmtDateTime(m.scheduled_at, m.tz, t) : t("Время не согласовано")}</span>
                      </div>
                      <div className="lm-teams">
                        <span className="lm-name">{m.home_name}</span>
                        <span className="lm-score num">vs</span>
                        <span className="lm-name right">{m.away_name}</span>
                      </div>
                      {o && (
                        <div className="odds-row">
                          <span className="odd num">×{o.home.toFixed(2)}</span>
                          <span className="small faint">{t("коэффициенты")}</span>
                          <span className="odd num">×{o.away.toFixed(2)}</span>
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {user && (
            <section className="stack">
              <h2 className="section-title">{t("Мои прогнозы")}</h2>
              {mine.length === 0 ? (
                <div className="empty">{t("Вы ещё не делали прогнозов.")}</div>
              ) : (
                <div className="bet-list">
                  {mine.map((b) => (
                    <Link key={b.id} href={`/match/${b.match_id}`} className={`bet-row${b.won === true ? " won" : b.won === false ? " lost" : ""}`}>
                      <span className="bet-row-main">
                        <b>{b.home} — {b.away}</b>
                        <span className="small muted">{b.comp} · {t("на {team}", { team: b.pick === "home" ? b.home : b.away })} · ×{Number(b.odds).toFixed(2)}</span>
                      </span>
                      <span className="bet-row-res num">
                        {b.won === null ? (
                          <>{b.stake} <Coin size={13} /> → {payout(b.stake, Number(b.odds))}</>
                        ) : b.won ? (
                          <>+{b.payout - b.stake} <Coin size={13} /></>
                        ) : (
                          <>−{b.stake} <Coin size={13} /></>
                        )}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="live-feed">
          <h2><Icon name="ui-bets" size={22} /> {t("Лучшие прогнозисты")}</h2>
          {top.length === 0 ? (
            <p className="small muted">{t("Таблица появится после первых рассчитанных прогнозов.")}</p>
          ) : (
            <ol className="top-pred">
              {top.map((p, i) => (
                <li key={p.user_id}>
                  <span className="num faint">{i + 1}</span>
                  <Link href={`/players/${p.user_id}`} className="who"><Avatar name={p.nick} avatar={p.avatar} size={22} /> <Nick name={p.nick} color={p.name_color} /></Link>
                  <span className={`num ${p.profit >= 0 ? "up" : "down"}`}>{p.profit >= 0 ? "+" : ""}{p.profit}</span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </div>
  );
}
