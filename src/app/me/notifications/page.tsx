import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { markNotificationsRead } from "@/app/actions/auth";
import { SubmitButton } from "@/components/client";

export const metadata = { title: "Уведомления" };
export const dynamic = "force-dynamic";

export default async function Notifications() {
  const user = await requireUser("/me/notifications");
  const items = await q<{ id: number; title: string; body: string; link: string; read_at: Date | null; created_at: Date }>(
    "select * from notifications where user_id = $1 order by created_at desc limit 100",
    [user.id],
  );
  const unread = items.some((n) => !n.read_at);
  const fmt = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Tashkent", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="wrap section stack" style={{ maxWidth: 760 }}>
      <div className="row between">
        <h1 style={{ fontSize: "2rem" }}>Уведомления</h1>
        {unread && (
          <form action={markNotificationsRead}>
            <SubmitButton className="btn btn-ghost btn-sm">Прочитать все</SubmitButton>
          </form>
        )}
      </div>
      {items.length ? (
        <div className="list">
          {items.map((n) => {
            const inner = (
              <span style={{ flex: 1 }}>
                <span className="row" style={{ gap: 8 }}>
                  {!n.read_at && <span className="badge plain" style={{ height: 20 }}>новое</span>}
                  <b>{n.title}</b>
                </span>
                {n.body && <span className="small muted" style={{ display: "block", marginTop: 2 }}>{n.body}</span>}
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
        <div className="empty">Уведомлений пока нет</div>
      )}
    </div>
  );
}
