import { StartNudge } from "@/components/StartNudge";
import Link from "next/link";
import { requireUser, ROLE_LABELS } from "@/lib/auth";
import { q } from "@/lib/db";
import { ENTRY_STATUS_LABELS, PLATFORM_LABELS, fmtDateTime } from "@/lib/format";
import { updateProfile, changePassword, logout, discordPrefs } from "../actions/auth";
import { DiscordButton } from "@/components/DiscordButton";
import { one } from "@/lib/db";
import { Flash, MatchStatusBadge, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ProfileFields } from "@/components/ProfileFields";
import { getT } from "@/lib/i18n/server";
import { playerLevel } from "@/lib/levels";
import { FRAMES } from "@/lib/engine/levels";
import { frameAction } from "../actions/duels";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Мой кабинет") };
}
export const dynamic = "force-dynamic";

export default async function Me({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const user = await requireUser("/me");
  const extra = await one<{ discord_username: string | null; discord_dm: boolean; has_password: boolean }>(
    "select discord_username, discord_dm, password_hash is not null as has_password from users where id = $1",
    [user.id],
  );
  const [entries, matches, judging, lvl, frameRow] = await Promise.all([
    q<{ id: string; name: string; status: string; number: number; slug: string; comp: string; mode: string }>(
      `select e.id, e.name, e.status, e.number, c.slug, c.name as comp, c.mode
         from entry_members em join entries e on e.id = em.entry_id join competitions c on c.id = e.competition_id
        where em.user_id = $1 and em.active order by e.created_at desc`,
      [user.id],
    ),
    q<{ id: string; number: number; status: "ready"; scheduled_at: Date | null; home_name: string | null; away_name: string | null; comp: string; timezone: string }>(
      `select m.id, m.number, m.status, m.scheduled_at, he.name as home_name, ae.name as away_name, c.name as comp, c.timezone
         from matches m join competitions c on c.id = m.competition_id
         left join entries he on he.id = m.home_entry_id left join entries ae on ae.id = m.away_entry_id
        where c.draw_state = 'published' and m.status not in ('completed') and not m.is_bye
          and (m.home_entry_id in (select entry_id from entry_members where user_id = $1 and active)
            or m.away_entry_id in (select entry_id from entry_members where user_id = $1 and active))
        order by m.scheduled_at nulls last, m.number limit 10`,
      [user.id],
    ),
    q<{ id: string; number: number; round: number; status: "ready"; scheduled_at: Date | null; play_by: Date | null; home_name: string | null; away_name: string | null; comp: string; timezone: string }>(
      `select m.id, m.number, m.round, m.status, m.scheduled_at, m.play_by, he.name as home_name, ae.name as away_name, c.name as comp, c.timezone
         from matches m join competitions c on c.id = m.competition_id
         left join entries he on he.id = m.home_entry_id left join entries ae on ae.id = m.away_entry_id
        where m.referee_user_id = $1 and m.status <> 'completed' and not m.is_bye
        order by m.scheduled_at nulls last, m.round, m.number limit 20`,
      [user.id],
    ),
    playerLevel(user.id),
    one<{ card_frame: string }>("select card_frame from users where id = $1", [user.id]),
  ]);

  return (
    <div className="wrap section stack-lg">
      <div className="row between">
        <div>
          <h1 style={{ fontSize: "2.2rem" }}>{user.rl_nickname}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {PLATFORM_LABELS[user.platform]} · {user.rl_id} · {t(ROLE_LABELS[user.role])}
          </p>
        </div>
        <div className="row">
          <Link href={`/players/${user.id}`} className="btn btn-ghost">{t("Публичный профиль")}</Link>
          <form action={logout}>
            <button className="btn btn-ghost">{t("Выйти")}</button>
          </form>
        </div>
      </div>
      <Flash sp={sp} />
      <StartNudge userId={user.id} />

      <div className="split">
        <div className="stack-lg">
          {judging.length > 0 && (
            <section className="stack">
              <div className="row between">
                <h2 style={{ fontSize: "1.3rem" }}>⚖ {t("Матчи, которые я сужу")}</h2>
                <Link className="btn btn-sm" href="/referee">{t("Кабинет судьи")} →</Link>
              </div>
              <div className="list">
                {judging.map((m) => (
                  <Link key={m.id} href={`/match/${m.id}`} className="list-row">
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>
                        {m.home_name ?? "?"} vs {m.away_name ?? "?"}
                      </b>
                      <span className="small muted" style={{ display: "block" }}>
                        {m.comp} · {t("Тур {n}", { n: m.round })} · #{m.number} ·{" "}
                        {m.scheduled_at
                          ? fmtDateTime(m.scheduled_at, m.timezone, t)
                          : m.play_by
                            ? t("до {date}", { date: fmtDateTime(m.play_by, m.timezone, t) })
                            : t("время не согласовано")}
                      </span>
                    </span>
                    <span className="badge gold plain">{t("Внести счёт")}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <section className="stack">
            <h2 style={{ fontSize: "1.3rem" }}>{t("Мои ближайшие матчи")}</h2>
            {matches.length ? (
              <div className="list">
                {matches.map((m) => (
                  <Link key={m.id} href={`/match/${m.id}`} className="list-row">
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>
                        {m.home_name ?? "?"} vs {m.away_name ?? "?"}
                      </b>
                      <span className="small muted" style={{ display: "block" }}>
                        {m.comp} · #{m.number} · {fmtDateTime(m.scheduled_at, m.timezone, t)}
                      </span>
                    </span>
                    <MatchStatusBadge status={m.status} />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="empty">{t("Нет предстоящих матчей")}</div>
            )}
          </section>
          <section className="stack">
            <h2 style={{ fontSize: "1.3rem" }}>{t("Мои соревнования")}</h2>
            {entries.length ? (
              <div className="list">
                {entries.map((e) => (
                  <Link key={e.id} href={`/c/${e.slug}`} className="list-row">
                    <span style={{ flex: 1 }}>
                      <b>{e.comp}</b>
                      <span className="small muted" style={{ display: "block" }}>
                        {e.mode === "2v2" ? t("Команда {team}", { team: e.name }) : "1v1"} · #{e.number}
                      </span>
                    </span>
                    <span className="badge">{t(ENTRY_STATUS_LABELS[e.status])}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="empty">
                <p>{t("Вы ещё не участвуете ни в одном соревновании.")}</p>
                <Link href="/competitions" className="btn" style={{ marginTop: 16 }}>{t("Выбрать соревнование")}</Link>
              </div>
            )}
          </section>
        </div>

        <aside className="stack-lg">
          <section className="panel stack">
            <h3>Discord</h3>
            {extra?.discord_username ? (
              <>
                <p className="muted small">{t("Привязан: {name}", { name: extra.discord_username })}</p>
                <div className="row">
                  <form action={discordPrefs}>
                    <input type="hidden" name="action" value={extra.discord_dm ? "dm_off" : "dm_on"} />
                    <SubmitButton className="btn btn-ghost btn-sm">{extra.discord_dm ? t("Отключить сообщения от бота") : t("Включить сообщения от бота")}</SubmitButton>
                  </form>
                  <form action={discordPrefs}>
                    <input type="hidden" name="action" value="unlink" />
                    <SubmitButton className="btn btn-danger btn-sm" confirm={t("Отвязать Discord?")}>{t("Отвязать")}</SubmitButton>
                  </form>
                </div>
              </>
            ) : (
              <>
                <p className="muted small">{t("Привяжите Discord: бот будет присылать соперников и напоминания о матчах, а входить можно будет в один клик.")}</p>
                <DiscordButton mode="link" label={t("Привязать Discord")} />
              </>
            )}
          </section>
          <section className="panel stack">
            <h3>{t("Рамка карточки")}</h3>
            <p className="muted small" style={{ margin: 0 }}>{t("Новые рамки открываются с уровнем. Ваш уровень: {n}", { n: lvl.level })}</p>
            <form action={frameAction} className="frame-pick">
              {FRAMES.map((f) => {
                const open = f.level <= lvl.level;
                return (
                  <label key={f.key} className={`frame-opt fut-frame-${f.key}${open ? "" : " locked"}`}>
                    <input type="radio" name="frame" value={f.key} defaultChecked={(frameRow?.card_frame ?? "none") === f.key} disabled={!open} />
                    <span className="frame-swatch" aria-hidden />
                    <span>{t(f.name)}</span>
                    {!open && <small>🔒 {t("ур. {n}", { n: f.level })}</small>}
                  </label>
                );
              })}
              <SubmitButton className="btn btn-sm">{t("Сохранить")}</SubmitButton>
            </form>
          </section>
          <form action={updateProfile} className="panel stack">
            <h3>{t("Профиль")}</h3>
            <div className="stack">
              <ProfileFields u={user} />
            </div>
            <SubmitButton className="btn">{t("Сохранить")}</SubmitButton>
          </form>
          <form action={changePassword} className="panel stack" id="password">
            <h3>{t("Пароль")}</h3>
            {extra?.has_password ? (
              <label className="field">
                <span>{t("Текущий пароль")}</span>
                <input className="input" type="password" name="current" required autoComplete="current-password" />
              </label>
            ) : (
              <p className="small muted">{t("Вы входите через Discord. Задайте пароль, чтобы входить и по email.")}</p>
            )}
            <label className="field">
              <span>{t("Новый пароль")}</span>
              <input className="input" type="password" name="password" required minLength={8} autoComplete="new-password" />
            </label>
            <SubmitButton className="btn btn-ghost">{t("Сменить пароль")}</SubmitButton>
          </form>
        </aside>
      </div>
    </div>
  );
}
