import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { q, one, type Queryable } from "./db";
import { DICTS } from "./i18n/dicts";
import { isLocale, makeT, type Locale, type Params, type T } from "./i18n/core";
import { renderStored, fmtDateTime } from "./format";
import { siteUrl } from "./discord";
import { wallet, claimDaily } from "./shop";
import { playerLevel } from "./levels";
import { FormError } from "./errors";

// The bot token lives only in the TELEGRAM_BOT_TOKEN env var (added by the owner).
// The webhook secret is generated here and kept in settings, so nobody has to handle it.
export const telegramConfigured = () => !!process.env.TELEGRAM_BOT_TOKEN;

async function api<R = unknown>(method: string, body: unknown): Promise<R | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const data = (await res.json().catch(() => null)) as { ok: boolean; result: R; error_code?: number } | null;
  if (!data?.ok) {
    // Blocked by the user / chat gone: unlink silently.
    if (data?.error_code === 403 && body && typeof body === "object" && "chat_id" in body) {
      await q("update users set telegram_chat_id = null where telegram_chat_id = $1", [(body as { chat_id: number }).chat_id]);
    }
    return null;
  }
  return data.result;
}

async function setting(key: string) {
  return (await one<{ value: string }>("select value from settings where key = $1", [key]))?.value ?? null;
}
async function putSetting(key: string, value: string) {
  await q("insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [key, value]);
}

async function webhookSecret() {
  await q("insert into settings (key, value) values ('tg_webhook_secret', $1) on conflict (key) do nothing", [randomBytes(24).toString("base64url")]);
  return (await setting("tg_webhook_secret"))!;
}

export async function checkWebhookSecret(header: string | null) {
  const secret = await setting("tg_webhook_secret");
  if (!secret || !header) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Registers the webhook and caches the bot username. Runs from the cron tick; cheap when already done. */
export async function ensureTelegram() {
  if (!telegramConfigured()) return { configured: false };
  const url = `${siteUrl()}/api/telegram`;
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const fingerprint = `${url}|${token.slice(0, token.indexOf(":"))}`; // bot id only, never the secret part
  if ((await setting("tg_webhook_for")) === fingerprint && (await setting("tg_username"))) return { configured: true, ready: true };
  const me = await api<{ username: string }>("getMe", {});
  if (!me) return { configured: true, ready: false };
  await putSetting("tg_username", me.username);
  const ok = await api("setWebhook", { url, secret_token: await webhookSecret(), allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
  if (ok) {
    await putSetting("tg_webhook_for", fingerprint);
    await api("setMyCommands", {
      commands: [
        { command: "me", description: "Profile · Profil · Профиль" },
        { command: "next", description: "Next matches · Keyingi o‘yinlar · Ближайшие матчи" },
        { command: "daily", description: "Daily bonus · Kunlik bonus · Ежедневный бонус" },
        { command: "stop", description: "Unlink · Uzish · Отвязать" },
      ],
    });
  }
  return { configured: true, ready: !!ok };
}

export async function botUsername() {
  return telegramConfigured() ? await setting("tg_username") : null;
}

/** One-time deep link that ties this Telegram chat to the signed-in user. */
export async function linkUrl(userId: string) {
  const name = await botUsername();
  if (!name) throw new FormError("Telegram-бот ещё не подключён");
  const code = randomBytes(18).toString("base64url");
  await q("delete from telegram_codes where user_id = $1 or expires_at < now()", [userId]);
  await q("insert into telegram_codes (code, user_id, expires_at) values ($1, $2, now() + interval '15 minutes')", [code, userId]);
  return `https://t.me/${name}?start=${code}`;
}

export async function unlinkTelegram(userId: string) {
  await q("update users set telegram_chat_id = null, telegram_username = null where id = $1", [userId]);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tFor = (loc: Locale) => makeT(loc, DICTS[loc]);
const pickLocale = (stored: string | null | undefined, tg?: string) =>
  isLocale(stored) ? stored : tg?.startsWith("uz") ? "uz" : tg?.startsWith("en") ? "en" : "ru";

const menu = (t: T) => ({
  inline_keyboard: [
    [
      { text: t("Профиль"), callback_data: "me" },
      { text: t("Матчи"), callback_data: "next" },
      { text: t("Бонус дня"), callback_data: "daily" },
    ],
    [{ text: t("Открыть сайт"), url: `${siteUrl()}/me` }],
  ],
});

async function send(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  return api("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
}

/** Queues a notification for users with a linked chat. Called from notify(). */
export async function enqueueTelegram(c: Queryable | undefined, userIds: string[], title: string, body: string, link: string, params: Params) {
  await q(
    `insert into telegram_outbox (chat_id, payload)
     select telegram_chat_id, jsonb_build_object('title', $2::text, 'body', $3::text, 'link', $4::text, 'params', $5::jsonb, 'locale', locale)
     from users where id = any($1::uuid[]) and telegram_chat_id is not null`,
    [userIds, title, body, link, JSON.stringify(params)],
    c,
  );
}

export async function flushTelegram(limit = 40) {
  if (!telegramConfigured()) return { sent: 0 };
  const rows = await q<{ chat_id: string; fresh: boolean; payload: { title: string; body: string; link: string; params: Params; locale: string } }>(
    "delete from telegram_outbox where id in (select id from telegram_outbox order by id limit $1 for update skip locked) returning chat_id, payload, created_at > now() - interval '1 day' as fresh",
    [limit],
  );
  let sent = 0;
  for (const r of rows) {
    if (!r.fresh) continue;
    const p = r.payload;
    const t = tFor(isLocale(p.locale) ? p.locale : "ru");
    const title = renderStored(t, p.title, p.params);
    const body = p.body ? renderStored(t, p.body, p.params) : "";
    const ok = await send(Number(r.chat_id), `<b>${esc(title)}</b>${body ? `\n${esc(body)}` : ""}`, {
      reply_markup: { inline_keyboard: [[{ text: t("Открыть"), url: `${siteUrl()}${p.link || "/me"}` }]] },
    }).catch(() => null);
    if (ok) sent++;
  }
  return { sent };
}

async function profileText(userId: string, t: T) {
  const u = await one<{ nickname: string }>("select rl_nickname as nickname from users where id = $1", [userId]);
  const [w, lvl] = await Promise.all([wallet(userId), playerLevel(userId)]);
  return [
    `<b>${esc(u?.nickname ?? "")}</b>`,
    t("Уровень {n} · {xp} XP", { n: lvl.level, xp: lvl.xp }),
    t("Монеты: {n}", { n: w.balance }),
    w.dailyClaimed ? t("Бонус дня уже получен") : t("Бонус дня ждёт — /daily"),
  ].join("\n");
}

async function nextText(userId: string, t: T) {
  const rows = await q<{ id: string; number: number; comp: string; tz: string; scheduled_at: string | null; play_by: string | null; home: string; away: string }>(
    `select m.id, m.number, c.name as comp, c.timezone as tz, m.scheduled_at, m.play_by, h.name as home, a.name as away
       from matches m
       join competitions c on c.id = m.competition_id
       join entries h on h.id = m.home_entry_id
       join entries a on a.id = m.away_entry_id
      where m.status in ('ready', 'upcoming') and not m.is_bye
        and exists (select 1 from entry_members em where em.user_id = $1 and em.active and em.entry_id in (m.home_entry_id, m.away_entry_id))
      order by coalesce(m.scheduled_at, m.play_by) nulls last
      limit 5`,
    [userId],
  );
  if (!rows.length) return t("Ближайших матчей нет.");
  return [
    `<b>${esc(t("Ближайшие матчи"))}</b>`,
    ...rows.map(
      (m) =>
        `• <a href="${siteUrl()}/match/${m.id}">${esc(m.home)} — ${esc(m.away)}</a>\n  ${esc(m.comp)} · ${
          m.scheduled_at ? esc(fmtDateTime(m.scheduled_at, m.tz, t)) : m.play_by ? esc(t("Сыграть до: {when}.", { when: fmtDateTime(m.play_by, m.tz, t) })) : esc(t("время не назначено"))
        }`,
    ),
  ].join("\n");
}

type Update = {
  message?: { chat: { id: number; type: string }; from?: { username?: string; language_code?: string }; text?: string };
  callback_query?: { id: string; data?: string; from: { username?: string; language_code?: string }; message?: { chat: { id: number } } };
};

/** Handles one webhook update. Never throws: Telegram retries on errors. */
export async function handleUpdate(u: Update) {
  const chatId = u.message?.chat.id ?? u.callback_query?.message?.chat.id;
  if (!chatId) return;
  if (u.message && u.message.chat.type !== "private") return;
  const from = u.message?.from ?? u.callback_query?.from;
  if (u.callback_query) await api("answerCallbackQuery", { callback_query_id: u.callback_query.id });
  const text = (u.message?.text ?? "").trim();
  const cmd = u.callback_query?.data ?? (text.startsWith("/") ? text.slice(1).split(/[\s@]/)[0] : "");
  const user = await one<{ id: string; locale: string }>("select id, locale from users where telegram_chat_id = $1", [chatId]);
  const t = tFor(pickLocale(user?.locale, from?.language_code));

  if (cmd === "start") {
    const code = text.split(/\s+/)[1];
    if (code) {
      const row = await one<{ user_id: string }>("delete from telegram_codes where code = $1 and expires_at > now() returning user_id", [code]);
      if (!row) return send(chatId, t("Ссылка устарела. Откройте кабинет на сайте и нажмите «Привязать Telegram» ещё раз."));
      await q("update users set telegram_chat_id = null where telegram_chat_id = $1", [chatId]);
      await q("update users set telegram_chat_id = $2, telegram_username = $3 where id = $1", [row.user_id, chatId, from?.username ?? null]);
      const lt = tFor(pickLocale((await one<{ locale: string }>("select locale from users where id = $1", [row.user_id]))?.locale, from?.language_code));
      return send(chatId, `${esc(lt("Telegram привязан! Сюда будут приходить матчи, результаты и напоминания."))}\n\n${await profileText(row.user_id, lt)}`, { reply_markup: menu(lt) });
    }
    if (user) return send(chatId, await profileText(user.id, t), { reply_markup: menu(t) });
    return send(chatId, esc(t("Привет! Это бот RL Championship. Чтобы получать уведомления, откройте кабинет на сайте и нажмите «Привязать Telegram».")), {
      reply_markup: { inline_keyboard: [[{ text: t("Открыть сайт"), url: `${siteUrl()}/me` }]] },
    });
  }
  if (!user) {
    return send(chatId, esc(t("Сначала привяжите аккаунт: кабинет на сайте → «Привязать Telegram».")), {
      reply_markup: { inline_keyboard: [[{ text: t("Открыть сайт"), url: `${siteUrl()}/me` }]] },
    });
  }
  if (cmd === "me") return send(chatId, await profileText(user.id, t), { reply_markup: menu(t) });
  if (cmd === "next") return send(chatId, await nextText(user.id, t), { reply_markup: menu(t) });
  if (cmd === "daily") {
    try {
      const r = await claimDaily(user.id);
      return send(chatId, esc(t("+{n} монет! Серия: {d} дн.", { n: r.amount, d: r.streak })), { reply_markup: menu(t) });
    } catch (e) {
      return send(chatId, esc(e instanceof FormError ? t(e.message, e.params) : t("Не получилось, попробуйте позже.")), { reply_markup: menu(t) });
    }
  }
  if (cmd === "stop") {
    await unlinkTelegram(user.id);
    return send(chatId, esc(t("Telegram отвязан. Уведомления сюда больше не придут.")));
  }
  return send(chatId, esc(t("Выберите действие:")), { reply_markup: menu(t) });
}
