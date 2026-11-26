"use server";

import { requireUser } from "@/lib/auth";
import { guard, ok, FormError } from "@/lib/forms";
import { createDuel, respondDuel, cancelDuel, reportDuel, confirmDuel } from "@/lib/duels";
import { getT } from "@/lib/i18n/server";
import { playerLevel } from "@/lib/levels";
import { frameUnlocked } from "@/lib/engine/levels";
import { q } from "@/lib/db";

const UUID = /^[0-9a-f-]{36}$/i;
const id = (fd: FormData, k = "duel_id") => {
  const v = String(fd.get(k) ?? "");
  if (!UUID.test(v)) throw new FormError("Дуэль не найдена");
  return v;
};

export async function challengeAction(fd: FormData) {
  const opponent = String(fd.get("opponent_id") ?? "");
  const back = UUID.test(opponent) ? `/players/${opponent}` : "/duels";
  const user = await requireUser(back);
  await guard(back, async () => {
    await createDuel(user.id, id(fd, "opponent_id"), String(fd.get("message") ?? ""));
  });
  ok("/duels", (await getT())("Вызов отправлен — ждём ответа соперника"));
}

export async function respondDuelAction(fd: FormData) {
  const user = await requireUser("/duels");
  const accept = fd.get("answer") === "accept";
  await guard("/duels", async () => respondDuel(id(fd), user.id, accept));
  ok("/duels", (await getT())(accept ? "Вызов принят — договоритесь о времени и сыграйте" : "Вызов отклонён"));
}

export async function cancelDuelAction(fd: FormData) {
  const user = await requireUser("/duels");
  await guard("/duels", async () => cancelDuel(id(fd), user.id));
  ok("/duels", (await getT())("Вызов отменён"));
}

export async function reportDuelAction(fd: FormData) {
  const user = await requireUser("/duels");
  await guard("/duels", async () => {
    const mine = String(fd.get("mine") ?? "").trim();
    const theirs = String(fd.get("theirs") ?? "").trim();
    if (mine === "" || theirs === "") throw new FormError("Заполните оба поля счёта");
    await reportDuel(id(fd), user.id, Number(mine), Number(theirs));
  });
  ok("/duels", (await getT())("Счёт отправлен — соперник должен подтвердить"));
}

export async function confirmDuelAction(fd: FormData) {
  const user = await requireUser("/duels");
  const agree = fd.get("answer") === "agree";
  await guard("/duels", async () => confirmDuel(id(fd), user.id, agree));
  ok("/duels", (await getT())(agree ? "Дуэль завершена" : "Счёт отклонён — внесите его заново"));
}

export async function frameAction(fd: FormData) {
  const user = await requireUser("/me");
  await guard("/me", async () => {
    const frame = String(fd.get("frame") ?? "none");
    const { level } = await playerLevel(user.id);
    if (!frameUnlocked(frame, level)) throw new FormError("Эта рамка ещё закрыта");
    await q("update users set card_frame = $2 where id = $1", [user.id, frame]);
  });
  ok("/me", (await getT())("Рамка сохранена"));
}
