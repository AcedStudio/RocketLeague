import { Icon } from "@/components/Icon";
import { CREST_COLORS } from "@/lib/engine/clubs";

/** A club crest: a coloured shape (shield, circle, hex or diamond) with an emblem from the icon set. */
export function Crest({ icon, color, shape, size = 48 }: { icon: string; color: string; shape: string; size?: number }) {
  const [a, b] = CREST_COLORS[color] ?? CREST_COLORS.sky;
  return (
    <span className={`crest crest-${shape}`} style={{ width: size, height: size, ["--c1" as string]: a, ["--c2" as string]: b }} aria-hidden>
      <span className="crest-plate" />
      <Icon name={icon} size={Math.round(size * 0.62)} />
    </span>
  );
}

export function ClubTag({ tag }: { tag: string | null | undefined }) {
  return tag ? <span className="club-tag">[{tag}]</span> : null;
}
