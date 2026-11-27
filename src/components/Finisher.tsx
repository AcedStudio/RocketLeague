"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

/** Deterministic pseudo-random numbers (same on server and client → no hydration mismatch). */
const rnd = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const between = (i: number, salt: number, a: number, b: number) => a + rnd(i, salt) * (b - a);
type V = React.CSSProperties & Record<`--${string}`, string | number>;

const CONFETTI = ["#37BEFE", "#88EDFF", "#F2B53A", "#FF6BB5", "#5CEB8B", "#FFFFFF", "#A66BFF"];

function particles(kind: string) {
  switch (kind) {
    case "confetti":
      return Array.from({ length: 46 }, (_, i) => (
        <i key={i} className="p conf" style={{ "--x": `${between(i, 1, -260, 260)}px`, "--y": `${between(i, 2, -200, -60)}px`, "--r": `${between(i, 3, -540, 540)}deg`, "--d": `${between(i, 4, 0, 0.25)}s`, "--c": CONFETTI[i % CONFETTI.length], "--w": `${between(i, 5, 6, 11)}px` } as V} />
      ));
    case "sparks":
      return Array.from({ length: 34 }, (_, i) => (
        <i key={i} className="p spark" style={{ "--a": `${(i / 34) * 360 + between(i, 1, -6, 6)}deg`, "--l": `${between(i, 2, 110, 230)}px`, "--d": `${between(i, 3, 0, 0.3)}s` } as V} />
      ));
    case "shockwave":
      return [0, 1, 2].map((i) => <i key={i} className="p ring" style={{ "--d": `${i * 0.18}s` } as V} />).concat(<i key="f" className="p flash" />);
    case "lightning":
      return [
        <i key="f" className="p flash white" />,
        <svg key="b" className="p bolt" viewBox="0 0 100 200" aria-hidden>
          <path d="M58 0L22 92H48L30 200L84 74H56L76 0Z" />
        </svg>,
        ...Array.from({ length: 14 }, (_, i) => (
          <i key={i} className="p spark blue" style={{ "--a": `${(i / 14) * 360}deg`, "--l": `${between(i, 2, 90, 170)}px`, "--d": `${0.15 + between(i, 3, 0, 0.2)}s` } as V} />
        )),
      ];
    case "inferno":
      return [
        <i key="g" className="p heat" />,
        ...Array.from({ length: 34 }, (_, i) => (
          <i key={i} className="p ember" style={{ "--x": `${between(i, 1, -200, 200)}px`, "--y": `${between(i, 2, -260, -120)}px`, "--d": `${between(i, 3, 0, 0.9)}s`, "--w": `${between(i, 4, 4, 9)}px` } as V} />
        )),
      ];
    case "frost":
      return [
        <i key="v" className="p frost-veil" />,
        ...Array.from({ length: 22 }, (_, i) => (
          <i key={i} className="p shard" style={{ "--a": `${(i / 22) * 360 + between(i, 1, -8, 8)}deg`, "--l": `${between(i, 2, 90, 210)}px`, "--d": `${between(i, 3, 0, 0.2)}s`, "--w": `${between(i, 4, 6, 12)}px` } as V} />
        )),
      ];
    case "galaxy":
      return [
        <i key="f" className="p flash white" />,
        <i key="n" className="p nebula" />,
        ...Array.from({ length: 40 }, (_, i) => (
          <i key={i} className="p star" style={{ "--a": `${between(i, 1, 0, 360)}deg`, "--l": `${between(i, 2, 60, 260)}px`, "--d": `${between(i, 3, 0.1, 0.5)}s`, "--w": `${between(i, 4, 2, 5)}px` } as V} />
        )),
      ];
    case "crown":
      return [
        <i key="r" className="p rays" />,
        <span key="c" className="p crown-drop"><Icon name="t-crown" size={96} /></span>,
        ...Array.from({ length: 26 }, (_, i) => (
          <i key={i} className="p conf" style={{ "--x": `${between(i, 1, -240, 240)}px`, "--y": `${between(i, 2, -180, -50)}px`, "--r": `${between(i, 3, -400, 400)}deg`, "--d": `${0.35 + between(i, 4, 0, 0.25)}s`, "--c": i % 2 ? "#F2B53A" : "#FFF1B8", "--w": `${between(i, 5, 5, 9)}px` } as V} />
        )),
      ];
    case "ignition":
      return [
        <i key="w" className="p fire-ring" />,
        <i key="w2" className="p fire-ring late" />,
        ...Array.from({ length: 28 }, (_, i) => (
          <i key={i} className="p ember" style={{ "--x": `${between(i, 1, -220, 220)}px`, "--y": `${between(i, 2, -220, -80)}px`, "--d": `${0.2 + between(i, 3, 0, 0.6)}s`, "--w": `${between(i, 4, 4, 8)}px` } as V} />
        )),
      ];
    default:
      return [];
  }
}

/** A victory effect. `side` moves its origin to the winner; `loop` keeps it playing (shop previews). */
export function Finisher({ kind, side = "center", loop, replay, label }: { kind: string; side?: "home" | "away" | "center"; loop?: boolean; replay?: boolean; label?: string }) {
  const [run, setRun] = useState(0);
  return (
    <>
      <div key={run} className={`fx fx-${kind} fx-${side}${loop ? " fx-loop" : ""}`} aria-hidden>
        {particles(kind)}
      </div>
      {replay && (
        <button type="button" className="fx-replay" onClick={() => setRun((n) => n + 1)} title={label}>
          <Icon name="ui-replay" size={16} /> {label}
        </button>
      )}
    </>
  );
}
