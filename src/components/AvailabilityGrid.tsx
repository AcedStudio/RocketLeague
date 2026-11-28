import { getT } from "@/lib/i18n/server";
import { SubmitButton } from "@/components/client";
import { availabilityAction } from "@/app/actions/availability";
import { GRID_HOURS, type Availability } from "@/lib/engine/availability";

const DAY_KEYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Weekly hour grid: tick when you can usually play. Plain checkboxes, styled as tiles. */
export async function AvailabilityGrid({ value }: { value: Availability | null }) {
  const t = await getT();
  const on = (d: number, h: number) => !!value?.[String(d)]?.includes(h);
  return (
    <form action={availabilityAction} className="avail stack">
      <div className="avail-scroll">
        <table className="avail-grid">
          <thead>
            <tr>
              <th />
              {GRID_HOURS.map((h) => (
                <th key={h} className="num">{String(h).padStart(2, "0")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_KEYS.map((d, i) => (
              <tr key={d}>
                <th>{t(d)}</th>
                {GRID_HOURS.map((h) => (
                  <td key={h}>
                    <label className="avail-cell" title={`${t(d)} ${String(h).padStart(2, "0")}:00`}>
                      <input type="checkbox" name="h" value={`${i}:${h}`} defaultChecked={on(i, h)} />
                      <span />
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row between">
        <span className="small muted">{t("Время по Ташкенту. Отметьте часы, когда вы обычно можете играть — сайт подберёт общее время с соперником.")}</span>
        <SubmitButton className="btn btn-sm">{t("Сохранить")}</SubmitButton>
      </div>
    </form>
  );
}
