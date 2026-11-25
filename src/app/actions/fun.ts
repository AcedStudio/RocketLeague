"use server";

import { requireUser } from "@/lib/auth";
import { guard, ok, FormError } from "@/lib/forms";
import { vote } from "@/lib/awards";

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
