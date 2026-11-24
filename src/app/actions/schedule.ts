"use server";

import { requireUser } from "@/lib/auth";
import { guard, ok, FormError } from "@/lib/forms";
import { one } from "@/lib/db";
import { fromLocalInput } from "@/lib/format";
import { proposeTime, respondProposal, withdrawProposal, checkIn } from "@/lib/scheduling";

const uuid = (v: unknown) => {
  const s = String(v ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(s)) throw new FormError("Неверный идентификатор");
  return s;
};

export async function proposeAction(fd: FormData) {
  const id = uuid(fd.get("match_id"));
  const path = `/match/${id}`;
  const user = await requireUser(path);
  let msg = "";
  await guard(path, async () => {
    const m = await one<{ timezone: string }>("select c.timezone from matches m join competitions c on c.id = m.competition_id where m.id = $1", [id]);
    if (!m) throw new FormError("Матч не найден");
    const at = fromLocalInput(String(fd.get("at") ?? ""), m.timezone);
    if (!at) throw new FormError("Укажите дату и время");
    msg = await proposeTime(id, user.id, at);
  });
  ok(path, msg);
}

export async function proposalResponseAction(fd: FormData) {
  const id = uuid(fd.get("match_id"));
  const path = `/match/${id}`;
  const user = await requireUser(path);
  const proposal = uuid(fd.get("proposal_id"));
  const action = String(fd.get("action"));
  let msg = "";
  await guard(path, async () => {
    msg = action === "withdraw" ? await withdrawProposal(proposal, user.id) : await respondProposal(proposal, user.id, action === "accept");
  });
  ok(path, msg);
}

export async function checkInAction(fd: FormData) {
  const id = uuid(fd.get("match_id"));
  const path = `/match/${id}`;
  const user = await requireUser(path);
  let msg = "";
  await guard(path, async () => {
    msg = await checkIn(id, user.id);
  });
  ok(path, msg);
}
