"use server";

import { requireUser } from "@/lib/auth";
import { guard, ok } from "@/lib/forms";
import { claimStep } from "@/lib/onboarding";

export async function claimStepAction(fd: FormData) {
  const user = await requireUser("/start");
  const key = String(fd.get("step") ?? "");
  await guard("/start", () => claimStep(user.id, key));
  ok("/start", key === "final" ? "Вы прошли первые шаги! Тег Rookie Class ваш" : "Награда получена");
}
