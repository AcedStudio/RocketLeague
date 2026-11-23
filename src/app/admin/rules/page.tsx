import { requireAdmin } from "@/lib/auth";
import { getRules, RULE_CATEGORIES, type Rule } from "@/lib/data";
import { saveRule, ruleAction } from "@/app/actions/admin";
import { Flash, pick, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { getT } from "@/lib/i18n/server";

async function RuleForm({ r }: { r?: Rule }) {
  const t = await getT();
  return (
    <form action={saveRule} className="stack">
      {r && <input type="hidden" name="rule_id" value={r.id} />}
      <div className="form-grid">
        <label className="field">
          <span>{t("Раздел")}</span>
          <input className="input" name="category" list="rule-cats" required defaultValue={r?.category ?? RULE_CATEGORIES[0]} />
        </label>
        <label className="field">
          <span>{t("Заголовок")}</span>
          <input className="input" name="title" required maxLength={140} defaultValue={r?.title} />
        </label>
        <label className="field full">
          <span>{t("Текст")}</span>
          <textarea className="input" name="body" required maxLength={8000} defaultValue={r?.body} style={{ minHeight: 160 }} />
        </label>
        <label className="check">
          <input type="checkbox" name="published" defaultChecked={r?.published} />
          <span>{t("Опубликовано")}</span>
        </label>
      </div>
      <div>
        <SubmitButton className="btn">{r ? t("Сохранить") : t("Добавить правило")}</SubmitButton>
      </div>
    </form>
  );
}

export default async function AdminRules({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  await requireAdmin();
  const rules = await getRules(false);
  const editing = rules.find((r) => r.id === pick(sp, "edit"));
  const drafts = rules.filter((r) => !r.published).length;
  const act = (r: Rule, action: string, label: string, cls = "btn btn-ghost btn-sm", confirm?: string) => (
    <form action={ruleAction}>
      <input type="hidden" name="rule_id" value={r.id} />
      <input type="hidden" name="action" value={action} />
      <SubmitButton className={cls} confirm={confirm}>{label}</SubmitButton>
    </form>
  );
  return (
    <>
      <div className="row between">
        <h1 style={{ fontSize: "2rem" }}>{t("Правила")}</h1>
        {drafts > 0 && (
          <form action={ruleAction}>
            <input type="hidden" name="action" value="publish_all" />
            <SubmitButton className="btn btn-gold" confirm={t("Опубликовать черновики ({n}) и уведомить всех?", { n: drafts })}>
              {t("Опубликовать все ({n})", { n: drafts })}
            </SubmitButton>
          </form>
        )}
      </div>
      <p className="muted measure">{t("Пока нет опубликованных правил, на сайте показывается пометка, что правила ещё не опубликованы.")}</p>
      <Flash sp={sp} />
      <datalist id="rule-cats">
        {RULE_CATEGORIES.map((c) => <option key={c} value={c} />)}
      </datalist>

      <section className="panel stack">
        <h3>{editing ? t("Редактирование: {title}", { title: editing.title }) : t("Новое правило")}</h3>
        <RuleForm key={editing?.id ?? "new"} r={editing} />
      </section>

      {rules.length ? (
        <div className="list">
          {rules.map((r) => (
            <div key={r.id} className="list-row" style={{ flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 200 }}>
                <span className="small faint">{r.category}</span>
                <b style={{ display: "block" }}>{r.title}</b>
              </span>
              <span className={`badge ${r.published ? "ok" : "dim"}`}>{r.published ? t("Опубликовано") : t("Черновик")}</span>
              <div className="row">
                {act(r, "up", "↑")}
                {act(r, "down", "↓")}
                <a className="btn btn-ghost btn-sm" href={`/admin/rules?edit=${r.id}`}>{t("Изменить")}</a>
                {act(r, "toggle", r.published ? t("Скрыть") : t("Опубликовать"))}
                {act(r, "delete", t("Удалить"), "btn btn-danger btn-sm", t("Удалить правило?"))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">{t("Правил пока нет. Добавьте их, когда будет готов официальный текст.")}</div>
      )}
    </>
  );
}
