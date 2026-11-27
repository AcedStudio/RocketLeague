import Link from "next/link";
import { notFound } from "next/navigation";
import { getMatch, getCompetition, getEntry } from "@/lib/data";
import { getUser, isReferee, isAdmin } from "@/lib/auth";
import { q } from "@/lib/db";
import { userSide } from "@/lib/tournament";
import { fmtDateTime, toLocalInput, MATCH_STATUS_LABELS, renderStored, scoreOf } from "@/lib/format";
import { Flash, MatchStatusBadge, stageLabel, type SP } from "@/components/ui";
import { GamesInput, SubmitButton, LocalTime, ShotPicker } from "@/components/client";
import { reportAction, respondAction, refereeResultAction, matchStatusAction, scheduleAction, matchRefereeAction, uploadShotsAction, deleteShotAction } from "@/app/actions/match";
import { listMatchFiles, MAX_FILES_PER_MATCH } from "@/lib/files";
import { MatchJourney } from "@/components/MatchJourney";
import { RefereeForm } from "@/components/RefereeForm";
import { matchOfRound } from "@/lib/motw";
import { entryRatings } from "@/lib/rating";
import { winChance } from "@/lib/engine/odds.ts";
import { matchCommentary } from "@/lib/commentary";
import { rivalryBetween } from "@/lib/derby";
import { refereeCandidates } from "@/lib/referees";
import { getT } from "@/lib/i18n/server";
import { matchRatingChanges } from "@/lib/rating";
import { Delta } from "@/components/rating";
import { ScheduleBox } from "@/components/ScheduleBox";
import { sweep } from "@/lib/scheduling";
import { after } from "next/server";
import { Finisher } from "@/components/Finisher";
import { Icon } from "@/components/Icon";
import { finisherItem } from "@/lib/engine/shop";

export const dynamic = "force-dynamic";

