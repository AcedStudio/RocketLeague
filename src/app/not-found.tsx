import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="wrap section">
      <div className="lost">
        <div className="lost-code" aria-hidden>
          <span>4</span>
          <span className="lost-ball" />
          <span>4</span>
        </div>
        <h1>{t("Мяч улетел за пределы поля")}</h1>
        <p className="muted">{t("Такой страницы нет. Возможно, ссылка устарела или соревнование ещё не опубликовано.")}</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link href="/" className="btn">{t("На главную")}</Link>
          <Link href="/competitions" className="btn btn-ghost">{t("Соревнования")}</Link>
        </div>
      </div>
    </div>
  );
}
