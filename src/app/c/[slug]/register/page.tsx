import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCompetitionBySlug, getUserEntry, entryCounts } from "@/lib/data";
import { getUser } from "@/lib/auth";
import { PLATFORM_LABELS } from "@/lib/format";
import { registerAction } from "@/app/actions/registration";
import { Flash, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export default async function Register({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SP }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const comp = await getCompetitionBySlug(slug);
  if (!comp) notFound();
  const user = await getUser();
  const path = `/c/${slug}/register`;

  if (!user) {
    return (
      <div className="panel stack measure">
        <h2 style={{ fontSize: "1.4rem" }}>Сначала войдите в аккаунт</h2>
        <p className="muted">Аккаунт хранит ваш ник и Rocket League ID, поэтому регистрация в соревнованиях занимает один клик.</p>
        <div className="row">
          <Link className="btn" href={`/signup?next=${encodeURIComponent(path)}`}>Создать аккаунт</Link>
          <Link className="btn btn-ghost" href={`/login?next=${encodeURIComponent(path)}`}>Войти</Link>
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
          <h3>Регистрация закрыта</h3>
        </div>
      ) : !platformOk ? (
        <div className="notice">Платформа вашего аккаунта ({PLATFORM_LABELS[user.platform]}) не допущена к этому соревнованию.</div>
      ) : (
        <form action={registerAction} className="panel stack">
          <input type="hidden" name="slug" value={comp.slug} />
          <h2 style={{ fontSize: "1.4rem" }}>{comp.mode === "2v2" ? "Создание команды 2v2" : "Регистрация 1v1"}</h2>
          {full && <div className="notice">Все места заняты. Вы попадёте в лист ожидания и получите место автоматически, если кто-то отменит участие.</div>}

          <fieldset>
            <legend>{comp.mode === "2v2" ? "Капитан" : "Игрок"}</legend>
            <dl className="facts-list">
              <dt>Ник</dt>
              <dd>{user.rl_nickname}</dd>
              <dt>Rocket League ID</dt>
              <dd>{user.rl_id}</dd>
              <dt>Платформа</dt>
              <dd>{PLATFORM_LABELS[user.platform]}</dd>
              <dt>Контакт</dt>
              <dd>{user.contact}</dd>
            </dl>
            <p className="small faint" style={{ marginTop: 12 }}>
              Данные берутся из профиля. <Link href="/me">Изменить</Link>
            </p>
          </fieldset>

          {comp.mode === "2v2" && (
            <>
              <label className="field">
                <span>Название команды</span>
                <input className="input" name="team_name" required minLength={2} maxLength={32} />
                <small>Должно быть уникальным в этом соревновании</small>
              </label>
              <div className="notice small">
                После создания вы получите ссылку-приглашение. Второй игрок открывает её, входит в свой аккаунт и подтверждает участие. Неполные
                команды не попадают в жеребьёвку.
              </div>
            </>
          )}

          <label className="check">
            <input type="checkbox" name="accept" required />
            <span>
              Я прочитал(а) <Link href="/rules" target="_blank">правила соревнования</Link> и согласен(на) с ними
            </span>
          </label>
          <SubmitButton className="btn btn-lg" pendingText="Отправляем…">
            {comp.mode === "2v2" ? "Создать команду" : full ? "Встать в лист ожидания" : "Зарегистрироваться"}
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
