import Link from "next/link";
import { q, one, dbConfigured } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { fmtDate } from "@/lib/format";
import { SetupNotice } from "@/components/ui";
import { FutCard } from "@/components/FutCard";
import { getPlayerCard, CALIBRATION, type PlayerCard } from "@/lib/cards";
import { START_RATING } from "@/lib/engine/elo";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Зал славы") };
}
export const dynamic = "force-dynamic";

type Champ = { slug: string; comp: string; mode: string; season: string; team: string; entry_id: string; finished_at: Date | null; players: { id: string; nick: string }[] };
type Record_ = { label: string; value: string; who: string; href?: string; note?: string };

async function cardsFor(ids: string[]) {
  return (await Promise.all([...new Set(ids)].map((id) => getPlayerCard(id)))).filter(Boolean) as PlayerCard[];
}

export default async function Hall() {
  const t = await getT();
  if (!dbConfigured()) return <SetupNotice />;

  const [champs, top, peak, titles, wins, bigWin, results] = await Promise.all([
    q<Champ>(
      `select c.slug, c.name as comp, c.mode, c.season, e.name as team, e.id as entry_id, c.finished_at,
              coalesce((select json_agg(json_build_object('id', u.id, 'nick', u.rl_nickname) order by em.is_captain desc)
                          from entry_members em join users u on u.id = em.user_id where em.entry_id = e.id and em.active), '[]') as players
         from competitions c join entries e on e.id = c.champion_entry_id
        where c.status = 'finished' order by c.finished_at desc nulls last`,
    ),
    q<{ user_id: string }>(
      `select user_id from rating_changes group by user_id, mode having count(*) >= ${CALIBRATION}
        order by ${START_RATING} + sum(delta) desc limit 12`,
    ),
    one<{ id: string; nick: string; mode: string; peak: number }>(
      `select u.id, u.rl_nickname as nick, x.mode, max(x.run)::int as peak from (
         select user_id, mode, ${START_RATING} + sum(delta) over (partition by user_id, mode order by created_at, id) as run from rating_changes) x
         join users u on u.id = x.user_id group by u.id, u.rl_nickname, x.mode order by peak desc limit 1`,
    ),
    one<{ id: string; nick: string; n: number }>(
      `select u.id, u.rl_nickname as nick, count(*)::int as n from competitions c
         join entry_members em on em.entry_id = c.champion_entry_id and em.active join users u on u.id = em.user_id
        where c.status = 'finished' group by u.id, u.rl_nickname order by n desc, u.rl_nickname limit 1`,
    ),
    one<{ id: string; nick: string; n: number }>(
      `select u.id, u.rl_nickname as nick, count(*)::int as n from matches m
         join entry_members em on em.entry_id = m.winner_entry_id and em.active join users u on u.id = em.user_id
        where m.status = 'completed' and not m.is_bye group by u.id, u.rl_nickname order by n desc, u.rl_nickname limit 1`,
    ),
    one<{ id: string; winner: string; loser: string; gf: number; ga: number; comp: string }>(
      `select m.id, case when (g->>'home')::int > (g->>'away')::int then he.name else ae.name end as winner,
              case when (g->>'home')::int > (g->>'away')::int then ae.name else he.name end as loser,
              greatest((g->>'home')::int, (g->>'away')::int) as gf, least((g->>'home')::int, (g->>'away')::int) as ga, c.name as comp
         from matches m cross join lateral jsonb_array_elements(coalesce(m.games, '[]'::jsonb)) g
         join entries he on he.id = m.home_entry_id join entries ae on ae.id = m.away_entry_id join competitions c on c.id = m.competition_id
        where m.status = 'completed' and not m.forfeit
        order by abs((g->>'home')::int - (g->>'away')::int) desc, greatest((g->>'home')::int, (g->>'away')::int) desc limit 1`,
    ),
    q<{ id: string; nick: string; won: boolean }>(
      `select u.id, u.rl_nickname as nick, m.winner_entry_id = em.entry_id as won
         from matches m join entry_members em on em.active and em.entry_id in (m.home_entry_id, m.away_entry_id)
         join users u on u.id = em.user_id
        where m.status = 'completed' and not m.is_bye order by u.id, coalesce(m.completed_at, m.updated_at), m.number`,
    ),
  ]);

  // Longest win streak, computed over everyone's ordered results.
  let streak: { id: string; nick: string; n: number } | null = null;
  let cur = { id: "", n: 0 };
  for (const r of results) {
    if (r.id !== cur.id) cur = { id: r.id, n: 0 };
    cur.n = r.won ? cur.n + 1 : 0;
    if (cur.n > 0 && (!streak || cur.n > streak.n)) streak = { id: r.id, nick: r.nick, n: cur.n };
  }

  const reigning = (["1v1", "2v2"] as const).map((mode) => champs.find((c) => c.mode === mode)).filter(Boolean) as Champ[];
  const [reigningCards, topCards] = await Promise.all([cardsFor(reigning.flatMap((c) => c.players.map((p) => p.id))), cardsFor(top.map((r) => r.user_id))]);
  const best = topCards.filter((c) => c.tier).sort((a, b) => b.rating - a.rating).slice(0, 3);

  const records: Record_[] = [];
  if (peak) records.push({ label: t("Пиковый рейтинг"), value: String(peak.peak), who: peak.nick, href: `/players/${peak.id}`, note: peak.mode });
  if (streak) records.push({ label: t("Серия побед подряд"), value: String(streak.n), who: streak.nick, href: `/players/${streak.id}` });
  if (titles) records.push({ label: t("Больше всего титулов"), value: String(titles.n), who: titles.nick, href: `/players/${titles.id}` });
  if (wins) records.push({ label: t("Больше всего побед"), value: String(wins.n), who: wins.nick, href: `/players/${wins.id}` });
  if (bigWin) records.push({ label: t("Крупнейшая победа в игре"), value: `${bigWin.gf}:${bigWin.ga}`, who: `${bigWin.winner} — ${bigWin.loser}`, href: `/match/${bigWin.id}`, note: bigWin.comp });

  return (
    <div className="wrap section stack-lg">
      <div className="stack-sm">
        <h1>{t("Зал славы")}</h1>
        <p className="muted" style={{ maxWidth: 640 }}>{t("Чемпионы, лучшие игроки и рекорды RL Championship. Карточки обновляются после каждого матча.")}</p>
      </div>

      {reigning.length > 0 && (
        <section className="stack">
          <h2 style={{ fontSize: "1.4rem" }}>👑 {t("Действующие чемпионы")}</h2>
          <div className="cards-row">
            {reigning.map((c) => (
              <div key={c.slug} className="stack" style={{ gap: 10, alignItems: "center" }}>
                <div className="cards-row" style={{ gap: 16 }}>
                  {c.players.map((p) => {
                    const card = reigningCards.find((x) => x.id === p.id);
                    return card ? <FutCard key={p.id} card={card} size={c.players.length > 1 ? "sm" : "lg"} link /> : null;
                  })}
                </div>
                <span className="badge gold plain">
                  {c.mode} · <Link href={`/c/${c.slug}`}>{c.comp}</Link>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {best.length > 0 && (
        <section className="stack">
          <h2 style={{ fontSize: "1.4rem" }}>{t("Лучшие по рейтингу")}</h2>
          <div className="cards-row">
            {best.map((c) => (
              <FutCard key={c.id} card={c} size="sm" link />
            ))}
          </div>
        </section>
      )}

      {records.length > 0 && (
        <section className="stack">
          <h2 style={{ fontSize: "1.4rem" }}>{t("Рекорды")}</h2>
          <div className="kpis">
            {records.map((r) => (
              <div key={r.label} className="kpi">
                <b className="num">{r.value}</b>
                <span>{r.label}</span>
                <span className="small" style={{ marginTop: 6 }}>
                  {r.href ? <Link href={r.href}>{r.who}</Link> : r.who}
                  {r.note && <span className="faint"> · {r.note}</span>}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="stack">
        <h2 style={{ fontSize: "1.4rem" }}>🏆 {t("Все чемпионы")}</h2>
        {champs.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Соревнование")}</th>
                  <th className="c">{t("Режим")}</th>
                  <th>{t("Чемпион")}</th>
                  <th className="hide-s">{t("Дата")}</th>
                </tr>
              </thead>
              <tbody>
                {champs.map((c) => (
                  <tr key={c.slug}>
                    <td>
                      <Link href={`/c/${c.slug}`} style={{ fontWeight: 600 }}>{c.comp}</Link>
                      {c.season && <div className="small faint">{c.season}</div>}
                    </td>
                    <td className="c">{c.mode}</td>
                    <td>
                      <b style={{ color: "var(--gold)" }}>{c.team}</b>
                      {c.mode === "2v2" && (
                        <div className="small">
                          {c.players.map((p, i) => (
                            <span key={p.id}>
                              {i > 0 && " · "}
                              <Link href={`/players/${p.id}`}>{p.nick}</Link>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="hide-s muted">{c.finished_at ? fmtDate(c.finished_at, "Asia/Tashkent", t) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">{t("Здесь появятся чемпионы первых турниров")}</div>
        )}
      </section>
    </div>
  );
}
