import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCompetitionBySlug, getUserEntry, entryCounts } from "@/lib/data";
import { getUser } from "@/lib/auth";
import { PLATFORM_LABELS } from "@/lib/format";
import { registerAction } from "@/app/actions/registration";
import { Flash, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { getT } from "@/lib/i18n/server";

export default async function Register({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SP }) {
  const t = await getT();
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const comp = await getCompetitionBySlug(slug);
  if (!comp) notFound();
  const user = await getUser();
  const path = `/c/${slug}/register`;

  if (!user) {
    return (
      <div className="panel stack measure">
        <h2 style={{ fontSize: "1.4rem" }}>{t("Сначала войдите в аккаунт")}</h2>
        <p className="muted">{t("Аккаунт хранит ваш ник и Rocket League ID, поэтому регистрация в соревнованиях занимает один клик.")}</p>
        <div className="row">
          <Link className="btn" href={`/signup?next=${encodeURIComponent(path)}`}>{t("Создать аккаунт")}</Link>
          <Link className="btn btn-ghost" href={`/login?next=${encodeURIComponent(path)}`}>{t("Войти")}</Link>
        </div>
      </div>
    );
  }
  if (await getUserEntry(comp.id, user.id)) redirect(`/c/${slug}`);
  const counts = await entryCounts(comp.id);
  const full = counts.active >= comp.capacity;
  const open = comp.status === "registration" && !(comp.registration_deadline && new Date(comp.registration_deadline).getTime() < Date.now());
  const platformOk = comp.platforms.includes(user.platform);

  return (
    <div className="stack" style={{ maxWidth: 680 }}>
      <Flash sp={sp} />
      {!open ? (
        <div className="empty">
          <h3>{t("Регистрация закрыта")}</h3>
        </div>
      ) : !platformOk ? (
        <div className="notice">{t("Платформа вашего аккаунта ({platform}) не допущена к этому соревнованию.", { platform: PLATFORM_LABELS[user.platform] })}</div>
      ) : (
        <form action={registerAction} className="panel stack">
          <input type="hidden" name="slug" value={comp.slug} />
          <h2 style={{ fontSize: "1.4rem" }}>{comp.mode === "2v2" ? t("Создание команды 2v2") : t("Регистрация 1v1")}</h2>
          {full && <div className="notice">{t("Все места заняты. Вы попадёте в лист ожидания и получите место автоматически, если кто-то отменит участие.")}</div>}

          <fieldset>
            <legend>{comp.mode === "2v2" ? t("Капитан") : t("Игрок")}</legend>
            <dl className="facts-list">
              <dt>{t("Ник")}</dt>
              <dd>{user.rl_nickname}</dd>
              <dt>Rocket League ID</dt>
              <dd>{user.rl_id}</dd>
              <dt>{t("Платформа")}</dt>
              <dd>{PLATFORM_LABELS[user.platform]}</dd>
              <dt>{t("Контакт")}</dt>
              <dd>{user.contact}</dd>
            </dl>
            <p className="small faint" style={{ marginTop: 12 }}>
              {t("Данные берутся из профиля.")} <Link href="/me">{t("Изменить")}</Link>
            </p>
          </fieldset>

          {comp.mode === "2v2" && (
            <>
              <label className="field">
                <span>{t("Название команды")}</span>
                <input className="input" name="team_name" required minLength={2} maxLength={32} />
                <small>{t("Должно быть уникальным в этом соревновании")}</small>
              </label>
              <div className="notice small">
                {t("После создания вы получите ссылку-приглашение. Второй игрок открывает её, входит в свой аккаунт и подтверждает участие. Неполные команды не попадают в жеребьёвку.")}
              </div>
            </>
          )}

          <label className="check">
            <input type="checkbox" name="accept" required />
            <span>
              {t("Я прочитал(а) правила соревнования и согласен(на) с ними")} (<Link href="/rules" target="_blank">{t("открыть правила")}</Link>)
            </span>
          </label>
          <SubmitButton className="btn btn-lg" pendingText={t("Отправляем…")}>
            {comp.mode === "2v2" ? t("Создать команду") : full ? t("Встать в лист ожидания") : t("Зарегистрироваться")}
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
