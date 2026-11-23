import { notFound } from "next/navigation";
import { getCompetitionBySlug, getMatches, getPrizes } from "@/lib/data";
import { Bracket } from "@/components/ui";

export default async function BracketPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comp = await getCompetitionBySlug(slug);
  if (!comp) notFound();
  const matches = comp.draw_state === "published" ? await getMatches(comp.id) : [];
  const ko = matches.filter((m) => m.stage === "knockout" || m.stage === "third_place");
  if (!ko.length) {
    return (
      <div className="empty">
        <h3>Сетка плей-офф ещё не сформирована</h3>
        <p>
          {comp.format === "groups_knockout"
            ? "Она появится автоматически, когда закончится групповой этап."
            : "Она появится после публикации жеребьёвки."}
        </p>
      </div>
    );
  }
  const champion = comp.status === "finished" ? (await getPrizes(comp.id)).find((p) => p.place === 1)?.recipient_name : null;
  const final = ko.find((m) => m.stage === "knockout" && !m.next_match_id);
  const winnerName = final?.winner_entry_id ? (final.winner_entry_id === final.home_entry_id ? final.home_name : final.away_name) : null;
  return (
    <div className="stack-lg">
      {(champion || winnerName) && (
        <div className="champion-card">
          <span className="badge gold plain">Чемпион</span>
          <b>{champion ?? winnerName}</b>
        </div>
      )}
      <Bracket matches={ko} />
      <p className="small faint">Победитель матча автоматически проходит в следующий раунд. Нажмите на матч, чтобы открыть подробности.</p>
    </div>
  );
}
