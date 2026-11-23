import { requireAdmin } from "@/lib/auth";
import { CompetitionForm } from "@/components/CompetitionForm";
import { Flash, type SP } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export default async function NewCompetition({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  await requireAdmin();
  return (
    <>
      <h1 style={{ fontSize: "2rem" }}>{t("Новое соревнование")}</h1>
      <p className="muted measure">{t("Соревнование создаётся черновиком. Участники увидят его, когда вы откроете регистрацию.")}</p>
      <Flash sp={sp} />
      <CompetitionForm />
    </>
  );
}
