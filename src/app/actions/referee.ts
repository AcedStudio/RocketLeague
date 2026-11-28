"use server";

import { requireUser } from "@/lib/auth";
import { guard, ok } from "@/lib/forms";
import { claimRefTier } from "@/lib/referee-rank";

export async function claimRefTierAction(fd: FormData) {
  const user = await requireUser("/referee");
  await guard("/referee#track", async () => {
    await claimRefTier(user.id, String(fd.get("key") ?? ""));
  });
  ok("/referee#track", "Награда получена");
}
