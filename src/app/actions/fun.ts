"use server";

import { requireUser } from "@/lib/auth";
import { guard, ok, FormError } from "@/lib/forms";
import { vote } from "@/lib/awards";
import { savePredictions } from "@/lib/predictions";
import { getT } from "@/lib/i18n/server";

const UUID = /^[0-9a-f-]{36}$/i;

export async function voteAction(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  const round = Number(fd.get("round"));
  const back = `/c/${encodeURIComponent(slug)}/calendar#tour-${round}`;
  const user = await requireUser(back);
  let msg = "";
  await guard(back, async () => {
    const comp = String(fd.get("competition_id") ?? "");
    const stage = String(fd.get("stage") ?? "");
    const nominee = String(fd.get("nominee") ?? "");
    if (!UUID.test(comp) || !UUID.test(nominee) || !["league", "group"].includes(stage) || !Number.isInteger(round)) throw new FormError("Выберите игрока");
    msg = await vote(comp, stage, round, user.id, nominee);
  });
  ok(back, msg);
}

export async function predictAction(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  const back = `/c/${encodeURIComponent(slug)}/predictions`;
  const user = await requireUser(back);
  let n = 0;
  await guard(back, async () => {
    const comp = String(fd.get("competition_id") ?? "");
    if (!UUID.test(comp)) throw new FormError("Соревнование не найдено");
    const picks: Record<string, [number, number]> = {};
    for (const [k, v] of fd.entries()) {
      const m = /^h_([0-9a-f-]{36})$/i.exec(k);
      if (!m) continue;
      const home = String(v).trim();
      const away = String(fd.get(`a_${m[1]}`) ?? "").trim();
      if (home === "" && away === "") continue;
      if (home === "" || away === "") throw new FormError("Заполните оба поля счёта");
      picks[m[1]] = [Number(home), Number(away)];
    }
    if (!Object.keys(picks).length) throw new FormError("Введите хотя бы один прогноз");
    n = await savePredictions(user.id, comp, picks);
  });
  ok(back, (await getT())("Прогнозы сохранены: {n}", { n }));
}
