"use server";

import { requireUser } from "@/lib/auth";
import { guard, ok } from "@/lib/forms";
import { claimChapter } from "@/lib/story";

export async function chapterAction(fd: FormData) {
  const user = await requireUser("/story");
  const ref = String(fd.get("ref") ?? "");
  await guard("/story", async () => {
    await claimChapter(user.id, ref);
  });
  ok(`/story#ch${ref.split(":")[1] ?? ""}`, "Глава пройдена!");
}
