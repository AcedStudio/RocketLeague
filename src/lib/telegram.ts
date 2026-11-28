import "server-only";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { q, one, type Queryable } from "./db";
import { DICTS } from "./i18n/dicts";
import { isLocale, makeT, type Locale, type Params, type T } from "./i18n/core";
import { renderStored, fmtDateTime } from "./format";
import { siteUrl, type MessageSpec } from "./discord";
import { tierLabel } from "./discord-server";
import { getFeaturedCompetition } from "./data";
import { leaderboard, playerRatings } from "./rating";
import { headToHead } from "./prostats";
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
  // A short hash, never the token itself: a rotated token or a new version re-registers the webhook.
  const fingerprint = `v2|${url}|${createHash("sha256").update(token).digest("hex").slice(0, 16)}`;
  if ((await setting("tg_webhook_for")) === fingerprint && (await setting("tg_username"))) return { configured: true, ready: true };
  const me = await api<{ username: string }>("getMe", {});
  if (!me) return { configured: true, ready: false };
  await putSetting("tg_username", me.username);
  const ok = await api("setWebhook", { url, secret_token: await webhookSecret(), allowed_updates: ["message", "callback_query", "my_chat_member"], drop_pending_updates: true });
  if (ok) {
    await putSetting("tg_webhook_for", fingerprint);
    await api("setMyCommands", {
      commands: [
        { command: "me", description: "Profile · Profil · Профиль" },
        { command: "card", description: "Player card · O‘yinchi kartasi · Карточка игрока" },
        { command: "next", description: "Next matches · Keyingi o‘yinlar · Ближайшие матчи" },
        { command: "table", description: "Standings · Jadval · Таблица" },
        { command: "top", description: "Top rating · Reyting topi · Топ рейтинга" },
        { command: "h2h", description: "Head to head · Shaxsiy uchrashuvlar · Личные встречи" },
        { command: "daily", description: "Daily bonus · Kunlik bonus · Ежедневный бонус" },
        { command: "stop", description: "Unlink · Uzish · Отвязать" },
      ],
    });
  }
  return { configured: true, ready: !!ok };
}

export async function botUsername() {
  if (!telegramConfigured()) return null;
  // Connect on first use instead of waiting for the cron tick (also picks up a rotated token).
  await ensureTelegram().catch((e) => console.error("[telegram] ensure", e));
  return await setting("tg_username");
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
      { text: t("Карточка"), callback_data: "card" },
      { text: t("Бонус дня"), callback_data: "daily" },
    ],
    [
      { text: t("Матчи"), callback_data: "next" },
      { text: t("Таблица"), callback_data: "table" },
      { text: t("Топ"), callback_data: "top" },
    ],
    [{ text: t("Открыть сайт"), url: `${siteUrl()}/me` }],
  ],
});

