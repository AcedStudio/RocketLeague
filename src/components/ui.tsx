import Link from "next/link";
import type { Match, Competition, GroupTable } from "@/lib/data";
import { MATCH_STATUS_LABELS, COMP_STATUS_LABELS, KIND_LABELS, FORMAT_LABELS, fmtDateTime, fmtDate, fmtMoney, groupLabel } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/core";
import { CupIcon, LeagueIcon } from "./Art";

export type SP = Promise<Record<string, string | string[] | undefined>>;

export function pick(sp: Record<string, string | string[] | undefined>, k: string): string {
  const v = sp[k];
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? "" : "";
}

export async function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const okMsg = pick(sp, "ok");
  const errMsg = pick(sp, "err");
  if (!okMsg && !errMsg) return null;
  const t = await getT();
  return (
    <div className={`flash ${errMsg ? "flash-err" : "flash-ok"}`} role={errMsg ? "alert" : "status"}>
      {t(errMsg || okMsg)}
    </div>
  );
}

export async function MatchStatusBadge({ status }: { status: Match["status"] }) {
  const t = await getT();
  const cls = { upcoming: "dim", ready: "", live: "live", completed: "ok", under_review: "warn", postponed: "danger" }[status];
  return <span className={`badge ${cls}`}>{t(MATCH_STATUS_LABELS[status])}</span>;
}

export async function CompStatusBadge({ status }: { status: Competition["status"] }) {
  const t = await getT();
  const cls = { draft: "dim", registration: "ok", closed: "warn", in_progress: "", playoffs: "gold", finished: "dim" }[status];
  return <span className={`badge ${cls}`}>{t(COMP_STATUS_LABELS[status])}</span>;
}

export function roundName(t: T, round: number, rounds: number, stage: "knockout" | "third_place" = "knockout"): string {
  if (stage === "third_place") return t("Матч за 3-е место");
  const fromEnd = rounds - round;
  if (fromEnd === 0) return t("Финал");
  if (fromEnd === 1) return t("Полуфинал");
  return t("1/{n} финала", { n: 2 ** fromEnd, teams: 2 ** (fromEnd + 1) });
}

export function stageLabel(t: T, m: Pick<Match, "stage" | "round" | "group_name">, rounds?: number) {
  if (m.stage === "group") return `${groupLabel(m.group_name, t)} · ${t("тур {n}", { n: m.round })}`;
  if (m.stage === "league") return t("Тур {n}", { n: m.round });
  if (m.stage === "third_place") return t("Матч за 3-е место");
  return rounds ? roundName(t, m.round, rounds) : t("Раунд {n}", { n: m.round });
}

