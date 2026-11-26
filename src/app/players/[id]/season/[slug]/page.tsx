import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompetitionBySlug } from "@/lib/data";
import { playerSeason } from "@/lib/wrapped";
import { getT } from "@/lib/i18n/server";

type P = { params: Promise<{ id: string; slug: string }> };

export async function generateMetadata({ params }: P) {
  const { id, slug } = await params;
  const t = await getT();
  const comp = await getCompetitionBySlug(slug);
  if (!comp || !/^[0-9a-f-]{36}$/i.test(id)) return {};
  const s = await playerSeason(id, comp.id);
  if (!s) return {};
  const title = t("{name}: сезон в {comp}", { name: s.nickname, comp: comp.name });
  return { title, openGraph: { title, images: [{ url: `/api/season-card/${id}/${comp.id}?lang=${t.locale}`, width: 1080, height: 1350 }] } };
}

export default async function Season({ params }: P) {
  const t = await getT();
  const { id, slug } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const comp = await getCompetitionBySlug(slug);
  if (!comp) notFound();
  const s = await playerSeason(id, comp.id);
  if (!s || !s.story.played) notFound();
  const st = s.story;
  const pct = st.played ? Math.round((st.wins / st.played) * 100) : 0;

  const slides: { key: string; tone: string; body: React.ReactNode }[] = [
    {
      key: "intro",
      tone: "sky",
      body: (
        <>
          <span className="eyebrow">{comp.name}</span>
          <h2 className="wr-huge">{t("Твой сезон")}</h2>
          <p className="wr-lead">{s.nickname}</p>
          <p className="small muted">{s.finished ? t("Сезон завершён") : t("Сезон ещё идёт — цифры обновляются после каждого матча")}</p>
        </>
      ),
    },
    {
      key: "matches",
      tone: "navy",
      body: (
        <>
          <span className="eyebrow">{t("Матчи")}</span>
          <div className="wr-ring" style={{ "--p": pct } as React.CSSProperties}>
            <b className="num">{pct}%</b>
            <small>{t("побед")}</small>
          </div>
          <p className="wr-lead num">
            {t("Победы: {w} · поражения: {l}", { w: st.wins, l: st.losses })}
          </p>
          {st.longestStreak >= 2 && <p className="small">{t("Лучшая серия побед: {n} 🔥", { n: st.longestStreak })}</p>}
        </>
      ),
    },
    {
      key: "goals",
      tone: "cyan",
      body: (
        <>
          <span className="eyebrow">{t("Голы")}</span>
          <h2 className="wr-huge num">{st.goalsFor}</h2>
          <p className="wr-lead">{t("забито · пропущено {n}", { n: st.goalsAgainst })}</p>
          {st.cleanSheets > 0 && <p className="small">🧱 {t("Сухих побед: {n}", { n: st.cleanSheets })}</p>}
        </>
      ),
    },
    ...(st.bestWin
      ? [
          {
            key: "best",
            tone: "gold",
            body: (
              <>
                <span className="eyebrow">{t("Лучший матч")}</span>
                <h2 className="wr-huge num">{st.bestWin.gf}:{st.bestWin.ga}</h2>
                <p className="wr-lead">{t("против {name}", { name: st.bestWin.opponent })}</p>
                <Link className="btn btn-ghost btn-sm" href={`/match/${st.bestWin.matchId}`}>{t("Открыть матч")}</Link>
              </>
            ),
          },
        ]
      : []),
    ...(st.favouriteVictim || st.nemesis
      ? [
          {
            key: "rivals",
            tone: "red",
            body: (
              <>
                <span className="eyebrow">{t("Соперники")}</span>
                {st.favouriteVictim && (
                  <div className="wr-pair">
                    <small>😈 {t("Любимая жертва")}</small>
                    <b>{st.favouriteVictim.name}</b>
                    <span className="small">{t("побед над ним: {n}", { n: st.favouriteVictim.wins })}</span>
                  </div>
                )}
                {st.nemesis && (
                  <div className="wr-pair">
                    <small>👹 {t("Главный кошмар")}</small>
                    <b>{st.nemesis.name}</b>
                    <span className="small">{t("поражений от него: {n}", { n: st.nemesis.losses })}</span>
                  </div>
                )}
              </>
            ),
          },
        ]
      : []),
    {
      key: "awards",
      tone: "purple",
      body: (
        <>
          <span className="eyebrow">{t("Награды")}</span>
          <div className="wr-stats">
            <div><b className="num">{s.playerOfRound}</b><small>⭐ {t("Игрок тура")}</small></div>
            <div><b className="num">{s.teamOfRound}</b><small>🃏 {t("Команда тура")}</small></div>
            <div><b className="num">{s.badges}</b><small>🏅 {t("Значки")}</small></div>
            <div><b className="num">{s.eloChange > 0 ? `+${s.eloChange}` : s.eloChange}</b><small>📈 ELO</small></div>
          </div>
        </>
      ),
    },
    {
      key: "final",
      tone: s.champion ? "gold" : "sky",
      body: (
        <>
          <span className="eyebrow">{s.finished ? t("Итог") : t("Сейчас")}</span>
          {s.champion ? (
            <h2 className="wr-huge">🏆 {t("Чемпион!")}</h2>
          ) : s.position ? (
            <h2 className="wr-huge num">#{s.position}</h2>
          ) : (
            <h2 className="wr-huge">GG</h2>
          )}
          {s.position && <p className="wr-lead">{t("место из {n}", { n: s.players })}</p>}
          <div className="row" style={{ justifyContent: "center" }}>
            <a className="btn" href={`/api/season-card/${id}/${comp.id}?lang=${t.locale}`} download={`rl-season-${slug}.png`}>
              📸 {t("Скачать картинку")}
            </a>
            <Link className="btn btn-ghost" href={`/players/${id}`}>{t("К профилю")}</Link>
          </div>
        </>
      ),
    },
  ];

  return (
    <div className="wrap section stack">
      <div className="wr" aria-label={t("Твой сезон")}>
        {slides.map((sl, i) => (
          <section key={sl.key} id={`s${i + 1}`} className={`wr-slide wr-${sl.tone}`}>
            <span className="wr-count small">{i + 1} / {slides.length}</span>
            {sl.body}
          </section>
        ))}
      </div>
      <nav className="wr-dots" aria-label={t("Слайды")}>
        {slides.map((sl, i) => (
          <a key={sl.key} href={`#s${i + 1}`} aria-label={`${i + 1}`} />
        ))}
      </nav>
      <p className="small faint" style={{ textAlign: "center", margin: 0 }}>{t("Листайте вбок →")}</p>
    </div>
  );
}
