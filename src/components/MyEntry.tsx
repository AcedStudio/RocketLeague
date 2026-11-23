import Link from "next/link";
import { headers } from "next/headers";
import type { Competition, Entry } from "@/lib/data";
import { ENTRY_STATUS_LABELS } from "@/lib/format";
import { withdrawAction, checkInAction } from "@/app/actions/registration";
import { SubmitButton, CopyField } from "./client";
import { getT } from "@/lib/i18n/server";

export async function MyEntry({ comp, entry, userId }: { comp: Competition; entry: Entry; userId: string }) {
  const t = await getT();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const isCaptain = entry.captain_id === userId;
  const canWithdraw = comp.draw_state === "none" && ["registration", "closed"].includes(comp.status) && !["cancelled", "rejected"].includes(entry.status);
  const statusClass = { confirmed: "ok", pending: "warn", waitlist: "warn", incomplete: "warn", cancelled: "dim", rejected: "danger" }[entry.status];
  return (
    <div className="panel stack" style={{ borderColor: "rgba(55,190,254,.45)" }}>
      <div className="row between">
        <h3>{comp.mode === "2v2" ? t("Ваша команда: {team}", { team: entry.name }) : t("Вы зарегистрированы")}</h3>
        <span className={`badge ${statusClass}`}>{t(ENTRY_STATUS_LABELS[entry.status])}</span>
      </div>
      <p className="muted small">
        {t("Номер участника #{n}", { n: entry.number })}
        {comp.mode === "2v2" && ` · ${entry.members.map((m) => m.rl_nickname).join(", ")}`}
      </p>

      {entry.status === "incomplete" && isCaptain && entry.invite_code && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="small muted">{t("Отправьте напарнику ссылку. Команда попадёт в жеребьёвку, только когда он подтвердит участие.")}</span>
          <CopyField value={`${origin}/join/${entry.invite_code}`} />
        </div>
      )}
      {entry.status === "waitlist" && <p className="small muted">{t("Как только освободится место, вы автоматически попадёте в основной список и получите уведомление.")}</p>}
      {entry.status === "pending" && <p className="small muted">{t("Администратор проверит заявку. Мы пришлём уведомление.")}</p>}

      <div className="row">
        {comp.checkin_open && entry.status === "confirmed" && !entry.checked_in_at && (
          <form action={checkInAction}>
            <input type="hidden" name="slug" value={comp.slug} />
            <input type="hidden" name="entry_id" value={entry.id} />
            <SubmitButton className="btn">{t("Пройти чек-ин")}</SubmitButton>
          </form>
        )}
        {entry.checked_in_at && <span className="badge ok">{t("Чек-ин пройден")}</span>}
        {comp.draw_state === "published" && (
          <Link className="btn btn-ghost" href={`/c/${comp.slug}/matches?entry=${entry.id}`}>
            {t("Мои матчи")}
          </Link>
        )}
        {canWithdraw && (
          <form action={withdrawAction}>
            <input type="hidden" name="slug" value={comp.slug} />
            <input type="hidden" name="entry_id" value={entry.id} />
            <SubmitButton className="btn btn-danger" confirm={isCaptain ? t("Отменить регистрацию?") : t("Покинуть команду?")}>
              {isCaptain ? t("Отменить регистрацию") : t("Покинуть команду")}
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
