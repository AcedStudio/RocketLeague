import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { Flash, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Crest } from "@/components/Crest";
import { CrestPicker } from "@/components/CrestPicker";
import { Avatar, Nick, UserBadge } from "@/components/Badge";
import { Icon } from "@/components/Icon";
import { Coin } from "@/components/shop";
import { siteUrl } from "@/lib/discord";
import { clubByTag, clubMembers, clubGoalState, clubOf } from "@/lib/clubs";
import { rankOf } from "@/lib/engine/ranks";
import { CLUB_MAX } from "@/lib/engine/clubs";
import { joinClubAction, leaveClubAction, kickAction, updateClubAction, clubGoalAction } from "@/app/actions/clubs";

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }) {
  const club = await clubByTag((await params).tag);
  return { title: club ? `${club.name} [${club.tag}]` : "Club" };
}

export default async function ClubPage({ params, searchParams }: { params: Promise<{ tag: string }>; searchParams: SP }) {
  const [{ tag }, sp, t, user] = await Promise.all([params, searchParams, getT(), getUser()]);
  const club = await clubByTag(tag);
  if (!club) notFound();
  const [members, mine] = await Promise.all([clubMembers(club.id), user ? clubOf(user.id) : null]);
  const goal = await clubGoalState(club.id, user?.id ?? null, members);
  const isMember = !!mine && mine.id === club.id;
  const isOwner = isMember && mine?.role === "owner";
  const points = members.reduce((s, m) => s + m.points, 0);
  const avgRating = members.length ? Math.round(members.reduce((s, m) => s + m.rating, 0) / members.length) : 0;

  return (
    <div className="wrap section stack-lg">
      <Flash sp={sp} />
      <header className="club-hero" style={{ ["--c1" as string]: "var(--accent)" }}>
        <Crest icon={club.crest_icon} color={club.crest_color} shape={club.crest_shape} size={132} />
        <div className="club-hero-text">
          <p className="eyebrow">{t("Клуб")}</p>
          <h1 className="pass-title">
            {club.name} <span className="club-tag big">[{club.tag}]</span>
          </h1>
          {club.motto && <p className="club-motto">«{club.motto}»</p>}
          <div className="pass-facts">
            <span><b className="num">{members.length}</b>/{CLUB_MAX} {t("участников")}</span>
            <span><b className="num">{points.toLocaleString("ru-RU")}</b> {t("очков сезона")}</span>
            <span><b className="num">{avgRating}</b> {t("средний ELO")}</span>
          </div>
          <div className="row">
            {user && !mine && (club.open || sp.code) && (members.length < CLUB_MAX) && (
              <form action={joinClubAction}>
                <input type="hidden" name="club" value={club.id} />
                <input type="hidden" name="tag" value={club.tag} />
                {typeof sp.code === "string" && <input type="hidden" name="code" value={sp.code} />}
                <SubmitButton className="btn btn-gold">{t("Вступить в клуб")}</SubmitButton>
              </form>
            )}
            {isMember && (
              <form action={leaveClubAction}>
                <SubmitButton className="btn btn-ghost btn-sm" confirm={t("Покинуть клуб {name}?", { name: club.name })}>{t("Покинуть клуб")}</SubmitButton>
              </form>
            )}
          </div>
        </div>
      </header>

      <section className="pass-card">
        <div className="pass-card-head">
          <h2>{t("Цель недели")}</h2>
          <span className="timer">{t("Обновятся в понедельник")}</span>
        </div>
        <div className="quest is-goal">
          <span className="quest-icon"><Icon name="q-match" size={38} /></span>
          <div className="quest-main">
            <b>{t("Сыграйте всем клубом {n} игр — матчи и дуэли", { n: goal.target })}</b>
            <span className="meter-row">
              <span className="meter"><i style={{ width: `${Math.round((goal.value / goal.target) * 100)}%` }} /></span>
              <span className="small num faint">{goal.value} / {goal.target}</span>
            </span>
          </div>
          <div className="quest-reward"><span className="chip-coin num">+{goal.reward} <Coin size={12} /></span></div>
          <div className="quest-act">
            {isMember && goal.done && !goal.claimed ? (
              <form action={clubGoalAction}><SubmitButton className="btn btn-gold btn-sm">{t("Забрать")}</SubmitButton></form>
            ) : goal.claimed ? (
              <Icon name="r-check" size={26} />
            ) : (
              <span className="small faint">{t("каждому участнику")}</span>
            )}
          </div>
        </div>
      </section>

      <section className="stack">
        <h2 className="section-title">{t("Состав")}</h2>
        <div className="club-roster">
          {members.map((m) => {
            const r = rankOf(m.rating, m.games);
            return (
              <div key={m.user_id} className="roster-row">
                <Link href={`/players/${m.user_id}`} className="who">
                  <Avatar name={m.nick} avatar={m.avatar} size={36} />
                  <span className="roster-name">
                    <b><Nick name={m.nick} color={m.name_color} /></b>
                    <span className="small muted">{m.role === "owner" ? t("Владелец") : t("Участник")}</span>
                  </span>
                </Link>
                <UserBadge value={m.badge} size="sm" />
                <span className="rank-chip" style={{ ["--tier" as string]: r.placed ? r.tier.color : "var(--ink-faint)" }}>
                  <Icon name={r.placed ? `rk-${r.tier.key}` : "rk-unranked"} size={22} /> {r.placed ? r.label : t("Калибровка")}
                </span>
                <span className="num small"><b>{m.points}</b> {t("очков")}</span>
                <span className="num small muted">{t("{n} игр за неделю", { n: m.week })}</span>
                {isOwner && m.user_id !== user?.id ? (
                  <form action={kickAction}>
                    <input type="hidden" name="club" value={club.id} />
                    <input type="hidden" name="tag" value={club.tag} />
                    <input type="hidden" name="user" value={m.user_id} />
                    <SubmitButton className="slot-clear" confirm={t("Исключить {name} из клуба?", { name: m.nick })}>{t("Исключить")}</SubmitButton>
                  </form>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {isOwner && (
        <section id="edit" className="pass-card">
          <div className="pass-card-head">
            <h2>{t("Настройки клуба")}</h2>
          </div>
          {!club.open && (
            <p className="small">
              {t("Ссылка-приглашение:")} <code className="invite">{`${siteUrl()}/clubs/join/${club.invite_code}`}</code>
            </p>
          )}
          <form action={updateClubAction} className="stack">
            <div className="grid-2">
              <label className="field"><span>{t("Название")}</span><input name="name" defaultValue={club.name} required minLength={3} maxLength={24} /></label>
              <label className="field"><span>{t("Тег (2–5 латинских букв или цифр)")}</span><input name="tag" defaultValue={club.tag} required minLength={2} maxLength={5} /></label>
            </div>
            <label className="field"><span>{t("Девиз (необязательно)")}</span><input name="motto" defaultValue={club.motto} maxLength={80} /></label>
            <label className="check"><input type="checkbox" name="open" defaultChecked={club.open} /> {t("Открытый клуб — любой может вступить")}</label>
            <CrestPicker initial={{ icon: club.crest_icon, color: club.crest_color, shape: club.crest_shape }} labels={{ shape: t("Форма"), color: t("Цвет"), icon: t("Эмблема") }} />
            <SubmitButton className="btn">{t("Сохранить")}</SubmitButton>
          </form>
        </section>
      )}
    </div>
  );
}
