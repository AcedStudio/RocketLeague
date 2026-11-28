import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { Flash, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Icon } from "@/components/Icon";
import { Coin } from "@/components/shop";
import { onboardState } from "@/lib/onboarding";
import { claimStepAction } from "@/app/actions/onboarding";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Первые шаги") };
}

export default async function Start({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const user = await getUser();
  if (!user) redirect("/login?next=/start");
  const st = await onboardState(user.id);
  const done = st.steps.filter((s) => s.claimed).length;

  return (
    <div className="wrap section stack-lg start">
      <Flash sp={sp} />
      <header className="start-hero">
        <div className="stack-sm">
          <p className="eyebrow">{t("Первые шаги")}</p>
          <h1 className="pass-title">{t("Добро пожаловать на арену, {name}!", { name: user.rl_nickname })}</h1>
          <p className="muted" style={{ margin: 0, maxWidth: 560 }}>{t("Пройдите семь коротких шагов — за каждый монеты, а в конце эксклюзивный тег, который больше никак не получить.")}</p>
        </div>
        <div className="start-goal">
          <span className="it-glyph"><Icon name="t-rookieclass" size={92} /></span>
          <b>Rookie Class</b>
          <span className="small muted">{t("Награда за все шаги")}</span>
        </div>
      </header>

      <div className="start-progress">
        <span className="meter"><i style={{ width: `${Math.round((done / st.steps.length) * 100)}%` }} /></span>
        <span className="small num">{done} / {st.steps.length}</span>
      </div>

      <ol className="start-steps">
        {st.steps.map((s, i) => (
          <li key={s.key} className={`start-step${s.claimed ? " is-claimed" : s.done ? " is-ready" : ""}`}>
            <span className="start-no num">{s.claimed ? <Icon name="r-check" size={26} /> : i + 1}</span>
            <span className="quest-icon"><Icon name={s.icon} size={36} /></span>
            <span className="start-text">
              <b>{t(s.title)}</b>
              <span className="small muted">{t(s.desc)}</span>
            </span>
            <span className="chip-coin num">+{s.coins} <Coin size={12} /></span>
            {s.claimed ? (
              <span className="small faint">{t("Готово")}</span>
            ) : s.done ? (
              <form action={claimStepAction}>
                <input type="hidden" name="step" value={s.key} />
                <SubmitButton className="btn btn-gold btn-sm">{t("Забрать")}</SubmitButton>
              </form>
            ) : (
              <Link className="btn btn-ghost btn-sm" href={s.href}>{t("Перейти")}</Link>
            )}
          </li>
        ))}
      </ol>

      <section className={`start-final${st.allClaimed && !st.finished ? " is-ready" : ""}`}>
        <Icon name="t-rookieclass" size={56} />
        <span className="start-text">
          <b>{t("Финал: тег Rookie Class")}</b>
          <span className="small muted">{st.finished ? t("Получен — он уже рядом с вашим ником") : t("Откроется, когда заберёте награды всех шагов")}</span>
        </span>
        {!st.finished && (
          <form action={claimStepAction}>
            <input type="hidden" name="step" value="final" />
            <SubmitButton className="btn btn-gold" disabled={!st.allClaimed}>{t("Получить тег")}</SubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}
