import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompetitionBySlug, getEntries } from "@/lib/data";
import { ENTRY_STATUS_LABELS, PLATFORM_LABELS } from "@/lib/format";
import { pick, type SP } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export default async function Participants({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SP }) {
  const t = await getT();
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const comp = await getCompetitionBySlug(slug);
  if (!comp) notFound();
  const search = pick(sp, "q").slice(0, 60);
  const all = await getEntries(comp.id, { search });
  const shown = all.filter((e) => ["confirmed", "pending", "incomplete", "waitlist"].includes(e.status));
  const main = shown.filter((e) => e.status !== "waitlist");
  const waitlist = shown.filter((e) => e.status === "waitlist");

  const table = (rows: typeof shown) => (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>№</th>
            <th>{comp.mode === "2v2" ? t("Команда") : t("Игрок")}</th>
            {comp.mode === "2v2" && <th>{t("Состав")}</th>}
            <th>{t("Платформа")}</th>
            <th>{t("Статус")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td className="num faint">#{e.number}</td>
              <td style={{ fontWeight: 600 }}>
                {comp.mode === "1v1" && e.members[0] ? <Link href={`/players/${e.members[0].user_id}`}>{e.name}</Link> : e.name}
              </td>
              {comp.mode === "2v2" && (
                <td>
                  {e.members.map((m, i) => (
                    <span key={m.user_id}>
                      {i > 0 && ", "}
                      <Link href={`/players/${m.user_id}`}>{m.rl_nickname}</Link>
                      {m.is_captain && <span className="faint small"> {t("(к)")}</span>}
                    </span>
                  ))}
                </td>
              )}
              <td className="muted">{[...new Set(e.members.map((m) => PLATFORM_LABELS[m.platform]))].join(", ")}</td>
              <td>
                <span className={`badge ${e.status === "confirmed" ? "ok" : "warn"}`}>{t(ENTRY_STATUS_LABELS[e.status])}</span>
                {comp.checkin_required && e.checked_in_at && <span className="badge ok plain" style={{ marginLeft: 6 }}>{t("Чек-ин")}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="stack-lg">
      <form className="row" role="search">
        <input className="input" name="q" defaultValue={search} placeholder={comp.mode === "2v2" ? t("Поиск команды или игрока") : t("Поиск игрока")} style={{ maxWidth: 360 }} />
        <button className="btn btn-ghost">{t("Найти")}</button>
        {search && <Link href={`/c/${slug}/participants`} className="btn btn-ghost">{t("Сбросить")}</Link>}
      </form>
      {main.length ? table(main) : <div className="empty">{search ? t("Никого не нашли") : t("Пока никто не зарегистрировался")}</div>}
      {waitlist.length > 0 && (
        <div className="stack">
          <h2 style={{ fontSize: "1.3rem" }}>{t("Лист ожидания")}</h2>
          {table(waitlist)}
        </div>
      )}
    </div>
  );
}
