import { requireReferee, isAdmin, ROLE_LABELS } from "@/lib/auth";
import { Tabs } from "@/components/client";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const t = await getT();
  return { title: t("Админ-панель"), robots: { index: false } };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = await getT();
  const user = await requireReferee();
  const admin = isAdmin(user.role);
  const items = [
    { href: "/admin", label: t("Обзор"), exact: true },
    ...(admin
      ? [
          { href: "/admin/competitions", label: t("Соревнования") },
          { href: "/admin/rules", label: t("Правила") },
          { href: "/admin/announcements", label: t("Объявления") },
          { href: "/admin/users", label: t("Пользователи") },
          { href: "/admin/discord", label: "Discord" },
          { href: "/admin/log", label: t("Журнал") },
          { href: "/admin/settings", label: t("Настройки") },
        ]
      : []),
  ];
  return (
    <div className="wrap admin-shell">
      <div className="stack" style={{ alignSelf: "start", gap: 8 }}>
        <span className="small faint" style={{ padding: "0 12px" }}>
          {t(ROLE_LABELS[user.role])}
        </span>
        <Tabs items={items} className="admin-nav" />
      </div>
      <div className="stack-lg" style={{ minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
