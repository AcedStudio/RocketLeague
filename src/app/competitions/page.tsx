import { dbConfigured } from "@/lib/db";
import { listCompetitions } from "@/lib/data";
import { CompetitionRow, SetupNotice } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Соревнования") };
}
export const dynamic = "force-dynamic";

export default async function Competitions() {
  const t = await getT();
  if (!dbConfigured()) return <SetupNotice />;
  const comps = await listCompetitions();
  const active = comps.filter((c) => c.status !== "finished");
  const finished = comps.filter((c) => c.status === "finished");
  return (
    <div className="wrap section stack-lg">
      <div>
        <h1>{t("Соревнования")}</h1>
        <p className="muted measure" style={{ marginTop: 12 }}>
          {t("Лиги идут как сезон чемпионата: каждый играет с каждым, места решает таблица. Кубки проходят как еврокубок: жеребьёвка, групповой этап и плей-офф до финала.")}
        </p>
      </div>
      {active.length ? (
        <div className="comp-list">{active.map((c) => <CompetitionRow key={c.id} c={c} />)}</div>
      ) : (
        <div className="empty">
          <h3>{t("Пока нет открытых соревнований")}</h3>
          <p>{t("Загляните позже или следите за объявлениями.")}</p>
        </div>
      )}
      {finished.length > 0 && (
        <div>
          <h2 style={{ marginBottom: 16 }}>{t("Архив")}</h2>
          <div className="comp-list">{finished.map((c) => <CompetitionRow key={c.id} c={c} />)}</div>
        </div>
      )}
    </div>
  );
}
