import Link from "next/link";
import { redirect } from "next/navigation";
import { signup } from "../actions/auth";
import { getUser } from "@/lib/auth";
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
  return (
    <div className="wrap section" style={{ maxWidth: 720 }}>
      <div className="stack">
        <h1 style={{ fontSize: "2rem" }}>{t("Создать аккаунт")}</h1>
        <p className="muted measure">{t("Один аккаунт на игрока. После этого можно записаться в любую лигу или кубок в пару кликов.")}</p>
        <Flash sp={sp} />
        <form action={signup} className="panel stack">
          <input type="hidden" name="next" value={next} />
          <div className="form-grid">
            <label className="field">
              <span>Email</span>
              <input className="input" type="email" name="email" required autoComplete="email" />
            </label>
            <label className="field">
              <span>{t("Пароль")}</span>
              <input className="input" type="password" name="password" required minLength={8} autoComplete="new-password" />
              <small>{t("Минимум 8 символов")}</small>
            </label>
            <ProfileFields />
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
