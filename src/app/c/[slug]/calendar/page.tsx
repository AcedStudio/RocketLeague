import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompetitionBySlug, getMatches, getEntries, getStandings, type Match } from "@/lib/data";
import { getUser } from "@/lib/auth";
import { fmtDate, fmtDateTime, groupLabel, scoreOf } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { pick, type SP } from "@/components/ui";
import { AutoSubmitForm } from "@/components/client";
import { entryRatings } from "@/lib/rating";
import { getPolls, nominees as getNominees, myVote, type Nominee } from "@/lib/awards";
import { voteAction } from "@/app/actions/fun";
import { q as dbq } from "@/lib/db";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Календарь") };
}

type Tour = { round: number; matches: Match[]; deadline: Date | null };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function Calendar({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SP }) {
  const t = await getT();
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const comp = await getCompetitionBySlug(slug);
  if (!comp) notFound();
  const tz = comp.timezone;

  if (comp.draw_state !== "published") {
    return (
      <div className="empty stack" style={{ gap: 8 }}>
        <h3>{t("Календарь появится после жеребьёвки")}</h3>
        {comp.season_days > 0 && <p className="muted">{t("Сезон продлится {days} дней: туры распределятся равномерно, у каждого тура будет свой крайний день.", { days: comp.season_days })}</p>}
      </div>
    );
  }

  const stage = comp.format === "round_robin" ? "league" : "group";
  const [all, entries, user, tables, ratings] = await Promise.all([getMatches(comp.id), getEntries(comp.id), getUser(), getStandings(comp), entryRatings(comp.id)]);
  const matches = all.filter((m) => m.stage === stage && !m.is_bye);
  const tourMap = new Map<number, Tour>();
  for (const m of matches) {
    const tour = tourMap.get(m.round) ?? { round: m.round, matches: [], deadline: null };
    tour.matches.push(m);
    if (m.play_by && (!tour.deadline || new Date(m.play_by) > tour.deadline)) tour.deadline = new Date(m.play_by);
    tourMap.set(m.round, tour);
  }
  const tours = [...tourMap.values()].sort((a, b) => a.round - b.round);
  if (!tours.length) return <div className="empty">{t("В этом формате нет туров — смотрите сетку плей-офф")}</div>;

  const now = Date.now();
  const current = tours.find((x) => x.matches.some((m) => m.status !== "completed"))?.round ?? null;

  // Player-of-the-tour polls: open ones get nominees and my vote.
  const polls = new Map((await getPolls(comp.id)).filter((p) => p.stage === stage).map((p) => [p.round, p]));
  const teams = new Map<number, { user_id: string; nickname: string }[]>();
  for (const row of await dbq<{ round: number; user_id: string; nickname: string }>(
    "select t.round, t.user_id, u.rl_nickname as nickname from tour_team t join users u on u.id = t.user_id where t.competition_id = $1 and t.stage = $2 order by t.round, t.rank",
    [comp.id, stage],
  )) teams.set(row.round, [...(teams.get(row.round) ?? []), row]);
  const openPolls = [...polls.values()].filter((p) => !p.closed_at && new Date(p.closes_at).getTime() > now);
  const pollData = new Map<number, { list: Nominee[]; mine: string | null }>(
    await Promise.all(
      openPolls.map(async (p) => [p.round, { list: await getNominees(comp.id, stage, p.round), mine: user ? await myVote(comp.id, stage, p.round, user.id) : null }] as const),
    ),
  );
  const confirmed = entries.filter((e) => e.status === "confirmed").sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = new Map(confirmed.map((e) => [e.id, e.name]));
  const myEntry = user ? confirmed.find((e) => e.members.some((m) => m.user_id === user.id)) : undefined;
  const rows = new Map(tables.flatMap((tb) => tb.rows.map((r) => [r.id, r] as const)));
  const elo = new Map(ratings.map((r) => [r.entry_id, r.rating]));

  // Quick view: ?p=<entry> (default: me) and optionally ?vs=<entry>.
  const pParam = pick(sp, "p");
  const vsParam = pick(sp, "vs");
  const p = UUID.test(pParam) && nameOf.has(pParam) ? pParam : myEntry?.id ?? "";
  const vs = p && UUID.test(vsParam) && nameOf.has(vsParam) && vsParam !== p ? vsParam : "";
  const href = (np: string, nvs = "") => `/c/${slug}/calendar?${new URLSearchParams({ ...(np ? { p: np } : {}), ...(nvs ? { vs: nvs } : {}) })}#view`;

  const involves = (m: Match, id: string) => m.home_entry_id === id || m.away_entry_id === id;
  const fixtures = p
    ? tours.map((tour) => ({ tour, m: tour.matches.find((x) => involves(x, p)) }))
    : [];
  const meetings = p && vs ? matches.filter((m) => involves(m, p) && involves(m, vs)).sort((a, b) => a.round - b.round) : [];

  const resultBadge = (m: Match, id: string) => {
    if (m.status !== "completed") return null;
    const home = m.home_entry_id === id;
    const won = m.winner_entry_id === id;
    const score = m.forfeit ? t("ТП") : m.games?.length ? (home ? scoreOf(m).join(":") : [...scoreOf(m)].reverse().join(":")) : "";
    return <span className={`badge ${won ? "ok" : "danger"}`}>{won ? t("В") : t("П")}{score ? ` ${score}` : ""}</span>;
  };
  const whenCell = (m: Match) =>
    m.scheduled_at ? <span className="small">{fmtDateTime(m.scheduled_at, tz, t)}{m.time_confirmed ? " ✓" : ""}</span> : <span className="faint small">{t("время не согласовано")}</span>;

  const Summary = ({ id }: { id: string }) => {
    const r = rows.get(id);
    const next = matches
      .filter((m) => involves(m, id) && m.status !== "completed")
      .sort((a, b) => a.round - b.round)[0];
    const opp = next ? (next.home_entry_id === id ? next.away_entry_id : next.home_entry_id) : null;
    return (
      <div className="pv-card">
        <div className="pv-head">
          <b>{nameOf.get(id)}</b>
          {r && <span className="badge accent">#{r.position}</span>}
        </div>
        <dl className="pv-stats">
          <div><dt>{t("Очки")}</dt><dd>{r?.points ?? 0}</dd></div>
          <div><dt>{t("В–П")}</dt><dd>{r ? `${r.wins}–${r.losses}` : "0–0"}</dd></div>
          <div><dt>{t("Голы")}</dt><dd>{r ? `${r.goalsFor}:${r.goalsAgainst}` : "0:0"}</dd></div>
          <div><dt>ELO</dt><dd>{elo.get(id) ?? 1000}</dd></div>
        </dl>
        <div className="pv-form" aria-label={t("Форма")}>
          {(r?.form ?? []).map((f, i) => (
            <i key={i} className={f === "W" ? "w" : "l"}>{f === "W" ? t("В") : t("П")}</i>
          ))}
          {!r?.form?.length && <span className="faint small">{t("Ещё нет сыгранных матчей")}</span>}
        </div>
        {next && opp && (
          <p className="small muted" style={{ margin: 0 }}>
            {t("Следующий: тур {n} — {name}", { n: next.round, name: nameOf.get(opp) ?? "?" })}
            {next.play_by && ` · ${t("до {date}", { date: fmtDate(next.play_by, tz, t) })}`}
          </p>
        )}
      </div>
    );
  };

  const last = tours[tours.length - 1].deadline;
  const tourState = (tour: Tour) => (tour.matches.every((m) => m.status === "completed") ? "done" : tour.round === current ? "now" : "next");

  return (
    <div className="stack-lg">
      <Flash sp={sp} />
      <div className="stack-sm">
        <h2 style={{ fontSize: "1.4rem" }}>{t("Календарь сезона")}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {t("Туров: {n}", { n: tours.length })}
          {last && ` · ${t("последний тур до {date}", { date: fmtDate(last, tz, t) })}`}
          {comp.double_round_robin && ` · ${t("каждый с каждым дома и в гостях")}`}
        </p>
      </div>

      {/* Tour strip: jump to any tour, colour = played / now / upcoming */}
      <nav className="tour-strip" aria-label={t("Туры")}>
        {tours.map((tour) => (
          <a key={tour.round} href={`#tour-${tour.round}`} className={`ts-${tourState(tour)}`} title={tour.deadline ? t("до {date}", { date: fmtDate(tour.deadline, tz, t) }) : undefined}>
            {tour.round}
          </a>
        ))}
      </nav>

      {/* Quick view */}
      <section id="view" className="panel stack" style={{ scrollMarginTop: 90 }}>
        <h3>{t("Быстрый просмотр")}</h3>
        <AutoSubmitForm action={`/c/${slug}/calendar`} className="pv-form-row">
          <label className="field">
            <span>{t("Игрок")}</span>
            <select className="input" name="p" defaultValue={p}>
              <option value="">{t("— выберите игрока —")}</option>
              {confirmed.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.id === myEntry?.id ? ` (${t("вы")})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("Соперник")}</span>
            <select className="input" name="vs" defaultValue={vs} disabled={!p}>
              <option value="">{t("— все соперники —")}</option>
              {confirmed
                .filter((e) => e.id !== p)
                .map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
            </select>
          </label>
          <noscript>
            <button className="btn">{t("Показать")}</button>
          </noscript>
          {(p || vs) && (
            <Link className="btn btn-ghost" href={`/c/${slug}/calendar#view`}>{t("Сбросить")}</Link>
          )}
        </AutoSubmitForm>

        {!p && <p className="muted" style={{ margin: 0 }}>{t("Выберите игрока, чтобы увидеть его календарь, или добавьте соперника — покажем, в каких турах они встретятся.")}</p>}

        {p && vs && (
          <div className="stack">
            <div className="pv-duel">
              <Summary id={p} />
              <div className="pv-vs">
                <span>VS</span>
                <small className="muted">
                  {(() => {
                    const done = meetings.filter((m) => m.status === "completed");
                    const pw = done.filter((m) => m.winner_entry_id === p).length;
                    return done.length ? `${pw} : ${done.length - pw}` : t("ещё не играли");
                  })()}
                </small>
              </div>
              <Summary id={vs} />
            </div>
            {meetings.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="c" style={{ width: 64 }}>{t("Тур")}</th>
                      <th>{t("Крайний день")}</th>
                      <th>{t("Матч")}</th>
                      <th>{t("Время")}</th>
                      <th>{t("Итог")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meetings.map((m) => {
                      const tour = tourMap.get(m.round)!;
                      return (
                        <tr key={m.id} className={m.round === current ? "row-current" : undefined}>
                          <td className="c num" style={{ fontWeight: 700 }}><a href={`#tour-${m.round}`}>{m.round}</a></td>
                          <td className="muted">{tour.deadline ? fmtDate(tour.deadline, tz, t) : "—"}</td>
                          <td style={{ fontWeight: 600 }}>
                            <Link href={`/match/${m.id}`}>{m.home_name} — {m.away_name}</Link>
                            <div className="small faint">{m.home_entry_id === p ? t("{name} дома", { name: nameOf.get(p) }) : t("{name} в гостях", { name: nameOf.get(p) })}</div>
                          </td>
                          <td>{m.status === "completed" ? <span className="faint small">—</span> : whenCell(m)}</td>
                          <td>{resultBadge(m, p) ?? <span className="faint small">{t("не сыгран")}</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">{t("Эти игроки не встречаются в этом соревновании")}</div>
            )}
          </div>
        )}

        {p && !vs && (
          <div className="stack">
            <Summary id={p} />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="c" style={{ width: 64 }}>{t("Тур")}</th>
                    <th>{t("Крайний день")}</th>
                    <th>{t("Соперник")}</th>
                    <th className="c hide-s">{t("Где")}</th>
                    <th>{t("Итог")}</th>
                  </tr>
                </thead>
                <tbody>
                  {fixtures.map(({ tour, m }) => {
                    const isCurrent = tour.round === current;
                    if (!m)
                      return (
                        <tr key={tour.round}>
                          <td className="c num">{tour.round}</td>
                          <td className="muted">{tour.deadline ? fmtDate(tour.deadline, tz, t) : "—"}</td>
                          <td colSpan={3} className="faint">{t("Выходной тур")}</td>
                        </tr>
                      );
                    const home = m.home_entry_id === p;
                    const opp = (home ? m.away_entry_id : m.home_entry_id) ?? "";
                    const overdue = !!tour.deadline && tour.deadline.getTime() < now && m.status !== "completed";
                    return (
                      <tr key={tour.round} className={isCurrent ? "row-current" : undefined}>
                        <td className="c num" style={{ fontWeight: 700 }}>{tour.round}</td>
                        <td className={overdue ? "" : "muted"} style={overdue ? { color: "var(--danger)" } : undefined}>
                          {tour.deadline ? fmtDate(tour.deadline, tz, t) : "—"}
                          {isCurrent && <span className="badge accent" style={{ marginLeft: 8 }}>{t("сейчас")}</span>}
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          <Link href={href(p, opp)} title={t("Сравнить с этим соперником")}>{nameOf.get(opp) ?? "?"}</Link>
                        </td>
                        <td className="c hide-s">{home ? t("Дома") : t("В гостях")}</td>
                        <td>
                          <Link href={`/match/${m.id}`} className="plain-link">{resultBadge(m, p) ?? whenCell(m)}</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="small faint" style={{ margin: 0 }}>{t("Нажмите на соперника, чтобы сравнить игроков и увидеть все их встречи.")}</p>
          </div>
        )}
      </section>

      <section className="stack">
        <h3>{t("Все туры")}</h3>
        <div className="tours">
          {tours.map((tour) => {
            const playing = new Set(tour.matches.flatMap((m) => [m.home_entry_id, m.away_entry_id]));
            const resting = confirmed.filter((e) => !playing.has(e.id));
            const state = tourState(tour);
            return (
              <article key={tour.round} id={`tour-${tour.round}`} className={`tour-card${state === "now" ? " is-current" : ""}${state === "done" ? " is-done" : ""}`}>
                <header>
                  <b>{t("Тур {n}", { n: tour.round })}</b>
                  <span className="small muted">
                    {state === "now" ? `● ${t("идёт")} · ` : state === "done" ? `✓ ${t("сыгран")} · ` : ""}
                    {tour.deadline ? t("до {date}", { date: fmtDate(tour.deadline, tz, t) }) : ""}
                  </span>
                </header>
                <ul>
                  {tour.matches.map((m) => {
                    const hl = vs ? involves(m, p) && involves(m, vs) : p ? involves(m, p) : !!myEntry && involves(m, myEntry.id);
                    const score = m.status === "completed" ? (m.forfeit ? t("ТП") : m.games?.length ? scoreOf(m).join(":") : "✓") : "vs";
                    return (
                      <li key={m.id} className={hl ? "mine" : undefined}>
                        <Link href={`/match/${m.id}`}>
                          <span className={`t-home${m.status === "completed" && m.winner_entry_id === m.home_entry_id ? " win" : ""}`}>{m.home_name ?? "?"}</span>
                          <span className={`t-score${m.status === "completed" ? " done" : ""}`}>{score}</span>
                          <span className={`t-away${m.status === "completed" && m.winner_entry_id === m.away_entry_id ? " win" : ""}`}>{m.away_name ?? "?"}</span>
                        </Link>
                        {stage === "group" && m.group_name && <span className="t-group">{groupLabel(m.group_name, t)}</span>}
                      </li>
                    );
                  })}
                </ul>
                {stage === "league" && resting.length > 0 && <footer className="small faint">{t("Отдыхает: {names}", { names: resting.map((e) => e.name).join(", ") })}</footer>}
                {teams.get(tour.round) && (
                  <div className="totw-strip">
                    <a href={`/api/totw/${comp.id}/${tour.round}?stage=${stage}&lang=${t.locale}`} target="_blank" rel="noopener" className="totw-label">
                      🃏 {t("Команда тура")}
                    </a>
                    {teams.get(tour.round)!.map((p, i) => (
                      <Link key={p.user_id} href={`/players/${p.user_id}`} className={`totw-chip${i === 0 ? " first" : ""}`}>
                        {p.nickname}
                      </Link>
                    ))}
                  </div>
                )}
                {(() => {
                  const poll = polls.get(tour.round);
                  if (!poll) return null;
                  const data = pollData.get(tour.round);
                  if (data) {
                    const total = data.list.reduce((s2, n) => s2 + n.votes, 0);
                    return (
                      <div className="poll">
                        <div className="poll-head">
                          <b>⭐ {t("Игрок тура")}</b>
                          <span className="small muted">{t("голосование до {when}", { when: fmtDateTime(poll.closes_at, tz, t) })}</span>
                        </div>
                        <form action={voteAction} className="poll-list">
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="competition_id" value={comp.id} />
                          <input type="hidden" name="stage" value={stage} />
                          <input type="hidden" name="round" value={tour.round} />
                          {data.list.map((n) => {
                            const share = total ? Math.round((n.votes / total) * 100) : 0;
                            const self = user?.id === n.user_id;
                            return (
                              <SubmitButton
                                key={n.user_id}
                                className={`poll-option${data.mine === n.user_id ? " chosen" : ""}`}
                                name="nominee"
                                value={n.user_id}
                                disabled={!user || self}
                                quiet
                              >
                                <span className="poll-bar" style={{ width: `${share}%` }} aria-hidden />
                                <span className="poll-name">
                                  {data.mine === n.user_id ? "✓ " : ""}
                                  {n.nickname}
                                  <small className="faint"> {n.won ? t("В") : t("П")}{n.score ? ` ${n.score}` : ""}</small>
                                </span>
                                <span className="poll-votes num">{n.votes}</span>
                              </SubmitButton>
                            );
                          })}
                        </form>
                        {!user && <p className="small faint" style={{ margin: 0 }}>{t("Войдите, чтобы проголосовать")}</p>}
                      </div>
                    );
                  }
                  return poll.winner_name ? (
                    <div className="poll-winner">
                      ⭐ {t("Игрок тура")}: <Link href={`/players/${poll.winner_id}`}>{poll.winner_name}</Link>
                      <span className="small faint"> · {t("голосов: {n}", { n: poll.winner_votes })}</span>
                    </div>
                  ) : null;
                })()}
              </article>
            );
          })}
        </div>
      </section>
      <p className="small faint">{t("Время указано в часовом поясе {tz}.", { tz })}</p>
    </div>
  );
}
