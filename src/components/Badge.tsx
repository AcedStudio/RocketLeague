import type { T } from "@/lib/i18n/core";
import { badgeFor, nameColorClass, iconOf, avatarItem } from "@/lib/engine/shop";
import { Icon } from "@/components/Icon";

/** The tag or title a player chose to show next to their name. Names are English and never translated. */
export function UserBadge({ value, size = "md" }: { value: string | null | undefined; t?: T; size?: "sm" | "md" }) {
  const b = badgeFor(value);
  if (!b) return null;
  return (
    <span className={`ubadge ubadge-${size} r-${b.item.rarity}${b.kind === "title" ? " is-title" : ""}`}>
      <Icon name={iconOf(b.kind, b.item.key)} size={size === "sm" ? 14 : 18} /> {b.item.name}
    </span>
  );
}

/** A nickname painted in the colour the player bought. */
export function Nick({ name, color }: { name: string; color?: string | null }) {
  const cls = nameColorClass(color);
  return cls ? <span className={cls}>{name}</span> : <>{name}</>;
}

/** A player's round avatar: the bought portrait with a rarity ring, or the first letter of the name. */
export function Avatar({ name, avatar, size = 26 }: { name: string; avatar?: string | null; size?: number }) {
  const it = avatarItem(avatar);
  if (!it) {
    return (
      <span className="np-avatar" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden>
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <span className={`av rar-${it.rarity}`} style={{ width: size, height: size }} aria-hidden>
      <Icon name={`av-${it.key}`} size={size} />
    </span>
  );
}
