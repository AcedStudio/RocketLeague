import Link from "next/link";
import { Icon } from "@/components/Icon";
import { eventState } from "@/lib/events";
import { getT } from "@/lib/i18n/server";

/** Themed strip for the running event; renders nothing between events. */
export async function EventBanner({ userId }: { userId: string | null }) {
  const st = await eventState(userId);
  if (!st) return null;
  const t = await getT();
  const e = st.event;
  const next = st.milestones.find((m) => !m.reached);
  const claimable = st.milestones.filter((m) => m.reached && !m.claimed).length;
  const days = Math.max(0, Math.ceil((st.endsAt.getTime() - Date.now()) / 86400_000));
  return (
    <Link
      href="/events"
      className="ev-banner"
      style={{ ["--c1" as string]: e.theme.c1, ["--c2" as string]: e.theme.c2, ["--glow" as string]: e.theme.glow }}
    >
      <Icon name={e.icon} size={46} />
      <span className="ev-b-text">
        <small>{t("Событие месяца")}</small>
        <b>{e.name}</b>
      </span>
      <span className="ev-boost">XP ×{e.boost}</span>
      <span className="ev-b-meta small">
        {userId ? (
          claimable > 0 ? (
            <b>{t("Можно забрать наград: {n}", { n: claimable })}</b>
          ) : next ? (
            t("{p} / {n} очков", { p: st.points, n: next.points })
          ) : (
            t("Все награды открыты")
          )
        ) : (
          t("Войдите, чтобы участвовать")
        )}
        <span className="muted"> · {t("ещё {n} дн.", { n: days })}</span>
      </span>
    </Link>
  );
}
