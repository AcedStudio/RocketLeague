import Link from "next/link";
import { redirect } from "next/navigation";
import { signup } from "../actions/auth";
import { getUser, getDiscordPending } from "@/lib/auth";
import { DiscordButton } from "@/components/DiscordButton";
import { Flash, pick, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ProfileFields } from "@/components/ProfileFields";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Регистрация аккаунта") };
}

export default async function SignupPage({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const next = pick(sp, "next") || "/competitions";
  if (await getUser()) redirect(next.startsWith("/") ? next : "/me");
  const discord = await getDiscordPending();
  return (
    <div className="wrap section" style={{ maxWidth: 720 }}>
      <div className="stack">
        <h1 style={{ fontSize: "2rem" }}>{t("Создать аккаунт")}</h1>
        <p className="muted measure">{t("Один аккаунт на игрока. После этого можно записаться в любую лигу или кубок в пару кликов.")}</p>
        <Flash sp={sp} />
        {discord ? (
          <div className="flash flash-ok">{t("Discord {name} подключён. Заполните профиль игрока, пароль можно не задавать.", { name: discord.username })}</div>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            <DiscordButton mode="login" next={next} label={t("Зарегистрироваться через Discord")} />
          </div>
        )}
        <form action={signup} className="panel stack">
          <input type="hidden" name="next" value={next} />
          <div className="form-grid">
            <label className="field">
              <span>Email</span>
              <input className="input" type="email" name="email" required autoComplete="email" />
            </label>
            <label className="field">
              <span>{t("Пароль")}</span>
              <input className="input" type="password" name="password" required={!discord} minLength={8} autoComplete="new-password" />
              <small>{discord ? t("Необязательно: можно входить через Discord") : t("Минимум 8 символов")}</small>
            </label>
            <ProfileFields u={discord ? { display_name: discord.displayName, contact: `Discord: ${discord.username}` } : undefined} />
          </div>
          <SubmitButton className="btn btn-lg" pendingText={t("Создаём…")}>
            {t("Создать аккаунт")}
          </SubmitButton>
        </form>
        <p className="muted">
          {t("Уже есть аккаунт?")} <Link href={`/login?next=${encodeURIComponent(next)}`}>{t("Войти")}</Link>
        </p>
      </div>
    </div>
  );
}
