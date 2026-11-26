import Link from "next/link";
import { requireReferee, isAdmin } from "@/lib/auth";
import { q, one } from "@/lib/db";
import { Flash, MatchStatusBadge, type SP } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { fmtDate } from "@/lib/format";

type AttentionMatch = { id: string; number: number; round: number; stage: string; play_by: Date | null; home_name: string | null; away_name: string | null; comp: string; comp_id: string; timezone: string };

export default async function AdminHome({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const user = await requireReferee();
  const [k, review, pendingEntries, awaiting, noRef, overdue, needScore, discordFail] = await Promise.all([
    one<Record<string, number>>(
      `select (select count(*)::int from users) as players,
              (select count(*)::int from entries e join competitions c on c.id = e.competition_id where c.mode = '2v2' and e.status in ('confirmed','pending')) as teams,
              (select count(*)::int from matches where status in ('ready','live') and not is_bye) as active,
              (select count(*)::int from matches where status = 'completed' and not is_bye) as completed,
              (select count(*)::int from match_reports where status = 'pending') as pending_reports,
              (select count(*)::int from matches where status = 'under_review') as disputed,
              (select count(*)::int from entries where status = 'pending') as pending_entries,
              (select count(*)::int from entries where status = 'waitlist') as waitlist,
              (select count(*)::int from entries where status = 'incomplete') as incomplete`,
    ),
    q<{ id: string; number: number; status: "under_review"; home_name: string; away_name: string; comp: string }>(
      `select m.id, m.number, m.status, he.name as home_name, ae.name as away_name, c.name as comp
         from matches m join competitions c on c.id = m.competition_id
         left join entries he on he.id = m.home_entry_id left join entries ae on ae.id = m.away_entry_id
        where m.status = 'under_review' order by m.updated_at`,
    ),
    q<{ id: string; competition_id: string; name: string; comp: string }>(
      "select e.id, e.competition_id, e.name, c.name as comp from entries e join competitions c on c.id = e.competition_id where e.status = 'pending' order by e.created_at limit 20",
    ),
    q<{ id: string; number: number; status: "ready"; home_name: string; away_name: string; comp: string }>(
      `select distinct on (m.id) m.id, m.number, m.status, he.name as home_name, ae.name as away_name, c.name as comp
         from match_reports r join matches m on m.id = r.match_id join competitions c on c.id = m.competition_id
         left join entries he on he.id = m.home_entry_id left join entries ae on ae.id = m.away_entry_id
        where r.status = 'pending' and r.created_at < now() - interval '12 hours' limit 20`,
    ),
    // Referee-only competitions: matches of the current and next round with nobody to enter the score.
    q<AttentionMatch>(
      `with cur as (select competition_id, min(round) as r from matches where status <> 'completed' and not is_bye and home_entry_id is not null and away_entry_id is not null group by competition_id)
       select m.id, m.number, m.round, m.stage, m.play_by, he.name as home_name, ae.name as away_name, c.name as comp, c.id as comp_id, c.timezone
         from matches m join competitions c on c.id = m.competition_id join cur on cur.competition_id = m.competition_id
         left join entries he on he.id = m.home_entry_id left join entries ae on ae.id = m.away_entry_id
        where c.referee_only and c.draw_state = 'published' and m.referee_user_id is null and not m.is_bye
          and m.status <> 'completed' and m.home_entry_id is not null and m.away_entry_id is not null and m.round <= cur.r + 1
        order by m.round, m.number limit 30`,
    ),
    // Past the round deadline and still not finished (auto-forfeit may be off).
    q<AttentionMatch>(
      `select m.id, m.number, m.round, m.stage, m.play_by, he.name as home_name, ae.name as away_name, c.name as comp, c.id as comp_id, c.timezone
         from matches m join competitions c on c.id = m.competition_id
         left join entries he on he.id = m.home_entry_id left join entries ae on ae.id = m.away_entry_id
        where m.play_by < now() and m.status not in ('completed', 'under_review') and not m.is_bye
          and m.home_entry_id is not null and m.away_entry_id is not null
        order by m.play_by limit 30`,
    ),
    // Played (agreed time + 30 min passed) in a referee-only competition, but no score yet.
    q<AttentionMatch>(
      `select m.id, m.number, m.round, m.stage, m.play_by, he.name as home_name, ae.name as away_name, c.name as comp, c.id as comp_id, c.timezone
         from matches m join competitions c on c.id = m.competition_id
         left join entries he on he.id = m.home_entry_id left join entries ae on ae.id = m.away_entry_id
        where c.referee_only and m.time_confirmed and m.scheduled_at < now() - interval '30 minutes'
          and m.status not in ('completed', 'under_review') and not m.is_bye
        order by m.scheduled_at limit 30`,
    ),
    one<{ n: number; last: string | null }>(
      "select count(*)::int as n, max(last_error) as last from discord_outbox where sent_at is null and attempts >= 3 and created_at > now() - interval '7 days'",
    ),
  ]);
  const attention = [
    { key: "disputes", icon: "⚖️", n: review.length, label: t("Споры по результатам"), href: "#disputes", tone: "danger" },
    { key: "score", icon: "📝", n: needScore.length, label: t("Сыграны, но счёт не внесён"), href: "#need-score", tone: "danger" },
    { key: "overdue", icon: "⌛", n: overdue.length, label: t("Просрочены по дедлайну тура"), href: "#overdue", tone: "warn" },
    { key: "noref", icon: "🧑‍⚖️", n: noRef.length, label: t("Матчи без судьи"), href: "#no-referee", tone: "warn" },
    { key: "entries", icon: "📥", n: isAdmin(user.role) ? pendingEntries.length : 0, label: t("Заявки на проверке"), href: "#entries", tone: "warn" },
    { key: "reports", icon: "💬", n: awaiting.length, label: t("Результаты без ответа больше 12 часов"), href: "#awaiting", tone: "warn" },
    { key: "discord", icon: "🤖", n: discordFail?.n ?? 0, label: t("Сообщения Discord не доставлены"), href: "/admin/discord", tone: "warn" },
  ].filter((a) => a.n > 0);
  const matchList = (rows: AttentionMatch[], id: string, title: string, action?: (m: AttentionMatch) => string) =>
    rows.length > 0 && (
      <section className="stack" id={id}>
        <h2 style={{ fontSize: "1.3rem" }}>{title}</h2>
        <div className="list">
          {rows.map((m) => (
            <Link key={m.id} href={action ? action(m) : `/match/${m.id}`} className="list-row">
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>
                  #{m.number} {m.home_name} vs {m.away_name}
                </b>
                <span className="small muted" style={{ display: "block" }}>
                  {m.comp} · {t("Тур {n}", { n: m.round })}
                  {m.play_by && ` · ${t("до {date}", { date: fmtDate(m.play_by, m.timezone, t) })}`}
                </span>
              </span>
              <span className="small">→</span>
            </Link>
          ))}
        </div>
      </section>
    );

  const kpis: [string, number, boolean?][] = [
    [t("Игроков"), k?.players ?? 0],
    [t("Команд 2v2"), k?.teams ?? 0],
    [t("Активных матчей"), k?.active ?? 0],
    [t("Сыграно матчей"), k?.completed ?? 0],
    [t("Ждут подтверждения"), k?.pending_reports ?? 0],
    [t("Споров"), k?.disputed ?? 0, (k?.disputed ?? 0) > 0],
    [t("Заявок на проверке"), k?.pending_entries ?? 0, (k?.pending_entries ?? 0) > 0],
    [t("В листе ожидания"), k?.waitlist ?? 0],
    [t("Неполных команд"), k?.incomplete ?? 0],
  ];

  return (
    <>
      <h1 style={{ fontSize: "2rem" }}>{t("Обзор")}</h1>
      <Flash sp={sp} />
      <section className={`attention${attention.length ? "" : " clear"}`}>
        <h2>{attention.length ? `🔔 ${t("Требует внимания")}` : `✅ ${t("Всё под контролем — срочных дел нет")}`}</h2>
        {attention.length > 0 && (
          <div className="attention-grid">
            {attention.map((a) => (
              <Link key={a.key} href={a.href} className={`attention-item ${a.tone}`}>
                <span className="attention-icon" aria-hidden>{a.icon}</span>
                <b className="num">{a.n}</b>
                <span>{a.label}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
      <div className="kpis">
        {kpis.map(([label, n, alert]) => (
          <div key={label} className={`kpi ${alert ? "alert" : ""}`}>
            <b className="num">{n}</b>
            <span>{t(label)}</span>
          </div>
        ))}
      </div>

      {matchList(needScore, "need-score", t("Сыграны, но счёт не внесён"))}
      {matchList(noRef, "no-referee", t("Матчи без судьи"), (m) => `/admin/c/${m.comp_id}?tab=matches&rt=${encodeURIComponent(`${m.stage}:${m.round}`)}`)}
      {matchList(overdue, "overdue", t("Просрочены по дедлайну тура"))}

      <section className="stack" id="disputes">
        <h2 style={{ fontSize: "1.3rem" }}>{t("Споры")}</h2>
        {review.length ? (
          <div className="list">
            {review.map((m) => (
              <Link key={m.id} href={`/match/${m.id}`} className="list-row">
                <span style={{ flex: 1 }}>
                  <b>
                    #{m.number} {m.home_name} vs {m.away_name}
                  </b>
                  <span className="small muted" style={{ display: "block" }}>{m.comp}</span>
                </span>
                <MatchStatusBadge status={m.status} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty">{t("Открытых споров нет")}</div>
        )}
      </section>

      {awaiting.length > 0 && (
        <section className="stack" id="awaiting">
          <h2 style={{ fontSize: "1.3rem" }}>{t("Результаты без ответа больше 12 часов")}</h2>
          <div className="list">
            {awaiting.map((m) => (
              <Link key={m.id} href={`/match/${m.id}`} className="list-row">
                <b style={{ flex: 1 }}>
                  #{m.number} {m.home_name} vs {m.away_name}
                </b>
                <span className="small muted">{m.comp}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {isAdmin(user.role) && pendingEntries.length > 0 && (
        <section className="stack" id="entries">
          <h2 style={{ fontSize: "1.3rem" }}>{t("Заявки на проверке")}</h2>
          <div className="list">
            {pendingEntries.map((e) => (
              <Link key={e.id} href={`/admin/c/${e.competition_id}?tab=participants`} className="list-row">
                <b style={{ flex: 1 }}>{e.name}</b>
                <span className="small muted">{e.comp}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
