"use server";

import { requireUser } from "@/lib/auth";
import { str, bool, guard, ok, FormError } from "@/lib/forms";
import { registerSolo, createTeam, joinTeam, withdraw, checkIn } from "@/lib/tournament";
import { getCompetitionBySlug } from "@/lib/data";

function slugOf(fd: FormData) {
  const s = String(fd.get("slug") ?? "");
  if (!/^[a-z0-9-]{1,80}$/.test(s)) throw new Error("bad slug");
  return s;
}

export async function registerAction(fd: FormData) {
  const slug = slugOf(fd);
  const path = `/c/${slug}/register`;
  const user = await requireUser(path);
  let message = "";
  await guard(path, async () => {
    if (!bool(fd, "accept")) throw new FormError("Подтвердите согласие с правилами соревнования");
    const comp = await getCompetitionBySlug(slug);
    if (!comp) throw new FormError("Соревнование не найдено");
    if (comp.mode === "1v1") message = await registerSolo(comp.id, user);
    else message = await createTeam(comp.id, user, str(fd, "team_name", "Название команды", { min: 2, max: 32 }));
  });
  ok(`/c/${slug}`, message);
}

export async function joinAction(fd: FormData) {
  const code = String(fd.get("code") ?? "").toUpperCase();
  const path = `/join/${encodeURIComponent(code)}`;
  const user = await requireUser(path);
  let result = { slug: "", message: "" };
  await guard(path, async () => {
    if (!bool(fd, "accept")) throw new FormError("Подтвердите согласие с правилами соревнования");
    result = await joinTeam(code, user);
  });
  ok(`/c/${result.slug}`, result.message);
}

export async function withdrawAction(fd: FormData) {
  const slug = slugOf(fd);
  const user = await requireUser(`/c/${slug}`);
  let message = "";
  await guard(`/c/${slug}`, async () => {
    message = await withdraw(String(fd.get("entry_id")), user);
  });
  ok(`/c/${slug}`, message);
}

export async function checkInAction(fd: FormData) {
  const slug = slugOf(fd);
  const user = await requireUser(`/c/${slug}`);
  let message = "";
  await guard(`/c/${slug}`, async () => {
    message = await checkIn(String(fd.get("entry_id")), user);
  });
  ok(`/c/${slug}`, message);
}
