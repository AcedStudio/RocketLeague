import Link from "next/link";
import { requireUser, isAdmin } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Flash, type SP } from "@/components/ui";
import { refereeDesk, unrefereed, refereedCount, type DeskMatch } from "@/lib/referee-desk";
import { RefereeForm } from "@/components/RefereeForm";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Кабинет судьи") };
}

export default async function RefereeDesk({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const user = await requireUser("/referee");
  const admin = isAdmin(user.role);
  const [desk, free, judged] = await Promise.all([refereeDesk(user.id), admin ? unrefereed() : Promise.resolve([]), refereedCount(user.id)]);
  const total = desk.score.length + desk.upcoming.length + desk.waiting.length;

  const title = (m: DeskMatch) => (
    <div className="desk-title">
      <Link href={`/match/${m.id}`}><b>{m.home_name} vs {m.away_name}</b></Link>
      <span className="small muted">
        {m.comp} · {t("Тур {n}", { n: m.round })} · #{m.number}
      </span>
    </div>
  );

  return (
    <div className="wrap section stack-lg">
      <Flash sp={sp} />
      <div className="stack-sm">
        <h1>⚖️ {t("Кабинет судьи")}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {t("Матчей на вас: {n} · уже отсужено: {d}", { n: total, d: judged })}
        </p>
      </div>

      <details className="panel ref-guide" open={total > 0 && judged < 3}>
        <summary><b>📋 {t("Как судить — 4 шага")}</b></summary>
        <ol>
          <li>{t("Игроки договариваются о времени на странице матча — вы видите его здесь.")}</li>
          <li>{t("Во время игры можно зайти наблюдателем в их приватный матч.")}</li>
          <li>{t("После игры проверьте скриншот итогового счёта (игроки загружают его на странице матча).")}</li>
          <li>{t("Впишите счёт и нажмите «Утвердить результат» — он сразу станет официальным, таблица обновится.")}</li>
        </ol>
        <p className="small muted" style={{ margin: 0 }}>{t("Если игрок не пришёл, выберите «… не явился» — сопернику засчитают техническую победу.")}</p>
      </details>

      {desk.score.length > 0 && (
        <section className="stack">
          <h2 className="desk-h">🔴 {t("Пора внести счёт")} <span className="badge danger plain">{desk.score.length}</span></h2>
          <div className="desk-grid">
            {desk.score.map((m) => (
              <article key={m.id} className="desk-card hot">
                {title(m)}
                <div className="desk-meta small">
                  {m.status === "under_review" && <span className="badge danger plain">{t("Спор")}</span>}
                  <span>📷 {t("скриншотов: {n}", { n: m.shots })}</span>
                  {m.reports > 0 && <span>📝 {t("отчётов игроков: {n}", { n: m.reports })}</span>}
                  {m.scheduled_at && <span>🕒 {fmtDateTime(m.scheduled_at, m.timezone, t)}</span>}
                </div>
                <RefereeForm t={t} matchId={m.id} bestOf={m.best_of} homeName={m.home_name ?? ""} awayName={m.away_name ?? ""} back="/referee" compact />
              </article>
            ))}
          </div>
        </section>
      )}

      {desk.upcoming.length > 0 && (
        <section className="stack">
          <h2 className="desk-h">🟡 {t("Скоро")}</h2>
          <div className="list">
            {desk.upcoming.map((m) => (
              <Link key={m.id} href={`/match/${m.id}`} className="list-row">
                <span style={{ flex: 1, minWidth: 0 }}>{title(m)}</span>
                <span className="badge gold plain">{fmtDateTime(m.scheduled_at, m.timezone, t)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {desk.waiting.length > 0 && (
        <section className="stack">
          <h2 className="desk-h">⚪ {t("Ждут, пока игроки договорятся о времени")}</h2>
          <div className="list">
            {desk.waiting.map((m) => (
              <Link key={m.id} href={`/match/${m.id}`} className="list-row">
                <span style={{ flex: 1, minWidth: 0 }}>{title(m)}</span>
                <span className="small muted">{m.play_by ? t("до {date}", { date: fmtDate(m.play_by, m.timezone, t) }) : ""}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {total === 0 && <div className="empty">{t("Сейчас вы не судите ни одного матча. Когда админ назначит вас судьёй, матч появится здесь и придёт уведомление.")}</div>}

      {admin && free.length > 0 && (
        <section className="stack">
          <h2 className="desk-h">🧑‍⚖️ {t("Матчи без судьи")} <span className="badge gold plain">{free.length}</span></h2>
          <p className="small muted" style={{ margin: 0 }}>{t("Назначить судей на весь тур можно в админке: соревнование → Матчи → Судьи.")}</p>
          <div className="list">
            {free.slice(0, 12).map((m) => (
              <Link key={m.id} href={`/match/${m.id}`} className="list-row">
                <span style={{ flex: 1, minWidth: 0 }}>{title(m)}</span>
                <span className="small">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
