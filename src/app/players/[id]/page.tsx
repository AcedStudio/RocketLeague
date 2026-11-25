import Link from "next/link";
import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { PLATFORM_LABELS, fmtDate } from "@/lib/format";
import { stageLabel } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { playerRatings, ratingHistory } from "@/lib/rating";
import { RatingCard, Delta } from "@/components/rating";
import { FutCard, STAT_LABELS } from "@/components/FutCard";
import { getPlayerCard } from "@/lib/cards";
import { STAT_KEYS } from "@/lib/engine/card";
import { playerAchievements } from "@/lib/achievements";

export const dynamic = "force-dynamic";

export default async function Player({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const u = await one<{ id: string; rl_nickname: string; platform: string; created_at: Date }>(
    "select id, rl_nickname, platform, created_at from users where id = $1",
    [id],
  );
  if (!u) notFound();

  const [entries, matches, awards, ratings, h1, h2, card, achievements] = await Promise.all([
    q<{ id: string; name: string; comp: string; slug: string; mode: string; status: string }>(
      `select e.id, e.name, c.name as comp, c.slug, c.mode, c.status
         from entry_members em join entries e on e.id = em.entry_id join competitions c on c.id = e.competition_id
        where em.user_id = $1 and em.active and c.status <> 'draft' order by e.created_at desc`,
      [id],
    ),
    q<{ id: string; stage: "group"; round: number; group_name: string | null; home_name: string; away_name: string; home_wins: number; away_wins: number; won: boolean; comp: string; forfeit: boolean; delta: number | null }>(
      `select m.id, m.stage, m.round, g.name as group_name, he.name as home_name, ae.name as away_name, m.home_wins, m.away_wins, m.forfeit,
              m.winner_entry_id in (select entry_id from entry_members where user_id = $1 and active) as won, c.name as comp,
              (select r.delta from rating_changes r where r.match_id = m.id and r.user_id = $1) as delta
         from matches m join competitions c on c.id = m.competition_id
         join entries he on he.id = m.home_entry_id join entries ae on ae.id = m.away_entry_id
         left join groups g on g.id = m.group_id
        where m.status = 'completed' and not m.is_bye
          and (m.home_entry_id in (select entry_id from entry_members where user_id = $1 and active)
            or m.away_entry_id in (select entry_id from entry_members where user_id = $1 and active))
        order by coalesce(m.completed_at, m.updated_at) desc limit 50`,
      [id],
    ),
    q<{ place: number; comp: string; slug: string; ended: Date }>(
      `select p.place, c.name as comp, c.slug, c.updated_at as ended from prizes p join competitions c on c.id = p.competition_id
        where c.status = 'finished' and p.place between 1 and 3 and p.recipient_entry_id in (select entry_id from entry_members where user_id = $1 and active)
        order by c.updated_at desc`,
      [id],
    ),
    playerRatings(id),
    ratingHistory(id, "1v1"),
    ratingHistory(id, "2v2"),
    getPlayerCard(id),
    playerAchievements(id),
  ]);
  const earned = achievements.filter((a) => a.done).length;
  const wins = matches.filter((m) => m.won).length;
  const losses = matches.length - wins;
  const medal = (p: number) => (p === 1 ? t("Чемпион") : p === 2 ? t("Финалист") : t("Бронза"));

  return (
    <div className="wrap section stack-lg">
      <div>
        <h1>{u.rl_nickname}</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          {PLATFORM_LABELS[u.platform]} · {t("на платформе с {date}", { date: fmtDate(u.created_at, "Asia/Tashkent", t) })}
        </p>
      </div>
      <div className="card-hero">
        {card && <FutCard card={card} />}
        <div className="stack">
          <div className="rating-cards">
            {ratings.map((r) => (
              <RatingCard key={r.mode} r={r} history={(r.mode === "1v1" ? h1 : h2).map((x) => x.rating)} />
            ))}
          </div>
          <ul className="fut-legend small muted">
            {STAT_KEYS.map((k) => (
              <li key={k}>
                <b>{k.toUpperCase()}</b>
                {t(STAT_LABELS[k])}
              </li>
            ))}
            <li>
              <b>OVR</b>
              {t("Общий рейтинг: считается из ELO")}
            </li>
          </ul>
        </div>
      </div>
      <div className="stat-strip">
        <div>
          <b className="num">{matches.length}</b>
          <span>{t("матчей")}</span>
        </div>
        <div>
          <b className="num">{wins}</b>
          <span>{t("побед")}</span>
        </div>
        <div>
          <b className="num">{losses}</b>
          <span>{t("поражений")}</span>
        </div>
        <div>
          <b className="num">{matches.length ? Math.round((wins / matches.length) * 100) : 0}%</b>
          <span>{t("побед в процентах")}</span>
        </div>
      </div>
      {awards.length > 0 && (
        <section className="stack">
          <h2 style={{ fontSize: "1.3rem" }}>{t("Достижения")}</h2>
          <div className="row">
            {awards.map((a, i) => (
              <Link key={i} href={`/c/${a.slug}`} className={`badge ${a.place === 1 ? "gold" : "dim"} plain`} style={{ height: 32, padding: "0 14px" }}>
                {medal(a.place)} · {a.comp}
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="stack" id="achievements">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ fontSize: "1.3rem" }}>🏅 {t("Значки")}</h2>
          <span className="small muted">{t("{n} из {total}", { n: earned, total: achievements.length })}</span>
        </div>
        <div className="ach-grid">
          {[...achievements].sort((a, b) => Number(b.done) - Number(a.done)).map((a) => {
            const pct = Math.min(100, Math.round((a.value / a.def.target) * 100));
            return (
              <div key={a.def.key} className={`ach${a.done ? " done" : ""}`} title={t(a.def.desc, { n: a.def.target })}>
                <span className="ach-icon" aria-hidden>{a.def.icon}</span>
                <span className="ach-text">
                  <b>{t(a.def.name)}</b>
                  <small>{t(a.def.desc, { n: a.def.target })}</small>
                  {a.done ? (
                    a.unlocked_at && <small className="faint">{fmtDate(a.unlocked_at, "Asia/Tashkent", t)}</small>
                  ) : (
                    <span className="ach-bar" aria-label={`${Math.min(a.value, a.def.target)} / ${a.def.target}`}>
                      <i style={{ width: `${pct}%` }} />
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <div className="split">
        <section className="stack">
          <h2 style={{ fontSize: "1.3rem" }}>{t("История матчей")}</h2>
          {matches.length ? (
            <div className="list">
              {matches.map((m) => (
                <Link key={m.id} href={`/match/${m.id}`} className="list-row">
                  <span className={`badge ${m.won ? "ok" : "danger"} plain`} style={{ width: 28, justifyContent: "center", padding: 0 }}>
                    {m.won ? t("В") : t("П")}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>
                      {m.home_name} {m.forfeit ? t("ТП") : `${m.home_wins}:${m.away_wins}`} {m.away_name}
                    </b>
                    <span className="small muted" style={{ display: "block" }}>
                      {m.comp} · {stageLabel(t, m)}
                    </span>
                  </span>
                  <Delta value={m.delta} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty">{t("Сыгранных матчей пока нет")}</div>
          )}
        </section>
        <aside className="stack">
          <h2 style={{ fontSize: "1.3rem" }}>{t("Соревнования")}</h2>
          {entries.length ? (
            <div className="list">
              {entries.map((e) => (
                <Link key={e.id} href={`/c/${e.slug}`} className="list-row">
                  <span>
                    <b>{e.comp}</b>
                    {e.mode === "2v2" && <span className="small muted" style={{ display: "block" }}>{t("Команда {team}", { team: e.name })}</span>}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty">{t("Нет")}</div>
          )}
        </aside>
      </div>
    </div>
  );
}
