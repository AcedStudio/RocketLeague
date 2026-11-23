// Original illustrations: abstract arena, ball, car and trophy. No game assets.

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="lm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#029FFC" />
          <stop offset="1" stopColor="#88EDFF" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#lm)" />
      <path d="M4 20h9M6 15h7M8 25h6" stroke="#03203D" strokeWidth="2" strokeLinecap="round" opacity=".55" />
      <circle cx="20" cy="16" r="7.5" fill="#03203D" />
      <path d="M20 9.5l3 2.2-1.1 3.6h-3.8l-1.1-3.6zM17 16.6l1.2 3.5M23 16.6l-1.2 3.5M18.6 20.4h2.8" stroke="#88EDFF" strokeWidth="1.1" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

export function ArenaArt({ label = "Абстрактная арена с мячом и машиной" }: { label?: string }) {
  return (
    <svg viewBox="0 0 460 400" role="img" aria-label={label}>
      <defs>
        <linearGradient id="trail" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity=".95" />
        </linearGradient>
        <linearGradient id="boost" x1="0" x2="1">
          <stop offset="0" stopColor="#D9AD50" stopOpacity="0" />
          <stop offset="1" stopColor="#D9AD50" />
        </linearGradient>
        <radialGradient id="ball" cx=".35" cy=".3" r=".8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".55" stopColor="#dff6ff" />
          <stop offset="1" stopColor="#7fc8ee" />
        </radialGradient>
      </defs>
      {/* pitch in perspective */}
      <g transform="translate(230 210) skewX(-14) scale(1 .62)" fill="none" stroke="#03203D" strokeOpacity=".5" strokeWidth="2.2">
        <rect x="-200" y="-190" width="400" height="380" rx="70" />
        <line x1="-200" y1="0" x2="200" y2="0" />
        <circle r="56" />
        <circle r="5" fill="#03203D" fillOpacity=".5" />
        <rect x="-70" y="-190" width="140" height="56" rx="10" />
        <rect x="-70" y="134" width="140" height="56" rx="10" />
      </g>
      {/* ball speed trails */}
      <g strokeLinecap="round">
        <line x1="70" y1="120" x2="268" y2="120" stroke="url(#trail)" strokeWidth="5" />
        <line x1="110" y1="142" x2="262" y2="142" stroke="url(#trail)" strokeWidth="3.5" />
        <line x1="40" y1="98" x2="262" y2="98" stroke="url(#trail)" strokeWidth="2.5" />
      </g>
      <g transform="translate(310 118)">
        <ellipse cx="6" cy="128" rx="44" ry="9" fill="#03203D" opacity=".18" />
        <circle r="48" fill="url(#ball)" stroke="#03203D" strokeOpacity=".25" strokeWidth="2" />
        <g fill="none" stroke="#03203D" strokeOpacity=".55" strokeWidth="2.2" strokeLinejoin="round">
          <path d="M0 -20l19 13-7 22h-24l-7-22z" />
          <path d="M0 -20v-27M19 -7l26-9M12 15l16 22M-12 15l-16 22M-19 -7l-26-9" />
        </g>
      </g>
      {/* car, top-down wedge with boost */}
      <g transform="translate(118 268) rotate(-16)">
        <path d="M-130 4h120" stroke="url(#boost)" strokeWidth="14" strokeLinecap="round" />
        <path d="M-120 4h110" stroke="#fff" strokeOpacity=".6" strokeWidth="4" strokeLinecap="round" />
        <path d="M-10 -22h62q22 0 34 18v8q-12 18-34 18h-62q-8 0-8-8v-28q0-8 8-8z" fill="#03203D" />
        <path d="M24 -14h22q12 0 18 10v8q-6 10-18 10h-22q-6 0-6-6v-16q0-6 6-6z" fill="#37BEFE" />
        <rect x="-6" y="-30" width="22" height="9" rx="3" fill="#03203D" />
        <rect x="-6" y="21" width="22" height="9" rx="3" fill="#03203D" />
        <rect x="50" y="-30" width="22" height="9" rx="3" fill="#03203D" />
        <rect x="50" y="21" width="22" height="9" rx="3" fill="#03203D" />
      </g>
    </svg>
  );
}

export function TrophyArt({ size = 220, label = "Кубок чемпиона" }: { size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 220" role="img" aria-label={label}>
      <defs>
        <linearGradient id="gold" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#F4D58A" />
          <stop offset=".45" stopColor="#D9AD50" />
          <stop offset="1" stopColor="#8E6A22" />
        </linearGradient>
        <linearGradient id="goldEdge" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".7" />
          <stop offset=".3" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="208" rx="64" ry="8" fill="#000" opacity=".25" />
      <path d="M44 22h112v34c0 40-25 70-56 70S44 96 44 56z" fill="url(#gold)" />
      <path d="M44 22h112v34c0 40-25 70-56 70S44 96 44 56z" fill="url(#goldEdge)" />
      <path d="M44 34H22c0 30 12 46 34 50M156 34h22c0 30-12 46-34 50" fill="none" stroke="url(#gold)" strokeWidth="9" strokeLinecap="round" />
      <path d="M88 124h24l6 36H82z" fill="url(#gold)" />
      <rect x="56" y="160" width="88" height="40" rx="6" fill="#0C2344" stroke="#D9AD50" strokeWidth="2" />
      <rect x="72" y="172" width="56" height="16" rx="3" fill="none" stroke="#D9AD50" strokeOpacity=".6" />
      <circle cx="100" cy="64" r="20" fill="none" stroke="#5c4310" strokeOpacity=".55" strokeWidth="3" />
      <path d="M100 50l7 5-3 8h-8l-3-8z" fill="none" stroke="#5c4310" strokeOpacity=".55" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

export function CupIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4h10v4a5 5 0 0 1-10 0z" />
      <path d="M7 6H4c0 3 1.5 4.5 3.5 4.8M17 6h3c0 3-1.5 4.5-3.5 4.8M12 13v4M8 20h8M9.5 17h5" />
    </svg>
  );
}

export function LeagueIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16M4 10h16M4 14h16M4 18h10" />
      <circle cx="19" cy="18" r="2" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}
