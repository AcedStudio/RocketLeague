import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { getT } from "@/lib/i18n/server";

export default async function AdminLog() {
  const t = await getT();
  await requireAdmin();
  const rows = await q<{ id: number; action: string; details: string; created_at: Date; actor: string | null }>(
    "select l.id, l.action, l.details, l.created_at, u.rl_nickname as actor from activity_log l left join users u on u.id = l.actor_id order by l.created_at desc limit 300",
  );
  return (
    <>
      <h1 style={{ fontSize: "2rem" }}>{t("Журнал действий")}</h1>
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t("Время")}</th><th>{t("Кто")}</th><th>{t("Действие")}</th><th>{t("Детали")}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="small num" style={{ whiteSpace: "nowrap" }}>{fmtDateTime(r.created_at, "Asia/Tashkent", t)}</td>
                  <td className="small">{r.actor ?? t("система")}</td>
                  <td><span className="tag">{r.action}</span></td>
                  <td className="small muted">{r.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">{t("Записей пока нет")}</div>
      )}
    </>
  );
}
