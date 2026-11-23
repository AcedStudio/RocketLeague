import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { renderStored } from "@/lib/format";
import { q } from "@/lib/db";
import { markNotificationsRead } from "@/app/actions/auth";
import { SubmitButton } from "@/components/client";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Уведомления") };
}
export const dynamic = "force-dynamic";

export default async function Notifications() {
  const t = await getT();
  const user = await requireUser("/me/notifications");
  const items = await q<{ id: number; title: string; body: string; link: string; params: Record<string, unknown>; read_at: Date | null; created_at: Date }>(
    "select * from notifications where user_id = $1 order by created_at desc limit 100",
    [user.id],
  );
  const unread = items.some((n) => !n.read_at);
  const fmt = new Intl.DateTimeFormat(t.intl, { timeZone: "Asia/Tashkent", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="wrap section stack" style={{ maxWidth: 760 }}>
      <div className="row between">
        <h1 style={{ fontSize: "2rem" }}>{t("Уведомления")}</h1>
        {unread && (
          <form action={markNotificationsRead}>
            <SubmitButton className="btn btn-ghost btn-sm">{t("Прочитать все")}</SubmitButton>
          </form>
        )}
      </div>
      {items.length ? (
        <div className="list">
          {items.map((n) => {
            const inner = (
              <span style={{ flex: 1 }}>
                <span className="row" style={{ gap: 8 }}>
                  {!n.read_at && <span className="badge plain" style={{ height: 20 }}>{t("новое")}</span>}
                  <b>{renderStored(t, n.title, n.params)}</b>
                </span>
                {n.body && <span className="small muted" style={{ display: "block", marginTop: 2 }}>{renderStored(t, n.body, n.params)}</span>}
                <span className="small faint">{fmt.format(new Date(n.created_at))}</span>
              </span>
            );
            return n.link.startsWith("/") ? (
              <Link key={n.id} href={n.link} className="list-row">{inner}</Link>
            ) : (
              <div key={n.id} className="list-row">{inner}</div>
            );
          })}
        </div>
      ) : (
        <div className="empty">{t("Уведомлений пока нет")}</div>
      )}
    </div>
  );
}
