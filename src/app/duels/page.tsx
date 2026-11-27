import Link from "next/link";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { fmtDateTime } from "@/lib/format";
import { Flash, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { UserBadge, Nick, Avatar } from "@/components/Badge";
import { myDuels, recentDuels, duelTable, type Duel } from "@/lib/duels";
import { respondDuelAction, cancelDuelAction, reportDuelAction, confirmDuelAction } from "@/app/actions/duels";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Дуэли") };
}

const TZ = "Asia/Tashkent";

export default async function Duels({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const user = await getUser();
  const [mine, recent, table] = await Promise.all([user ? myDuels(user.id) : Promise.resolve([] as Duel[]), recentDuels(), duelTable()]);
  const active = mine.filter((d) => ["pending", "accepted", "reported"].includes(d.status));
  const past = mine.filter((d) => !["pending", "accepted", "reported"].includes(d.status)).slice(0, 15);

  const opponentOf = (d: Duel) => (d.challenger_id === user?.id ? { id: d.opponent_id, name: d.opponent } : { id: d.challenger_id, name: d.challenger });
  const STATUS: Record<Duel["status"], string> = {
    pending: t("ждёт ответа"),
    accepted: t("принята — сыграйте"),
    reported: t("ждёт подтверждения счёта"),
    completed: t("завершена"),
    declined: t("отклонена"),
    cancelled: t("отменена"),
    expired: t("истекла"),
  };

  const card = (d: Duel) => {
    const opp = opponentOf(d);
    const iChallenged = d.challenger_id === user?.id;
    const iReported = d.reported_by === user?.id;
    const myScore = d.ch_goals == null ? null : iChallenged ? `${d.ch_goals}:${d.op_goals}` : `${d.op_goals}:${d.ch_goals}`;
    return (
      <article key={d.id} className={`duel duel-${d.status}`}>
        <header className="duel-head">
          <span className="duel-vs">
            ⚔️ <Link href={`/players/${opp.id}`}>{opp.name}</Link>
          </span>
          <span className="badge plain dim">{STATUS[d.status]}</span>
        </header>
        <p className="small muted" style={{ margin: 0 }}>
          {iChallenged ? t("Вы вызвали · {when}", { when: fmtDateTime(d.created_at, TZ, t) }) : t("Вас вызвали · {when}", { when: fmtDateTime(d.created_at, TZ, t) })}
          {d.message && <> · «{d.message}»</>}
        </p>

        {d.status === "pending" && !iChallenged && (
          <form action={respondDuelAction} className="row">
            <input type="hidden" name="duel_id" value={d.id} />
            <SubmitButton className="btn btn-sm" name="answer" value="accept">{t("Принять вызов")}</SubmitButton>
            <SubmitButton className="btn btn-ghost btn-sm" name="answer" value="decline">{t("Отказаться")}</SubmitButton>
          </form>
        )}
        {d.status === "pending" && iChallenged && (
          <form action={cancelDuelAction}>
            <input type="hidden" name="duel_id" value={d.id} />
            <SubmitButton className="btn btn-ghost btn-sm">{t("Отменить вызов")}</SubmitButton>
          </form>
        )}
        {d.status === "accepted" && (
          <form action={reportDuelAction} className="duel-report">
            <input type="hidden" name="duel_id" value={d.id} />
            <span className="small muted">{t("Счёт (одна игра):")}</span>
            <label className="duel-score">
              <small>{t("Вы")}</small>
              <input className="input num" name="mine" inputMode="numeric" pattern="[0-9]*" maxLength={2} required />
            </label>
            <span>:</span>
            <label className="duel-score">
              <small>{opp.name}</small>
              <input className="input num" name="theirs" inputMode="numeric" pattern="[0-9]*" maxLength={2} required />
            </label>
            <SubmitButton className="btn btn-sm">{t("Внести счёт")}</SubmitButton>
          </form>
        )}
        {d.status === "reported" && (
          iReported ? (
            <p className="small" style={{ margin: 0 }}>{t("Вы внесли счёт {score} — ждём подтверждения соперника", { score: myScore ?? "" })}</p>
          ) : (
            <form action={confirmDuelAction} className="row">
              <input type="hidden" name="duel_id" value={d.id} />
              <span className="small">{t("Соперник внёс счёт {score} (вы первые). Верно?", { score: myScore ?? "" })}</span>
              <SubmitButton className="btn btn-sm" name="answer" value="agree">{t("Да, подтвердить")}</SubmitButton>
              <SubmitButton className="btn btn-ghost btn-sm" name="answer" value="disagree">{t("Нет")}</SubmitButton>
            </form>
          )
        )}
        {d.status === "completed" && (
          <p className="duel-result" style={{ margin: 0 }}>
            <b className="num">{myScore}</b> {d.winner_id === user?.id ? <span className="badge ok plain">{t("Победа")}</span> : <span className="badge danger plain">{t("Поражение")}</span>}
          </p>
        )}
      </article>
    );
  };

  return (
    <div className="wrap section stack-lg">
      <Flash sp={sp} />
      <div className="stack-sm">
        <h1>⚔️ {t("Дуэли")}</h1>
        <p className="muted" style={{ maxWidth: 640, margin: 0 }}>
          {t("Товарищеский матч вне лиги: одна игра, 5 минут. Бросьте вызов из профиля любого игрока — кнопка «Бросить вызов». Счёт вносит любой из двоих, второй подтверждает.")}
        </p>
      </div>

      <div className="split">
        <section className="stack">
          {user ? (
            <>
              <h2 style={{ fontSize: "1.3rem" }}>{t("Мои дуэли")}</h2>
              {active.length ? <div className="duel-list">{active.map(card)}</div> : (
                <div className="empty">
                  {t("Активных дуэлей нет.")} <Link href="/players">{t("Выберите соперника")} →</Link>
                </div>
              )}
              {past.length > 0 && (
                <details className="stack-sm">
                  <summary className="small muted">{t("История ({n})", { n: past.length })}</summary>
                  <div className="duel-list">{past.map(card)}</div>
                </details>
              )}
            </>
          ) : (
            <div className="empty">
              <Link className="btn" href="/login?next=/duels">{t("Войдите, чтобы бросать вызовы")}</Link>
            </div>
          )}

          <h2 style={{ fontSize: "1.3rem" }}>{t("Последние дуэли")}</h2>
          {recent.length ? (
            <div className="list">
              {recent.map((d) => (
                <div key={d.id} className="list-row duel-feed">
                  <Link href={`/players/${d.challenger_id}`} className={d.winner_id === d.challenger_id ? "win" : undefined}>{d.challenger}</Link>
                  <b className="num">{d.ch_goals}:{d.op_goals}</b>
                  <Link href={`/players/${d.opponent_id}`} className={d.winner_id === d.opponent_id ? "win" : undefined}>{d.opponent}</Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">{t("Пока ни одной дуэли — станьте первым")}</div>
          )}
        </section>

        <aside className="stack">
          <h2 style={{ fontSize: "1.3rem" }}>🏆 {t("Лучшие дуэлянты")}</h2>
          {table.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="c">#</th>
                    <th>{t("Игрок")}</th>
                    <th className="c">{t("В")}</th>
                    <th className="c">{t("П")}</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((r, i) => (
                    <tr key={r.user_id} className={r.user_id === user?.id ? "mine" : undefined}>
                      <td className="c num">{i + 1}</td>
                      <td style={{ fontWeight: 600 }}><Link href={`/players/${r.user_id}`} className="who"><Avatar name={r.nickname} avatar={r.avatar} size={24} /> <Nick name={r.nickname} color={r.color} /></Link> <UserBadge value={r.badge} t={t} size="sm" /></td>
                      <td className="c num">{r.wins}</td>
                      <td className="c num">{r.losses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty small">{t("Таблица появится после первых дуэлей")}</div>
          )}
        </aside>
      </div>
    </div>
  );
}
