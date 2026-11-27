"use client";

import { useState } from "react";
import { Crest } from "@/components/Crest";
import { CREST_ICONS, CREST_COLORS, CREST_SHAPES } from "@/lib/engine/clubs";
import { Icon } from "@/components/Icon";

/** Shape, colour and emblem pickers with a live crest preview; posts icon/color/shape. */
export function CrestPicker({ initial, labels }: { initial?: { icon: string; color: string; shape: string }; labels: { shape: string; color: string; icon: string } }) {
  const [icon, setIcon] = useState(initial?.icon ?? CREST_ICONS[0]);
  const [color, setColor] = useState(initial?.color ?? "sky");
  const [shape, setShape] = useState(initial?.shape ?? "shield");
  return (
    <div className="crest-picker">
      <div className="crest-preview">
        <Crest icon={icon} color={color} shape={shape} size={120} />
      </div>
      <div className="crest-options">
        <fieldset>
          <legend>{labels.shape}</legend>
          <div className="pick-row">
            {CREST_SHAPES.map((s) => (
              <label key={s} className="pick">
                <input type="radio" name="shape" value={s} checked={shape === s} onChange={() => setShape(s)} />
                <span><Crest icon={icon} color={color} shape={s} size={34} /></span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>{labels.color}</legend>
          <div className="pick-row">
            {Object.entries(CREST_COLORS).map(([k, [a, b]]) => (
              <label key={k} className="pick">
                <input type="radio" name="color" value={k} checked={color === k} onChange={() => setColor(k)} />
                <span className="swatch" style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} />
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>{labels.icon}</legend>
          <div className="pick-row">
            {CREST_ICONS.map((i) => (
              <label key={i} className="pick">
                <input type="radio" name="icon" value={i} checked={icon === i} onChange={() => setIcon(i)} />
                <span className="pick-ico"><Icon name={i} size={30} /></span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </div>
  );
}
