import { requireAdmin } from "@/lib/auth";
import { one } from "@/lib/db";
import { getDiscordSettings, oauthConfigured, botConfigured, discordEnv, siteUrl } from "@/lib/discord";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n/core";
import { saveDiscordSettings, discordAction } from "@/app/actions/admin";
import { Flash, type SP } from "@/components/ui";
import { SubmitButton, CopyField } from "@/components/client";
import { getT } from "@/lib/i18n/server";

export default async function AdminDiscord({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  await requireAdmin();
  const [s, stats] = await Promise.all([
    getDiscordSettings(),
    one<{ linked: number; pending: number; failed: number }>(
      `select (select count(*)::int from users where discord_id is not null) as linked,
              (select count(*)::int from discord_outbox where sent_at is null and attempts < 5) as pending,
              (select count(*)::int from discord_outbox where sent_at is null and attempts >= 5) as failed`,
    ),
  ]);
  const env = discordEnv();
  const base = siteUrl();
  const checks: [string, boolean][] = [
    ["DISCORD_CLIENT_ID", !!env.clientId],
    ["DISCORD_CLIENT_SECRET", !!env.clientSecret],
    ["DISCORD_BOT_TOKEN", !!env.botToken],
    ["DISCORD_PUBLIC_KEY", !!env.publicKey],
  ];
  const act = (action: string, label: string, cls = "btn btn-ghost") => (
    <form action={discordAction}>
      <input type="hidden" name="action" value={action} />
      <SubmitButton className={cls} pendingText={t("Отправляем…")}>{label}</SubmitButton>
    </form>
  );

  return (
    <>
      <h1 style={{ fontSize: "2rem" }}>Discord</h1>
      <Flash sp={sp} />

      <div className="kpis">
        <div className="kpi">
          <b>{oauthConfigured() ? "✓" : "—"}</b>
          <span>{t("Вход через Discord")}</span>
        </div>
        <div className="kpi">
          <b>{botConfigured() ? "✓" : "—"}</b>
          <span>{t("Бот")}</span>
        </div>
        <div className="kpi">
          <b className="num">{stats?.linked ?? 0}</b>
          <span>{t("Привязали Discord")}</span>
        </div>
        <div className={`kpi ${(stats?.failed ?? 0) > 0 ? "alert" : ""}`}>
          <b className="num">{stats?.pending ?? 0}</b>
          <span>{t("В очереди на отправку")}</span>
        </div>
      </div>

      <section className="panel stack">
        <h3>{t("Переменные в Vercel")}</h3>
        <div className="row">
          {checks.map(([k, okv]) => (
            <span key={k} className={`badge ${okv ? "ok" : "danger"}`}>
              {k}
            </span>
          ))}
        </div>
        <p className="small muted">{t("Значения хранятся только в Vercel (Settings → Environment Variables). После изменения сделайте Redeploy.")}</p>
        <div className="stack" style={{ gap: 6 }}>
          <span className="small muted">Redirect URL (OAuth2 → Redirects)</span>
          <CopyField value={`${base}/api/auth/discord/callback`} />
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="small muted">Interactions Endpoint URL (General Information)</span>
          <CopyField value={`${base}/api/discord/interactions`} />
        </div>
        {env.clientId && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="small muted">{t("Ссылка, чтобы добавить бота на сервер")}</span>
            <CopyField value={`https://discord.com/oauth2/authorize?client_id=${env.clientId}&scope=bot%20applications.commands&permissions=268454913`} />
          </div>
        )}
      </section>

      <form action={saveDiscordSettings} className="panel form-grid">
        <h3 className="full">{t("Сервер и каналы")}</h3>
        <p className="small muted full">{t("Включите в Discord: Настройки → Расширенные → Режим разработчика. Затем правый клик по серверу, каналу или роли → «Копировать ID».")}</p>
        <label className="field">
          <span>{t("ID сервера")}</span>
          <input className="input" name="discord_guild_id" inputMode="numeric" defaultValue={s.guildId} />
        </label>
        <label className="field">
          <span>{t("Язык сообщений в каналах")}</span>
          <select className="input" name="discord_locale" defaultValue={s.locale}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>{LOCALE_NAMES[l]}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("Канал для объявлений")}</span>
          <input className="input" name="discord_announce_channel" inputMode="numeric" defaultValue={s.announceChannel} />
          <small>{t("Жеребьёвка, старт регистрации, чемпион, объявления")}</small>
        </label>
        <label className="field">
          <span>{t("Канал для результатов")}</span>
          <input className="input" name="discord_results_channel" inputMode="numeric" defaultValue={s.resultsChannel} />
          <small>{t("Пусто — результаты идут в канал объявлений")}</small>
        </label>
        <label className="field">
          <span>{t("Роль участника")}</span>
          <input className="input" name="discord_participant_role" inputMode="numeric" defaultValue={s.participantRole} />
          <small>{t("Выдаётся автоматически подтверждённым участникам. Роль бота должна быть выше этой роли.")}</small>
        </label>
        <div className="full">
          <SubmitButton className="btn">{t("Сохранить")}</SubmitButton>
        </div>
      </form>

      <section className="panel stack">
        <h3>{t("Проверка")}</h3>
        <div className="row">
          {act("check", t("Проверить сервер"))}
          {act("test", t("Отправить тестовое сообщение"))}
          {act("commands", t("Зарегистрировать команды"))}
          {act("flush", t("Отправить очередь"))}
        </div>
        {(stats?.failed ?? 0) > 0 && <p className="small" style={{ color: "var(--danger)" }}>{t("Не удалось отправить сообщений: {n}. Проверьте права бота.", { n: stats!.failed })}</p>}
      </section>
    </>
  );
}
