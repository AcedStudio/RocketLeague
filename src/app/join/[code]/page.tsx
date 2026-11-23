import Link from "next/link";
import { getEntryByInvite, getCompetition } from "@/lib/data";
import { getUser } from "@/lib/auth";
import { joinAction } from "@/app/actions/registration";
import { Flash, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Приглашение в команду") };
}

export default async function Join({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: SP }) {
  const t = await getT();
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const entry = await getEntryByInvite(code.toUpperCase());
  const comp = entry ? await getCompetition(entry.competition_id) : null;
  const user = await getUser();
  const path = `/join/${code}`;

  return (
    <div className="wrap section" style={{ maxWidth: 600 }}>
      <div className="stack">
        <Flash sp={sp} />
        {!entry || !comp ? (
          <div className="empty">
            <h3>{t("Приглашение недействительно")}</h3>
            <p>{t("Ссылка устарела или команда уже собрана.")}</p>
          </div>
        ) : (
          <div className="panel stack">
            <span className="small muted">{comp.name}</span>
            <h1 style={{ fontSize: "1.8rem" }}>{t("Вас приглашают в команду «{team}»", { team: entry.name })}</h1>
            <p className="muted">{t("Капитан:")} {entry.members.find((m) => m.is_captain)?.rl_nickname}</p>
            {entry.status !== "incomplete" ? (
              <div className="notice">{t("В команде уже нет свободного места.")}</div>
            ) : !user ? (
              <div className="row">
                <Link className="btn" href={`/signup?next=${encodeURIComponent(path)}`}>{t("Создать аккаунт")}</Link>
                <Link className="btn btn-ghost" href={`/login?next=${encodeURIComponent(path)}`}>{t("Войти")}</Link>
              </div>
            ) : (
              <form action={joinAction} className="stack">
                <input type="hidden" name="code" value={code.toUpperCase()} />
                <label className="check">
                  <input type="checkbox" name="accept" required />
                  <span>
                    {t("Я подтверждаю участие и согласен(на) с правилами")} (<Link href="/rules" target="_blank">{t("открыть правила")}</Link>)
                  </span>
                </label>
                <SubmitButton className="btn btn-lg">{t("Вступить в команду")}</SubmitButton>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