async function send(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  return api("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
}

async function sendPhoto(chatId: number, path: string, caption: string, extra: Record<string, unknown> = {}) {
  const url = `${siteUrl()}${path}`;
  const ok = await api("sendPhoto", { chat_id: chatId, photo: url, caption: caption.slice(0, 1024), parse_mode: "HTML", ...extra });
  // If Telegram can't fetch the picture, still deliver the text.
  return ok ?? send(chatId, caption, extra);
}

// ---------------------------------------------------------------- channel

/** The channel the bot posts to. Set when a linked site admin adds the bot to a channel as an admin. */
export async function telegramChannel() {
  const id = await setting("tg_channel_id");
  return id ? { id: Number(id), title: (await setting("tg_channel_title")) ?? "" } : null;
}

/** Mirrors a Discord channel announcement (results, tables, team of the round…) to the Telegram channel. */
export async function enqueueTelegramChannel(c: Queryable | undefined, spec: MessageSpec, locale: string) {
  if (!telegramConfigured()) return;
  const ch = await one<{ value: string }>("select value from settings where key = 'tg_channel_id'", [], c);
  if (!ch) return;
  await q("insert into telegram_outbox (chat_id, payload) values ($1, $2)", [ch.value, JSON.stringify({ kind: "channel", spec, locale })], c);
}

function specCaption(spec: MessageSpec, t: T) {
  const p = spec.params ?? {};
  const parts = [`<b>${esc(renderStored(t, spec.title, p))}</b>`];
  if (spec.description) parts.push(esc(renderStored(t, spec.description, p)));
  for (const f of spec.fields ?? []) {
    const value = f.lines ? f.lines.map((l) => renderStored(t, l.text, l.params)).join("\n") : f.value;
    if (value) parts.push(`<b>${esc(renderStored(t, f.name, p))}</b>\n${esc(value.replace(/```/g, "").replace(/\*\*/g, ""))}`);
  }
  return parts.join("\n\n");
}

async function deliverChannel(chatId: number, spec: MessageSpec, locale: Locale) {
  const t = tFor(locale);
  const caption = specCaption(spec, t);
  const markup = spec.link ? { reply_markup: { inline_keyboard: [[{ text: t("Открыть на сайте"), url: `${siteUrl()}${spec.link}` }]] } } : {};
  if (spec.image) return sendPhoto(chatId, `${spec.image}${spec.image.includes("?") ? "&" : "?"}lang=${locale}`, caption, markup);
  return send(chatId, caption, markup);
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
  const rows = await q<{ chat_id: string; fresh: boolean; payload: { kind?: "channel"; spec?: MessageSpec; title: string; body: string; link: string; params: Params; locale: string } }>(
    "delete from telegram_outbox where id in (select id from telegram_outbox order by id limit $1 for update skip locked) returning chat_id, payload, created_at > now() - interval '1 day' as fresh",
    [limit],
  );
  let sent = 0;
  for (const r of rows) {
    if (!r.fresh) continue;
    const p = r.payload;
    if (p.kind === "channel" && p.spec) {
      if (await deliverChannel(Number(r.chat_id), p.spec, isLocale(p.locale) ? p.locale : "uz").catch(() => null)) sent++;
      continue;
    }
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
  my_chat_member?: { chat: { id: number; type: string; title?: string }; from: { id: number }; new_chat_member: { status: string } };
  message?: { chat: { id: number; type: string }; from?: { username?: string; language_code?: string }; text?: string };
  callback_query?: { id: string; data?: string; from: { username?: string; language_code?: string }; message?: { chat: { id: number } } };
};

/** Handles one webhook update. Never throws: Telegram retries on errors. */
export async function handleUpdate(u: Update) {
  if (u.my_chat_member) return channelMembership(u.my_chat_member);
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
  if (cmd === "card") return cardReply(chatId, user.id, t);
  if (cmd === "table") return tableReply(chatId, t);
  if (cmd === "top") return send(chatId, await topText(text.includes("2v2") ? "2v2" : "1v1", t), { reply_markup: menu(t) });
  if (cmd === "h2h") {
    const nick = text.split(/\s+/).slice(1).join(" ").trim();
    return send(chatId, await h2hText(user.id, nick, t), { reply_markup: menu(t) });
  }
  if (cmd === "stop") {
    await unlinkTelegram(user.id);
    return send(chatId, esc(t("Telegram отвязан. Уведомления сюда больше не придут.")));
  }
  return send(chatId, esc(t("Выберите действие:")), { reply_markup: menu(t) });
}


async function channelMembership(m: NonNullable<Update["my_chat_member"]>) {
  if (m.chat.type !== "channel") return;
  const current = await setting("tg_channel_id");
  if (m.new_chat_member.status !== "administrator") {
    // Removed or demoted in our channel: stop posting there.
    if (current === String(m.chat.id)) await q("delete from settings where key in ('tg_channel_id', 'tg_channel_title')");
    return;
  }
  // Only a site admin (with a linked Telegram) can choose the channel.
  const admin = await one<{ id: string; locale: string }>(
    "select id, locale from users where telegram_chat_id = $1 and role in ('admin', 'superadmin')",
    [m.from.id],
  );
  if (!admin) {
    await send(m.from.id, "RL Championship: only a site admin with a linked Telegram can connect a channel.").catch(() => null);
    return;
  }
  await putSetting("tg_channel_id", String(m.chat.id));
  await putSetting("tg_channel_title", m.chat.title ?? "");
  const t = tFor(isLocale(admin.locale) ? admin.locale : "ru");
  await send(m.from.id, esc(t("Канал «{name}» подключён: сюда будут приходить результаты, таблицы и команды тура.", { name: m.chat.title ?? "" })));
  const comp = await getFeaturedCompetition();
  const ct = tFor("uz");
  if (comp && comp.draw_state === "published" && comp.format !== "knockout") {
    await sendPhoto(m.chat.id, `/api/standings-card/${comp.slug}?lang=uz&v=${Date.now()}`, `<b>${esc(comp.name)}</b>\n${esc(ct("Турнирная таблица"))}`, {
      reply_markup: { inline_keyboard: [[{ text: ct("Открыть на сайте"), url: `${siteUrl()}/c/${comp.slug}/standings` }]] },
    });
  }
}

async function cardReply(chatId: number, userId: string, t: T) {
  const [u, ratings] = await Promise.all([one<{ rl_nickname: string }>("select rl_nickname from users where id = $1", [userId]), playerRatings(userId)]);
  const v = ratings.map((r) => `${r.rating}.${r.games}`).join("-");
  const caption = [`<b>${esc(u?.rl_nickname ?? "")}</b>`, ...ratings.map((r) => `${r.mode}: ${r.rating} · ${esc(tierLabel(t, r.rating, r.games))}`)].join("\n");
  return sendPhoto(chatId, `/api/card/${userId}?lang=${t.locale}&v=${v}`, caption, {
    reply_markup: { inline_keyboard: [[{ text: t("Открыть профиль"), url: `${siteUrl()}/players/${userId}` }]] },
  });
}

async function tableReply(chatId: number, t: T) {
  const comp = await getFeaturedCompetition();
  if (!comp || comp.draw_state !== "published" || comp.format === "knockout") return send(chatId, esc(t("Таблица появится после жеребьёвки")), { reply_markup: menu(t) });
  return sendPhoto(chatId, `/api/standings-card/${comp.slug}?lang=${t.locale}&v=${Date.now()}`, `<b>${esc(comp.name)}</b>`, {
    reply_markup: { inline_keyboard: [[{ text: t("Открыть на сайте"), url: `${siteUrl()}/c/${comp.slug}/standings` }]] },
  });
}

async function topText(mode: "1v1" | "2v2", t: T) {
  const rows = await leaderboard(mode, "", 10);
  if (!rows.length) return esc(t("Рейтинг появится после первых сыгранных матчей"));
  return [
    `<b>${esc(t("Топ рейтинга {mode}", { mode }))}</b>`,
    ...rows.map((r, i) => `${i + 1}. <b>${esc(r.rl_nickname)}</b> — ${r.rating} · ${esc(tierLabel(t, r.rating, r.games))}`),
    "",
    esc(t("Другой режим: /top 2v2")),
  ].join("\n");
}

async function h2hText(userId: string, nick: string, t: T) {
  if (!nick) return esc(t("Напишите ник соперника: /h2h Nickname"));
  const opp = await one<{ id: string; rl_nickname: string }>("select id, rl_nickname from users where lower(rl_nickname) = lower($1)", [nick]);
  if (!opp) return esc(t("Игрок не найден — проверьте ник."));
  if (opp.id === userId) return esc(t("Это вы :)"));
  const h = await headToHead(userId, opp.id);
  if (!h.aWins && !h.bWins) return esc(t("Они ещё не встречались. Самое время бросить вызов!"));
  return [
    `<b>${esc(t("Личные встречи"))}: ${esc(opp.rl_nickname)}</b>`,
    `${h.aWins} : ${h.bWins}`,
    esc(t("Голы {gf}:{ga}", { gf: h.aGoals, ga: h.bGoals })),
    `<a href="${siteUrl()}/players/compare?a=${userId}&b=${opp.id}">${esc(t("Сравнить"))}</a>`,
  ].join("\n");
}
