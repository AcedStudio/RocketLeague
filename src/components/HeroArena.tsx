import Link from "next/link";
import type { T } from "@/lib/i18n/core";

const SPARKS = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 53) % 100,
  delay: ((i * 7) % 18) / 3,
  dur: 5 + ((i * 3) % 5),
  size: 2 + (i % 3),
  gold: i % 3 === 0,
}));

const STREAKS = [
  { top: 58, delay: 0, dur: 3.4, gold: false },
  { top: 66, delay: 1.3, dur: 2.8, gold: true },
  { top: 72, delay: 2.4, dur: 3.9, gold: false },
  { top: 63, delay: 3.1, dur: 3.1, gold: true },
];

/** Animated hero: a stylised arena with a glowing ball, boost trails and sparks. Pure SVG + CSS, no photos. */
export function HeroArena({
  t,
  title,
  tagline,
  primary,
  secondary,
  stats,
}: {
  t: T;
  title: string;
  tagline: string;
  primary: { href: string; label: string };
  secondary: { href: string; label: string };
  stats: { value: number | string; label: string }[];
}) {
  return (
    <section className="ha" aria-label={title}>
      <div className="ha-sky" aria-hidden />
      <div className="ha-floor" aria-hidden>
        <div className="ha-grid" />
        <div className="ha-lines" />
      </div>
      <div className="ha-glow ha-glow-l" aria-hidden />
      <div className="ha-glow ha-glow-r" aria-hidden />

      <div className="ha-streaks" aria-hidden>
        {STREAKS.map((s, i) => (
          <i key={i} className={s.gold ? "gold" : ""} style={{ top: `${s.top}%`, animationDelay: `${s.delay}s`, animationDuration: `${s.dur}s` }} />
        ))}
      </div>

      <div className="ha-ball-wrap" aria-hidden>
        <svg className="ha-ball" viewBox="0 0 200 200">
          <defs>
            <radialGradient id="haBall" cx="38%" cy="32%" r="75%">
              <stop offset="0" stopColor="#F4FBFF" />
              <stop offset="0.35" stopColor="#9FDDFF" />
              <stop offset="0.75" stopColor="#1E6FD9" />
              <stop offset="1" stopColor="#0A2A5C" />
            </radialGradient>
            <radialGradient id="haHalo" cx="50%" cy="50%" r="50%">
              <stop offset="0.55" stopColor="#37BEFE" stopOpacity="0.55" />
              <stop offset="1" stopColor="#37BEFE" stopOpacity="0" />
            </radialGradient>
            <clipPath id="haClip"><circle cx="100" cy="100" r="62" /></clipPath>
          </defs>
          <circle cx="100" cy="100" r="98" fill="url(#haHalo)" className="ha-halo" />
          <circle cx="100" cy="100" r="62" fill="url(#haBall)" />
          <g clipPath="url(#haClip)" className="ha-hex" fill="none" stroke="#0A2A5C" strokeOpacity="0.45" strokeWidth="2.2">
            <path d="M100 58l18 10v21l-18 10-18-10V68z" />
            <path d="M136 79l18 10v21l-18 10-18-10V89zM64 79l18 10v21l-18 10-18-10V89zM100 120l18 10v21l-18 10-18-10v-21zM136 38l18 10v21l-18 10-18-10V48zM64 38l18 10v21l-18 10-18-10V48z" />
          </g>
          <ellipse cx="80" cy="74" rx="20" ry="11" fill="#fff" opacity="0.55" transform="rotate(-30 80 74)" />
        </svg>
        <span className="ha-orbit" />
        <span className="ha-orbit ha-orbit-2" />
        <span className="ha-shadow" />
      </div>

      <div className="ha-sparks" aria-hidden>
        {SPARKS.map((s, i) => (
          <i
            key={i}
            className={s.gold ? "gold" : ""}
            style={{ left: `${s.left}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s`, animationDuration: `${s.dur}s` }}
          />
        ))}
      </div>

      <div className="wrap ha-content">
        <span className="ha-kicker">{t("Сезон открыт")}</span>
        <h1 className="ha-title">
          <span>RL</span> <span className="ha-shine">Championship</span>
        </h1>
        <p className="ha-tag">{tagline}</p>
        <div className="ha-cta">
          <Link href={primary.href} className="btn btn-gold btn-lg">{primary.label}</Link>
          <Link href={secondary.href} className="btn btn-ghost btn-lg ha-ghost">{secondary.label}</Link>
        </div>
        <dl className="ha-stats">
          {stats.map((s) => (
            <div key={s.label}>
              <dd className="num">{s.value}</dd>
              <dt>{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
