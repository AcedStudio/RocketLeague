import Link from "next/link";
import { checkResetToken } from "@/lib/password-reset";
import { applyResetAction } from "@/app/actions/password";
import { Flash, pick, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Новый пароль"), robots: { index: false } };
}

export default async function Reset({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const token = pick(sp, "token");
  const who = await checkResetToken(token);
  return (
    <div className="wrap section" style={{ maxWidth: 460 }}>
      <Flash sp={sp} />
      {who ? (
        <form action={applyResetAction} className="panel stack">
          <h1 style={{ fontSize: "1.8rem" }}>{t("Новый пароль")}</h1>
          <p className="muted" style={{ margin: 0 }}>{t("Аккаунт: {name}. Придумайте новый пароль — минимум 8 символов.", { name: who.nickname })}</p>
          <input type="hidden" name="token" value={token} />
          <label className="field">
            <span>{t("Новый пароль")}</span>
            <input className="input" type="password" name="password" minLength={8} maxLength={100} autoComplete="new-password" required />
          </label>
          <label className="field">
            <span>{t("Повторите пароль")}</span>
            <input className="input" type="password" name="password2" minLength={8} maxLength={100} autoComplete="new-password" required />
          </label>
          <SubmitButton className="btn">{t("Сохранить и войти")}</SubmitButton>
        </form>
      ) : (
        <div className="lost" style={{ padding: "40px 0" }}>
          <div className="lost-code warn" aria-hidden>🔑</div>
          <h1>{t("Ссылка не работает")}</h1>
          <p className="muted">{t("Ссылка устарела или уже использована — попросите администратора новую")}</p>
          <Link className="btn" href="/login">{t("Ко входу")}</Link>
        </div>
      )}
    </div>
  );
}
