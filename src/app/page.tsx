import Link from "next/link";
import { dbConfigured, one } from "@/lib/db";
import { getFeaturedCompetition, listCompetitions, getAnnouncements, entryCounts, getMatches, getSettings } from "@/lib/data";
import { getUser } from "@/lib/auth";
import { FORMAT_LABELS, KIND_LABELS, fmtDate, fmtMoney } from "@/lib/format";
import { ArenaArt } from "@/components/Art";
import { Countdown } from "@/components/client";
import { CompetitionRow, CompStatusBadge, Flash, MatchCard, SetupNotice, type SP } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  if (!dbConfigured()) return <SetupNotice />;
  const [settings, featured, comps, news, user, totals] = await Promise.all([
    getSettings(),
    getFeaturedCompetition(),
    listCompetitions(),
    getAnnouncements(undefined, 4),
    getUser(),
    one<{ matches: number; goals: number; players: number }>(
      `select (select count(*)::int from matches where status = 'completed' and not is_bye) as matches,
              (select coalesce(sum(home_goals + away_goals), 0)::int from matches where status = 'completed') as goals,
              (select count(*)::int from users) as players`,
    ),
  ]);
  const counts = featured ? await entryCounts(featured.id) : null;
  const upcoming = featured ? (await getMatches(featured.id)).filter((m) => ["ready", "live", "under_review"].includes(m.status) && !m.is_bye).slice(0, 6) : [];
  const prize = featured ? fmtMoney(featured.prize_pool, featured.prize_currency) : null;
  const leagues = comps.filter((c) => c.kind === "league");
  const cups = comps.filter((c) => c.kind === "cup");
  const startsInFuture = featured?.start_at && new Date(featured.start_at).getTime() > Date.now();

  return (
    <>
      <section className="hero">
        <div className="hero-grain" />
        <div className="wrap">
          <div>
            {featured ? (
              <>
                <div className="row">
                  <CompStatusBadge status={featured.status} />
                  <span className="badge plain">
                    {KIND_LABELS[featured.kind]} · {featured.mode}
                  </span>
                </div>
                <h1 style={{ marginTop: 16 }}>{featured.name}</h1>
                <p className="lead">{FORMAT_LABELS[featured.format]}{featured.season ? ` · ${featured.season}` : ""}</p>
                <dl className="hero-facts">
                  <div>
                    <dt>Участники</dt>
                    <dd className="num">
                      {counts?.active ?? 0}/{featured.capacity}
                    </dd>
                  </div>
                  <div>
                    <dt>Призовой фонд</dt>
                    <dd className="gold">{prize ?? "Будет объявлен"}</dd>
                  </div>
                  <div>
                    <dt>Старт</dt>
                    <dd>{fmtDate(featured.start_at, featured.timezone)}</dd>
                  </div>
                </dl>
                {startsInFuture && <Countdown to={new Date(featured.start_at!).toISOString()} />}
                <div className="row" style={{ marginTop: 28 }}>
                  {featured.status === "registration" ? (
                    <Link href={`/c/${featured.slug}/register`} className="btn btn-navy btn-lg">
                      Зарегистрироваться
                    </Link>
                  ) : (
                    <Link href={`/c/${featured.slug}`} className="btn btn-navy btn-lg">
                      Открыть турнир
                    </Link>
                  )}
                  <Link href={`/c/${featured.slug}`} className="btn btn-lg" style={{ ["--bg" as string]: "rgba(3,32,61,.1)", ["--fg" as string]: "#03203d" }}>
                    Подробнее
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h1>{settings.site_name}</h1>
                <p className="lead">{settings.tagline}. Скоро здесь появится первое соревнование.</p>
                <div className="row" style={{ marginTop: 28 }}>
                  {user ? (
                    <Link href="/me" className="btn btn-navy btn-lg">Мой кабинет</Link>
                  ) : (
                    <Link href="/signup" className="btn btn-navy btn-lg">Создать аккаунт</Link>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="hero-art">
            <ArenaArt />
          </div>
        </div>
      </section>

      <div className="wrap" style={{ paddingTop: 24 }}>
        <Flash sp={sp} />
      </div>

      {news.length > 0 && (
        <section className="wrap section" style={{ paddingBottom: 0 }}>
          <div className="section-head">
            <h2>Объявления</h2>
          </div>
          <div className="list">
            {news.map((a) => (
              <article key={a.id} className="list-row" style={{ alignItems: "flex-start", flexDirection: "column", gap: 6 }}>
                <div className="row">
                  {a.pinned && <span className="badge gold plain">Закреплено</span>}
                  {a.competition_name && <span className="tag">{a.competition_name}</span>}
                  <span className="small faint">{fmtDate(a.created_at, featured?.timezone ?? "Asia/Tashkent")}</span>
                </div>
                <h3>{a.title}</h3>
                <p className="muted measure" style={{ whiteSpace: "pre-line" }}>{a.body}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && featured && (
        <section className="wrap section" style={{ paddingBottom: 0 }}>
          <div className="section-head">
            <h2>Ближайшие матчи</h2>
            <Link href={`/c/${featured.slug}/matches`} className="btn btn-ghost btn-sm">
              Все матчи
            </Link>
          </div>
          <div className="matches">
            {upcoming.map((m) => (
              <MatchCard key={m.id} m={m} tz={featured.timezone} />
            ))}
          </div>
        </section>
      )}

      <section className="wrap section">
        <div className="split">
          <div className="stack-lg">
            <div>
              <div className="section-head">
                <h2>Лиги</h2>
                <span className="muted small">Сезон, все играют со всеми, таблица</span>
              </div>
              {leagues.length ? (
                <div className="comp-list">{leagues.map((c) => <CompetitionRow key={c.id} c={c} />)}</div>
              ) : (
                <div className="empty">Лиг пока нет</div>
              )}
            </div>
            <div>
              <div className="section-head">
                <h2>Кубки</h2>
                <span className="muted small">Жеребьёвка, группы, плей-офф</span>
              </div>
              {cups.length ? (
                <div className="comp-list">{cups.map((c) => <CompetitionRow key={c.id} c={c} />)}</div>
              ) : (
                <div className="empty">Кубков пока нет</div>
              )}
            </div>
          </div>
          <aside className="stack">
            <div className="panel stack">
              <h3>Как это работает</h3>
              <ol className="muted" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
                <li>Создайте аккаунт с вашим Rocket League ID</li>
                <li>Выберите лигу или кубок, 1v1 или 2v2</li>
                <li>Для 2v2 пригласите напарника по ссылке</li>
                <li>После жеребьёвки смотрите соперников и время матчей</li>
                <li>Сыграйте и отправьте счёт, соперник подтверждает</li>
              </ol>
            </div>
            <div className="stat-strip" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <b className="num">{totals?.players ?? 0}</b>
                <span>игроков</span>
              </div>
              <div>
                <b className="num">{totals?.matches ?? 0}</b>
                <span>матчей сыграно</span>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
