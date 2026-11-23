import Link from "next/link";
import { requireAdmin, ROLE_LABELS, type Role } from "@/lib/auth";
import { q } from "@/lib/db";
import { PLATFORM_LABELS } from "@/lib/format";
import { setRole } from "@/app/actions/admin";
import { Flash, pick, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export default async function AdminUsers({ searchParams }: { searchParams: SP }) {
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
      <h1 style={{ fontSize: "2rem" }}>Пользователи</h1>
      <Flash sp={sp} />
      <form className="row" role="search">
        <input className="input" name="q" defaultValue={search} placeholder="Ник, email или Rocket League ID" style={{ maxWidth: 340 }} />
        <button className="btn btn-ghost">Найти</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Игрок</th><th>Email</th><th>Контакт</th><th>Роль</th></tr>
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
                      <select className="input" name="role" defaultValue={u.role} style={{ minHeight: 36, maxWidth: 200 }} aria-label="Роль">
                        {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <SubmitButton className="btn btn-ghost btn-sm">OK</SubmitButton>
                    </form>
                  ) : (
                    <span className="badge dim plain">{ROLE_LABELS[u.role]}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
