"use server";

import { requireUser, requireAdmin } from "@/lib/auth";
import { guard, ok, FormError } from "@/lib/forms";
import { claimDaily, buyTag, equipBadge, grantCoins } from "@/lib/shop";

export async function dailyAction() {
  const user = await requireUser("/shop");
  await guard("/shop", () => claimDaily(user.id));
  ok("/shop", "Бонус получен: +10 🪙");
}

export async function buyAction(fd: FormData) {
  const user = await requireUser("/shop");
  await guard("/shop", () => buyTag(user.id, String(fd.get("tag") ?? "")));
  ok("/shop", "Тег куплен и надет");
}

export async function equipAction(fd: FormData) {
  const user = await requireUser("/shop");
  await guard("/shop", () => equipBadge(user.id, String(fd.get("badge") ?? "")));
  ok("/shop", "Готово");
}

export async function grantAction(fd: FormData) {
  const admin = await requireAdmin();
  const back = "/admin/users";
  await guard(back, async () => {
    const id = String(fd.get("user_id") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new FormError("Игрок не найден");
    await grantCoins(admin.id, id, Number(fd.get("amount")), String(fd.get("note") ?? ""));
  });
  ok(back, "Монеты начислены");
}
