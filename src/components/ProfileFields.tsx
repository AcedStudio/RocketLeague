import type { User } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";

export async function ProfileFields({ u }: { u?: Partial<User> }) {
  const t = await getT();
  return (
    <>
      <label className="field">
        <span>{t("Имя")}</span>
        <input className="input" name="display_name" required maxLength={60} defaultValue={u?.display_name} autoComplete="name" />
      </label>
      <label className="field">
        <span>{t("Ник в Rocket League")}</span>
        <input className="input" name="rl_nickname" required minLength={2} maxLength={32} defaultValue={u?.rl_nickname} />
      </label>
      <label className="field">
        <span>{t("Платформа")}</span>
        <select className="input" name="platform" required defaultValue={u?.platform ?? ""}>
          <option value="" disabled>
            {t("Выберите")}
          </option>
          <option value="pc">PC (Epic / Steam)</option>
          <option value="playstation">PlayStation</option>
          <option value="xbox">Xbox</option>
        </select>
      </label>
      <label className="field">
        <span>Rocket League ID</span>
        <input className="input" name="rl_id" required minLength={2} maxLength={64} defaultValue={u?.rl_id} />
        <small>{t("Epic ID, PSN ID или Xbox Gamertag. Один аккаунт — одна регистрация.")}</small>
      </label>
      <label className="field full">
        <span>{t("Контакт для связи")}</span>
        <input className="input" name="contact" required minLength={2} maxLength={80} defaultValue={u?.contact} placeholder={t("Discord: nickname или Telegram: @nickname")} />
      </label>
    </>
  );
}
