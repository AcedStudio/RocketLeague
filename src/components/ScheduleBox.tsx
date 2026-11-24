import { q } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { fmtDateTime, toLocalInput } from "@/lib/format";
import { checkinWindow, CHECKIN_OPENS_MIN, MAX_PENDING_PER_SIDE } from "@/lib/scheduling";
import { proposeAction, proposalResponseAction, checkInAction } from "@/app/actions/schedule";
import { SubmitButton, Countdown } from "@/components/client";
import type { Competition, Match } from "@/lib/data";

type Proposal = { id: string; entry_id: string; at: Date; who: string | null };

/** Time negotiation + "I'm here" check-in, shown to the two sides of an open match. */
export async function ScheduleBox({ m, comp, side }: { m: Match; comp: Competition; side: "home" | "away" | null }) {
  const t = await getT();
  if (!m.home_entry_id || !m.away_entry_id || m.is_bye || ["completed", "under_review"].includes(m.status)) return null;
  const proposals = await q<Proposal>(
    `select p.id, p.entry_id, p.at, u.rl_nickname as who from match_proposals p left join users u on u.id = p.proposed_by
      where p.match_id = $1 and p.status = 'pending' and p.at > now() order by p.at`,
    [m.id],
  );
  const tz = comp.timezone;
  const myEntry = side === "home" ? m.home_entry_id : side === "away" ? m.away_entry_id : null;
  const mine = proposals.filter((p) => p.entry_id === myEntry);
  const theirs = proposals.filter((p) => myEntry && p.entry_id !== myEntry);
  const others = myEntry ? [] : proposals;
  const w = checkinWindow({ scheduled_at: m.scheduled_at, noshow_minutes: comp.noshow_minutes });
  const now = Date.now();
  const checkinOpen = !!w && now >= w.opens.getTime() && now <= w.closes.getTime();
  const iCheckedIn = side === "home" ? !!m.home_checkin_at : side === "away" ? !!m.away_checkin_at : false;
  const respond = (p: Proposal, action: string, label: string, cls: string) => (
    <form action={proposalResponseAction}>
      <input type="hidden" name="match_id" value={m.id} />
      <input type="hidden" name="proposal_id" value={p.id} />
      <input type="hidden" name="action" value={action} />
      <SubmitButton className={cls}>{label}</SubmitButton>
    </form>
  );
  const sideName = (s: "home" | "away") => (s === "home" ? m.home_name : m.away_name);

  return (
    <section className="panel stack">
      <div className="row between">
        <h3>{t("Время матча")}</h3>
        {m.scheduled_at ? (
          <span className={`badge ${m.time_confirmed ? "ok" : "warn"}`}>{m.time_confirmed ? t("согласовано") : t("предварительно")}</span>
        ) : (
          <span className="badge warn">{t("не назначено")}</span>
        )}
      </div>

      {m.scheduled_at && (
        <p style={{ margin: 0 }}>
          <b>{fmtDateTime(m.scheduled_at, tz, t)}</b>
          {new Date(m.scheduled_at).getTime() > now && (
            <span className="muted">
              {" "}
              · {t("через")} <Countdown to={new Date(m.scheduled_at).toISOString()} />
            </span>
          )}
        </p>
      )}
      {m.play_by && !m.time_confirmed && (
        <p className="small" style={{ margin: 0, color: "var(--warn)" }}>
          {t("Сыграть до: {when}.", { when: fmtDateTime(m.play_by, tz, t) })}{" "}
          {comp.deadline_forfeit && t("Кто не ответит на предложения соперника до срока — получит техническое поражение.")}
        </p>
      )}

      {/* Check-in */}
      {w && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            {(["home", "away"] as const).map((s) => {
              const at = s === "home" ? m.home_checkin_at : m.away_checkin_at;
              return (
                <span key={s} className={`badge ${at ? "ok" : "dim"}`}>
                  {sideName(s)}: {at ? t("на месте") : t("не отметился")}
                </span>
              );
            })}
          </div>
          {side && !iCheckedIn && checkinOpen && (
            <form action={checkInAction}>
              <input type="hidden" name="match_id" value={m.id} />
              <SubmitButton className="btn btn-gold">{t("Я на месте")}</SubmitButton>
            </form>
          )}
          {side && !iCheckedIn && !checkinOpen && now < w.opens.getTime() && (
            <p className="small muted" style={{ margin: 0 }}>{t("Кнопка «Я на месте» появится за {n} минут до начала.", { n: CHECKIN_OPENS_MIN })}</p>
          )}
          {comp.noshow_minutes > 0 && (
            <p className="small faint" style={{ margin: 0 }}>
              {t("Если вы отметились, а соперник нет — через {min} мин. после начала вам засчитается техническая победа.", { min: comp.noshow_minutes })}
            </p>
          )}
        </div>
      )}

      {/* Opponent's proposals */}
      {theirs.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="small muted">{t("Соперник предлагает:")}</span>
          {theirs.map((p) => (
            <div key={p.id} className="row between list-row" style={{ padding: "10px 12px" }}>
              <b>{fmtDateTime(p.at, tz, t)}</b>
              <div className="row" style={{ gap: 6 }}>
                {respond(p, "accept", t("Принять"), "btn btn-sm")}
                {respond(p, "decline", t("Отклонить"), "btn btn-ghost btn-sm")}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* My proposals */}
      {mine.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="small muted">{t("Ваши предложения ждут ответа:")}</span>
          {mine.map((p) => (
            <div key={p.id} className="row between list-row" style={{ padding: "10px 12px" }}>
              <span>{fmtDateTime(p.at, tz, t)}</span>
              {respond(p, "withdraw", t("Отозвать"), "btn btn-ghost btn-sm")}
            </div>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <p className="small muted" style={{ margin: 0 }}>
          {t("Предложено время:")} {others.map((p) => fmtDateTime(p.at, tz, t)).join(" · ")}
        </p>
      )}

      {side && mine.length < MAX_PENDING_PER_SIDE && (
        <form action={proposeAction} className="row">
          <input type="hidden" name="match_id" value={m.id} />
          <input
            className="input"
            type="datetime-local"
            name="at"
            required
            min={toLocalInput(new Date(), tz)}
            max={m.play_by ? toLocalInput(m.play_by, tz) : undefined}
            style={{ maxWidth: 240 }}
            aria-label={t("Время")}
          />
          <SubmitButton className="btn btn-ghost">{m.time_confirmed ? t("Предложить другое время") : t("Предложить время")}</SubmitButton>
        </form>
      )}
      {side && <small className="faint">{t("Время в поясе {tz}. Соперник получит уведомление на сайте и в Discord и сможет принять его одной кнопкой.", { tz })}</small>}
    </section>
  );
}
