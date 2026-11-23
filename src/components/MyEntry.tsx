import Link from "next/link";
import { headers } from "next/headers";
import type { Competition, Entry } from "@/lib/data";
import { ENTRY_STATUS_LABELS } from "@/lib/format";
import { withdrawAction, checkInAction } from "@/app/actions/registration";
import { SubmitButton, CopyField } from "./client";

export async function MyEntry({ comp, entry, userId }: { comp: Competition; entry: Entry; userId: string }) {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const isCaptain = entry.captain_id === userId;
  const canWithdraw = comp.draw_state === "none" && ["registration", "closed"].includes(comp.status) && !["cancelled", "rejected"].includes(entry.status);
  const statusClass = { confirmed: "ok", pending: "warn", waitlist: "warn", incomplete: "warn", cancelled: "dim", rejected: "danger" }[entry.status];
  return (
    <div className="panel stack" style={{ borderColor: "rgba(55,190,254,.45)" }}>
      <div className="row between">
        <h3>{comp.mode === "2v2" ? `Ваша команда: ${entry.name}` : "Вы зарегистрированы"}</h3>
        <span className={`badge ${statusClass}`}>{ENTRY_STATUS_LABELS[entry.status]}</span>
      </div>
      <p className="muted small">
        Номер участника #{entry.number}
        {comp.mode === "2v2" && ` · ${entry.members.map((m) => m.rl_nickname).join(" и ")}`}
      </p>

      {entry.status === "incomplete" && isCaptain && entry.invite_code && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="small muted">Отправьте напарнику ссылку. Команда попадёт в жеребьёвку, только когда он подтвердит участие.</span>
          <CopyField value={`${origin}/join/${entry.invite_code}`} />
        </div>
      )}
      {entry.status === "waitlist" && <p className="small muted">Как только освободится место, вы автоматически попадёте в основной список и получите уведомление.</p>}
      {entry.status === "pending" && <p className="small muted">Администратор проверит заявку. Мы пришлём уведомление.</p>}

      <div className="row">
        {comp.checkin_open && entry.status === "confirmed" && !entry.checked_in_at && (
          <form action={checkInAction}>
            <input type="hidden" name="slug" value={comp.slug} />
            <input type="hidden" name="entry_id" value={entry.id} />
            <SubmitButton className="btn">Пройти чек-ин</SubmitButton>
          </form>
        )}
        {entry.checked_in_at && <span className="badge ok">Чек-ин пройден</span>}
        {comp.draw_state === "published" && (
          <Link className="btn btn-ghost" href={`/c/${comp.slug}/matches?entry=${entry.id}`}>
            Мои матчи
          </Link>
        )}
        {canWithdraw && (
          <form action={withdrawAction}>
            <input type="hidden" name="slug" value={comp.slug} />
            <input type="hidden" name="entry_id" value={entry.id} />
            <SubmitButton className="btn btn-danger" confirm={isCaptain ? "Отменить регистрацию?" : "Покинуть команду?"}>
              {isCaptain ? "Отменить регистрацию" : "Покинуть команду"}
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
