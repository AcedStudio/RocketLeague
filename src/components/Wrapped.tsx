"use client";

import { Children, useCallback, useEffect, useRef, useState } from "react";

/** A number that counts up from zero when it appears. */
export function CountUp({ to, ms = 1200, prefix = "" }: { to: number; ms?: number; prefix?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return <>{prefix}{v}</>;
}

/** Stories player: one slide at a time, progress bars, auto-advance, tap left/right, hold to pause, arrow keys. */
export function WrappedPlayer({ children, seconds = 6, labels }: { children: React.ReactNode; seconds?: number; labels: { prev: string; next: string; pause: string } }) {
  const slides = Children.toArray(children);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [t, setT] = useState(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const go = useCallback((d: number) => {
    setI((x) => Math.max(0, Math.min(slides.length - 1, x + d)));
    setT(0);
  }, [slides.length]);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setT((x) => Math.min(1, x + 0.1 / seconds)), 100);
    return () => clearInterval(id);
  }, [paused, seconds]);

  useEffect(() => {
    if (t >= 1 && i < slides.length - 1) {
      setI(i + 1);
      setT(0);
    }
  }, [t, i, slides.length]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [go]);

  const down = () => {
    held.current = false;
    holdTimer.current = setTimeout(() => {
      held.current = true;
      setPaused(true);
    }, 220);
  };
  const up = (dir: number) => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (held.current) setPaused(false);
    else go(dir);
  };

  return (
    <div className={`story${paused ? " is-paused" : ""}`}>
      <div className="story-bars">
        {slides.map((_, k) => (
          <span key={k}><i style={{ width: `${k < i ? 100 : k === i ? Math.round(t * 100) : 0}%` }} /></span>
        ))}
      </div>
      <div className="story-stage" key={i}>
        {slides[i]}
      </div>
      <button type="button" className="story-tap prev" aria-label={labels.prev} onPointerDown={down} onPointerUp={() => up(-1)} onPointerLeave={() => holdTimer.current && clearTimeout(holdTimer.current)} />
      <button type="button" className="story-tap next" aria-label={labels.next} onPointerDown={down} onPointerUp={() => up(1)} onPointerLeave={() => holdTimer.current && clearTimeout(holdTimer.current)} />
      {paused && <span className="story-paused">{labels.pause}</span>}
    </div>
  );
}
