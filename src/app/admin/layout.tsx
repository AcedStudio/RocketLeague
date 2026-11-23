import { requireReferee, isAdmin, ROLE_LABELS } from "@/lib/auth";
import { Tabs } from "@/components/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Админ-панель", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireReferee();
  const admin = isAdmin(user.role);
  const items = [
    { href: "/admin", label: "Обзор", exact: true },
    ...(admin
      ? [
          { href: "/admin/competitions", label: "Соревнования" },
          { href: "/admin/rules", label: "Правила" },
          { href: "/admin/announcements", label: "Объявления" },
          { href: "/admin/users", label: "Пользователи" },
          { href: "/admin/log", label: "Журнал" },
          { href: "/admin/settings", label: "Настройки" },
        ]
      : []),
  ];
  return (
    <div className="wrap admin-shell">
      <div className="stack" style={{ alignSelf: "start", gap: 8 }}>
        <span className="small faint" style={{ padding: "0 12px" }}>
          {ROLE_LABELS[user.role]}
        </span>
        <Tabs items={items} className="admin-nav" />
      </div>
      <div className="stack-lg" style={{ minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
