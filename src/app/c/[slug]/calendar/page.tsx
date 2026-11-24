import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompetitionBySlug, getMatches, getEntries, type Match } from "@/lib/data";
import { getUser } from "@/lib/auth";
import { fmtDate, fmtDateTime, groupLabel } from "@/lib/format";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Календарь") };
}

type Tour = { round: number; matches: Match[]; deadline: Date | null };

export default async function Calendar({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getT();
  const { slug } = await params;
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
  const [all, entries, user] = await Promise.all([getMatches(comp.id), getEntries(comp.id), getUser()]);
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
  const confirmed = entries.filter((e) => e.status === "confirmed");
  const myEntry = user ? confirmed.find((e) => e.members.some((m) => m.user_id === user.id)) : undefined;
  const nameOf = new Map(confirmed.map((e) => [e.id, e.name]));
  const last = tours[tours.length - 1].deadline;

  // My season: one row per tour, like a club's fixture list.
  const mine = myEntry
    ? tours.map((tour) => {
        const m = tour.matches.find((x) => x.home_entry_id === myEntry.id || x.away_entry_id === myEntry.id);
        return { tour, m };
      })
    : [];

  const resultCell = (m: Match, entryId: string) => {
    if (m.status === "completed") {
      const home = m.home_entry_id === entryId;
      const won = m.winner_entry_id === entryId;
      const score = m.forfeit ? t("ТП") : home ? `${m.home_wins}:${m.away_wins}` : `${m.away_wins}:${m.home_wins}`;
      return <span className={`badge ${won ? "ok" : "danger"}`}>{won ? t("В") : t("П")} {score}</span>;
    }
    if (m.scheduled_at) return <span className="small">{fmtDateTime(m.scheduled_at, tz, t)}{m.time_confirmed ? " ✓" : ""}</span>;
    return <span className="faint small">{t("время не согласовано")}</span>;
  };

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <h2 style={{ fontSize: "1.4rem" }}>{t("Календарь сезона")}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {t("Туров: {n}", { n: tours.length })}
          {last && ` · ${t("последний тур до {date}", { date: fmtDate(last, tz, t) })}`}
          {comp.double_round_robin && ` · ${t("каждый с каждым дома и в гостях")}`}
        </p>
      </div>

      {myEntry && (
        <section className="stack">
          <h3>{t("Мои соперники по турам")}</h3>
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
                {mine.map(({ tour, m }) => {
                  const isCurrent = tour.round === current;
                  if (!m)
                    return (
                      <tr key={tour.round}>
                        <td className="c num">{tour.round}</td>
                        <td className="muted">{tour.deadline ? fmtDate(tour.deadline, tz, t) : "—"}</td>
                        <td colSpan={3} className="faint">{t("Выходной тур")}</td>
                      </tr>
                    );
                  const home = m.home_entry_id === myEntry.id;
                  const opp = home ? m.away_entry_id : m.home_entry_id;
                  return (
                    <tr key={tour.round} className={isCurrent ? "row-current" : undefined}>
                      <td className="c num" style={{ fontWeight: 700 }}>{tour.round}</td>
                      <td className={tour.deadline && new Date(tour.deadline).getTime() < now && m.status !== "completed" ? "" : "muted"}>
                        {tour.deadline ? fmtDate(tour.deadline, tz, t) : "—"}
                        {isCurrent && <span className="badge accent" style={{ marginLeft: 8 }}>{t("сейчас")}</span>}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        <Link href={`/match/${m.id}`}>{nameOf.get(opp ?? "") ?? "?"}</Link>
                      </td>
                      <td className="c hide-s">{home ? t("Дома") : t("В гостях")}</td>
                      <td>{resultCell(m, myEntry.id)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small faint" style={{ margin: 0 }}>{t("«Дома» — вы создаёте лобби. Время с соперником договаривайтесь на странице матча до крайнего дня тура.")}</p>
        </section>
      )}

      <section className="stack">
        <h3>{t("Все туры")}</h3>
        <div className="tours">
          {tours.map((tour) => {
            const playing = new Set(tour.matches.flatMap((m) => [m.home_entry_id, m.away_entry_id]));
            const resting = confirmed.filter((e) => !playing.has(e.id));
            const done = tour.matches.every((m) => m.status === "completed");
            return (
              <article key={tour.round} id={`tour-${tour.round}`} className={`tour-card${tour.round === current ? " is-current" : ""}${done ? " is-done" : ""}`}>
                <header>
                  <b>{t("Тур {n}", { n: tour.round })}</b>
                  <span className="small muted">
                    {tour.round === current ? `● ${t("идёт")} · ` : done ? `✓ ${t("сыгран")} · ` : ""}
                    {tour.deadline ? t("до {date}", { date: fmtDate(tour.deadline, tz, t) }) : ""}
                  </span>
                </header>
                <ul>
                  {tour.matches.map((m) => {
                    const isMine = !!myEntry && (m.home_entry_id === myEntry.id || m.away_entry_id === myEntry.id);
                    const score = m.status === "completed" ? (m.forfeit ? t("ТП") : `${m.home_wins}:${m.away_wins}`) : t("vs");
                    return (
                      <li key={m.id} className={isMine ? "mine" : undefined}>
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
              </article>
            );
          })}
        </div>
      </section>
      <p className="small faint">{t("Время указано в часовом поясе {tz}.", { tz })}</p>
    </div>
  );
}
