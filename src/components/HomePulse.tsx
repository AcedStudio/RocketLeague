import Link from "next/link";
import { getMatches, getStandings, getEntries, type Competition } from "@/lib/data";
import { getPolls } from "@/lib/awards";
import { matchOfRound } from "@/lib/motw";
import { getT } from "@/lib/i18n/server";
import { fmtDate, fmtDateTime, scoreOf } from "@/lib/format";
import { Countdown } from "@/components/client";

// The "live" part of the home page: my next match, season progress, latest results, leaders, open vote.

export async function HomePulse({ comp, userId }: { comp: Competition; userId: string | null }) {
  const t = await getT();
  if (comp.draw_state !== "published") return null;
  const [matches, entries, tables, polls, motw] = await Promise.all([
    getMatches(comp.id),
    getEntries(comp.id),
    comp.format === "round_robin" ? getStandings(comp) : Promise.resolve([]),
    getPolls(comp.id),
    matchOfRound(comp),
  ]);
  const tz = comp.timezone;
  const real = matches.filter((m) => !m.is_bye && m.home_entry_id && m.away_entry_id);
  const league = real.filter((m) => m.stage === "league" || m.stage === "group");
  const played = real.filter((m) => m.status === "completed");
  const rounds = Math.max(0, ...league.map((m) => m.round));
  const current = league.filter((m) => m.status !== "completed").sort((a, b) => a.round - b.round)[0]?.round ?? rounds;
  const lastDeadline = league.reduce<number>((mx, m) => Math.max(mx, m.play_by ? new Date(m.play_by).getTime() : 0), 0);
  const daysLeft = lastDeadline ? Math.max(0, Math.ceil((lastDeadline - Date.now()) / 86400000)) : null;
  const pct = real.length ? Math.round((played.length / real.length) * 100) : 0;

  const myEntry = userId ? entries.find((e) => e.status === "confirmed" && e.members.some((x) => x.user_id === userId))?.id ?? null : null;
  const next = myEntry
    ? real
        .filter((m) => m.status !== "completed" && (m.home_entry_id === myEntry || m.away_entry_id === myEntry))
        .sort((a, b) => a.round - b.round || a.number - b.number)[0]
    : undefined;
  const nextAt = next ? (next.scheduled_at ?? next.play_by) : null;
  const opponent = next ? (next.home_entry_id === myEntry ? next.away_name : next.home_name) : null;

  const recent = [...played]
    .sort((a, b) => new Date(b.completed_at ?? 0).getTime() - new Date(a.completed_at ?? 0).getTime())
    .slice(0, 5);
  const top = tables[0]?.rows.slice(0, 5) ?? [];
  const openPoll = polls.find((p) => !p.closed_at && new Date(p.closes_at).getTime() > Date.now());
  const lastWinner = [...polls].reverse().find((p) => p.winner_name);

  return (
    <section className="wrap section pulse" style={{ paddingBottom: 0 }}>
      {next && (
        <Link href={`/match/${next.id}`} className="pulse-next">
          <div className="stack-sm" style={{ minWidth: 0 }}>
            <span className="eyebrow">⚡ {t("Ваш следующий матч")}</span>
            <b className="pulse-vs">
              {t("против {name}", { name: opponent ?? "?" })}
            </b>
            <span className="small muted">
              {t("Тур {n}", { n: next.round })} ·{" "}
              {next.scheduled_at
                ? fmtDateTime(next.scheduled_at, tz, t)
                : next.play_by
                  ? t("сыграть до {date}", { date: fmtDate(next.play_by, tz, t) })
                  : t("Время ещё не назначено")}
              {!next.time_confirmed && !next.scheduled_at && ` · ${t("договоритесь о времени")}`}
            </span>
          </div>
          {nextAt && new Date(nextAt).getTime() > Date.now() && (
            <div className="pulse-count">
              <Countdown to={new Date(nextAt).toISOString()} />
            </div>
          )}
        </Link>
      )}

      <div className="pulse-progress">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b>
            {comp.name} · {t("Тур {n} из {total}", { n: current, total: rounds })}
          </b>
          <span className="small muted">
            {t("сыграно {done} из {all}", { done: played.length, all: real.length })}
            {daysLeft !== null && ` · ${t("до конца сезона: {n} дн.", { n: daysLeft })}`}
          </span>
        </div>
        <div className="pulse-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>

      {openPoll ? (
        <Link href={`/c/${comp.slug}/calendar#tour-${openPoll.round}`} className="pulse-poll">
          <span>⭐ {t("Голосование за игрока тура {n} открыто — выберите лучшего!", { n: openPoll.round })}</span>
          <span className="small">{t("до {when}", { when: fmtDateTime(openPoll.closes_at, tz, t) })} →</span>
        </Link>
      ) : lastWinner ? (
        <Link href={`/players/${lastWinner.winner_id}`} className="pulse-poll">
          <span>⭐ {t("Игрок тура {n}: {name}", { n: lastWinner.round, name: lastWinner.winner_name ?? "" })}</span>
          <span className="small">→</span>
        </Link>
      ) : null}

      {motw && (
        <Link href={`/match/${motw.match.id}`} className="motw">
          <span className="eyebrow motw-eyebrow">🔥 {t("Матч тура {n}", { n: motw.round })}</span>
          <div className="motw-vs">
            <div className="motw-side">
              <b>{motw.match.home_name}</b>
              <small>
                {motw.homePos ? `#${motw.homePos} · ` : ""}ELO {motw.homeElo}
              </small>
            </div>
            <span className="motw-x">VS</span>
            <div className="motw-side right">
              <b>{motw.match.away_name}</b>
              <small>
                {motw.awayPos ? `#${motw.awayPos} · ` : ""}ELO {motw.awayElo}
              </small>
            </div>
          </div>
          <span className="small muted">
            {motw.match.scheduled_at && motw.match.time_confirmed
              ? fmtDateTime(motw.match.scheduled_at, tz, t)
              : motw.match.play_by
                ? t("сыграть до {date}", { date: fmtDate(motw.match.play_by, tz, t) })
                : t("Время ещё не назначено")}
          </span>
        </Link>
      )}

      <div className="pulse-grid">
        <div className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3>{t("Последние результаты")}</h3>
            <Link className="small" href={`/c/${comp.slug}/matches`}>{t("Все матчи")} →</Link>
          </div>
          {recent.length ? (
            <div className="pulse-results">
              {recent.map((m) => {
                const hw = m.winner_entry_id === m.home_entry_id;
                return (
                  <Link key={m.id} href={`/match/${m.id}`} className="pulse-result">
                    <span className={`right${hw ? " win" : ""}`}>{m.home_name}</span>
                    <b className="num">{m.forfeit ? (hw ? "W:FF" : "FF:W") : scoreOf(m).join(":")}</b>
                    <span className={!hw ? "win" : ""}>{m.away_name}</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>{t("Пока нет сыгранных матчей")}</p>
          )}
        </div>
        {top.length > 0 && (
          <div className="panel stack">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3>{t("Лидеры")}</h3>
              <Link className="small" href={`/c/${comp.slug}/standings`}>{t("Вся таблица")} →</Link>
            </div>
            <ol className="pulse-top">
              {top.map((r) => (
                <li key={r.id} className={r.id === myEntry ? "mine" : undefined}>
                  <span className="num pos">{r.position}</span>
                  <span className="name">{r.name}</span>
                  <span className="small faint num">{r.wins}–{r.losses}</span>
                  <b className="num">{r.points}</b>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
