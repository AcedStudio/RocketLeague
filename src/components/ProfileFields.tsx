import type { User } from "@/lib/auth";

export function ProfileFields({ u }: { u?: Partial<User> }) {
  return (
    <>
      <label className="field">
        <span>Имя</span>
        <input className="input" name="display_name" required maxLength={60} defaultValue={u?.display_name} autoComplete="name" />
      </label>
      <label className="field">
        <span>Ник в Rocket League</span>
        <input className="input" name="rl_nickname" required minLength={2} maxLength={32} defaultValue={u?.rl_nickname} />
      </label>
      <label className="field">
        <span>Платформа</span>
        <select className="input" name="platform" required defaultValue={u?.platform ?? ""}>
          <option value="" disabled>
            Выберите
          </option>
          <option value="pc">PC (Epic / Steam)</option>
          <option value="playstation">PlayStation</option>
          <option value="xbox">Xbox</option>
        </select>
      </label>
      <label className="field">
        <span>Rocket League ID</span>
        <input className="input" name="rl_id" required minLength={2} maxLength={64} defaultValue={u?.rl_id} />
        <small>Epic ID, PSN ID или Xbox Gamertag. Один аккаунт — одна регистрация.</small>
      </label>
      <label className="field full">
        <span>Контакт для связи</span>
        <input className="input" name="contact" required minLength={2} maxLength={80} defaultValue={u?.contact} placeholder="Discord: nickname или Telegram: @nickname" />
      </label>
    </>
  );
}
