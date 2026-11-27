import type { T } from "@/lib/i18n/core";
import { badgeFor, nameColorClass } from "@/lib/engine/shop";

/** The tag or title a player chose to show next to their name. Names are English and never translated. */
export function UserBadge({ value, size = "md" }: { value: string | null | undefined; t?: T; size?: "sm" | "md" }) {
  const b = badgeFor(value);
  if (!b) return null;
  return (
    <span className={`ubadge ubadge-${size} r-${b.item.rarity}${b.kind === "title" ? " is-title" : ""}`}>
      <span aria-hidden>{b.item.icon}</span> {b.item.name}
    </span>
  );
}

/** A nickname painted in the colour the player bought. */
export function Nick({ name, color }: { name: string; color?: string | null }) {
  const cls = nameColorClass(color);
  return cls ? <span className={cls}>{name}</span> : <>{name}</>;
}