type Report = { id: string; entry_id: string; games: { home: number; away: number }[]; proof_url: string; comment: string; status: string; response_comment: string; created_at: Date; reporter: string };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return {};
  const [m, t] = await Promise.all([getMatch(id), getT()]);
  if (!m) return {};
  const comp = await getCompetition(m.competition_id);
  const title = `${m.home_name ?? "TBD"} vs ${m.away_name ?? "TBD"}`;
  const description = m.status === "completed"
    ? t("{comp} · итог {score}", { comp: comp?.name ?? "", score: scoreOf(m).join(":") })
    : t("{comp} · тур {n}", { comp: comp?.name ?? "", n: m.round });
  const v = `${m.status}-${m.home_wins ?? 0}-${m.away_wins ?? 0}`;
  return { title, description, openGraph: { title, description, images: [{ url: `/api/match-card/${id}?lang=${t.locale}&v=${v}`, width: 1200, height: 630 }] } };
}

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

  const [home, away, reports, events, side, roundsRow, elo, refCandidates, shots, motw, ratings, story] = await Promise.all([
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
    isAdmin(user?.role) ? refereeCandidates(comp.id) : Promise.resolve([]),
    listMatchFiles(m.id),
    m.stage === "league" ? matchOfRound(comp) : Promise.resolve(null),
    entryRatings(comp.id),
    m.status === "completed" ? matchCommentary(undefined, comp.id, m.id).catch(() => []) : Promise.resolve([]),
  ]);
  const rH = ratings.find((r) => r.entry_id === m.home_entry_id)?.rating;
  const rA = ratings.find((r) => r.entry_id === m.away_entry_id)?.rating;
  const chance = rH && rA && !m.is_bye ? Math.round(winChance(rH, rA) * 100) : null;
  const hU = home?.members.length === 1 ? home.members[0].user_id : null;
  const aU = away?.members.length === 1 ? away.members[0].user_id : null;
  const rivalry = hU && aU ? await rivalryBetween(hU, aU) : null;
  const rounds = roundsRow[0]?.r ?? undefined;
  // Opportunistic: apply due reminders and forfeits (throttled, also run by the 5-minute tick).
  after(() => sweep().catch((e) => console.error("[sweep]", e)));
  const myEntry = side === "home" ? m.home_entry_id : side === "away" ? m.away_entry_id : null;
  const pendingFromOpponent = reports.find((r) => r.status === "pending" && myEntry && r.entry_id !== myEntry);
  const myPending = reports.find((r) => r.status === "pending" && r.entry_id === myEntry);
  const open = !!m.home_entry_id && !!m.away_entry_id && !["completed", "under_review"].includes(m.status) && !m.is_bye;
  const canReport = !!side && open && !comp.referee_only;
  const staff = isReferee(user?.role);
  const assignedRef = !!user && m.referee_user_id === user.id;
  const ref = staff || assignedRef;
  const done = m.status === "completed";
  const homeWin = done && m.winner_entry_id === m.home_entry_id;
  const awayWin = done && m.winner_entry_id === m.away_entry_id;
  const canShoot = !!user && (staff || assignedRef || !!side) && !!m.home_entry_id && !!m.away_entry_id && !m.is_bye;
  const shotsLeft = MAX_FILES_PER_MATCH - shots.length;
  const entryName = (eid: string) => (eid === m.home_entry_id ? m.home_name : m.away_name);
  // The winner's victory effect (a 2v2 team uses its captain's, else any member's).
  const fxRow = done && m.winner_entry_id && !m.forfeit
    ? (await q<{ finisher: string }>(
        `select u.finisher from entry_members em join users u on u.id = em.user_id
          where em.entry_id = $1 and em.active and u.finisher is not null order by em.is_captain desc limit 1`,
        [m.winner_entry_id],
      ))[0]
    : null;
  const fx = finisherItem(fxRow?.finisher);

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

      <section className="panel stack" style={{ padding: "clamp(20px, 4vw, 40px)", position: "relative", overflow: "hidden" }}>
        {fx && <Finisher kind={fx.key} side={homeWin ? "home" : awayWin ? "away" : "center"} replay label={fx.name} />}
        <div className="row between small muted">
          <span>
            {t("Матч #{n}", { n: m.number })} · {stageLabel(t, m, rounds)} · {m.best_of === 1 ? t("одна игра") : `Bo${m.best_of}`}
          </span>
          <span className="row" style={{ gap: 8 }}>
            {rivalry?.derby && <span className="badge derby plain"><Icon name="t-bolt" size={14} /> {t("Дерби")}</span>}
            {motw?.match.id === m.id && <span className="badge gold plain"><Icon name="t-fire" size={14} /> {t("Матч тура")}</span>}
            <MatchStatusBadge status={m.status} />
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 16, alignItems: "center", marginTop: 12 }}>
          {team(home, m.home_name, homeWin)}
          <div className="num" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem, 7vw, 3.6rem)", fontWeight: 700, whiteSpace: "nowrap" }}>
            {done ? (m.forfeit ? t("ТП") : scoreOf(m).join(" : ")) : "vs"}
          </div>
          {team(away, m.away_name, awayWin)}
        </div>
        <p className="row" style={{ justifyContent: "center", margin: 0 }}>
          {m.referee_name ? (
            <span className="badge gold plain"><Icon name="ui-referee" size={14} /> {t("Судья: {name}", { name: m.referee_name })}</span>
          ) : (
            !m.is_bye && <span className="badge dim plain"><Icon name="ui-referee" size={14} /> {t("Судья ещё не назначен")}</span>
          )}
        </p>
        {rivalry && rivalry.meetings > (done ? 1 : 0) && (
          <p className="h2h-line">
            {t("Личные встречи (лига + дуэли): {home} {h} — {a} {away}", { home: m.home_name ?? "", away: m.away_name ?? "", h: rivalry.xWins, a: rivalry.yWins })}
          </p>
        )}
        {story.length > 0 && (
          <div className="story">
            {story.map((l) => (
              <span key={l.key}>{renderStored(t, l.text, l.params)}</span>
            ))}
          </div>
        )}
        {chance !== null && !done && (
          <div className="win-chance" aria-label={t("Шанс победы: {home} {h}% — {away} {a}%", { home: m.home_name ?? "", h: chance, away: m.away_name ?? "", a: 100 - chance })}>
            <span className="small muted">{t("Шанс победы по рейтингу")}</span>
            <div className="win-chance-bar">
              <i style={{ flex: Math.max(chance, 4) }}><b className="num">{chance}%</b></i>
              <i style={{ flex: Math.max(100 - chance, 4) }}><b className="num">{100 - chance}%</b></i>
            </div>
          </div>
        )}
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

      <MatchJourney m={m} comp={comp} role={assignedRef || (staff && !side) ? "referee" : side ? "player" : "viewer"} t={t} />

      {ref && m.home_entry_id && m.away_entry_id && !m.is_bye && (!done ? (
        <section className="panel stack ref-panel" id="referee">
          <div className="row between">
            <h3>⚖️ {assignedRef ? t("Вы судья этого матча") : t("Судейская панель")}</h3>
            {assignedRef && <Link className="small" href="/referee">{t("Все мои матчи")} →</Link>}
          </div>
          {m.status === "under_review" && <div className="notice small">{t("Спор: сравните отчёты и скриншоты ниже и установите официальный результат.")}</div>}
          <RefereeForm t={t} matchId={m.id} bestOf={m.best_of} homeName={m.home_name ?? ""} awayName={m.away_name ?? ""} initial={m.games ?? undefined} />
        </section>
      ) : staff ? (
        <details className="panel ref-panel" id="referee">
          <summary><b>✏️ {t("Исправить результат")}</b></summary>
          <div style={{ marginTop: 12 }}>
            <RefereeForm t={t} matchId={m.id} bestOf={m.best_of} homeName={m.home_name ?? ""} awayName={m.away_name ?? ""} initial={m.games ?? undefined} />
          </div>
        </details>
      ) : null)}

      <div className="split">
        <div className="stack-lg">
          <ScheduleBox m={m} comp={comp} side={side} />
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

          {!!side && open && comp.referee_only && !assignedRef && (
            <section className="panel stack">
              <h3>{t("Результат")}</h3>
              <p className="small muted" style={{ margin: 0 }}>
                {m.referee_name
                  ? t("Счёт вносит судья матча — {name}. Пригласите его в лобби зрителем или отправьте ему скриншот итогового счёта.", { name: m.referee_name })
                  : t("Счёт вносит судья матча. Судью назначит администратор — вы получите уведомление.")}
              </p>
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

          {(shots.length > 0 || canShoot) && (
            <section className="panel stack" id="shots">
              <h3>📷 {t("Скриншоты матча")}</h3>
              {shots.length > 0 ? (
                <div className="shot-grid">
                  {shots.map((f) => (
                    <figure key={f.id} className="shot">
                      <a href={`/api/file/${f.id}`} target="_blank" rel="noopener">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/file/${f.id}`} alt={t("Скриншот от {name}", { name: f.uploader ?? "—" })} loading="lazy" />
                      </a>
                      <figcaption className="small faint">
                        {f.uploader ?? "—"} · {fmtDateTime(f.created_at, comp.timezone, t)}
                        {user && (user.id === f.uploader_id || staff) && (
                          <form action={deleteShotAction} style={{ display: "inline" }}>
                            <input type="hidden" name="match_id" value={m.id} />
                            <input type="hidden" name="file_id" value={f.id} />
                            <SubmitButton className="link-btn" confirm={t("Удалить скриншот?")} quiet>✕</SubmitButton>
                          </form>
                        )}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <p className="small muted" style={{ margin: 0 }}>{t("Приложите скриншот итогового счёта — так судье проще подтвердить результат.")}</p>
              )}
              {canShoot && shotsLeft > 0 && (
                <form action={uploadShotsAction} className="stack-sm">
                  <input type="hidden" name="match_id" value={m.id} />
                  <ShotPicker left={shotsLeft} />
                  <SubmitButton className="btn btn-sm" pendingText={t("Загружаем…")}>{t("Загрузить")}</SubmitButton>
                </form>
              )}
            </section>
          )}

          {staff && m.home_entry_id && m.away_entry_id && !m.is_bye && (
            <details className="panel stack">
              <summary><b>⚙️ {t("Управление матчем (админ)")}</b></summary>
              {staff && !done && (
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
              {staff && (
                <form action={scheduleAction} className="row">
                  <input type="hidden" name="match_id" value={m.id} />
                  <input className="input" type="datetime-local" name="scheduled_at" defaultValue={toLocalInput(m.scheduled_at, comp.timezone)} style={{ maxWidth: 260 }} />
                  <SubmitButton className="btn btn-ghost">{t("Сохранить время")}</SubmitButton>
                </form>
              )}
              {isAdmin(user?.role) && !done && (
                <form action={matchRefereeAction} className="row">
                  <input type="hidden" name="match_id" value={m.id} />
                  <select className="input" name="referee" defaultValue={m.referee_user_id ?? ""} style={{ maxWidth: 260 }} aria-label={t("Судья матча")}>
                    <option value="">{t("— без судьи —")}</option>
                    {refCandidates
                      .filter((c) => c.entry_id !== m.home_entry_id && c.entry_id !== m.away_entry_id)
                      .map((c) => (
                        <option key={c.user_id} value={c.user_id}>{c.nickname} · {t("судил: {n}", { n: c.refereed })}</option>
                      ))}
                  </select>
                  <SubmitButton className="btn btn-ghost">{t("Назначить судью")}</SubmitButton>
                </form>
              )}
            </details>
          )}
        </div>

        <aside className="stack-lg">
          {m.home_entry_id && m.away_entry_id && !m.is_bye && (
            <section className="stack">
              <h3>{done ? t("Картинка результата") : "Match Day"}</h3>
              <a href={`/api/match-card/${m.id}?lang=${t.locale}&v=${m.status}-${m.home_wins ?? 0}-${m.away_wins ?? 0}`} target="_blank" rel="noopener" className="match-card-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/match-card/${m.id}?lang=${t.locale}&v=${m.status}-${m.home_wins ?? 0}-${m.away_wins ?? 0}`} alt={`${m.home_name} — ${m.away_name}`} width={1200} height={630} loading="lazy" />
              </a>
              <a
                className="btn btn-ghost btn-sm"
                href={`/api/match-card/${m.id}?lang=${t.locale}&v=${m.status}-${m.home_wins ?? 0}-${m.away_wins ?? 0}`}
                download={`rlc-match-${m.number}.png`}
              >
                {t("Скачать картинку")}
              </a>
            </section>
          )}
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
