import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";
import { listCompetitions } from "@/lib/data";
import { fmtDateTime } from "@/lib/format";
import { saveAnnouncement, announcementAction } from "@/app/actions/admin";
import { Flash, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { getT } from "@/lib/i18n/server";

export default async function AdminAnnouncements({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  await requireAdmin();
  const [items, comps] = await Promise.all([
    q<{ id: string; title: string; body: string; pinned: boolean; created_at: Date; comp: string | null }>(
      "select a.*, c.name as comp from announcements a left join competitions c on c.id = a.competition_id order by a.created_at desc limit 50",
    ),
    listCompetitions(true),
  ]);
  return (
    <>
      <h1 style={{ fontSize: "2rem" }}>{t("Объявления")}</h1>
      <Flash sp={sp} />
      <form action={saveAnnouncement} className="panel form-grid">
        <label className="field full">
          <span>{t("Заголовок")}</span>
          <input className="input" name="title" required maxLength={140} />
        </label>
        <label className="field full">
          <span>{t("Текст")}</span>
          <textarea className="input" name="body" required maxLength={4000} />
        </label>
        <label className="field">
          <span>{t("Соревнование")}</span>
          <select className="input" name="competition_id" defaultValue="">
            <option value="">{t("Для всех")}</option>
            {comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="stack" style={{ gap: 10, justifyContent: "end" }}>
          <label className="check"><input type="checkbox" name="pinned" /> <span>{t("Закрепить")}</span></label>
          <label className="check"><input type="checkbox" name="notify" defaultChecked /> <span>{t("Отправить уведомление")}</span></label>
          <label className="check"><input type="checkbox" name="discord" defaultChecked /> <span>{t("Опубликовать в Discord")}</span></label>
        </div>
        <div className="full"><SubmitButton className="btn">{t("Опубликовать")}</SubmitButton></div>
      </form>
      {items.length ? (
        <div className="list">
          {items.map((a) => (
            <div key={a.id} className="list-row" style={{ flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 220 }}>
                <span className="small faint">{fmtDateTime(a.created_at, "Asia/Tashkent", t)} · {a.comp ?? t("Для всех")}</span>
                <b style={{ display: "block" }}>{a.title}</b>
              </span>
              {a.pinned && <span className="badge gold plain">{t("Закреплено")}</span>}
              <form action={announcementAction}>
                <input type="hidden" name="announcement_id" value={a.id} />
                <input type="hidden" name="action" value="pin" />
                <SubmitButton className="btn btn-ghost btn-sm">{a.pinned ? t("Открепить") : t("Закрепить")}</SubmitButton>
              </form>
              <form action={announcementAction}>
                <input type="hidden" name="announcement_id" value={a.id} />
                <input type="hidden" name="action" value="delete" />
                <SubmitButton className="btn btn-danger btn-sm" confirm={t("Удалить объявление?")}>{t("Удалить")}</SubmitButton>
              </form>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">{t("Объявлений нет")}</div>
      )}
    </>
  );
}
