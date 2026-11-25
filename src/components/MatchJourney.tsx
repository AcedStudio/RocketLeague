import Link from "next/link";
import type { Match, Competition } from "@/lib/data";
import type { T } from "@/lib/i18n/core";
import { fmtDate, fmtDateTime } from "@/lib/format";

// "What happens next" for a match: five steps, the current one highlighted, plus one plain hint for whoever is looking.

type Role = "player" | "referee" | "viewer";

export function MatchJourney({ m, comp, role, t }: { m: Match; comp: Competition; role: Role; t: T }) {
  if (m.is_bye || !m.home_entry_id || !m.away_entry_id) return null;
  const tz = comp.timezone;
  const now = Date.now();
  const done = m.status === "completed";
  const review = m.status === "under_review";
  const timeSet = !!m.scheduled_at && (m.time_confirmed || done);
  const kicked = done || review || m.status === "live" || (!!m.scheduled_at && new Date(m.scheduled_at).getTime() <= now);

  const steps = [
    { key: "draw", label: t("Соперники определены"), done: true },
    { key: "time", label: t("Время согласовано"), done: timeSet || kicked },
    { key: "play", label: t("Матч сыгран"), done: done || review },
    { key: "score", label: t("Счёт внесён"), done },
    { key: "table", label: t("Очки в таблице"), done },
  ];
  const current = steps.findIndex((s) => !s.done);

  const deadline = m.play_by ? fmtDate(m.play_by, tz, t) : null;
  const referee = m.referee_name;
  let hint: React.ReactNode;
  if (done) {
    const winner = m.winner_entry_id === m.home_entry_id ? m.home_name : m.away_name;
    hint = (
      <>
        {t("Матч завершён — победил {name}. Очки уже в таблице.", { name: winner ?? "" })}{" "}
        <Link href={`/c/${comp.slug}/standings`}>{t("Смотреть таблицу")} →</Link>
      </>
    );
  } else if (review) {
    hint = role === "referee" ? t("Результаты игроков не совпали — проверьте скриншоты и впишите итоговый счёт в панели судьи.") : t("Результат на проверке у судьи. Обычно это быстро.");
  } else if (role === "referee") {
    hint = kicked ? t("Вы судья этого матча: после игры впишите итоговый счёт в панели судьи ниже.") : t("Вы судья этого матча. Когда игроки сыграют, впишите счёт в панели судьи ниже.");
  } else if (role === "player") {
    if (!timeSet && !kicked)
      hint = deadline
        ? t("Шаг 1: предложите сопернику время в блоке «Время матча» ниже. Сыграть нужно до {date}.", { date: deadline })
        : t("Шаг 1: предложите сопернику время в блоке «Время матча» ниже.");
    else if (!kicked)
      hint = t("Время согласовано: {when}. Создайте приватный матч в Rocket League (5 минут) и пригласите соперника.", { when: fmtDateTime(m.scheduled_at, tz, t) });
    else
      hint = comp.referee_only
        ? referee
          ? t("После игры сделайте скриншот итогового счёта, загрузите его ниже и сообщите счёт судье ({name}).", { name: referee })
          : t("После игры сделайте скриншот итогового счёта и загрузите его ниже — судья внесёт результат.")
        : t("После игры отправьте счёт в форме ниже и приложите скриншот.");
  } else {
    hint = timeSet && !kicked ? t("Матч назначен на {when}.", { when: fmtDateTime(m.scheduled_at, tz, t) }) : deadline ? t("Матч нужно сыграть до {date}.", { date: deadline }) : t("Время матча ещё не согласовано.");
  }

  return (
    <section className="journey" aria-label={t("Что дальше?")}>
      <ol className="journey-steps">
        {steps.map((s, i) => (
          <li key={s.key} className={s.done ? "done" : i === current ? "now" : undefined} aria-current={i === current ? "step" : undefined}>
            <span className="journey-dot">{s.done ? "✓" : i + 1}</span>
            <span className="journey-label">{s.label}</span>
          </li>
        ))}
      </ol>
      <p className="journey-hint">
        <span aria-hidden>{done ? "🏁" : role === "viewer" ? "ℹ️" : "👉"}</span>
        <span>{hint}</span>
      </p>
    </section>
  );
}
