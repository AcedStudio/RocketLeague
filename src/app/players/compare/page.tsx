import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { getUser } from "@/lib/auth";
import { Icon } from "@/components/Icon";
import { Avatar, Nick, UserBadge } from "@/components/Badge";
import { FormStrip, Gauge } from "@/components/ProStats";
import { compareCard, headToHead, findPlayer, pickablePlayers } from "@/lib/prostats";
import { ComparePicker } from "@/components/PlayerPicker";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Compare · RL Championship" };

type SP = Promise<{ a?: string; b?: string }>;

export default async function Compare({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const viewer = await getUser();
  const [aId, bId, players] = await Promise.all([findPlayer(sp.a ?? viewer?.id), findPlayer(sp.b), pickablePlayers()]);
  const [A, B] = await Promise.all([aId ? compareCard(aId) : null, bId ? compareCard(bId) : null]);
  const h2h = A && B && A.user.id !== B.user.id ? await headToHead(A.user.id, B.user.id) : null;

  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const rows: { label: string; a: number; b: number; fmt?: (n: number) => string; lowerBetter?: boolean }[] =
    A && B
      ? [
          { label: t("Рейтинг 1v1"), a: A.ratings[0].rating, b: B.ratings[0].rating },
          { label: t("Рейтинг 2v2"), a: A.ratings[1].rating, b: B.ratings[1].rating },
          { label: t("Пик рейтинга"), a: Math.max(A.ratings[0].peak, A.ratings[1].peak), b: Math.max(B.ratings[0].peak, B.ratings[1].peak) },
          { label: t("Матчей"), a: A.stats.games, b: B.stats.games },
          { label: t("Побед"), a: A.stats.winrate, b: B.stats.winrate, fmt: pct },
          { label: t("Форма"), a: A.stats.formScore, b: B.stats.formScore },
          { label: t("Лучшая серия"), a: A.stats.bestStreak, b: B.stats.bestStreak },
          { label: t("Голов за матч"), a: A.stats.avgFor, b: B.stats.avgFor, fmt: (n) => n.toFixed(1) },
          { label: t("Пропущено за матч"), a: A.stats.avgAgainst, b: B.stats.avgAgainst, fmt: (n) => n.toFixed(1), lowerBetter: true },
          { label: t("Сухих матчей"), a: A.stats.cleanSheets, b: B.stats.cleanSheets },
          { label: t("Активных дней"), a: A.activity.activeDays, b: B.activity.activeDays },
        ]
      : [];

  const side = (C: NonNullable<typeof A>) => (
    <Link href={`/players/${C.user.id}`} className="cmp-side" style={{ color: "inherit", textDecoration: "none" }}>
      <Avatar name={C.user.rl_nickname} avatar={C.user.avatar} size={72} />
      <h2 style={{ fontSize: "1.25rem" }}><Nick name={C.user.rl_nickname} color={C.user.name_color} /></h2>
      <UserBadge value={C.user.equipped_badge} t={t} />
      <Gauge value={C.stats.formScore} label={t("форма")} />
      <FormStrip form={C.stats.form} t={t} />
    </Link>
  );

  return (
    <div className="wrap section stack-lg">
      <div className="row between">
        <h1 className="hall-title"><Icon name="ui-duels" size={30} /> {t("Сравнение игроков")}</h1>
      </div>
      <ComparePicker players={players} a={A?.user.id ?? null} b={B?.user.id ?? null} />
      {(sp.a || sp.b) && (!A || !B) && <div className="empty">{t("Игрок не найден — проверьте ник.")}</div>}
      {A && B && (
        <>
          <div className="cmp">
            {side(A)}
            <span className="cmp-vs">VS</span>
            {side(B)}
          </div>
          {h2h && (
            <section className="panel stack">
              <div className="row between">
                <b>{t("Личные встречи")}</b>
                <span className="num" style={{ fontWeight: 800, fontSize: "1.2rem" }}>
                  {h2h.aWins} : {h2h.bWins}
                </span>
              </div>
              {h2h.aWins + h2h.bWins > 0 ? (
                <>
                  <span className="h2h-bar">
                    <i className="a" style={{ width: `${(h2h.aWins / (h2h.aWins + h2h.bWins)) * 100}%` }} />
                    <i className="b" style={{ flex: 1 }} />
                  </span>
                  <span className="small muted">{t("Голы {gf}:{ga}", { gf: h2h.aGoals, ga: h2h.bGoals })}</span>
                  <div className="list">
                    {h2h.list.map((x) => (
                      <Link key={x.id} href={x.kind === "match" ? `/match/${x.id}` : `/duels`} className="list-row">
                        <b className={x.a_won ? "push-on" : "danger-ink"} style={{ width: 22 }}>{x.a_won ? t("В") : t("П")}</b>
                        <span style={{ flex: 1 }}>
                          <b className="num">{x.a_goals ?? 0}:{x.b_goals ?? 0}</b>{" "}
                          <span className="small muted">{x.kind === "duel" ? t("Дуэль") : x.comp}</span>
                        </span>
                        <span className="small muted">{fmtDate(x.at, "Asia/Tashkent", t)}</span>
                      </Link>
                    ))}
                  </div>
                </>
              ) : (
                <span className="small muted">{t("Они ещё не встречались. Самое время бросить вызов!")}</span>
              )}
            </section>
          )}
          <div className="cmp-rows">
            {rows.map((r) => {
              const f = r.fmt ?? ((n: number) => String(n));
              const aBetter = r.lowerBetter ? r.a < r.b : r.a > r.b;
              const bBetter = r.lowerBetter ? r.b < r.a : r.b > r.a;
              return (
                <div key={r.label} className="cmp-row">
                  <b className={`num${aBetter ? " win" : ""}`}>{f(r.a)}</b>
                  <span>{r.label}</span>
                  <b className={`num${bBetter ? " win" : ""}`}>{f(r.b)}</b>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
