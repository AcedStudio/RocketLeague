import { notFound } from "next/navigation";
import Link from "next/link";
import { getCompetitionBySlug } from "@/lib/data";
import { getUser, isAdmin } from "@/lib/auth";
import { KIND_LABELS, FORMAT_LABELS } from "@/lib/format";
import { CompStatusBadge } from "@/components/ui";
import { Tabs } from "@/components/client";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const [comp, t] = await Promise.all([getCompetitionBySlug((await params).slug), getT()]);
  return { title: comp?.name ?? t("Соревнование") };
}

export default async function CompLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const t = await getT();
  const { slug } = await params;
  const [comp, user] = await Promise.all([getCompetitionBySlug(slug), getUser()]);
  if (!comp || (comp.status === "draft" && !isAdmin(user?.role))) notFound();
  const base = `/c/${comp.slug}`;
  const tabs = [
    { href: base, label: t("Обзор"), exact: true },
    { href: `${base}/participants`, label: t("Участники") },
    ...(comp.format === "groups_knockout" ? [{ href: `${base}/draw`, label: t("Жеребьёвка") }] : []),
    ...(comp.format !== "knockout" ? [{ href: `${base}/standings`, label: t("Таблица") }] : []),
    ...(comp.format !== "round_robin" ? [{ href: `${base}/bracket`, label: t("Сетка") }] : []),
    ...(comp.format !== "knockout" ? [{ href: `${base}/calendar`, label: t("Календарь") }] : []),
    { href: `${base}/matches`, label: t("Матчи") },
    ...(comp.draw_state === "published" ? [{ href: `${base}/predictions`, label: `🔮 ${t("Прогнозы")}` }] : []),
    { href: `${base}/prizes`, label: t("Призы") },
  ];
  return (
    <>
      <div className="comp-head">
        <div className="wrap">
          <div className="row">
            <CompStatusBadge status={comp.status} />
            <span className="tag">{comp.mode}</span>
            <span className="small muted">
              {t(KIND_LABELS[comp.kind])} · {t(FORMAT_LABELS[comp.format])}
            </span>
            {isAdmin(user?.role) && (
              <Link href={`/admin/c/${comp.id}`} className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }}>
                {t("Управлять")}
              </Link>
            )}
          </div>
          <h1 style={{ marginTop: 14 }}>{comp.name}</h1>
          {comp.season && <p className="muted" style={{ marginTop: 6 }}>{comp.season}</p>}
          <Tabs items={tabs} />
        </div>
      </div>
      <div className="wrap section" style={{ paddingTop: 32 }}>
        {children}
      </div>
    </>
  );
}
