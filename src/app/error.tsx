"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="wrap section">
      <div className="empty">
        <h3>Что-то пошло не так</h3>
        <p>Попробуйте обновить страницу. Если ошибка повторяется, сообщите организаторам.</p>
        <button className="btn" style={{ marginTop: 16 }} onClick={reset}>
          Повторить
        </button>
      </div>
    </div>
  );
}
