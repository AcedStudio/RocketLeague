import Link from "next/link";
import { requireAdmin, ROLE_LABELS, type Role } from "@/lib/auth";
import { q } from "@/lib/db";
import { PLATFORM_LABELS } from "@/lib/format";
import { setRole } from "@/app/actions/admin";
import { Flash, pick, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { getT } from "@/lib/i18n/server";
import { ResetPassword } from "@/components/ResetPassword";
import { grantAction } from "@/app/actions/shop";

export default async function AdminUsers({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const me = await requireAdmin();
  const search = pick(sp, "q").slice(0, 60);
  const users = await q<{ id: string; email: string; rl_nickname: string; rl_id: string; platform: string; contact: string; role: Role }>(
    `select id, email, rl_nickname, rl_id, platform, contact, role from users
      where $1 = '' or rl_nickname ilike $2 or email ilike $2 or rl_id ilike $2 order by created_at desc limit 200`,
    [search, `%${search}%`],
  );
  return (
    <>
      <h1 style={{ fontSize: "2rem" }}>{t("Пользователи")}</h1>
      <Flash sp={sp} />
      <form className="row" role="search">
        <input className="input" name="q" defaultValue={search} placeholder={t("Ник, email или Rocket League ID")} style={{ maxWidth: 340 }} />
        <button className="btn btn-ghost">{t("Найти")}</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>{t("Игрок")}</th><th>Email</th><th>{t("Контакт")}</th><th>{t("Роль")}</th><th>{t("Пароль")}</th><th>🪙</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <Link href={`/players/${u.id}`} style={{ fontWeight: 600 }}>{u.rl_nickname}</Link>
                  <div className="small faint">{PLATFORM_LABELS[u.platform]} · {u.rl_id}</div>
                </td>
                <td className="small">{u.email}</td>
                <td className="small">{u.contact}</td>
                <td>
                  {me.role === "superadmin" && u.id !== me.id ? (
                    <form action={setRole} className="inline-form">
                      <input type="hidden" name="user_id" value={u.id} />
                      <select className="input" name="role" defaultValue={u.role} style={{ minHeight: 36, maxWidth: 200 }} aria-label={t("Роль")}>
                        {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
                      </select>
                      <SubmitButton className="btn btn-ghost btn-sm">OK</SubmitButton>
                    </form>
                  ) : (
                    <span className="badge dim plain">{t(ROLE_LABELS[u.role])}</span>
                  )}
                </td>
                <td>
                  {u.id !== me.id && (me.role === "superadmin" || u.role === "participant" || u.role === "referee") ? <ResetPassword userId={u.id} /> : <span className="faint small">—</span>}
                </td>
                <td>
                  <details className="grant">
                    <summary className="btn btn-ghost btn-sm">{t("Начислить")}</summary>
                    <form action={grantAction} className="grant-form">
                      <input type="hidden" name="user_id" value={u.id} />
                      <input className="input num" name="amount" type="number" min={-5000} max={5000} step={1} required placeholder="100" />
                      <input className="input" name="note" maxLength={80} placeholder={t("За что")} />
                      <SubmitButton className="btn btn-sm">OK</SubmitButton>
                    </form>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
