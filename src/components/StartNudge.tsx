import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { Icon } from "@/components/Icon";
import { onboardState } from "@/lib/onboarding";

/** A slim banner reminding a new player of their first steps (until they finish or the first month passes). */
export async function StartNudge({ userId }: { userId: string }) {
  const st = await onboardState(userId);
  if (!st.show) return null;
  const t = await getT();
  const done = st.steps.filter((s) => s.claimed).length;
  const ready = st.steps.filter((s) => s.done && !s.claimed).length;
  return (
    <Link href="/start" className="start-nudge">
      <Icon name="t-rookieclass" size={40} />
      <span className="start-text">
        <b>{t("Первые шаги: {n} из {total}", { n: done, total: st.steps.length })}</b>
        <span className="small muted">{ready ? t("Можно забрать наград: {n}", { n: ready }) : t("Монеты за каждый шаг и тег Rookie Class в конце")}</span>
      </span>
      <span className="meter"><i style={{ width: `${Math.round((done / st.steps.length) * 100)}%` }} /></span>
      <span className="btn btn-gold btn-sm">{t("Продолжить")}</span>
    </Link>
  );
}
