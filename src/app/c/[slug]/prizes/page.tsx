import { notFound } from "next/navigation";
import { getCompetitionBySlug, getPrizes } from "@/lib/data";
import { fmtMoney, PAYOUT_LABELS } from "@/lib/format";
import { TrophyArt } from "@/components/Art";

const PLACE = (p: number | null) => (p ? `${p}-е место` : "Специальная награда");

export default async function Prizes({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comp = await getCompetitionBySlug(slug);
  if (!comp) notFound();
  const prizes = await getPrizes(comp.id);
  const pool = fmtMoney(comp.prize_pool, comp.prize_currency);
  const first = prizes.find((p) => p.place === 1);
  const others = prizes.filter((p) => p !== first);

  if (!pool && prizes.length === 0) {
    return (
      <div className="empty">
        <h3>Призы ещё не объявлены</h3>
        <p>Организатор опубликует призовой фонд и распределение здесь.</p>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <section className="prize-hero">
        <div style={{ display: "grid", placeItems: "center" }}>
          <TrophyArt size={240} />
        </div>
        <div className="stack">
          <span className="badge gold plain">Призовой фонд</span>
          <div className="amount">{pool ?? "Будет объявлен"}</div>
          {first && (
            <div className="prize-place" style={{ borderColor: "rgba(217,173,80,.45)" }}>
              <span className="small muted">Чемпион · {first.title}</span>
              <b style={{ color: "var(--gold)" }}>{fmtMoney(first.amount, comp.prize_currency) ?? first.description ?? "—"}</b>
              {first.amount && first.description && <p className="small muted" style={{ marginTop: 4 }}>{first.description}</p>}
              {first.recipient_name && <p className="small" style={{ marginTop: 6 }}>Победитель: <b style={{ display: "inline", fontSize: "inherit" }}>{first.recipient_name}</b></p>}
            </div>
          )}
          <span className="small muted">Статус выплат: {PAYOUT_LABELS[comp.payout_status]}</span>
        </div>
      </section>

      {others.length > 0 && (
        <div className="prize-places" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))" }}>
          {others.map((p) => (
            <div key={p.id} className="prize-place">
              <span className="small muted">
                {PLACE(p.place)} · {p.title}
              </span>
              <b>{fmtMoney(p.amount, comp.prize_currency) ?? "—"}</b>
              {p.description && <p className="small muted" style={{ marginTop: 4 }}>{p.description}</p>}
              <p className="small" style={{ marginTop: 6 }}>
                {p.recipient_name ? `Получатель: ${p.recipient_name}` : ""} {p.recipient_name && (p.paid ? "· выплачено" : "· ожидает выплаты")}
              </p>
            </div>
          ))}
        </div>
      )}

      {comp.prize_notes && (
        <div className="panel">
          <h3 style={{ marginBottom: 10 }}>Условия выплаты</h3>
          <p className="muted" style={{ whiteSpace: "pre-line" }}>{comp.prize_notes}</p>
        </div>
      )}
    </div>
  );
}
