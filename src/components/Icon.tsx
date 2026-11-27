import { ICON_VERSION } from "@/lib/icons";

/** One of the site's own icons (public/icons.svg, built by scripts/icons/build.py). */
export function Icon({ name, size = 20, className = "" }: { name: string; size?: number; className?: string }) {
  return (
    <svg className={`ico ${className}`} width={size} height={size} aria-hidden="true" focusable="false">
      <use href={`/icons.svg?v=${ICON_VERSION}#${name}`} />
    </svg>
  );
}
