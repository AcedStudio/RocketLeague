import "server-only";
import { renderStored } from "./format";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { flushOutbox } from "./discord";
import { flushPush } from "./push";
import { flushTelegram } from "./telegram";
import { getT } from "./i18n/server";

import { FormError } from "./errors";
export { FormError };

export function str(fd: FormData, name: string, label: string, opts: { min?: number; max?: number; optional?: boolean } = {}): string {
  const raw = fd.get(name);
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v && opts.optional) return "";
  const min = opts.min ?? 1;
  const max = opts.max ?? 200;
  if (v.length < min) throw new FormError(min <= 1 ? "Заполните поле «{label}»" : "«{label}»: минимум {n} символов", { label, n: min });
  if (v.length > max) throw new FormError("«{label}»: максимум {n} символов", { label, n: max });
  return v;
}

export function int(fd: FormData, name: string, label: string, min: number, max: number): number {
  const v = Number(fd.get(name));
  if (!Number.isInteger(v) || v < min || v > max) throw new FormError("«{label}»: целое число от {min} до {max}", { label, min, max });
  return v;
}

export function optionalNumber(fd: FormData, name: string, label: string): number | null {
  const raw = String(fd.get(name) ?? "").trim().replace(",", ".");
  if (!raw) return null;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0 || v > 1e9) throw new FormError("«{label}»: неверное число", { label });
  return v;
}

export function bool(fd: FormData, name: string): boolean {
  const v = fd.get(name);
  return v === "on" || v === "true" || v === "1";
}

export function oneOf<T extends string>(fd: FormData, name: string, label: string, allowed: readonly T[]): T {
  const v = String(fd.get(name) ?? "");
  if (!(allowed as readonly string[]).includes(v)) throw new FormError("Выберите «{label}»", { label });
  return v as T;
}

export function email(fd: FormData): string {
  const v = str(fd, "email", "Email", { max: 120 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new FormError("Неверный email");
  return v;
}

export function url(fd: FormData, name: string, label: string): string {
  const v = str(fd, name, label, { optional: true, max: 500 });
  if (!v) return "";
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    return u.toString();
  } catch {
    throw new FormError("«{label}»: нужна ссылка вида https://...", { label });
  }
}

/** Only allow same-site relative redirects. */
export function safeNext(v: unknown, fallback = "/"): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : fallback;
}

function withParam(path: string, key: string, msg: string) {
  const i = path.indexOf("#");
  const [base, hash] = i < 0 ? [path, ""] : [path.slice(0, i), path.slice(i)];
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${key}=${encodeURIComponent(msg)}${hash}`;
}

export function ok(path: string, msg: string): never {
  redirect(withParam(path, "ok", msg));
}

export function fail(path: string, msg: string): never {
  redirect(withParam(path, "err", msg));
}

/**
 * Wraps a server action body: user-facing errors become a redirect with ?err=.
 * Next's redirect() throws internally, so it is re-thrown untouched.
 */
export async function guard(path: string, fn: () => Promise<void>): Promise<void> {
  let message: string | null = null;
  try {
    await fn();
    // Deliver queued Discord messages once the response is sent.
    after(() => flushOutbox().catch((e) => console.error("[discord] flush", e)));
    after(() => flushPush().catch((e) => console.error("[push] flush", e)));
    after(() => flushTelegram().catch((e) => console.error("[telegram] flush", e)));
  } catch (err) {
    if (err instanceof FormError) {
      const t = await getT();
      // Params that are themselves Russian labels (field names) get translated too.
      // renderStored also turns an {at, tz} pair into {when}.
      message = renderStored(t, err.message, err.params ?? {});
    }
    else if (isRedirect(err)) throw err;
    else {
      console.error(err);
      message = "Что-то пошло не так. Попробуйте ещё раз.";
    }
  }
  if (message) fail(path, message);
}

function isRedirect(err: unknown): boolean {
  return typeof err === "object" && err !== null && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}
