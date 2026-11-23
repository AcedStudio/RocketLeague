import { notFound } from "next/navigation";
import { getCompetitionBySlug, getGroups, getEntries } from "@/lib/data";
import { getUser, isAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";

export default async function Draw({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comp = await getCompetitionBySlug(slug);
  if (!comp) notFound();
  const user = await getUser();
  const visible = comp.draw_state === "published" || (comp.draw_state === "preview" && isAdmin(user?.role));
  if (!visible) {
    return (
      <div className="empty">
        <h3>Жеребьёвка ещё не проведена</h3>
        <p>
          Она пройдёт после закрытия регистрации. Участники распределяются по группам случайно
          {comp.seeded_draw ? " с посевом по корзинам" : ""}, результат сохраняется и не меняется после публикации.
        </p>
      </div>
    );
  }
  const [groups, entries] = await Promise.all([getGroups(comp.id), getEntries(comp.id)]);
  const names = new Map(entries.map((e) => [e.id, e.name]));
  const mine = user ? new Set(entries.filter((e) => e.members.some((m) => m.user_id === user.id)).map((e) => e.id)) : new Set<string>();

  return (
    <div className="stack-lg">
      {comp.draw_state === "preview" ? (
        <div className="notice">Предварительный результат виден только администраторам. Участники увидят группы после публикации.</div>
      ) : (
        <p className="muted small">
          Опубликовано {fmtDateTime(comp.draw_published_at, comp.timezone)}. Код жеребьёвки: <span className="num">{comp.draw_seed}</span>. Результат
          зафиксирован.
        </p>
      )}
      <div className="groups reveal">
        {groups.map((g) => (
          <section key={g.id} className="group-card">
            <h3>{g.name}</h3>
            <ol>
              {g.entry_ids.map((id) => (
                <li key={id} style={mine.has(id) ? { color: "var(--accent-light)", fontWeight: 700 } : undefined}>
                  {names.get(id)}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      <p className="small faint">Из каждой группы в плей-офф выходят {comp.qualifiers_per_group}. Победители групп посеяны выше, соперники из одной группы не встречаются в первом раунде, если этого можно избежать.</p>
    </div>
  );
}
