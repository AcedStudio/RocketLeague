import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { saveSettings } from "@/app/actions/admin";
import { Flash, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { getT } from "@/lib/i18n/server";

export default async function AdminSettings({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  await requireAdmin();
  const s = await getSettings();
  return (
    <>
      <h1 style={{ fontSize: "2rem" }}>{t("Настройки платформы")}</h1>
      <p className="muted measure">{t("Даты, вместимость, формат и регион настраиваются отдельно для каждого соревнования.")}</p>
      <Flash sp={sp} />
      <form action={saveSettings} className="panel form-grid">
        <label className="field">
          <span>{t("Название платформы")}</span>
          <input className="input" name="site_name" required maxLength={40} defaultValue={s.site_name} />
        </label>
        <label className="field">
          <span>{t("Подзаголовок")}</span>
          <input className="input" name="tagline" maxLength={120} defaultValue={s.tagline} />
        </label>
        <label className="field">
          <span>{t("Ссылка на логотип")}</span>
          <input className="input" name="logo_url" type="url" defaultValue={s.logo_url} placeholder="https://…/logo.png" />
          <small>{t("Квадратное изображение. Пусто — стандартный значок.")}</small>
        </label>
        <label className="field">
          <span>{t("Discord сервер")}</span>
          <input className="input" name="discord_url" type="url" defaultValue={s.discord_url} placeholder="https://discord.gg/…" />
        </label>
        <label className="field">
          <span>{t("Контактный email")}</span>
          <input className="input" name="contact_email" type="email" defaultValue={s.contact_email} />
        </label>
        <div className="full"><SubmitButton className="btn">{t("Сохранить")}</SubmitButton></div>
      </form>
    </>
  );
}
