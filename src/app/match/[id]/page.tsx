import Link from "next/link";
import { notFound } from "next/navigation";
import { getMatch, getCompetition, getEntry } from "@/lib/data";
import { getUser, isReferee, isAdmin } from "@/lib/auth";
import { q } from "@/lib/db";
import { userSide } from "@/lib/tournament";
import { fmtDateTime, toLocalInput, MATCH_STATUS_LABELS, renderStored } from "@/lib/format";
import { Flash, MatchStatusBadge, stageLabel, type SP } from "@/components/ui";
import { GamesInput, SubmitButton, LocalTime } from "@/components/client";
import { reportAction, respondAction, refereeResultAction, matchStatusAction, scheduleAction } from "@/app/actions/match";
import { getT } from "@/lib/i18n/server";
import { matchRatingChanges } from "@/lib/rating";
import { Delta } from "@/components/rating";

export const dynamic = "force-dynamic";

type Report = { id: string; entry_id: string; games: { home: number; away: number }[]; proof_url: string; comment: string; status: string; response_comment: string; created_at: Date; reporter: string };

export default async function MatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const t = await getT();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const m = await getMatch(id);
  if (!m) notFound();
  const comp = await getCompetition(m.competition_id);
  if (!comp) notFound();
  const user = await getUser();
  if (comp.draw_state !== "published" && !isAdmin(user?.role)) notFound();

  const [home, away, reports, events, side, roundsRow, elo] = await Promise.all([
    m.home_entry_id ? getEntry(m.home_entry_id) : null,
    m.away_entry_id ? getEntry(m.away_entry_id) : null,
    q<Report>(
      "select r.*, u.rl_nickname as reporter from match_reports r join users u on u.id = r.reporter_id where r.match_id = $1 order by r.created_at desc",
      [m.id],
    ),
    q<{ id: number; text: string; params: Record<string, unknown>; created_at: Date; actor: string | null }>(
      "select e.id, e.text, e.params, e.created_at, u.rl_nickname as actor from match_events e left join users u on u.id = e.actor_id where e.match_id = $1 order by e.created_at desc",
      [m.id],
    ),
    user ? userSide(m, user.id) : null,
    q<{ r: number }>("select max(round)::int as r from matches where competition_id = $1 and stage = 'knockout'", [comp.id]),
    matchRatingChanges(m.id),
  ]);
  const rounds = roundsRow[0]?.r ?? undefined;
  const myEntry = side === "home" ? m.home_entry_id : side === "away" ? m.away_entry_id : null;
  const pendingFromOpponent = reports.find((r) => r.status === "pending" && myEntry && r.entry_id !== myEntry);
  const myPending = reports.find((r) => r.status === "pending" && r.entry_id === myEntry);
  const canReport = !!side && m.home_entry_id && m.away_entry_id && !["completed", "under_review"].includes(m.status) && !m.is_bye;
  const ref = isReferee(user?.role);
  const done = m.status === "completed";
  const homeWin = done && m.winner_entry_id === m.home_entry_id;
  const awayWin = done && m.winner_entry_id === m.away_entry_id;
  const entryName = (eid: string) => (eid === m.home_entry_id ? m.home_name : m.away_name);

  const team = (e: typeof home, name: string | null, win: boolean) => (
    <div className="stack" style={{ gap: 6, alignItems: "center", textAlign: "center", minWidth: 0 }}>
      <h2 style={{ fontSize: "clamp(1.1rem, 3vw, 1.6rem)", color: win ? "var(--gold)" : undefined, overflowWrap: "anywhere" }}>{name ?? t("Определится позже")}</h2>
      {e && <span className="small muted">{e.members.map((x) => x.rl_nickname).join(" · ")}</span>}
      {win && <span className="badge gold plain">{t("Победитель")}</span>}
    </div>
  );

  return (
    <div className="wrap section stack-lg" style={{ paddingTop: 32 }}>
      <div className="row small">
        <Link href={`/c/${comp.slug}/matches`} className="muted">
          ← {comp.name}
        </Link>
      </div>
      <Flash sp={sp} />

      <section className="panel stack" style={{ padding: "clamp(20px, 4vw, 40px)" }}>
        <div className="row between small muted">
          <span>
            {t("Матч #{n}", { n: m.number })} · {stageLabel(t, m, rounds)} · Bo{m.best_of}
          </span>
          <MatchStatusBadge status={m.status} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 16, alignItems: "center", marginTop: 12 }}>
          {team(home, m.home_name, homeWin)}
          <div className="num" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem, 7vw, 3.6rem)", fontWeight: 700, whiteSpace: "nowrap" }}>
            {done ? (m.forfeit ? t("ТП") : `${m.home_wins} : ${m.away_wins}`) : "vs"}
          </div>
          {team(away, m.away_name, awayWin)}
        </div>
        <p className="muted" style={{ textAlign: "center" }}>
          {fmtDateTime(m.scheduled_at, comp.timezone, t)} ({comp.timezone})
          {m.scheduled_at && <LocalTime iso={new Date(m.scheduled_at).toISOString()} />}
        </p>
        {done && m.games && m.games.length > 0 && (
          <div className="row" style={{ justifyContent: "center" }}>
            {m.games.map((g, i) => (
              <span key={i} className="tag num" style={{ fontSize: "0.85rem" }}>
                {t("И{n}", { n: i + 1 })}: {g.home}–{g.away}
              </span>
            ))}
          </div>
        )}
        {done && !m.forfeit && <p className="small faint" style={{ textAlign: "center" }}>{t("Голы в сумме:")} {m.home_goals}–{m.away_goals}</p>}
        {m.forfeit && <p className="small faint" style={{ textAlign: "center" }}>{t("Техническая победа")}</p>}
      </section>

      <div className="split">
        <div className="stack-lg">
          {pendingFromOpponent && (
            <section className="panel stack" style={{ borderColor: "rgba(255,193,99,.5)" }}>
              <h3>{t("Соперник отправил результат")}</h3>
              <p>
                {pendingFromOpponent.games.map((g, i) => (
                  <span key={i} className="tag num" style={{ marginRight: 6 }}>
                    {t("И{n}", { n: i + 1 })}: {g.home}–{g.away}
                  </span>
                ))}
              </p>
              <p className="small muted">
                {t("Счёт указан как {home} – {away}. Отправил: {who}.", { home: m.home_name, away: m.away_name, who: pendingFromOpponent.reporter })}
                {pendingFromOpponent.proof_url && (
                  <>
                    {" "}
                    <a href={pendingFromOpponent.proof_url} target="_blank" rel="noopener noreferrer nofollow">{t("Доказательство")}</a>
                  </>
                )}
              </p>
              <form action={respondAction} className="stack">
                <input type="hidden" name="match_id" value={m.id} />
                <input type="hidden" name="report_id" value={pendingFromOpponent.id} />
                <label className="field">
                  <span>{t("Комментарий (обязателен, если оспариваете)")}</span>
                  <input className="input" name="comment" maxLength={500} />
                </label>
                <div className="row">
                  <SubmitButton className="btn" name="decision" value="accept">{t("Подтвердить")}</SubmitButton>
                  <SubmitButton className="btn btn-danger" name="decision" value="dispute" confirm={t("Оспорить результат? Матч уйдёт судье.")}>
                    {t("Оспорить")}
                  </SubmitButton>
                </div>
              </form>
            </section>
          )}

          {canReport && (
            <section className="panel stack">
              <h3>{myPending ? t("Вы уже отправили результат") : t("Отправить результат")}</h3>
              {myPending ? (
                <p className="small muted">{t("Ждём подтверждения соперника. Можно отправить исправленный счёт, старый будет заменён.")}</p>
              ) : (
                <p className="small muted">{t("Введите счёт каждой игры. Когда соперник подтвердит, результат станет официальным.")}</p>
              )}
              <form action={reportAction} className="stack">
                <input type="hidden" name="match_id" value={m.id} />
                <GamesInput bestOf={m.best_of} homeName={m.home_name ?? t("Хозяева")} awayName={m.away_name ?? t("Гости")} initial={myPending?.games} />
                <label className="field">
                  <span>{t("Ссылка на скриншот (необязательно)")}</span>
                  <input className="input" name="proof_url" type="url" placeholder="https://..." maxLength={500} />
                  <small>{t("Загрузите скриншот итогового экрана в Discord или Imgur и вставьте ссылку")}</small>
                </label>
                <label className="field">
                  <span>{t("Комментарий")}</span>
                  <input className="input" name="comment" maxLength={500} />
                </label>
                <SubmitButton className="btn">{myPending ? t("Отправить заново") : t("Отправить результат")}</SubmitButton>
              </form>
            </section>
          )}

          {ref && m.home_entry_id && m.away_entry_id && !m.is_bye && (
            <section className="panel stack" style={{ borderColor: "rgba(217,173,80,.4)" }}>
              <h3>{t("Судейская панель")}</h3>
              {m.status === "under_review" && <div className="notice small">{t("Спор: сравните отчёты ниже и установите официальный результат.")}</div>}
              <form action={refereeResultAction} className="stack">
                <input type="hidden" name="match_id" value={m.id} />
                <GamesInput bestOf={m.best_of} homeName={m.home_name ?? ""} awayName={m.away_name ?? ""} initial={m.games ?? undefined} />
                <label className="field">
                  <span>{t("Техническая победа")}</span>
                  <select className="input" name="forfeit" defaultValue="">
                    <option value="">{t("Нет, использовать счёт")}</option>
                    <option value="home">{t("Победа:")} {m.home_name}</option>
                    <option value="away">{t("Победа:")} {m.away_name}</option>
                  </select>
                </label>
                <label className="field">
                  <span>{t("Решение / комментарий")}</span>
                  <input className="input" name="note" maxLength={500} />
                </label>
                <SubmitButton className="btn btn-gold" confirm={t("Утвердить результат? Таблица и сетка обновятся.")}>
                  {t("Утвердить результат")}
                </SubmitButton>
              </form>
              {!done && (
                <form action={matchStatusAction} className="row">
                  <input type="hidden" name="match_id" value={m.id} />
                  <select className="input" name="status" defaultValue={m.status} style={{ maxWidth: 240 }}>
                    {(["upcoming", "ready", "live", "under_review", "postponed"] as const).map((s) => (
                      <option key={s} value={s}>{t(MATCH_STATUS_LABELS[s])}</option>
                    ))}
                  </select>
                  <SubmitButton className="btn btn-ghost">{t("Сменить статус")}</SubmitButton>
                </form>
              )}
              <form action={scheduleAction} className="row">
                <input type="hidden" name="match_id" value={m.id} />
                <input className="input" type="datetime-local" name="scheduled_at" defaultValue={toLocalInput(m.scheduled_at, comp.timezone)} style={{ maxWidth: 260 }} />
                <SubmitButton className="btn btn-ghost">{t("Сохранить время")}</SubmitButton>
              </form>
            </section>
          )}
        </div>

        <aside className="stack-lg">
          {elo.length > 0 && (
            <section className="stack">
              <h3>{t("Изменение рейтинга")}</h3>
              <div className="list">
                {elo.map((r) => (
                  <Link key={r.user_id} href={`/players/${r.user_id}`} className="list-row">
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>{r.rl_nickname}</b>
                      <span className="small faint" style={{ display: "block" }}>
                        {r.before} → {r.before + r.delta}
                      </span>
                    </span>
                    <Delta value={r.delta} />
                  </Link>
                ))}
              </div>
            </section>
          )}
          {(side || ref) && reports.length > 0 && (
            <section className="stack">
              <h3>{t("Отчёты")}</h3>
              <div className="list">
                {reports.map((r) => (
                  <div key={r.id} className="list-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
                    <div className="row">
                      <b>{entryName(r.entry_id)}</b>
                      <span className={`badge ${r.status === "confirmed" ? "ok" : r.status === "disputed" ? "danger" : r.status === "pending" ? "warn" : "dim"}`}>
                        {{ pending: t("ждёт ответа"), confirmed: t("подтверждён"), disputed: t("спор"), superseded: t("заменён") }[r.status]}
                      </span>
                    </div>
                    <span className="num">{r.games.map((g) => `${g.home}–${g.away}`).join(", ")}</span>
                    {r.comment && <span className="small muted">«{r.comment}»</span>}
                    {r.response_comment && <span className="small" style={{ color: "var(--danger)" }}>{t("Возражение:")} {r.response_comment}</span>}
                    {r.proof_url && (
                      <a className="small" href={r.proof_url} target="_blank" rel="noopener noreferrer nofollow">
                        {t("Доказательство")}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="stack">
            <h3>{t("История матча")}</h3>
            {events.length ? (
              <ol className="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {events.map((e) => (
                  <li key={e.id} className="list-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                    <span className="small">{renderStored(t, e.text, e.params)}</span>
                    <span className="small faint">
                      {fmtDateTime(e.created_at, comp.timezone, t)}
                      {e.actor ? ` · ${e.actor}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted small">{t("Пока без событий.")}</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
