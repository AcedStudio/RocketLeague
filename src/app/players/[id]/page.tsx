import Link from "next/link";
import { notFound } from "next/navigation";
import { q, one } from "@/lib/db";
import { PLATFORM_LABELS, fmtDate, scoreOf } from "@/lib/format";
import { stageLabel } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { playerRatings, ratingHistory } from "@/lib/rating";
import { RatingCard, Delta } from "@/components/rating";
import { FutCard, STAT_LABELS } from "@/components/FutCard";
import { getPlayerCard } from "@/lib/cards";
import { STAT_KEYS } from "@/lib/engine/card";
import { playerAchievements } from "@/lib/achievements";
import { playerRivals } from "@/lib/rivals";
import { playerInForms } from "@/lib/totw";
import { duelRecord } from "@/lib/duels";
import { playerLevel } from "@/lib/levels";
import { allDerbies } from "@/lib/derby";
import { playerSeasons } from "@/lib/wrapped";
import { UserBadge, Nick, Avatar } from "@/components/Badge";
import { bannerClass, iconOf } from "@/lib/engine/shop";
import { Icon } from "@/components/Icon";
import { Crest } from "@/components/Crest";
import { clubOf } from "@/lib/clubs";
import { getUser } from "@/lib/auth";
import { challengeAction } from "@/app/actions/duels";
import { SubmitButton } from "@/components/client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return {};
  const [card, t] = await Promise.all([getPlayerCard(id), getT()]);
  if (!card) return {};
  const description = t("Карточка игрока: OVR {ovr} · матчей {n} · побед {w}", { ovr: card.stats.ovr, n: card.stats.played, w: card.stats.wins });
  return {
    title: card.nickname,
    description,
    openGraph: { title: card.nickname, description, images: [{ url: `/api/card/${id}?lang=${t.locale}`, width: 400, height: 560 }] },
    twitter: { card: "summary" },
  };
}

