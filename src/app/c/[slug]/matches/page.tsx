import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompetitionBySlug, getMatches, getGroups, getEntries } from "@/lib/data";
import { getUser } from "@/lib/auth";
import { MATCH_STATUS_LABELS, groupLabel } from "@/lib/format";
import { MatchCard, pick, type SP } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export default async function Matches({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SP }) {
  const t = await getT();
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const comp = await getCompetitionBySlug(slug);
  if (!comp) notFound();
  if (comp.draw_state !== "published") {
    return (
      <div className="empty">
        <h3>{t("Расписание появится после жеребьёвки")}</h3>
      </div>
    );
  }
  const status = pick(sp, "status");
  const group = pick(sp, "group");
  const entry = pick(sp, "entry");
  const uuid = /^[0-9a-f-]{36}$/i;
  const [matches, groups, user, entries] = await Promise.all([
    getMatches(comp.id, {
      status: status in MATCH_STATUS_LABELS ? status : undefined,
      group: uuid.test(group) ? group : undefined,
      entry: uuid.test(entry) ? entry : undefined,
    }),
    getGroups(comp.id),
    getUser(),
    getEntries(comp.id),
  ]);
  const myEntries = new Set(user ? entries.filter((e) => e.members.some((m) => m.user_id === user.id)).map((e) => e.id) : []);
  const visible = matches.filter((m) => !m.is_bye);
  const rounds = Math.max(0, ...matches.filter((m) => m.stage === "knockout").map((m) => m.round));
  const myId = [...myEntries][0];

  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ status, group, entry, ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    const s = p.toString();
    return `/c/${slug}/matches${s ? `?${s}` : ""}`;
  };

  // Group the list by stage heading for readability.
  const sections = new Map<string, typeof visible>();
  for (const m of visible) {
    const key = m.stage === "group" ? groupLabel(m.group_name, t) : m.stage === "league" ? t("Тур {n}", { n: m.round }) : t("Плей-офф");
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key)!.push(m);
  }

  return (
    <div className="stack-lg">
      <div className="stack" style={{ gap: 10 }}>
        <div className="subtabs" style={{ marginBottom: 0 }}>
          <Link href={link({ status: "" })} aria-current={!status ? "page" : undefined}>{t("Все")}</Link>
          {(["ready", "live", "under_review", "completed", "postponed"] as const).map((s) => (
            <Link key={s} href={link({ status: s })} aria-current={status === s ? "page" : undefined}>
              {t(MATCH_STATUS_LABELS[s])}
            </Link>
          ))}
        </div>
        <div className="subtabs" style={{ marginBottom: 0 }}>
          {myId && (
            <Link href={link({ entry: entry ? "" : myId })} aria-current={entry === myId ? "page" : undefined}>
              {t("Только мои")}
            </Link>
          )}
          {comp.format === "groups_knockout" &&
            groups.map((g) => (
              <Link key={g.id} href={link({ group: group === g.id ? "" : g.id })} aria-current={group === g.id ? "page" : undefined}>
                {groupLabel(g.name, t)}
              </Link>
            ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty">{t("Матчей с такими фильтрами нет")}</div>
      ) : (
        [...sections.entries()].map(([title, list]) => (
          <section key={title} className="stack">
            <h2 style={{ fontSize: "1.2rem" }}>{title}</h2>
            <div className="matches">
              {list.map((m) => (
                <MatchCard key={m.id} m={m} tz={comp.timezone} rounds={rounds} mine={myEntries.has(m.home_entry_id ?? "") || myEntries.has(m.away_entry_id ?? "")} />
              ))}
            </div>
          </section>
        ))
      )}
      <p className="small faint">{t("Время указано в часовом поясе {tz}.", { tz: comp.timezone })}</p>
    </div>
  );
}
