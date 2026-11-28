"use server";

import { requireUser } from "@/lib/auth";
import { guard, ok } from "@/lib/forms";
import { q } from "@/lib/db";
import { cleanAvailability } from "@/lib/engine/availability";

export async function availabilityAction(fd: FormData) {
  const user = await requireUser("/me");
  await guard("/me#availability", async () => {
    const raw: Record<string, number[]> = {};
    for (const v of fd.getAll("h")) {
      const [d, h] = String(v).split(":").map(Number);
      (raw[String(d)] ??= []).push(h);
    }
    await q("update users set availability = $2 where id = $1", [user.id, JSON.stringify(cleanAvailability(raw))]);
  });
  ok("/me#availability", "Удобное время сохранено");
}
