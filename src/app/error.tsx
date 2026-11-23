"use client";

import { useT } from "@/components/client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useT();
  return (
    <div className="wrap section">
      <div className="empty">
        <h3>{t("Что-то пошло не так")}</h3>
        <p>{t("Попробуйте обновить страницу. Если ошибка повторяется, сообщите организаторам.")}</p>
        <button className="btn" style={{ marginTop: 16 }} onClick={reset}>
          {t("Повторить")}
        </button>
      </div>
    </div>
  );
}