export async function MatchCard({ m, tz, rounds, mine }: { m: Match; tz: string; rounds?: number; mine?: boolean }) {
  const t = await getT();
  const done = m.status === "completed";
  const side = (id: string | null) => {
    if (!id) return "tbd";
    if (!done) return "";
    return m.winner_entry_id === id ? "win" : "lose";
  };
  const hs = side(m.home_entry_id);
  const as = side(m.away_entry_id);
  const body = (
    <>
      <div className="meta">
        <span>
          #{m.number} · {stageLabel(t, m, rounds)}
        </span>
        {m.is_bye ? <span className="badge dim">{t("Проход (bye)")}</span> : <MatchStatusBadge status={m.status} />}
      </div>
      <span className={`side ${hs}`}>{m.home_name ?? (m.is_bye ? "—" : t("Определится позже"))}</span>
      <span className={`sc ${hs === "win" ? "win" : ""}`}>{done && !m.is_bye ? (m.forfeit ? (hs === "win" ? "W" : "L") : m.home_wins) : ""}</span>
      <span className={`side ${as}`}>{m.away_name ?? (m.is_bye ? "—" : t("Определится позже"))}</span>
      <span className={`sc ${as === "win" ? "win" : ""}`}>{done && !m.is_bye ? (m.forfeit ? (as === "win" ? "W" : "L") : m.away_wins) : ""}</span>
      <span className="small faint" style={{ gridColumn: "1 / -1", marginTop: 6 }}>
        {m.is_bye ? t("Участник проходит дальше без игры") : `${fmtDateTime(m.scheduled_at, tz, t)} · ${m.best_of === 1 ? t("одна игра") : `Bo${m.best_of}`}`}
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

export async function StandingsTable({
  table,
  highlight,
  showForm = true,
  previous,
  zones,
}: {
  table: GroupTable;
  highlight?: string | null;
  showForm?: boolean;
  /** Position of each entry before the latest tour: drives the ▲▼ arrows and the slide-in animation. */
  previous?: Map<string, number>;
  /** League colours: gold for the leader, green for prize places. */
  zones?: { champion: boolean; prizes: number };
}) {
  const t = await getT();
  return (
    <div className="table-wrap">
      <table className={previous ? "standings animated" : "standings"}>
        <thead>
          <tr>
            <th>#</th>
            {previous && <th className="c move-h" aria-label={t("Изменение")} />}
            <th>{table.group ? groupLabel(table.group.name, t) : t("Участник")}</th>
            <th className="c" title={t("Сыграно")}>{t("И")}</th>
            <th className="c" title={t("Победы")}>{t("В")}</th>
            <th className="c" title={t("Поражения")}>{t("П")}</th>
            <th className="c" title={t("Голы забито")}>{t("ЗГ")}</th>
            <th className="c" title={t("Голы пропущено")}>{t("ПГ")}</th>
            <th className="c" title={t("Разница голов")}>{t("РГ")}</th>
            <th className="c">{t("Очки")}</th>
            {showForm && <th className="hide-s">{t("Форма")}</th>}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => {
            const before = previous?.get(r.id);
            const move = before ? before - r.position : 0;
            const zone = zones
              ? r.position === 1 && zones.champion
                ? "zone-gold"
                : r.position <= zones.prizes
                  ? "zone-prize"
                  : ""
              : r.position <= table.qualify
                ? "qualified"
                : "";
            return (
            <tr
              key={r.id}
              className={`${zone} ${highlight === r.id ? "mine" : ""}`}
              style={move ? ({ "--shift": -move, "--i": i } as React.CSSProperties) : undefined}
              data-move={move ? (move > 0 ? "up" : "down") : undefined}
            >
              <td className="pos">{r.position}</td>
              {previous && (
                <td className="c move">
                  {move > 0 ? (
                    <span className="up" title={t("Поднялся на {n}", { n: move })}>▲{move}</span>
                  ) : move < 0 ? (
                    <span className="down" title={t("Опустился на {n}", { n: -move })}>▼{-move}</span>
                  ) : (
                    <span className="same">–</span>
                  )}
                </td>
              )}
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
                      <i key={i} className={f} aria-label={f === "W" ? t("Победа") : t("Поражение")}>
                        {f === "W" ? t("В") : t("П")}
                      </i>
                    ))}
                  </span>
                </td>
              )}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export async function Bracket({ matches }: { matches: Match[] }) {
  const t = await getT();
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
            <h3>{roundName(t, i + 1, rounds)}</h3>
            <div className="b-col">{col.map(box)}</div>
            {i === rounds - 1 && third && (
              <div className="b-third">
                <h3>{t("Матч за 3-е место")}</h3>
                {box(third)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export async function CompetitionRow({ c }: { c: Competition & { active_count?: number } }) {
  const t = await getT();
  const prize = fmtMoney(c.prize_pool, c.prize_currency, t.intl);
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
            {t(KIND_LABELS[c.kind])} · {t(FORMAT_LABELS[c.format])}
          </span>
          <span>
            {t("Участники: {n} из {cap}", { n: c.active_count ?? 0, cap: c.capacity })}
          </span>
          {c.start_at && <span>{t("Старт: {date}", { date: fmtDate(c.start_at, c.timezone, t) })}</span>}
          {prize && <span style={{ color: "var(--gold)" }}>{t("Призовой фонд: {amount}", { amount: prize })}</span>}
        </span>
      </span>
      <CompStatusBadge status={c.status} />
    </Link>
  );
}

export async function SetupNotice() {
  const t = await getT();
  return (
    <div className="wrap section">
      <div className="panel stack measure">
        <h2>{t("Подключите базу данных")}</h2>
        <p className="muted">
          {t("Сайт развёрнут, но база данных ещё не подключена. В Vercel откройте проект → Storage → подключите Neon Postgres, затем добавьте переменную AUTH_SECRET и сделайте Redeploy.")}
        </p>
      </div>
    </div>
  );
}
