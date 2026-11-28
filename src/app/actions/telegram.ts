"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { guard, ok } from "@/lib/forms";
import { linkUrl, unlinkTelegram } from "@/lib/telegram";

export async function telegramLinkAction() {
  const user = await requireUser("/me");
  let url = "";
  await guard("/me#telegram", async () => {
    url = await linkUrl(user.id);
  });
  redirect(url);
}

export async function telegramUnlinkAction() {
  const user = await requireUser("/me");
  await guard("/me#telegram", async () => {
    await unlinkTelegram(user.id);
  });
  ok("/me#telegram", "Telegram отвязан");
}
