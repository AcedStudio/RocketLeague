import Link from "next/link";
import { redirect } from "next/navigation";
import { login } from "../actions/auth";
import { getUser } from "@/lib/auth";
import { DiscordButton } from "@/components/DiscordButton";
import { Flash, pick, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Вход") };
}

export default async function LoginPage({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const next = pick(sp, "next") || "/me";
  if (await getUser()) redirect(next.startsWith("/") ? next : "/me");
  return (
    <div className="wrap section" style={{ maxWidth: 480 }}>
      <div className="stack">
        <h1 style={{ fontSize: "2rem" }}>{t("Вход")}</h1>
        <Flash sp={sp} />
        <form action={login} className="panel stack">
          <input type="hidden" name="next" value={next} />
          <label className="field">
            <span>Email</span>
            <input className="input" type="email" name="email" required autoComplete="email" />
          </label>
          <label className="field">
            <span>{t("Пароль")}</span>
            <input className="input" type="password" name="password" required autoComplete="current-password" />
          </label>
          <SubmitButton className="btn btn-lg" pendingText={t("Входим…")}>
            {t("Войти")}
          </SubmitButton>
          <DiscordButton mode="login" next={next} divider />
        </form>
        <p className="muted">
          {t("Нет аккаунта?")} <Link href={`/signup?next=${encodeURIComponent(next)}`}>{t("Создать")}</Link>
        </p>
      </div>
    </div>
  );
}
