import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { saveSettings } from "@/app/actions/admin";
import { Flash, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export default async function AdminSettings({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  await requireAdmin();
  const s = await getSettings();
  return (
    <>
      <h1 style={{ fontSize: "2rem" }}>Настройки платформы</h1>
      <p className="muted measure">Даты, вместимость, формат и регион настраиваются отдельно для каждого соревнования.</p>
      <Flash sp={sp} />
      <form action={saveSettings} className="panel form-grid">
        <label className="field">
          <span>Название платформы</span>
          <input className="input" name="site_name" required maxLength={40} defaultValue={s.site_name} />
        </label>
        <label className="field">
          <span>Подзаголовок</span>
          <input className="input" name="tagline" maxLength={120} defaultValue={s.tagline} />
        </label>
        <label className="field">
          <span>Ссылка на логотип</span>
          <input className="input" name="logo_url" type="url" defaultValue={s.logo_url} placeholder="https://…/logo.png" />
          <small>Квадратное изображение. Пусто — стандартный значок.</small>
        </label>
        <label className="field">
          <span>Discord сервер</span>
          <input className="input" name="discord_url" type="url" defaultValue={s.discord_url} placeholder="https://discord.gg/…" />
        </label>
        <label className="field">
          <span>Контактный email</span>
          <input className="input" name="contact_email" type="email" defaultValue={s.contact_email} />
        </label>
        <div className="full"><SubmitButton className="btn">Сохранить</SubmitButton></div>
      </form>
    </>
  );
}