export default async function Player({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const u = await one<{ id: string; rl_nickname: string; platform: string; created_at: Date; equipped_badge: string | null; name_color: string | null; banner: string | null; avatar: string | null }>(
    "select id, rl_nickname, platform, created_at, equipped_badge, name_color, banner, avatar from users where id = $1",
    [id],
  );
  if (!u) notFound();
  const club = await clubOf(u.id);

  const [entries, matches, awards, ratings, h1, h2, card, achievements, rivals, informs, duels, viewer, lvl, derbyList, seasons] = await Promise.all([
    q<{ id: string; name: string; comp: string; slug: string; mode: string; status: string }>(
      `select e.id, e.name, c.name as comp, c.slug, c.mode, c.status
         from entry_members em join entries e on e.id = em.entry_id join competitions c on c.id = e.competition_id
        where em.user_id = $1 and em.active and c.status <> 'draft' order by e.created_at desc`,
      [id],
    ),
    q<{ id: string; stage: "group"; round: number; group_name: string | null; home_name: string; away_name: string; home_wins: number; away_wins: number; best_of: number; games: { home: number; away: number }[] | null; won: boolean; comp: string; forfeit: boolean; delta: number | null }>(
      `select m.id, m.stage, m.round, g.name as group_name, he.name as home_name, ae.name as away_name, m.home_wins, m.away_wins, m.best_of, m.games, m.forfeit,
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
    playerRivals(id),
    playerInForms(id),
    duelRecord(id),
    getUser(),
    playerLevel(id),
    allDerbies(),
    playerSeasons(id),
  ]);
  const derbyWith = new Set(derbyList.filter((d) => d.a === id || d.b === id).map((d) => (d.a === id ? d.b : d.a)));
  const earned = achievements.filter((a) => a.done).length;
  const wins = matches.filter((m) => m.won).length;
  const losses = matches.length - wins;
  const medal = (p: number) => (p === 1 ? t("Чемпион") : p === 2 ? t("Финалист") : t("Бронза"));

  return (
    <div className="wrap section stack-lg">
      <div className={`profile-head ${bannerClass(u.banner)}`}>
        <div className="name-row">
          <Avatar name={u.rl_nickname} avatar={u.avatar} size={64} />
          <h1><Nick name={u.rl_nickname} color={u.name_color} /></h1>
          <UserBadge value={u.equipped_badge} t={t} />
          {club && (
            <Link href={`/clubs/${club.tag}`} className="club-link" title={club.name}>
              <Crest icon={club.crest_icon} color={club.crest_color} shape={club.crest_shape} size={30} />
              <span className="club-tag">[{club.tag}]</span>
            </Link>
          )}
          <span className="level-badge" title={t("Уровень игрока")}>
            <small>{t("Ур.")}</small>
            <b className="num">{lvl.level}</b>
          </span>
        </div>
        <div className="xp" aria-label={t("Опыт: {xp} из {to}", { xp: lvl.xp, to: lvl.to })}>
          <span className="xp-bar"><i style={{ width: `${Math.round(lvl.progress * 100)}%` }} /></span>
          <span className="small muted num">{t("{xp} / {to} XP до уровня {n}", { xp: lvl.xp, to: lvl.to, n: lvl.level + 1 })}</span>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          {PLATFORM_LABELS[u.platform]} · {t("на платформе с {date}", { date: fmtDate(u.created_at, "Asia/Tashkent", t) })}
          {duels.played > 0 && <> · ⚔️ {t("дуэли {w}–{l}", { w: duels.wins, l: duels.played - duels.wins })}</>}
        </p>
        {viewer && viewer.id !== id && (
          <details className="challenge">
            <summary className="btn btn-sm">⚔️ {t("Бросить вызов")}</summary>
            <form action={challengeAction} className="challenge-form">
              <input type="hidden" name="opponent_id" value={id} />
              <input className="input" name="message" maxLength={200} placeholder={t("Сообщение сопернику (необязательно)")} />
              <SubmitButton className="btn btn-sm">{t("Отправить вызов")}</SubmitButton>
            </form>
          </details>
        )}
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
      {seasons.length > 0 && (
        <div className="season-links">
          {seasons.map((se) => (
            <Link key={se.id} href={`/players/${id}/season/${se.slug}`} className="season-link">
              <span>🎬 {t("Твой сезон")}</span>
              <b>{se.name}</b>
              <small>{t("матчей: {n}", { n: se.played })} →</small>
            </Link>
          ))}
        </div>
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
                <span className="ach-icon" aria-hidden><Icon name={iconOf("ach", a.def.key)} size={40} /></span>
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
      {informs.length > 0 && (
        <section className="stack" id="inform">
          <h2 style={{ fontSize: "1.3rem" }}>🃏 {t("Коллекция In-Form")}</h2>
          <div className="if-strip">
            {informs.map((f) => (
              <Link key={`${f.slug}-${f.round}`} href={`/c/${f.slug}/calendar#tour-${f.round}`} className={`if-mini${f.active ? " active" : ""}`}>
                <span className="if-tag">IF</span>
                <b>{t("Тур {n}", { n: f.round })}</b>
                <small>{f.competition}</small>
                <small className="num">{f.gf}:{f.ga}</small>
              </Link>
            ))}
          </div>
        </section>
      )}
      {rivals.length > 0 && (
        <section className="stack" id="rivals">
          <h2 style={{ fontSize: "1.3rem" }}>⚔️ {t("Соперники")}</h2>
          <div className="rival-grid">
            {rivals.map((r) => {
              const pct = Math.round((r.wins / r.played) * 100);
              const body = (
                <>
                  <div className="rival-top">
                    <b>{r.opponent_user_id && derbyWith.has(r.opponent_user_id) && <span title={t("Дерби")}>⚡ </span>}{r.opponent}</b>
                    <span className={`badge plain ${r.wins > r.losses ? "ok" : r.wins < r.losses ? "danger" : "dim"}`}>
                      {r.wins}–{r.losses}
                    </span>
                  </div>
                  <span className="rival-bar" aria-label={t("Побед: {n}%", { n: pct })}>
                    <i style={{ width: `${pct}%` }} />
                  </span>
                  <span className="small muted">
                    {t("Матчей: {n}", { n: r.played })} · {t("Голы {gf}:{ga}", { gf: r.gf, ga: r.ga })}
                    {r.last_score && ` · ${t("последний {score}", { score: r.last_score })} ${r.last_won ? "✅" : "❌"}`}
                  </span>
                </>
              );
              return r.opponent_user_id ? (
                <Link key={r.opponent_user_id} href={`/players/${r.opponent_user_id}`} className="rival">{body}</Link>
              ) : (
                <div key={r.last_match_id} className="rival">{body}</div>
              );
            })}
          </div>
        </section>
      )}
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
                      {m.home_name} {m.forfeit ? t("ТП") : scoreOf(m).join(":")} {m.away_name}
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
