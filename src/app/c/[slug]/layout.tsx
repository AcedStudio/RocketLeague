import { notFound } from "next/navigation";
import Link from "next/link";
import { getCompetitionBySlug } from "@/lib/data";
import { getUser, isAdmin } from "@/lib/auth";
import { KIND_LABELS, FORMAT_LABELS } from "@/lib/format";
import { CompStatusBadge } from "@/components/ui";
import { Tabs } from "@/components/client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const comp = await getCompetitionBySlug((await params).slug);
  return { title: comp?.name ?? "Соревнование" };
}

export default async function CompLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [comp, user] = await Promise.all([getCompetitionBySlug(slug), getUser()]);
  if (!comp || (comp.status === "draft" && !isAdmin(user?.role))) notFound();
  const base = `/c/${comp.slug}`;
  const tabs = [
    { href: base, label: "Обзор", exact: true },
    { href: `${base}/participants`, label: "Участники" },
    ...(comp.format === "groups_knockout" ? [{ href: `${base}/draw`, label: "Жеребьёвка" }] : []),
    ...(comp.format !== "knockout" ? [{ href: `${base}/standings`, label: "Таблица" }] : []),
    ...(comp.format !== "round_robin" ? [{ href: `${base}/bracket`, label: "Сетка" }] : []),
    { href: `${base}/matches`, label: "Матчи" },
    { href: `${base}/prizes`, label: "Призы" },
  ];
  return (
    <>
      <div className="comp-head">
        <div className="wrap">
          <div className="row">
            <CompStatusBadge status={comp.status} />
            <span className="tag">{comp.mode}</span>
            <span className="small muted">
              {KIND_LABELS[comp.kind]} · {FORMAT_LABELS[comp.format]}
            </span>
            {isAdmin(user?.role) && (
              <Link href={`/admin/c/${comp.id}`} className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }}>
                Управлять
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
