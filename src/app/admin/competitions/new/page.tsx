import { requireAdmin } from "@/lib/auth";
import { CompetitionForm } from "@/components/CompetitionForm";
import { Flash, type SP } from "@/components/ui";

export default async function NewCompetition({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  await requireAdmin();
  return (
    <>
      <h1 style={{ fontSize: "2rem" }}>Новое соревнование</h1>
      <p className="muted measure">Соревнование создаётся черновиком. Участники увидят его, когда вы откроете регистрацию.</p>
      <Flash sp={sp} />
      <CompetitionForm />
    </>
  );
}
