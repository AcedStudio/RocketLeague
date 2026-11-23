import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompetitionBySlug, entryCounts, getUserEntry, getAnnouncements, getPrizes } from "@/lib/data";
import { getUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { FORMAT_LABELS, PLATFORM_LABELS, fmtDateTime, fmtMoney, plural } from "@/lib/format";
import { TIEBREAKER_LABELS } from "@/lib/engine/standings.ts";
import { Countdown } from "@/components/client";
import { Flash, type SP } from "@/components/ui";
import { MyEntry } from "@/components/MyEntry";

export default async function Overview({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SP }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const comp = await getCompetitionBySlug(slug);
  if (!comp) notFound();
  const user = await getUser();
  const [counts, entry, news, prizes, progress] = await Promise.all([
    entryCounts(comp.id),
    user ? getUserEntry(comp.id, user.id) : null,
    getAnnouncements(comp.id, 5),
    getPrizes(comp.id),
    one<{ total: number; done: number }>(
      "select count(*) filter (where not is_bye)::int as total, count(*) filter (where status = 'completed' and not is_bye)::int as done from matches where competition_id = $1",
      [comp.id],
    ),
  ]);
  const prize = fmtMoney(comp.prize_pool, comp.prize_currency);
  const deadlinePassed = comp.registration_deadline && new Date(comp.registration_deadline).getTime() < Date.now();
  const canRegister = comp.status === "registration" && !deadlinePassed && !entry;
  const free = Math.max(0, comp.capacity - counts.active);
  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const champion = comp.status === "finished" ? prizes.find((p) => p.place === 1)?.recipient_name : null;

  return (
    <div className="stack-lg">
      <Flash sp={sp} />
      {champion && (
        <div className="champion-card">
          <span className="badge gold plain">Чемпион</span>
          <b>{champion}</b>
        </div>
      )}
      <div className="split">
        <div className="stack-lg">
          {user && entry && <MyEntry comp={comp} entry={entry} userId={user.id} />}

          {comp.status === "registration" && !entry && (
            <div className="panel stack">
              <div className="row between">
                <h2 style={{ fontSize: "1.4rem" }}>Регистрация открыта</h2>
                <span className="badge ok">
                  {free > 0 ? `${free} ${plural(free, "место свободно", "места свободно", "мест свободно")}` : "Мест нет — лист ожидания"}
                </span>
              </div>
              {comp.registration_deadline && (
                <p className="muted">
                  Приём заявок до {fmtDateTime(comp.registration_deadline, comp.timezone)} ({comp.timezone})
                </p>
              )}
              {canRegister ? (
                <div className="row">
                  <Link className="btn btn-lg" href={`/c/${comp.slug}/register`}>
                    {comp.mode === "2v2" ? "Создать команду" : "Зарегистрироваться"}
                  </Link>
                  {comp.mode === "2v2" && <span className="small muted">Получили ссылку от капитана? Просто откройте её.</span>}
                </div>
              ) : (
                <p className="muted">Срок регистрации истёк.</p>
              )}
            </div>
          )}

          {comp.start_at && new Date(comp.start_at).getTime() > Date.now() && (
            <div className="stack" style={{ gap: 10 }}>
              <span className="small muted">До старта</span>
              <Countdown to={new Date(comp.start_at).toISOString()} />
            </div>
          )}

          {comp.description && (
            <div className="stack">
              <h2 style={{ fontSize: "1.4rem" }}>О соревновании</h2>
              <p className="muted prose" style={{ whiteSpace: "pre-line" }}>{comp.description}</p>
            </div>
          )}

          {progress && progress.total > 0 && (
            <div className="stack" style={{ gap: 8 }}>
              <div className="row between small">
                <span className="muted">Прогресс турнира</span>
                <span className="num">
                  {progress.done} из {progress.total} матчей · {pct}%
                </span>
              </div>
              <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <i style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {news.length > 0 && (
            <div className="stack">
              <h2 style={{ fontSize: "1.4rem" }}>Объявления</h2>
              <div className="list">
                {news.map((a) => (
                  <article key={a.id} className="list-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
                    <h3>{a.title}</h3>
                    <p className="muted small" style={{ whiteSpace: "pre-line" }}>{a.body}</p>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="panel">
          <dl className="facts-list">
            <dt>Формат</dt>
            <dd>{FORMAT_LABELS[comp.format]}</dd>
            <dt>Режим</dt>
            <dd>{comp.mode === "1v1" ? "1v1, индивидуально" : "2v2, команды по 2 игрока"}</dd>
            <dt>Участники</dt>
            <dd className="num">
              {counts.active} / {comp.capacity}
              {counts.waitlist > 0 && <span className="muted small"> · ожидают {counts.waitlist}</span>}
            </dd>
            <dt>Старт</dt>
            <dd>{fmtDateTime(comp.start_at, comp.timezone)}</dd>
            <dt>Часовой пояс</dt>
            <dd>{comp.timezone}</dd>
            <dt>Регион сервера</dt>
            <dd>{comp.region}</dd>
            <dt>Платформы</dt>
            <dd>{comp.platforms.map((p) => PLATFORM_LABELS[p] ?? p).join(", ")}</dd>
            {comp.format === "groups_knockout" && (
              <>
                <dt>Группы</dt>
                <dd>
                  {comp.group_count}, из каждой выходят {comp.qualifiers_per_group}
                </dd>
              </>
            )}
            <dt>Серии</dt>
            <dd>
              {comp.format !== "knockout" && `${comp.format === "round_robin" ? "Тур" : "Группы"}: Bo${comp.group_best_of}. `}
              {comp.format !== "round_robin" && `Плей-офф: Bo${comp.playoff_best_of}, финал: Bo${comp.final_best_of}`}
            </dd>
            {comp.format !== "knockout" && (
              <>
                <dt>Очки</dt>
                <dd>
                  Победа {comp.points_win}, поражение {comp.points_loss}
                </dd>
                <dt>При равенстве</dt>
                <dd>{comp.tiebreakers.map((t) => TIEBREAKER_LABELS[t]).join(" → ")}</dd>
              </>
            )}
            <dt>Призовой фонд</dt>
            <dd style={{ color: prize ? "var(--gold)" : undefined }}>{prize ?? "Не объявлен"}</dd>
          </dl>
          <div className="row" style={{ marginTop: 20 }}>
            <Link href="/rules" className="btn btn-ghost btn-sm">
              Правила
            </Link>
            <Link href={`/c/${comp.slug}/prizes`} className="btn btn-ghost btn-sm">
              Призы
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
