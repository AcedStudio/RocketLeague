"use server";

import { requireUser } from "@/lib/auth";
import { guard, ok } from "@/lib/forms";
import { placeBet } from "@/lib/bets";

export async function betAction(fd: FormData) {
  const matchId = String(fd.get("match") ?? "");
  const back = /^[0-9a-f-]{36}$/i.test(matchId) ? `/match/${matchId}#predict` : "/bets";
  const user = await requireUser(back);
  await guard(back, async () => {
    await placeBet(user.id, matchId, fd.get("pick") === "away" ? "away" : "home");
  });
  ok(back, "Прогноз принят");
}
