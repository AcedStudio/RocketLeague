"use server";

import { requireUser } from "@/lib/auth";
import { guard, ok } from "@/lib/forms";
import { claimTier, buyElite, claimQuest } from "@/lib/pass";
import { findItem } from "@/lib/engine/shop";

export async function claimTierAction(fd: FormData) {
  const user = await requireUser("/pass");
  const tier = Number(fd.get("tier"));
  const track = fd.get("track") === "elite" ? "elite" : "free";
  let got: Awaited<ReturnType<typeof claimTier>> | null = null;
  await guard(`/pass#t${tier}`, async () => {
    got = await claimTier(user.id, tier, track);
  });
  const g = got as Awaited<ReturnType<typeof claimTier>> | null;
  const drop = g && "drop" in g && g.drop ? findItem(g.drop) : g && "item" in g ? findItem(g.item) : null;
  ok(`/pass${drop ? `?got=${encodeURIComponent(drop.kind + ":" + drop.key)}` : ""}#t${tier}`, "Награда получена");
}

export async function buyEliteAction() {
  const user = await requireUser("/pass");
  await guard("/pass", () => buyElite(user.id));
  ok("/pass", "Elite-пропуск активирован");
}

export async function claimQuestAction(fd: FormData) {
  const user = await requireUser("/pass");
  await guard("/pass#quests", async () => {
    await claimQuest(user.id, String(fd.get("ref") ?? ""));
  });
  ok("/pass#quests", "Задание выполнено");
}
