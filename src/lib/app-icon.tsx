import { ImageResponse } from "next/og";

/** The RL Championship mark on navy, as a PNG app icon. `pad` keeps it inside the maskable safe zone. */
export function appIcon(size: number, pad = 0.14) {
  const inner = Math.round(size * (1 - pad * 2));
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#081A32" }}>
        <svg width={inner} height={inner} viewBox="0 0 32 32">
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
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
