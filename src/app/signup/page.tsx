import Link from "next/link";
import { redirect } from "next/navigation";
import { signup } from "../actions/auth";
import { getUser } from "@/lib/auth";
import { Flash, pick, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ProfileFields } from "@/components/ProfileFields";

export const metadata = { title: "Регистрация аккаунта" };

export default async function SignupPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const next = pick(sp, "next") || "/competitions";
  if (await getUser()) redirect(next.startsWith("/") ? next : "/me");
  return (
    <div className="wrap section" style={{ maxWidth: 720 }}>
      <div className="stack">
        <h1 style={{ fontSize: "2rem" }}>Создать аккаунт</h1>
        <p className="muted measure">Один аккаунт на игрока. После этого можно записаться в любую лигу или кубок в пару кликов.</p>
        <Flash sp={sp} />
        <form action={signup} className="panel stack">
          <input type="hidden" name="next" value={next} />
          <div className="form-grid">
            <label className="field">
              <span>Email</span>
              <input className="input" type="email" name="email" required autoComplete="email" />
            </label>
            <label className="field">
              <span>Пароль</span>
              <input className="input" type="password" name="password" required minLength={8} autoComplete="new-password" />
              <small>Минимум 8 символов</small>
            </label>
            <ProfileFields />
          </div>
          <SubmitButton className="btn btn-lg" pendingText="Создаём…">
            Создать аккаунт
          </SubmitButton>
        </form>
        <p className="muted">
          Уже есть аккаунт? <Link href={`/login?next=${encodeURIComponent(next)}`}>Войти</Link>
        </p>
      </div>
    </div>
  );
}
