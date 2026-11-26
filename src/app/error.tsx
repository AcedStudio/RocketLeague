"use client";

import Link from "next/link";
import { useT } from "@/components/client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useT();
  return (
    <div className="wrap section">
      <div className="lost">
        <div className="lost-code warn" aria-hidden>⚠</div>
        <h1>{t("Что-то пошло не так")}</h1>
        <p className="muted">{t("Попробуйте обновить страницу. Если ошибка повторяется, сообщите организаторам.")}</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn" onClick={reset}>{t("Повторить")}</button>
          <Link href="/" className="btn btn-ghost">{t("На главную")}</Link>
        </div>
      </div>
    </div>
  );
}
