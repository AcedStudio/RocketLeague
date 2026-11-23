import { getRules, RULE_CATEGORIES } from "@/lib/data";
import { dbConfigured } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { SetupNotice } from "@/components/ui";

export const metadata = { title: "Правила" };
export const dynamic = "force-dynamic";

export default async function Rules() {
  if (!dbConfigured()) return <SetupNotice />;
  const rules = await getRules(true);
  const byCat = new Map<string, typeof rules>();
  for (const r of rules) {
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category)!.push(r);
  }
  const order = [...RULE_CATEGORIES.filter((c) => byCat.has(c)), ...[...byCat.keys()].filter((c) => !(RULE_CATEGORIES as readonly string[]).includes(c))];
  const updated = rules.reduce<Date | null>((acc, r) => (!acc || new Date(r.updated_at) > acc ? new Date(r.updated_at) : acc), null);

  return (
    <div className="wrap section stack-lg">
      <div>
        <h1>Правила соревнований</h1>
        {updated && <p className="muted" style={{ marginTop: 10 }}>Последнее обновление: {fmtDate(updated, "Asia/Tashkent")}</p>}
      </div>
      {rules.length === 0 ? (
        <div className="notice stack measure">
          <h3 style={{ color: "var(--ink)" }}>Полные правила ещё не опубликованы</h3>
          <p>Организатор опубликует официальные правила до начала соревнований. Разделы будут такими:</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {RULE_CATEGORIES.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="with-toc">
          <nav className="toc hide-m" aria-label="Разделы правил">
            {order.map((c, i) => (
              <a key={c} href={`#cat-${i}`}>
                {c}
              </a>
            ))}
          </nav>
          <div className="stack-lg">
            {order.map((c, i) => (
              <section key={c} id={`cat-${i}`} className="stack" style={{ scrollMarginTop: 90 }}>
                <h2 style={{ fontSize: "1.35rem" }}>
                  {i + 1}. {c}
                </h2>
                {byCat.get(c)!.map((r, j) => (
                  <article key={r.id} className="panel stack" style={{ gap: 8 }}>
                    <h3>
                      {i + 1}.{j + 1} {r.title}
                    </h3>
                    <p className="muted prose" style={{ whiteSpace: "pre-line" }}>{r.body}</p>
                  </article>
                ))}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
