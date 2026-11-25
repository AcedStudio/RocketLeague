import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompetitionBySlug, getMatches, getEntries } from "@/lib/data";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Flash, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { predictAction } from "@/app/actions/fun";
import { predictionTable, myPredictions, predictionLocked, POINTS } from "@/lib/predictions";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Прогнозы") };
}

export default async function Predictions({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SP }) {
  const t = await getT();
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const comp = await getCompetitionBySlug(slug);
  if (!comp) notFound();
  if (comp.draw_state !== "published") return <div className="empty">{t("Прогнозы откроются после жеребьёвки")}</div>;

  const [matches, entries, user, table] = await Promise.all([getMatches(comp.id), getEntries(comp.id), getUser(), predictionTable(comp.id)]);
  const mine = user ? await myPredictions(comp.id, user.id) : [];
  const myPick = new Map(mine.map((p) => [p.match_id, p]));
  const myEntries = new Set(user ? entries.filter((e) => e.members.some((m) => m.user_id === user.id)).map((e) => e.id) : []);
  const tz = comp.timezone;

  const real = matches.filter((m) => !m.is_bye && m.home_entry_id && m.away_entry_id);
  // Open for picks: the next two tours that still have unplayed matches.
  const openRounds = [...new Set(real.filter((m) => !predictionLocked(m)).map((m) => `${m.stage}:${m.round}`))].slice(0, 2);
  const open = real.filter((m) => openRounds.includes(`${m.stage}:${m.round}`) && !predictionLocked(m));
  const scored = real.filter((m) => m.status === "completed" && myPick.has(m.id)).sort((a, b) => b.round - a.round).slice(0, 12);
  const meRow = user ? table.find((r) => r.user_id === user.id) : undefined;

  return (
    <div className="stack-lg">
      <Flash sp={sp} />
      <div className="stack-sm">
        <h2 style={{ fontSize: "1.4rem" }}>🔮 {t("Прогнозы")}</h2>
        <p className="muted" style={{ margin: 0, maxWidth: 680 }}>
          {t("Угадайте счёт матчей до их начала. Точный счёт — {exact} очка, верный победитель и разница — {margin}, просто победитель — {winner}. Свои матчи прогнозировать нельзя.", {
            exact: POINTS.exact,
            margin: POINTS.margin,
            winner: POINTS.winner,
          })}
        </p>
      </div>

      <div className="split">
        <section className="stack">
          <h3>{t("Сделать прогноз")}</h3>
          {!user ? (
            <div className="empty">
              <Link className="btn" href={`/login?next=/c/${slug}/predictions`}>{t("Войдите, чтобы делать прогнозы")}</Link>
            </div>
          ) : open.length ? (
            <form action={predictAction} className="stack">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="competition_id" value={comp.id} />
              <div className="list">
                {open.map((m) => {
                  const own = myEntries.has(m.home_entry_id!) || myEntries.has(m.away_entry_id!);
                  const p = myPick.get(m.id);
                  return (
                    <div key={m.id} className="list-row pick-row">
                      <span className="pick-meta small muted">
                        {t("Тур {n}", { n: m.round })} · {m.scheduled_at ? fmtDateTime(m.scheduled_at, tz, t) : m.play_by ? t("до {date}", { date: fmtDate(m.play_by, tz, t) }) : ""}
                        {m.best_of > 1 && ` · Bo${m.best_of}`}
                      </span>
                      <span className="pick-team right">{m.home_name}</span>
                      {own ? (
                        <span className="pick-own small faint">{t("ваш матч")}</span>
                      ) : (
                        <span className="pick-inputs">
                          <input className="input num" name={`h_${m.id}`} inputMode="numeric" pattern="[0-9]*" maxLength={2} defaultValue={p?.home ?? ""} aria-label={`${m.home_name}`} />
                          <span>:</span>
                          <input className="input num" name={`a_${m.id}`} inputMode="numeric" pattern="[0-9]*" maxLength={2} defaultValue={p?.away ?? ""} aria-label={`${m.away_name}`} />
                        </span>
                      )}
                      <span className="pick-team">{m.away_name}</span>
                    </div>
                  );
                })}
              </div>
              <div className="row">
                <SubmitButton className="btn">{t("Сохранить прогнозы")}</SubmitButton>
                <span className="small faint">{t("Можно менять до начала матча.")}</span>
              </div>
            </form>
          ) : (
            <div className="empty">{t("Сейчас нет матчей для прогноза")}</div>
          )}

          {scored.length > 0 && (
            <>
              <h3>{t("Мои прогнозы")}</h3>
              <div className="list">
                {scored.map((m) => {
                  const p = myPick.get(m.id)!;
                  const actual = m.best_of === 1 ? `${m.home_goals}:${m.away_goals}` : `${m.home_wins}:${m.away_wins}`;
                  return (
                    <Link key={m.id} href={`/match/${m.id}`} className="list-row">
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <b>{m.home_name} — {m.away_name}</b>
                        <span className="small muted" style={{ display: "block" }}>
                          {t("Ваш прогноз {pick} · итог {actual}", { pick: `${p.home}:${p.away}`, actual: m.forfeit ? t("ТП") : actual })}
                        </span>
                      </span>
                      <span className={`badge ${p.points ? (p.points === POINTS.exact ? "gold" : "ok") : "dim"} plain`}>+{p.points ?? 0}</span>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <aside className="stack">
          <h3>{t("Таблица прогнозистов")}</h3>
          {meRow && (
            <p className="small muted" style={{ margin: 0 }}>
              {t("Вы: {place} место · {points} очков", { place: table.indexOf(meRow) + 1, points: meRow.points })}
            </p>
          )}
          {table.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="c">#</th>
                    <th>{t("Игрок")}</th>
                    <th className="c">{t("Очки")}</th>
                    <th className="c" title={t("Точный счёт")}>🎯</th>
                    <th className="c hide-s">{t("Прогнозов")}</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((r, i) => (
                    <tr key={r.user_id} className={user?.id === r.user_id ? "mine" : undefined}>
                      <td className={`c num${i < 3 ? " rank-top" : ""}`}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}><Link href={`/players/${r.user_id}`}>{r.nickname}</Link></td>
                      <td className="c num" style={{ fontWeight: 700 }}>{r.points}</td>
                      <td className="c num">{r.exact}</td>
                      <td className="c num hide-s">{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">{t("Пока никто не сделал прогноз — будьте первым")}</div>
          )}
        </aside>
      </div>
    </div>
  );
}
