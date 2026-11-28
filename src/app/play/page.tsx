import Link from "next/link";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { listCompetitions } from "@/lib/data";
import { Icon } from "@/components/Icon";
import { CompetitionRow } from "@/components/ui";
import { TodayPanel } from "@/components/TodayPanel";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Мои игры") };
}

export default async function Play() {
  const [t, user, comps] = await Promise.all([getT(), getUser(), listCompetitions()]);
  const open = comps.filter((c) => c.status === "registration");
  const running = comps.filter((c) => ["in_progress", "playoffs"].includes(c.status));
  const quick = [
    { href: "/duels", icon: "ui-duels", label: t("Бросить вызов"), hint: t("Сыграть 1 на 1 с любым игроком") },
    { href: "/competitions", icon: "ui-competitions", label: t("Турниры"), hint: t("Лиги и кубки, таблицы, сетки") },
    { href: "/players", icon: "ui-players", label: t("Рейтинг"), hint: t("Кто сильнейший прямо сейчас") },
    { href: "/live", icon: "ui-live", label: t("Эфир"), hint: t("Что происходит сейчас") },
  ];
  return (
    <div className="wrap section stack-lg">
      <h1 className="hall-title"><Icon name="ui-competitions" size={30} /> {t("Мои игры")}</h1>
      {user ? (
        <TodayPanel userId={user.id} t={t} limit={30} title={false} />
      ) : (
        <div className="today-empty">
          <Icon name="ui-user" size={40} />
          <span className="stack" style={{ gap: 4, flex: 1 }}>
            <b>{t("Войдите, чтобы видеть свои матчи")}</b>
            <span className="small muted">{t("Здесь будет всё: с кем играть, когда и что сделать.")}</span>
          </span>
          <span className="row" style={{ gap: 8 }}>
            <Link href="/signup" className="btn btn-gold btn-sm">{t("Создать аккаунт")}</Link>
            <Link href="/login?next=/play" className="btn btn-ghost btn-sm">{t("Войти")}</Link>
          </span>
        </div>
      )}

      <div className="quick-grid">
        {quick.map((x) => (
          <Link key={x.href} href={x.href} className="quick">
            <Icon name={x.icon} size={34} />
            <b>{x.label}</b>
            <small className="muted">{x.hint}</small>
          </Link>
        ))}
      </div>

      {open.length > 0 && (
        <section className="stack">
          <h2 style={{ fontSize: "1.2rem" }}>{t("Открыта регистрация")}</h2>
          <div className="comp-list">{open.map((c) => <CompetitionRow key={c.id} c={c} />)}</div>
        </section>
      )}
      {running.length > 0 && (
        <section className="stack">
          <h2 style={{ fontSize: "1.2rem" }}>{t("Идут сейчас")}</h2>
          <div className="comp-list">{running.map((c) => <CompetitionRow key={c.id} c={c} />)}</div>
        </section>
      )}
    </div>
  );
}
