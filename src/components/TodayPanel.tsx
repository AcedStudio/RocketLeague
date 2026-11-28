import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Avatar, Nick } from "@/components/Badge";
import { myTasks, type Task } from "@/lib/today";
import { fmtWhen, fmtDate } from "@/lib/format";
import { q } from "@/lib/db";
import type { T } from "@/lib/i18n/core";

function TaskCard({ task, t }: { task: Task; t: T }) {
  const s = task.step;
  const when = task.kind === "match" && task.step.key === "scheduled" && task.when
    ? fmtWhen(task.when, task.tz, t)
    : task.playBy && !["review", "confirm", "tbd"].includes(s.key)
      ? t("Сыграть до {date}", { date: fmtDate(task.playBy, task.tz, t) })
      : null;
  return (
    <Link href={task.href} className={`task tone-${s.tone}`}>
      <Avatar name={task.opponent.name} avatar={task.opponent.avatar} size={44} />
      <span className="task-main">
        <span className="task-vs">
          <small>vs</small> <b><Nick name={task.opponent.name} color={task.opponent.color} /></b>
        </span>
        <span className="task-ctx">
          <Icon name={task.kind === "duel" ? "ui-duels" : "ui-competitions"} size={14} /> {task.kind === "duel" ? t("Дуэль") : task.context}
          {when && <> · <b className="task-when">{when}</b></>}
        </span>
        <span className="task-step"><i className="task-dot" />{t(s.label)}</span>
      </span>
      <span className={`btn btn-sm task-cta${s.tone === "urgent" ? " btn-gold" : s.tone === "wait" ? " btn-ghost" : ""}`}>{t(s.cta)}</span>
    </Link>
  );
}

/** "Your games today": the first thing a signed-in player sees. */
export async function TodayPanel({ userId, nick, t, limit = 3, title = true }: { userId: string; nick?: string; t: T; limit?: number; title?: boolean }) {
  const tasks = await myTasks(userId);
  const shown = tasks.slice(0, limit);
  const urgent = tasks.filter((x) => x.step.tone === "urgent").length;
  const open = tasks.length
    ? []
    : await q<{ slug: string; name: string; mode: string }>(
        "select slug, name, mode from competitions where status = 'registration' order by start_at nulls last limit 2",
      );
  return (
    <section className="today">
      {title && (
        <div className="today-head">
          <div>
            <h2>{nick ? t("Привет, {name}!", { name: nick }) : t("Мои игры")}</h2>
            <span className="small muted">
              {tasks.length === 0
                ? t("Сейчас у вас нет матчей")
                : urgent
                  ? t("Нужно ваше действие: {n}", { n: urgent })
                  : t("Матчей впереди: {n}", { n: tasks.length })}
            </span>
          </div>
          {tasks.length > limit && (
            <Link href="/play" className="btn btn-ghost btn-sm">{t("Все мои игры ({n})", { n: tasks.length })}</Link>
          )}
        </div>
      )}
      {shown.length ? (
        <div className="tasks">{shown.map((x) => <TaskCard key={x.kind + x.id} task={x} t={t} />)}</div>
      ) : (
        <div className="today-empty">
          <Icon name="ui-competitions" size={40} />
          <span className="stack" style={{ gap: 4, flex: 1 }}>
            <b>{t("Хотите сыграть?")}</b>
            <span className="small muted">{t("Запишитесь в турнир или бросьте вызов любому игроку — это быстро.")}</span>
          </span>
          <span className="row" style={{ gap: 8 }}>
            {open[0] ? (
              <Link href={`/c/${open[0].slug}/register`} className="btn btn-gold btn-sm">{t("Записаться: {name}", { name: open[0].name })}</Link>
            ) : (
              <Link href="/competitions" className="btn btn-gold btn-sm">{t("Турниры")}</Link>
            )}
            <Link href="/duels" className="btn btn-ghost btn-sm"><Icon name="ui-duels" size={16} /> {t("Бросить вызов")}</Link>
          </span>
        </div>
      )}
    </section>
  );
}
