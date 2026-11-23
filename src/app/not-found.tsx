import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="wrap section">
      <div className="empty">
        <h3>{t("Страница не найдена")}</h3>
        <p>{t("Возможно, ссылка устарела или соревнование ещё не опубликовано.")}</p>
        <Link href="/" className="btn" style={{ marginTop: 16 }}>
          {t("На главную")}
        </Link>
      </div>
    </div>
  );
}
