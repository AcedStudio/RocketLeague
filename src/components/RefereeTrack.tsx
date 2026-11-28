import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Gauge } from "@/components/ProStats";
import { SubmitButton } from "@/components/client";
import { Coin } from "@/components/shop";
import { Avatar, Nick } from "@/components/Badge";
import { claimRefTierAction } from "@/app/actions/referee";
import { reliabilityLabel } from "@/lib/engine/referee";
import type { refereeProfile, topReferees } from "@/lib/referee-rank";
import type { T } from "@/lib/i18n/core";

type Profile = Awaited<ReturnType<typeof refereeProfile>>;
type Top = Awaited<ReturnType<typeof topReferees>>;

const dur = (min: number | null, t: T) => (min === null ? "—" : min < 60 ? t("{n} мин", { n: min }) : t("{n} ч", { n: Math.round(min / 6) / 10 }));

export function RefereeTrack({ p, top, me, t }: { p: Profile; top: Top; me: string; t: T }) {
  const next = p.track.find((x) => !x.reached);
  return (
    <section className="stack" id="track">
      <div className="ref-hero">
        {p.score !== null ? <Gauge value={p.score} label={t("надёжность")} /> : <Icon name="q-ref" size={56} />}
        <div className="stack" style={{ gap: 4 }}>
          <b style={{ fontSize: "1.15rem" }}>{p.score !== null ? t(reliabilityLabel(p.score)) : t("Судейский путь")}</b>
          <span className="small muted">
            {t("Быстрый результат (до 6 часов после начала) — {a} монет, обычный — {b}.", { a: 25, b: 10 })}
          </span>
          {p.overdue > 0 && <span className="small danger-ink">{t("Просрочено матчей: {n} — внесите счёт, это снижает надёжность.", { n: p.overdue })}</span>}
        </div>
        <div className="ref-kpis">
          <div><b className="num">{p.count}</b><span>{t("отсужено")}</span></div>
          <div><b className="num">{dur(p.avgMinutes, t)}</b><span>{t("в среднем до счёта")}</span></div>
          <div><b className="num">{p.corrections}</b><span>{t("исправлений")}</span></div>
          <div><b className="num row" style={{ gap: 4, justifyContent: "center" }}><Coin />{p.earned}</b><span>{t("заработано")}</span></div>
        </div>
      </div>

      <div className="ref-track">
        {p.track.map((tier) => (
          <div key={tier.key} className={`ref-tier${tier.reached ? " on" : ""}${tier.claimed ? " done" : ""}`}>
            <Icon name={tier.icon} size={48} />
            <b>{tier.name}</b>
            <small className="muted">{t("{n} матч(ей)", { n: tier.need })}</small>
            <span className="ref-reward small">
              <Coin /> {tier.reward.coins}
              {tier.reward.item && <> + <Icon name={tier.reward.item.startsWith("tag:") ? `t-${tier.reward.item.slice(4)}` : `av-${tier.reward.item.split(":")[1]}`} size={18} /></>}
            </span>
            {tier.claimed ? (
              <Icon name="r-check" size={22} />
            ) : tier.reached ? (
              <form action={claimRefTierAction}>
                <input type="hidden" name="key" value={tier.key} />
                <SubmitButton className="btn btn-sm">{t("Забрать")}</SubmitButton>
              </form>
            ) : (
              <Icon name="r-lock" size={18} />
            )}
          </div>
        ))}
      </div>
      {next && <span className="small muted">{t("До «{name}»: ещё {n} матч(ей).", { name: next.name, n: next.need - p.count })}</span>}

      {top.length > 0 && (
        <div className="panel stack">
          <b>{t("Судьи месяца")}</b>
          <div className="list">
            {top.map((r, i) => (
              <Link key={r.id} href={`/players/${r.id}`} className={`list-row${r.id === me ? " me" : ""}`}>
                <b className="num" style={{ width: 22 }}>{i + 1}</b>
                <Avatar name={r.rl_nickname} avatar={r.avatar} size={28} />
                <span style={{ flex: 1 }}><Nick name={r.rl_nickname} color={r.name_color} /></span>
                <span className="small muted">{dur(r.avg, t)}</span>
                <b className="num">{r.n}</b>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
