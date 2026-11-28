import Link from "next/link";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { Icon } from "@/components/Icon";
import { Flash, type SP } from "@/components/ui";
import { Countdown, SubmitButton } from "@/components/client";
import { Coin } from "@/components/shop";
import { Avatar, Nick } from "@/components/Badge";
import { eventState, eventLeaderboard } from "@/lib/events";
import { claimMilestoneAction } from "@/app/actions/events";
import { EVENTS, EVENT_POINTS, currentEvent, nextEvent, eventStart, eventEnd } from "@/lib/engine/events";
import { findItem } from "@/lib/engine/shop";
import { fmtDate } from "@/lib/format";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("События") };
}

const itemIcon = (id: string) => {
  const [kind, key] = id.split(":");
  return kind === "tag" ? `t-${key}` : kind === "avatar" ? `av-${key}` : "r-coins";
};

export default async function Events({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const user = await getUser();
  const live = currentEvent();
  const ev = live ?? nextEvent();
  const st = ev ? await eventState(user?.id ?? null, ev) : null;
  const board = ev && live ? await eventLeaderboard(ev) : [];
  const now = Date.now();

  return (
    <div className="wrap section stack-lg">
      <Flash sp={sp} />
      {ev && st ? (
        <header className="ev-hero" style={{ ["--c1" as string]: ev.theme.c1, ["--c2" as string]: ev.theme.c2, ["--glow" as string]: ev.theme.glow }}>
          <div className="ev-hero-art"><Icon name={ev.icon} size={120} /></div>
          <div className="stack" style={{ gap: 8 }}>
            <span className="ev-kicker">{live ? t("Событие месяца · идёт сейчас") : t("Скоро · следующее событие")}</span>
            <h1 className="ev-title">{ev.name}</h1>
            <p className="ev-desc">{t(ev.desc)}</p>
            <div className="row" style={{ gap: 8 }}>
              <span className="ev-boost">XP ×{ev.boost}</span>
              <span className="ev-chip">{fmtDate(eventStart(ev), "Asia/Tashkent", t)} — {fmtDate(new Date(eventEnd(ev).getTime() - 1), "Asia/Tashkent", t)}</span>
            </div>
            <Countdown to={(live ? eventEnd(ev) : eventStart(ev)).toISOString()} />
          </div>
          {user && live && (
            <div className="ev-points">
              <b className="num">{st.points}</b>
              <span>{t("очков события")}</span>
            </div>
          )}
        </header>
      ) : (
        <div className="empty">{t("Новых событий пока нет — загляните позже.")}</div>
      )}

      {ev && st && (
        <section className="stack" id="milestones">
          <h2 className="hall-title"><Icon name="ui-event" size={26} /> {t("Награды события")}</h2>
          <div className="ev-track">
            {st.milestones.map((m) => {
              const item = m.reward.item ? findItem(m.reward.item) : null;
              const pct = Math.min(100, Math.round((st.points / m.points) * 100));
              return (
                <div key={m.ref} className={`ev-step${m.reached ? " on" : ""}${m.claimed ? " done" : ""}${item ? " big" : ""}`}>
                  <span className="ev-need num">{m.points}</span>
                  {item ? <Icon name={itemIcon(m.reward.item!)} size={56} /> : <Icon name="r-coins" size={44} />}
                  <b>{item ? item.name : <span className="row" style={{ gap: 4 }}><Coin /> {m.reward.coins}</span>}</b>
                  {item && <small className="muted">{t("Лимитированная награда")}</small>}
                  {m.claimed ? (
                    <Icon name="r-check" size={22} />
                  ) : m.reached && user && live ? (
                    <form action={claimMilestoneAction}>
                      <input type="hidden" name="ref" value={m.ref} />
                      <SubmitButton className="btn btn-sm">{t("Забрать")}</SubmitButton>
                    </form>
                  ) : (
                    <span className="ev-mini-bar"><i style={{ width: `${user && live ? pct : 0}%` }} /></span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="split">
        <section className="panel stack">
          <b>{t("Как получить очки")}</b>
          <div className="list">
            {[
              [t("Сыгранный матч"), EVENT_POINTS.match, "q-match"],
              [t("Победа в матче"), EVENT_POINTS.win, "q-win"],
              [t("Дуэль"), EVENT_POINTS.duel, "q-duel"],
              [t("Победа в дуэли"), EVENT_POINTS.duelWin, "ui-duels"],
              [t("Отсуженный матч"), EVENT_POINTS.refereed, "q-ref"],
              [t("Ежедневный вход"), EVENT_POINTS.checkin, "r-streak"],
            ].map(([label, pts, icon]) => (
              <div key={String(label)} className="list-row">
                <Icon name={String(icon)} size={26} />
                <span style={{ flex: 1 }}>{label}</span>
                <b className="num">+{pts}</b>
              </div>
            ))}
          </div>
          <span className="small muted">{t("Пока идёт событие, весь опыт боевого пропуска за игры умножается на {x}.", { x: ev?.boost ?? 1 })}</span>
          {!user && <Link className="btn btn-sm" href="/login?next=/events">{t("Войти и участвовать")}</Link>}
        </section>
        <aside className="panel stack">
          <b>{t("Лидеры события")}</b>
          {board.length ? (
            <div className="list">
              {board.map((r, i) => (
                <Link key={r.user_id} href={`/players/${r.user_id}`} className={`list-row${r.user_id === user?.id ? " me" : ""}`}>
                  <b className="num" style={{ width: 22 }}>{i + 1}</b>
                  <Avatar name={r.user.rl_nickname} avatar={r.user.avatar} size={28} />
                  <span style={{ flex: 1 }}><Nick name={r.user.rl_nickname} color={r.user.name_color} /></span>
                  <b className="num">{r.points}</b>
                </Link>
              ))}
            </div>
          ) : (
            <span className="small muted">{t("Пока никто не набрал очков — станьте первым.")}</span>
          )}
        </aside>
      </div>

      <section className="stack">
        <h2 style={{ fontSize: "1.2rem" }}>{t("Календарь событий")}</h2>
        <div className="ev-cal">
          {EVENTS.map((e) => {
            const state = eventEnd(e).getTime() <= now ? "past" : eventStart(e).getTime() <= now ? "live" : "soon";
            return (
              <div key={e.key} className={`ev-cal-card ${state}`} style={{ ["--c1" as string]: e.theme.c1, ["--c2" as string]: e.theme.c2 }}>
                <Icon name={e.icon} size={40} />
                <span>
                  <b>{e.name}</b>
                  <small className="muted" style={{ display: "block" }}>{fmtDate(eventStart(e), "Asia/Tashkent", t)}</small>
                </span>
                <span className="ev-chip">{state === "live" ? t("Идёт") : state === "past" ? t("Завершено") : t("Скоро")}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
