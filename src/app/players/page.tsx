import Link from "next/link";
import { UserBadge, Nick, Avatar } from "@/components/Badge";
import { ClubTag } from "@/components/Crest";
import { q, dbConfigured } from "@/lib/db";
import { PLATFORM_LABELS } from "@/lib/format";
import { pick, SetupNotice, type SP } from "@/components/ui";
import { TierBadge, Delta } from "@/components/rating";
import { leaderboard, type Mode } from "@/lib/rating";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Рейтинг игроков") };
}
export const dynamic = "force-dynamic";

export default async function Players({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  if (!dbConfigured()) return <SetupNotice />;
  const sp = await searchParams;
  const search = pick(sp, "q").slice(0, 60);
  const mode: Mode = pick(sp, "mode") === "2v2" ? "2v2" : "1v1";
  const [rows, unrated] = await Promise.all([
    leaderboard(mode, search),
    search
      ? q<{ id: string; rl_nickname: string; platform: string }>(
          `select u.id, u.rl_nickname, u.platform from users u
            where u.rl_nickname ilike $1 and not exists (select 1 from rating_changes r where r.user_id = u.id and r.mode = $2)
            order by u.rl_nickname limit 20`,
          [`%${search}%`, mode],
        )
      : Promise.resolve([]),
  ]);
  const href = (m: Mode) => `/players?mode=${m}${search ? `&q=${encodeURIComponent(search)}` : ""}`;

  return (
    <div className="wrap section stack-lg">
      <div className="stack-sm">
        <h1>{t("Рейтинг игроков")}</h1>
        <p className="muted" style={{ maxWidth: 640 }}>
          {t("ELO считается по каждому подтверждённому матчу: победа над сильным соперником даёт больше очков, разгромная серия — ещё больше. Первые 10 матчей рейтинг меняется быстрее.")}
        </p>
      </div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "end" }}>
        <nav className="tabs" style={{ marginTop: 0 }} aria-label={t("Режим")}>
          {(["1v1", "2v2"] as Mode[]).map((m) => (
            <Link key={m} href={href(m)} aria-current={m === mode ? "page" : undefined}>
              {m}
            </Link>
          ))}
        </nav>
        <form className="row" role="search">
          <input type="hidden" name="mode" value={mode} />
          <input className="input" name="q" defaultValue={search} placeholder={t("Ник игрока")} style={{ maxWidth: 260 }} />
          <button className="btn btn-ghost">{t("Найти")}</button>
        </form>
      </div>
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="c" style={{ width: 56 }}>#</th>
                <th>{t("Игрок")}</th>
                <th className="hide-s">{t("Ранг")}</th>
                <th className="c">ELO</th>
                <th className="c hide-s">{t("Матчи")}</th>
                <th className="c hide-s">{t("Победы")}</th>
                <th className="c">{t("Последний")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td className={`c num${!search && i < 3 ? " rank-top" : ""}`}>{search ? "·" : i + 1}</td>
                  <td style={{ fontWeight: 600 }}>
                    <Link href={`/players/${r.id}`} className="who"><Avatar name={r.rl_nickname} avatar={r.avatar} size={24} /> <Nick name={r.rl_nickname} color={r.name_color} /></Link> <ClubTag tag={r.club_tag} /> <UserBadge value={r.equipped_badge} t={t} size="sm" />
                    <div className="faint small">{PLATFORM_LABELS[r.platform]}</div>
                  </td>
                  <td className="hide-s">
                    <TierBadge rating={r.rating} games={r.games} />
                  </td>
                  <td className="c num" style={{ fontWeight: 700 }}>{r.rating}</td>
                  <td className="c num hide-s">{r.games}</td>
                  <td className="c num hide-s">{Math.round((r.wins / r.games) * 100)}%</td>
                  <td className="c">
                    <Delta value={r.last_delta} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">{search ? t("Никого не нашли") : t("Рейтинг появится после первых сыгранных матчей")}</div>
      )}
      {unrated.length > 0 && (
        <section className="stack-sm">
          <h2 style={{ fontSize: "1.1rem" }}>{t("Ещё без рейтинга в {mode}", { mode })}</h2>
          <div className="row">
            {unrated.map((u) => (
              <Link key={u.id} className="badge plain dim" href={`/players/${u.id}`}>
                {u.rl_nickname}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
