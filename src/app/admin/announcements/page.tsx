import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";
import { listCompetitions } from "@/lib/data";
import { fmtDateTime } from "@/lib/format";
import { saveAnnouncement, announcementAction } from "@/app/actions/admin";
import { Flash, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export default async function AdminAnnouncements({ searchParams }: { searchParams: SP }) {
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
      <h1 style={{ fontSize: "2rem" }}>Объявления</h1>
      <Flash sp={sp} />
      <form action={saveAnnouncement} className="panel form-grid">
        <label className="field full">
          <span>Заголовок</span>
          <input className="input" name="title" required maxLength={140} />
        </label>
        <label className="field full">
          <span>Текст</span>
          <textarea className="input" name="body" required maxLength={4000} />
        </label>
        <label className="field">
          <span>Соревнование</span>
          <select className="input" name="competition_id" defaultValue="">
            <option value="">Для всех</option>
            {comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="stack" style={{ gap: 10, justifyContent: "end" }}>
          <label className="check"><input type="checkbox" name="pinned" /> <span>Закрепить</span></label>
          <label className="check"><input type="checkbox" name="notify" defaultChecked /> <span>Отправить уведомление</span></label>
        </div>
        <div className="full"><SubmitButton className="btn">Опубликовать</SubmitButton></div>
      </form>
      {items.length ? (
        <div className="list">
          {items.map((a) => (
            <div key={a.id} className="list-row" style={{ flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 220 }}>
                <span className="small faint">{fmtDateTime(a.created_at, "Asia/Tashkent")} · {a.comp ?? "Для всех"}</span>
                <b style={{ display: "block" }}>{a.title}</b>
              </span>
              {a.pinned && <span className="badge gold plain">Закреплено</span>}
              <form action={announcementAction}>
                <input type="hidden" name="announcement_id" value={a.id} />
                <input type="hidden" name="action" value="pin" />
                <SubmitButton className="btn btn-ghost btn-sm">{a.pinned ? "Открепить" : "Закрепить"}</SubmitButton>
              </form>
              <form action={announcementAction}>
                <input type="hidden" name="announcement_id" value={a.id} />
                <input type="hidden" name="action" value="delete" />
                <SubmitButton className="btn btn-danger btn-sm" confirm="Удалить объявление?">Удалить</SubmitButton>
              </form>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">Объявлений нет</div>
      )}
    </>
  );
}
