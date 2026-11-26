"use client";

import { useActionState, useState } from "react";
import { adminResetAction, type ResetState } from "@/app/actions/password";
import { useT } from "@/components/client";

/** Admin row control: reset a player's password; the result is shown once, here only. */
export function ResetPassword({ userId }: { userId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<ResetState, FormData>(adminResetAction, null);
  const [copied, setCopied] = useState(false);
  const value = state?.password ?? state?.link ?? "";
  return (
    <div className="reset-pw">
      <form action={action} className="row" style={{ gap: 6 }}>
        <input type="hidden" name="user_id" value={userId} />
        <button className="btn btn-ghost btn-sm" name="mode" value="temp" disabled={pending}>🔑 {t("Временный пароль")}</button>
        <button className="btn btn-ghost btn-sm" name="mode" value="link" disabled={pending}>🔗 {t("Ссылка для сброса")}</button>
      </form>
      {state?.error && <p className="small" style={{ color: "var(--danger)", margin: 0 }}>{state.error}</p>}
      {value && (
        <div className="reset-out">
          <small>
            {state?.password
              ? t("Временный пароль для {name} — отправьте игроку. После входа сайт попросит сменить его. Больше он нигде не покажется.", { name: state.nickname ?? "" })
              : t("Ссылка для {name} действует 24 часа и работает один раз.", { name: state?.nickname ?? "" })}
          </small>
          <div className="row" style={{ gap: 6 }}>
            <code>{value}</code>
            <button
              type="button"
              className="btn btn-sm"
              onClick={async () => {
                await navigator.clipboard.writeText(value).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? t("Скопировано") : t("Копировать")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
