import { notFound } from "next/navigation";
import { getCompetitionBySlug, getGroups, getEntries } from "@/lib/data";
import { getUser, isAdmin } from "@/lib/auth";
import { fmtDateTime, groupLabel } from "@/lib/format";
import { getT } from "@/lib/i18n/server";

export default async function Draw({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getT();
  const { slug } = await params;
  const comp = await getCompetitionBySlug(slug);
  if (!comp) notFound();
  const user = await getUser();
  const visible = comp.draw_state === "published" || (comp.draw_state === "preview" && isAdmin(user?.role));
  if (!visible) {
    return (
      <div className="empty">
        <h3>{t("Жеребьёвка ещё не проведена")}</h3>
        <p>
          {comp.seeded_draw
            ? t("Она пройдёт после закрытия регистрации. Участники распределяются по группам случайно с посевом по корзинам, результат сохраняется и не меняется после публикации.")
            : t("Она пройдёт после закрытия регистрации. Участники распределяются по группам случайно, результат сохраняется и не меняется после публикации.")}
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
        <div className="notice">{t("Предварительный результат виден только администраторам. Участники увидят группы после публикации.")}</div>
      ) : (
        <p className="muted small">
          {t("Опубликовано {date}. Код жеребьёвки: {seed}. Результат зафиксирован.", { date: fmtDateTime(comp.draw_published_at, comp.timezone, t), seed: comp.draw_seed })}
        </p>
      )}
      <div className="groups reveal">
        {groups.map((g) => (
          <section key={g.id} className="group-card">
            <h3>{groupLabel(g.name, t)}</h3>
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
      <p className="small faint">{t("Из каждой группы в плей-офф выходят: {q}. Победители групп посеяны выше, соперники из одной группы не встречаются в первом раунде, если этого можно избежать.", { q: comp.qualifiers_per_group })}</p>
    </div>
  );
}
