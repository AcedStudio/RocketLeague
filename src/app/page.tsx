import { StartNudge } from "@/components/StartNudge";
import { EventBanner } from "@/components/EventBanner";
import Link from "next/link";
import { dbConfigured, one, q } from "@/lib/db";
import { getFeaturedCompetition, listCompetitions, getAnnouncements, entryCounts, getMatches, getSettings } from "@/lib/data";
import { getUser } from "@/lib/auth";
import { FORMAT_LABELS, KIND_LABELS, fmtDate, fmtMoney } from "@/lib/format";
import { Countdown } from "@/components/client";
import { CompetitionRow, CompStatusBadge, Flash, MatchCard, SetupNotice, type SP } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { HomePulse } from "@/components/HomePulse";
import { HeroArena } from "@/components/HeroArena";
import { TodayPanel } from "@/components/TodayPanel";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: SP }) {
  const t = await getT();
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
  const prize = featured ? fmtMoney(featured.prize_pool, featured.prize_currency, t.intl) : null;
  const leagues = comps.filter((c) => c.kind === "league");
  const cups = comps.filter((c) => c.kind === "cup");
  // The live block follows a running competition: the one I play in first, then the featured one, then any.
  const running = comps.filter((c) => c.draw_state === "published" && ["in_progress", "playoffs"].includes(c.status));
  const myComps = user && running.length > 1
    ? new Set((await q<{ competition_id: string }>("select e.competition_id from entries e join entry_members em on em.entry_id = e.id and em.active where em.user_id = $1 and e.status = 'confirmed'", [user.id])).map((r) => r.competition_id))
    : new Set<string>();
  const pulseComp = running.find((c) => myComps.has(c.id)) ?? running.find((c) => c.id === featured?.id) ?? running[0] ?? null;
  const startsInFuture = featured?.start_at && new Date(featured.start_at).getTime() > Date.now();

  return (
    <>
      <HeroArena
        t={t}
        title={settings.site_name}
        tagline={t(settings.tagline)}
        primary={user ? { href: "/play", label: t("Мои игры") } : { href: "/signup", label: t("Начать играть") }}
        secondary={featured ? { href: `/c/${featured.slug}`, label: featured.name } : { href: "/competitions", label: t("Турниры") }}
        stats={[
          { value: totals?.players ?? 0, label: t("игроков") },
          { value: totals?.matches ?? 0, label: t("матчей сыграно") },
          { value: totals?.goals ?? 0, label: t("голов") },
        ]}
      />

      {user && (
        <div className="wrap home-today">
          <TodayPanel userId={user.id} nick={user.rl_nickname} t={t} />
        </div>
      )}

      <section className={`hero-panel${user ? " after-today" : ""}`}>
        <div className="wrap">
          <div className="hero-card">
            {featured ? (
              <>
                <div className="stack" style={{ gap: 14, minWidth: 0 }}>
                  <div className="row">
                    <CompStatusBadge status={featured.status} />
                    <span className="badge plain">
                      {t(KIND_LABELS[featured.kind])} · {featured.mode}
                    </span>
                  </div>
                  <h2 className="hero-card-title">{featured.name}</h2>
                  <p className="muted">
                    {t(FORMAT_LABELS[featured.format])}
                    {featured.season ? ` · ${featured.season}` : ""}
                  </p>
                  <dl className="hero-facts">
                    <div>
                      <dt>{t("Участники")}</dt>
                      <dd className="num">
                        {counts?.active ?? 0}/{featured.capacity}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("Призовой фонд")}</dt>
                      <dd className="gold">{prize ?? t("Будет объявлен")}</dd>
                    </div>
                    <div>
                      <dt>{t("Старт")}</dt>
                      <dd>{fmtDate(featured.start_at, featured.timezone, t)}</dd>
                    </div>
                  </dl>
                </div>
                <div className="hero-actions">
                  {startsInFuture && (
                    <div className="stack" style={{ gap: 8 }}>
                      <span className="small faint">{t("До старта")}</span>
                      <Countdown to={new Date(featured.start_at!).toISOString()} />
                    </div>
                  )}
                  <div className="row">
                    {featured.status === "registration" ? (
                      <Link href={`/c/${featured.slug}/register`} className="btn btn-gold btn-lg">
                        {t("Зарегистрироваться")}
                      </Link>
                    ) : (
                      <Link href={`/c/${featured.slug}`} className="btn btn-gold btn-lg">
                        {t("Открыть турнир")}
                      </Link>
                    )}
                    <Link href={`/c/${featured.slug}`} className="btn btn-ghost btn-lg">
                      {t("Подробнее")}
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="stack" style={{ gap: 12, minWidth: 0 }}>
                  <h2 className="hero-card-title">{settings.site_name}</h2>
                  <p className="muted">
                    {t(settings.tagline)}. {t("Скоро здесь появится первое соревнование.")}
                  </p>
                </div>
                <div className="hero-actions">
                  <div className="row">
                    {user ? (
                      <Link href="/me" className="btn btn-gold btn-lg">{t("Мой кабинет")}</Link>
                    ) : (
                      <Link href="/signup" className="btn btn-gold btn-lg">{t("Создать аккаунт")}</Link>
                    )}
                    <Link href="/competitions" className="btn btn-ghost btn-lg">{t("Соревнования")}</Link>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="wrap" style={{ paddingTop: 24 }}>
        <Flash sp={sp} />
      </div>

      <div className="wrap" style={{ paddingTop: 12 }}>
        <EventBanner userId={user?.id ?? null} />
      </div>
      {user && (
        <div className="wrap" style={{ paddingTop: 12 }}>
          <StartNudge userId={user.id} />
        </div>
      )}
      {pulseComp && <HomePulse comp={pulseComp} userId={user?.id ?? null} />}

      {news.length > 0 && (
        <section className="wrap section" style={{ paddingBottom: 0 }}>
          <div className="section-head">
            <h2>{t("Объявления")}</h2>
          </div>
          <div className="list">
            {news.map((a) => (
              <article key={a.id} className="list-row" style={{ alignItems: "flex-start", flexDirection: "column", gap: 6 }}>
                <div className="row">
                  {a.pinned && <span className="badge gold plain">{t("Закреплено")}</span>}
                  {a.competition_name && <span className="tag">{a.competition_name}</span>}
                  <span className="small faint">{fmtDate(a.created_at, featured?.timezone ?? "Asia/Tashkent", t)}</span>
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
            <h2>{t("Ближайшие матчи")}</h2>
            <Link href={`/c/${featured.slug}/matches`} className="btn btn-ghost btn-sm">
              {t("Все матчи")}
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
                <h2>{t("Лиги")}</h2>
                <span className="muted small">{t("Сезон, все играют со всеми, таблица")}</span>
              </div>
              {leagues.length ? (
                <div className="comp-list">{leagues.map((c) => <CompetitionRow key={c.id} c={c} />)}</div>
              ) : (
                <div className="empty">{t("Лиг пока нет")}</div>
              )}
            </div>
            <div>
              <div className="section-head">
                <h2>{t("Кубки")}</h2>
                <span className="muted small">{t("Жеребьёвка, группы, плей-офф")}</span>
              </div>
              {cups.length ? (
                <div className="comp-list">{cups.map((c) => <CompetitionRow key={c.id} c={c} />)}</div>
              ) : (
                <div className="empty">{t("Кубков пока нет")}</div>
              )}
            </div>
          </div>
          <aside className="stack">
            <div className="panel stack">
              <h3>{t("Как это работает")}</h3>
              <ol className="muted" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
                <li>{t("Создайте аккаунт с вашим Rocket League ID")}</li>
                <li>{t("Выберите лигу или кубок, 1v1 или 2v2")}</li>
                <li>{t("Для 2v2 пригласите напарника по ссылке")}</li>
                <li>{t("После жеребьёвки смотрите соперников и время матчей")}</li>
                <li>{t("Сыграйте и отправьте счёт, соперник подтверждает")}</li>
              </ol>
            </div>
            <div className="stat-strip" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <b className="num">{totals?.players ?? 0}</b>
                <span>{t("игроков")}</span>
              </div>
              <div>
                <b className="num">{totals?.matches ?? 0}</b>
                <span>{t("матчей сыграно")}</span>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
