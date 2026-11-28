"use server";

import { requireUser } from "@/lib/auth";
import { guard, ok } from "@/lib/forms";
import { claimMilestone } from "@/lib/events";

export async function claimMilestoneAction(fd: FormData) {
  const user = await requireUser("/events");
  await guard("/events#milestones", async () => {
    await claimMilestone(user.id, String(fd.get("ref") ?? ""));
  });
  ok("/events#milestones", "Награда получена");
}
