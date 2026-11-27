"use server";

import { requireUser, requireAdmin } from "@/lib/auth";
import { guard, ok, FormError } from "@/lib/forms";
import { claimDaily, buyItem, openCrate, equipItem, grantCoins } from "@/lib/shop";
import { type Item } from "@/lib/engine/shop";

/** Where to come back to: the same tab and filters (only a plain query string is accepted). */
const back = (fd: FormData) => {
  const ret = String(fd.get("ret") ?? "");
  return /^\?[a-z0-9=&-]{0,80}$/.test(ret) ? `/shop${ret}` : "/shop";
};

export async function dailyAction() {
  const user = await requireUser("/shop");
  await guard("/shop", () => claimDaily(user.id));
  ok("/shop", "Бонус получен: +10 🪙");
}

export async function buyAction(fd: FormData) {
  const user = await requireUser("/shop");
  const id = String(fd.get("item") ?? (fd.get("tag") ? `tag:${fd.get("tag")}` : ""));
  await guard(back(fd), async () => {
    await buyItem(user.id, id);
  });
  ok(back(fd), "Куплено и надето ✨");
}

export async function crateAction(fd: FormData) {
  const user = await requireUser("/shop");
  let drop: Item | null = null;
  await guard("/shop?tab=crates", async () => {
    drop = await openCrate(user.id, String(fd.get("crate") ?? ""));
  });
  const d = drop as Item | null;
  ok(`/shop?tab=crates&drop=${encodeURIComponent(d ? `${d.kind}:${d.key}` : "")}`, "Кейс открыт!");
}

export async function equipAction(fd: FormData) {
  const user = await requireUser("/shop");
  await guard(back(fd), () => equipItem(user.id, String(fd.get("badge") ?? fd.get("value") ?? "")));
  ok(back(fd), "Готово");
}

export async function grantAction(fd: FormData) {
  const admin = await requireAdmin();
  const target = "/admin/users";
  await guard(target, async () => {
    const id = String(fd.get("user_id") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new FormError("Игрок не найден");
    await grantCoins(admin.id, id, Number(fd.get("amount")), String(fd.get("note") ?? ""));
  });
  ok(target, "Монеты начислены");
}
