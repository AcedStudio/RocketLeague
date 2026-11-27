import type { T } from "@/lib/i18n/core";
import { badgeFor } from "@/lib/engine/shop";

/** The tag or title a player chose to show next to their name. */
export function UserBadge({ value, t, size = "md" }: { value: string | null | undefined; t: T; size?: "sm" | "md" }) {
  const b = badgeFor(value);
  if (!b) return null;
  return (
    <span className={`ubadge ubadge-${size} r-${b.item.rarity}${b.kind === "title" ? " is-title" : ""}`}>
      <span aria-hidden>{b.item.icon}</span> {t(b.item.name)}
    </span>
  );
}
