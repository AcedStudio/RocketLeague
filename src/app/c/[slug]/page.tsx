import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompetitionBySlug, entryCounts, getUserEntry, getAnnouncements, getPrizes } from "@/lib/data";
import { getUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { FORMAT_LABELS, PLATFORM_LABELS, fmtDateTime, fmtMoney } from "@/lib/format";
import { TIEBREAKER_LABELS } from "@/lib/engine/standings.ts";
import { Countdown } from "@/components/client";
import { Flash, type SP } from "@/components/ui";
import { MyEntry } from "@/components/MyEntry";

export default async function Overview({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SP }) {
  const t = await getT();
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
  const prize = fmtMoney(comp.prize_pool, comp.prize_currency, t.intl);
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
          <span className="badge gold plain">{t("Чемпион")}</span>
          <b>{champion}</b>
        </div>
      )}
      <div className="split">
        <div className="stack-lg">
          {user && entry && <MyEntry comp={comp} entry={entry} userId={user.id} />}

          {comp.status === "registration" && !entry && (
            <div className="panel stack">
              <div className="row between">
                <h2 style={{ fontSize: "1.4rem" }}>{t("Регистрация открыта")}</h2>
                <span className="badge ok">
                  {free > 0 ? t("Свободно мест: {n}", { n: free }) : t("Мест нет, работает лист ожидания")}
                </span>
              </div>
              {comp.registration_deadline && (
                <p className="muted">
                  {t("Приём заявок до {date} ({tz})", { date: fmtDateTime(comp.registration_deadline, comp.timezone, t), tz: comp.timezone })}
                </p>
              )}
              {canRegister ? (
                <div className="row">
                  <Link className="btn btn-lg" href={`/c/${comp.slug}/register`}>
                    {comp.mode === "2v2" ? t("Создать команду") : t("Зарегистрироваться")}
                  </Link>
                  {comp.mode === "2v2" && <span className="small muted">{t("Получили ссылку от капитана? Просто откройте её.")}</span>}
                </div>
              ) : (
                <p className="muted">{t("Срок регистрации истёк.")}</p>
              )}
            </div>
          )}

          {comp.start_at && new Date(comp.start_at).getTime() > Date.now() && (
            <div className="stack" style={{ gap: 10 }}>
              <span className="small muted">{t("До старта")}</span>
              <Countdown to={new Date(comp.start_at).toISOString()} />
            </div>
          )}

          {comp.description && (
            <div className="stack">
              <h2 style={{ fontSize: "1.4rem" }}>{t("О соревновании")}</h2>
              <p className="muted prose" style={{ whiteSpace: "pre-line" }}>{comp.description}</p>
            </div>
          )}

          {progress && progress.total > 0 && (
            <div className="stack" style={{ gap: 8 }}>
              <div className="row between small">
                <span className="muted">{t("Прогресс турнира")}</span>
                <span className="num">
                  {t("{done} из {total} матчей", { done: progress.done, total: progress.total })} · {pct}%
                </span>
              </div>
              <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <i style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {news.length > 0 && (
            <div className="stack">
              <h2 style={{ fontSize: "1.4rem" }}>{t("Объявления")}</h2>
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
            <dt>{t("Формат")}</dt>
            <dd>{t(FORMAT_LABELS[comp.format])}</dd>
            <dt>{t("Режим")}</dt>
            <dd>{comp.mode === "1v1" ? t("1v1, индивидуально") : t("2v2, команды по 2 игрока")}</dd>
            <dt>{t("Участники")}</dt>
            <dd className="num">
              {counts.active} / {comp.capacity}
              {counts.waitlist > 0 && <span className="muted small"> · {t("в листе ожидания: {n}", { n: counts.waitlist })}</span>}
            </dd>
            <dt>{t("Старт")}</dt>
            <dd>{fmtDateTime(comp.start_at, comp.timezone, t)}</dd>
            <dt>{t("Часовой пояс")}</dt>
            <dd>{comp.timezone}</dd>
            <dt>{t("Регион сервера")}</dt>
            <dd>{comp.region}</dd>
            <dt>{t("Платформы")}</dt>
            <dd>{comp.platforms.map((p) => PLATFORM_LABELS[p] ?? p).join(", ")}</dd>
            {comp.format === "groups_knockout" && (
              <>
                <dt>{t("Группы")}</dt>
                <dd>
                  {t("{groups}, из каждой выходят {q}", { groups: comp.group_count, q: comp.qualifiers_per_group })}
                </dd>
              </>
            )}
            <dt>{t("Серии")}</dt>
            <dd>
              {comp.format !== "knockout" && `${comp.format === "round_robin" ? t("Тур") : t("Группы")}: Bo${comp.group_best_of}. `}
              {comp.format !== "round_robin" && t("Плей-офф: Bo{p}, финал: Bo{f}", { p: comp.playoff_best_of, f: comp.final_best_of })}
            </dd>
            {comp.format !== "knockout" && (
              <>
                <dt>{t("Очки")}</dt>
                <dd>
                  {t("Победа {w}, поражение {l}", { w: comp.points_win, l: comp.points_loss })}
                </dd>
                <dt>{t("При равенстве")}</dt>
                <dd>{comp.tiebreakers.map((tb) => t(TIEBREAKER_LABELS[tb])).join(" → ")}</dd>
              </>
            )}
            <dt>{t("Призовой фонд")}</dt>
            <dd style={{ color: prize ? "var(--gold)" : undefined }}>{prize ?? t("Не объявлен")}</dd>
          </dl>
          <div className="row" style={{ marginTop: 20 }}>
            <Link href="/rules" className="btn btn-ghost btn-sm">
              {t("Правила")}
            </Link>
            <Link href={`/c/${comp.slug}/prizes`} className="btn btn-ghost btn-sm">
              {t("Призы")}
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
