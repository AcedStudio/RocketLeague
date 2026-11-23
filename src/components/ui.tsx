import Link from "next/link";
import type { Match, Competition, GroupTable } from "@/lib/data";
import { MATCH_STATUS_LABELS, COMP_STATUS_LABELS, KIND_LABELS, FORMAT_LABELS, fmtDateTime, fmtDate, fmtMoney, plural } from "@/lib/format";
import { roundLabel } from "@/lib/engine/knockout.ts";
import { CupIcon, LeagueIcon } from "./Art";

export type SP = Promise<Record<string, string | string[] | undefined>>;

export function pick(sp: Record<string, string | string[] | undefined>, k: string): string {
  const v = sp[k];
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? "" : "";
}

export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const okMsg = pick(sp, "ok");
  const errMsg = pick(sp, "err");
  if (!okMsg && !errMsg) return null;
  return (
    <div className={`flash ${errMsg ? "flash-err" : "flash-ok"}`} role={errMsg ? "alert" : "status"}>
      {errMsg || okMsg}
    </div>
  );
}

export function MatchStatusBadge({ status }: { status: Match["status"] }) {
  const cls = { upcoming: "dim", ready: "", live: "live", completed: "ok", under_review: "warn", postponed: "danger" }[status];
  return <span className={`badge ${cls}`}>{MATCH_STATUS_LABELS[status]}</span>;
}

export function CompStatusBadge({ status }: { status: Competition["status"] }) {
  const cls = { draft: "dim", registration: "ok", closed: "warn", in_progress: "", playoffs: "gold", finished: "dim" }[status];
  return <span className={`badge ${cls}`}>{COMP_STATUS_LABELS[status]}</span>;
}

export function stageLabel(m: Pick<Match, "stage" | "round" | "group_name">, rounds?: number) {
  if (m.stage === "group") return `${m.group_name ?? "Группа"} · тур ${m.round}`;
  if (m.stage === "league") return `Тур ${m.round}`;
  if (m.stage === "third_place") return "Матч за 3-е место";
  return rounds ? roundLabel(m.round, rounds) : `Раунд ${m.round}`;
}

export function MatchCard({ m, tz, rounds, mine }: { m: Match; tz: string; rounds?: number; mine?: boolean }) {
  const done = m.status === "completed";
  const side = (id: string | null, name: string | null) => {
    if (!id) return "tbd";
    if (!done) return "";
    return m.winner_entry_id === id ? "win" : "lose";
  };
  const hs = side(m.home_entry_id, m.home_name);
  const as = side(m.away_entry_id, m.away_name);
  const body = (
    <>
      <div className="meta">
        <span>
          #{m.number} · {stageLabel(m, rounds)}
        </span>
        {m.is_bye ? <span className="badge dim">Проход (bye)</span> : <MatchStatusBadge status={m.status} />}
      </div>
      <span className={`side ${hs}`}>{m.home_name ?? (m.is_bye ? "—" : "Определится позже")}</span>
      <span className={`sc ${hs === "win" ? "win" : ""}`}>{done && !m.is_bye ? (m.forfeit ? (hs === "win" ? "W" : "L") : m.home_wins) : ""}</span>
      <span className={`side ${as}`}>{m.away_name ?? (m.is_bye ? "—" : "Определится позже")}</span>
      <span className={`sc ${as === "win" ? "win" : ""}`}>{done && !m.is_bye ? (m.forfeit ? (as === "win" ? "W" : "L") : m.away_wins) : ""}</span>
      <span className="small faint" style={{ gridColumn: "1 / -1", marginTop: 6 }}>
        {m.is_bye ? "Участник проходит дальше без игры" : `${fmtDateTime(m.scheduled_at, tz)} · Bo${m.best_of}`}
      </span>
    </>
  );
  if (m.is_bye) return <div className="match">{body}</div>;
  return (
    <Link href={`/match/${m.id}`} className={`match ${mine ? "mine" : ""}`}>
      {body}
    </Link>
  );
}

