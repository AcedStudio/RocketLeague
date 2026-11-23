import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap section">
      <div className="empty">
        <h3>Страница не найдена</h3>
        <p>Возможно, ссылка устарела или соревнование ещё не опубликовано.</p>
        <Link href="/" className="btn" style={{ marginTop: 16 }}>
          На главную
        </Link>
      </div>
    </div>
  );
}
