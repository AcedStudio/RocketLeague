export default function Loading() {
  return (
    <div className="wrap section" aria-busy="true" aria-live="polite">
      <div className="stack">
        <div className="panel" style={{ height: 120, opacity: 0.5 }} />
        <div className="panel" style={{ height: 240, opacity: 0.35 }} />
      </div>
    </div>
  );
}