export function StandingsTable({ table, highlight, showForm = true }: { table: GroupTable; highlight?: string | null; showForm?: boolean }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>{table.group ? table.group.name : "Участник"}</th>
            <th className="c" title="Сыграно">И</th>
            <th className="c" title="Победы">В</th>
            <th className="c" title="Поражения">П</th>
            <th className="c" title="Голы забито">ЗГ</th>
            <th className="c" title="Голы пропущено">ПГ</th>
            <th className="c" title="Разница голов">РГ</th>
            <th className="c">Очки</th>
            {showForm && <th className="hide-s">Форма</th>}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => (
            <tr key={r.id} className={`${r.position <= table.qualify ? "qualified" : ""} ${highlight === r.id ? "mine" : ""}`}>
              <td className="pos">{r.position}</td>
              <td style={{ fontWeight: 600 }}>{r.name}</td>
              <td className="c">{r.played}</td>
              <td className="c">{r.wins}</td>
              <td className="c">{r.losses}</td>
              <td className="c">{r.goalsFor}</td>
              <td className="c">{r.goalsAgainst}</td>
              <td className="c">{r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</td>
              <td className="c pts">{r.points}</td>
              {showForm && (
                <td className="hide-s">
                  <span className="form-dots">
                    {r.form.map((f, i) => (
                      <i key={i} className={f} aria-label={f === "W" ? "Победа" : "Поражение"}>
                        {f === "W" ? "В" : "П"}
                      </i>
                    ))}
                  </span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Bracket({ matches }: { matches: Match[] }) {
  const ko = matches.filter((m) => m.stage === "knockout");
  if (!ko.length) return null;
  const rounds = Math.max(...ko.map((m) => m.round));
  const third = matches.find((m) => m.stage === "third_place");
  const cols = Array.from({ length: rounds }, (_, i) => ko.filter((m) => m.round === i + 1).sort((a, b) => (a.bracket_index ?? 0) - (b.bracket_index ?? 0)));

  const slot = (m: Match, side: "home" | "away") => {
    const id = side === "home" ? m.home_entry_id : m.away_entry_id;
    const name = side === "home" ? m.home_name : m.away_name;
    const score = side === "home" ? m.home_wins : m.away_wins;
    const done = m.status === "completed";
    const cls = !id ? "tbd" : done ? (m.winner_entry_id === id ? "win" : "lose") : "";
    return (
      <div className={`b-slot ${cls}`}>
        <span className="n">{name ?? (m.is_bye ? "bye" : "—")}</span>
        <span className="s">{done && !m.is_bye ? (m.forfeit ? (m.winner_entry_id === id ? "W" : "L") : score) : ""}</span>
      </div>
    );
  };
  const box = (m: Match) => {
    const inner = (
      <>
        <span className="num">#{m.number}</span>
        {slot(m, "home")}
        {slot(m, "away")}
      </>
    );
    const cls = `b-match ${m.status === "completed" ? "done" : ""}`;
    return m.is_bye ? (
      <div className={cls} key={m.id}>{inner}</div>
    ) : (
      <Link href={`/match/${m.id}`} className={cls} key={m.id}>
        {inner}
      </Link>
    );
  };

  return (
    <div className="bracket-scroll">
      <div className="bracket">
        {cols.map((col, i) => (
          <div className={`b-round ${i === rounds - 1 ? "b-final" : ""}`} key={i}>
            <h3>{roundLabel(i + 1, rounds)}</h3>
            <div className="b-col">{col.map(box)}</div>
            {i === rounds - 1 && third && (
              <div className="b-third">
                <h3>Матч за 3-е место</h3>
                {box(third)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CompetitionRow({ c }: { c: Competition & { active_count?: number } }) {
  const prize = fmtMoney(c.prize_pool, c.prize_currency);
  return (
    <Link href={`/c/${c.slug}`} className="comp-row">
      <span className={`comp-mark ${c.kind}`}>{c.kind === "cup" ? <CupIcon /> : <LeagueIcon />}</span>
      <span style={{ minWidth: 0 }}>
        <span className="row" style={{ gap: 8 }}>
          <h3>{c.name}</h3>
          <span className="tag">{c.mode}</span>
        </span>
        <span className="facts">
          <span>
            {KIND_LABELS[c.kind]} · {FORMAT_LABELS[c.format]}
          </span>
          <span>
            {c.active_count ?? 0}/{c.capacity} {plural(c.capacity, "место", "места", "мест")}
          </span>
          {c.start_at && <span>Старт {fmtDate(c.start_at, c.timezone)}</span>}
          {prize && <span style={{ color: "var(--gold)" }}>Призовой фонд {prize}</span>}
        </span>
      </span>
      <CompStatusBadge status={c.status} />
    </Link>
  );
}

export function SetupNotice() {
  return (
    <div className="wrap section">
      <div className="panel stack measure">
        <h2>Подключите базу данных</h2>
        <p className="muted">
          Сайт развёрнут, но база данных ещё не подключена. В Vercel откройте проект → Storage → подключите Neon Postgres, затем
          добавьте переменную AUTH_SECRET и сделайте Redeploy.
        </p>
      </div>
    </div>
  );
}
