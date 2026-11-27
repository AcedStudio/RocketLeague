import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { type SP } from "@/components/ui";
import { AutoRefresh, TimeTo } from "@/components/client";
import { Icon } from "@/components/Icon";
import { liveBoard, liveFeed, type LiveMatch } from "@/lib/live";
import { renderStored, scoreOf, fmtDateTime } from "@/lib/format";
import type { T } from "@/lib/i18n/core";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Прямой эфир") };
}

function MatchTile({ m, tz, t }: { m: LiveMatch; tz: string; t: T }) {
  const [h, a] = m.state === "final" ? scoreOf(m) : [null, null];
  const homeWin = m.state === "final" && m.winner_entry_id === m.home_entry_id;
  const awayWin = m.state === "final" && m.winner_entry_id === m.away_entry_id;
  return (
    <Link href={`/match/${m.id}`} className={`lm lm-${m.state}`}>
      <div className="lm-top">
        {m.state === "live" && <span className="lm-badge live"><i className="live-dot" /> LIVE</span>}
        {m.state === "final" && <span className="lm-badge final">{m.forfeit ? t("ТП") : "FT"}</span>}
        {m.state === "review" && <span className="lm-badge review">{t("Проверка")}</span>}
        {m.state === "soon" && m.scheduled_at && (
          <span className="lm-badge soon">
            <TimeTo iso={new Date(m.scheduled_at).toISOString()} soon={t("через {t}")} now={t("начинается")} units={[t("ч"), t("мин")]} />
          </span>
        )}
        {m.state === "unscheduled" && <span className="lm-badge dim">{t("Время не согласовано")}</span>}
        <span className="lm-when small faint">{m.scheduled_at ? fmtDateTime(m.scheduled_at, tz, t) : m.play_by ? t("до {date}", { date: fmtDateTime(m.play_by, tz, t) }) : ""}</span>
      </div>
      <div className="lm-teams">
        <span className={`lm-name${homeWin ? " win" : awayWin ? " lose" : ""}`}>{m.home_name}</span>
        <span className="lm-score num">{m.state === "final" && !m.forfeit ? `${h} : ${a}` : "vs"}</span>
        <span className={`lm-name right${awayWin ? " win" : homeWin ? " lose" : ""}`}>{m.away_name}</span>
      </div>
      {m.referee_name && (
        <span className="lm-ref small faint">
          <Icon name="ui-referee" size={13} /> {m.referee_name}
        </span>
      )}
    </Link>
  );
}

export default async function LivePage({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const stream = sp.stream === "1";
  const [board, feed] = await Promise.all([liveBoard(), liveFeed()]);
  const liveNow = board.reduce((n, b) => n + b.matches.filter((m) => m.state === "live").length, 0);

  return (
    <div className={`wrap section stack-lg live-page${stream ? " stream" : ""}`}>
      <header className="live-head">
        <div>
          <p className="eyebrow">{t("Прямой эфир")}</p>
          <h1 className="live-title">
            {liveNow > 0 ? (
              <>
                <i className="live-dot big" /> {t("Сейчас играют: {n}", { n: liveNow })}
              </>
            ) : (
              t("Текущий тур")
            )}
          </h1>
        </div>
        <div className="live-tools">
          <AutoRefresh seconds={20} label={t("обновлено {n} с назад")} />
          {!stream && (
            <Link className="btn btn-ghost btn-sm" href="/live?stream=1" target="_blank">
              <Icon name="ui-live" size={16} /> {t("Режим для стрима")}
            </Link>
          )}
        </div>
      </header>

      {board.length === 0 && <div className="empty">{t("Сейчас нет идущих соревнований. Загляните, когда начнётся тур.")}</div>}

      <div className="live-layout">
        <div className="stack-lg">
          {board.map((b) => (
            <section key={b.comp.id} className="live-comp">
              <div className="live-comp-head">
                <div>
                  <Link href={`/c/${b.comp.slug}`} className="live-comp-name">{b.comp.name}</Link>
                  <span className="small muted">
                    {b.label.stage === "league" || b.label.stage === "group" ? t("Тур {n}", { n: b.label.round ?? 1 }) : t("Плей-офф")}
                  </span>
                </div>
                <div className="live-progress">
                  <span className="small num">{b.done} / {b.total}</span>
                  <span className="meter"><i style={{ width: `${Math.round((b.done / b.total) * 100)}%` }} /></span>
                </div>
              </div>
              <div className="lm-grid">
                {b.matches.map((m) => (
                  <MatchTile key={m.id} m={m} tz={b.comp.timezone} t={t} />
                ))}
              </div>
            </section>
          ))}
        </div>

        {!stream && (
          <aside className="live-feed">
            <h2>{t("Лента событий")}</h2>
            {feed.length === 0 ? (
              <p className="small muted">{t("Пока тихо.")}</p>
            ) : (
              <ol>
                {feed.map((e) => (
                  <li key={e.id}>
                    <time className="small faint num">{new Date(e.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" })}</time>
                    <Link href={`/match/${e.match_id}`}>
                      <b>{e.home} — {e.away}</b>
                      <span>{renderStored(t, e.text, e.params)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
