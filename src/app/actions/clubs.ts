"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { guard, ok, FormError } from "@/lib/forms";
import { createClub, joinClub, leaveClub, kickMember, updateClub, claimClubGoal, clubOf } from "@/lib/clubs";

const input = (fd: FormData) => ({
  name: String(fd.get("name") ?? ""),
  tag: String(fd.get("tag") ?? ""),
  motto: String(fd.get("motto") ?? ""),
  icon: String(fd.get("icon") ?? ""),
  color: String(fd.get("color") ?? ""),
  shape: String(fd.get("shape") ?? ""),
});

export async function createClubAction(fd: FormData) {
  const user = await requireUser("/clubs");
  let tag = "";
  await guard("/clubs#create", async () => {
    tag = (await createClub(user.id, input(fd))).tag;
  });
  ok(`/clubs/${tag}`, "Клуб создан!");
}

export async function joinClubAction(fd: FormData) {
  const user = await requireUser("/clubs");
  const back = `/clubs/${String(fd.get("tag") ?? "")}`;
  await guard(back, async () => {
    await joinClub(user.id, String(fd.get("club") ?? ""), String(fd.get("code") ?? "") || undefined);
  });
  ok(back, "Добро пожаловать в клуб!");
}

export async function leaveClubAction() {
  const user = await requireUser("/clubs");
  await guard("/clubs", () => leaveClub(user.id));
  ok("/clubs", "Вы покинули клуб");
}

export async function kickAction(fd: FormData) {
  const user = await requireUser("/clubs");
  const back = `/clubs/${String(fd.get("tag") ?? "")}`;
  await guard(back, () => kickMember(user.id, String(fd.get("club") ?? ""), String(fd.get("user") ?? "")));
  ok(back, "Игрок исключён");
}

export async function updateClubAction(fd: FormData) {
  const user = await requireUser("/clubs");
  const club = await clubOf(user.id);
  if (!club) redirect("/clubs");
  let tag = club.tag;
  await guard(`/clubs/${club.tag}#edit`, async () => {
    if (!club) throw new FormError("Вы не состоите в клубе");
    tag = await updateClub(user.id, club.id, { ...input(fd), open: fd.get("open") === "on" });
  });
  ok(`/clubs/${tag}`, "Клуб обновлён");
}

export async function clubGoalAction() {
  const user = await requireUser("/clubs");
  let tag = "";
  await guard("/clubs", async () => {
    tag = await claimClubGoal(user.id);
  });
  ok(`/clubs/${tag}`, "Награда клуба получена");
}
