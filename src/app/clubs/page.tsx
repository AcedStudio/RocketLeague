import Link from "next/link";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { Flash, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Crest } from "@/components/Crest";
import { CrestPicker } from "@/components/CrestPicker";
import { Coin } from "@/components/shop";
import { clubTable, clubOf } from "@/lib/clubs";
import { CLUB_PRICE, CLUB_MAX } from "@/lib/engine/clubs";
import { createClubAction, joinClubAction } from "@/app/actions/clubs";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Клубы") };
}

export default async function ClubsPage({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const user = await getUser();
  const [table, mine] = await Promise.all([clubTable(), user ? clubOf(user.id) : null]);

  return (
    <div className="wrap section stack-lg">
      <Flash sp={sp} />
      <header className="store-head">
        <div>
          <p className="eyebrow">{t("Клубы")}</p>
          <h1 className="store-title">{t("Своя команда — свой герб")}</h1>
          <p className="muted store-sub">{t("Объединяйтесь в клубы, собирайте очки сезона вместе и выполняйте недельную цель клуба. Очки клуба — это опыт пропуска всех его участников.")}</p>
        </div>
        {mine ? (
          <Link className="btn" href={`/clubs/${mine.tag}`}>{t("Мой клуб: {name}", { name: mine.name })}</Link>
        ) : user ? (
          <a className="btn btn-gold" href="#create">{t("Создать клуб")}</a>
        ) : (
          <Link className="btn" href="/login?next=/clubs">{t("Войдите, чтобы вступить")}</Link>
        )}
      </header>

      <section className="stack">
        <h2 className="section-title">{t("Таблица клубов")}</h2>
        {table.length === 0 ? (
          <div className="empty">{t("Клубов пока нет — создайте первый!")}</div>
        ) : (
          <div className="club-list">
            {table.map((c, i) => (
              <div key={c.id} className={`club-row${i < 3 ? ` top${i + 1}` : ""}`}>
                <span className="club-pos num">{i + 1}</span>
                <Link href={`/clubs/${c.tag}`} className="club-id">
                  <Crest icon={c.crest_icon} color={c.crest_color} shape={c.crest_shape} size={46} />
                  <span className="club-text">
                    <b>{c.name} <span className="club-tag">[{c.tag}]</span></b>
                    <span className="small muted">{c.motto || t("Участников: {n}", { n: c.members ?? 0 })}</span>
                  </span>
                </Link>
                <span className="club-members small muted num">{c.members}/{CLUB_MAX}</span>
                <b className="club-points num">{c.points.toLocaleString("ru-RU")}</b>
                {user && !mine && c.open && (c.members ?? 0) < CLUB_MAX ? (
                  <form action={joinClubAction}>
                    <input type="hidden" name="club" value={c.id} />
                    <input type="hidden" name="tag" value={c.tag} />
                    <SubmitButton className="btn btn-ghost btn-sm">{t("Вступить")}</SubmitButton>
                  </form>
                ) : (
                  <span className="small faint">{c.open ? "" : t("по приглашению")}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {user && !mine && (
        <section id="create" className="pass-card">
          <div className="pass-card-head">
            <h2>{t("Создать клуб")}</h2>
            <span className="timer">{t("Стоимость")}: <Coin size={13} /> {CLUB_PRICE}</span>
          </div>
          <form action={createClubAction} className="stack">
            <div className="grid-2">
              <label className="field">
                <span>{t("Название")}</span>
                <input name="name" required minLength={3} maxLength={24} placeholder="Tashkent Rockets" />
              </label>
              <label className="field">
                <span>{t("Тег (2–5 латинских букв или цифр)")}</span>
                <input name="tag" required minLength={2} maxLength={5} placeholder="TKR" style={{ textTransform: "uppercase" }} />
              </label>
            </div>
            <label className="field">
              <span>{t("Девиз (необязательно)")}</span>
              <input name="motto" maxLength={80} placeholder={t("Вместе до Supersonic Legend")} />
            </label>
            <CrestPicker labels={{ shape: t("Форма"), color: t("Цвет"), icon: t("Эмблема") }} />
            <SubmitButton className="btn btn-gold" confirm={t("Создать клуб за {price} монет?", { price: CLUB_PRICE })}>{t("Создать клуб")}</SubmitButton>
          </form>
        </section>
      )}
    </div>
  );
}
