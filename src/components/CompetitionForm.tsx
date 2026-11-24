import type { Competition } from "@/lib/data";
import { toLocalInput } from "@/lib/format";
import { saveCompetition } from "@/app/actions/admin";
import { SubmitButton } from "./client";
import { getT } from "@/lib/i18n/server";

const BO = [1, 3, 5, 7];

export async function CompetitionForm({ c }: { c?: Competition }) {
  const t = await getT();
  const tz = c?.timezone ?? "Asia/Tashkent";
  const locked = !!c && c.draw_state !== "none";
  const sel = (name: keyof Competition, label: string, def: number) => (
    <label className="field">
      <span>{label}</span>
      <select className="input" name={name} defaultValue={String(c ? c[name] : def)} disabled={locked}>
        {BO.map((b) => (
          <option key={b} value={b}>
            Bo{b}
          </option>
        ))}
      </select>
      {locked && <input type="hidden" name={name} value={String(c![name])} />}
    </label>
  );
  return (
    <form action={saveCompetition} className="stack-lg">
      {c && <input type="hidden" name="id" value={c.id} />}
      <fieldset className="form-grid">
        <legend>{t("Основное")}</legend>
        <label className="field full">
          <span>{t("Название")}</span>
          <input className="input" name="name" required minLength={3} maxLength={80} defaultValue={c?.name} placeholder={t("Например: Premier League, Сезон 1")} />
        </label>
        <label className="field">
          <span>{t("Тип")}</span>
          <select className="input" name="kind" defaultValue={c?.kind ?? "cup"}>
            <option value="league">{t("Лига (сезон, как АПЛ)")}</option>
            <option value="cup">{t("Кубок (как Лига чемпионов)")}</option>
          </select>
        </label>
        <label className="field">
          <span>{t("Сезон / подпись")}</span>
          <input className="input" name="season" maxLength={60} defaultValue={c?.season} placeholder={t("Сезон 2026/27")} />
        </label>
        <label className="field">
          <span>{t("Режим")}</span>
          <select className="input" name="mode" defaultValue={c?.mode ?? "1v1"}>
            <option value="1v1">{t("1v1 — индивидуально")}</option>
            <option value="2v2">{t("2v2 — команды по 2")}</option>
          </select>
          <small>{t("После первых заявок режим не меняется")}</small>
        </label>
        <label className="field">
          <span>{t("Формат")}</span>
          <select className="input" name="format" defaultValue={c?.format ?? "groups_knockout"} disabled={locked}>
            <option value="groups_knockout">{t("Группы + плей-офф")}</option>
            <option value="knockout">{t("Только плей-офф")}</option>
            <option value="round_robin">{t("Круговой (лига)")}</option>
          </select>
          {locked && <input type="hidden" name="format" value={c!.format} />}
        </label>
        <label className="field full">
          <span>{t("Описание")}</span>
          <textarea className="input" name="description" maxLength={4000} defaultValue={c?.description} />
        </label>
        <label className="check full">
          <input type="checkbox" name="featured" defaultChecked={c?.featured} />
          <span>{t("Показывать на главной странице")}</span>
        </label>
      </fieldset>

      <fieldset className="form-grid">
        <legend>{t("Регистрация и даты")}</legend>
        <label className="field">
          <span>{t("Максимум участников")}</span>
          <input className="input" type="number" name="capacity" min={2} max={256} required defaultValue={c?.capacity ?? 16} />
        </label>
        <label className="field">
          <span>{t("Часовой пояс")}</span>
          <input className="input" name="timezone" required defaultValue={tz} />
          <small>{t("Например Asia/Tashkent")}</small>
        </label>
        <label className="field">
          <span>{t("Окончание регистрации")}</span>
          <input className="input" type="datetime-local" name="registration_deadline" defaultValue={toLocalInput(c?.registration_deadline, tz)} />
        </label>
        <label className="field">
          <span>{t("Старт соревнования")}</span>
          <input className="input" type="datetime-local" name="start_at" defaultValue={toLocalInput(c?.start_at, tz)} />
        </label>
        <label className="field">
          <span>{t("Регион сервера")}</span>
          <input className="input" name="region" required maxLength={40} defaultValue={c?.region ?? "Europe"} />
        </label>
        <div className="field">
          <span>{t("Платформы")}</span>
          <div className="row">
            {[
              ["pc", "PC"],
              ["playstation", "PlayStation"],
              ["xbox", "Xbox"],
            ].map(([v, l]) => (
              <label key={v} className="check">
                <input type="checkbox" name="platforms" value={v} defaultChecked={c ? c.platforms.includes(v) : true} />
                <span>{l}</span>
              </label>
            ))}
          </div>
        </div>
        <label className="check">
          <input type="checkbox" name="require_approval" defaultChecked={c?.require_approval} />
          <span>{t("Заявки одобряет администратор")}</span>
        </label>
        <label className="check">
          <input type="checkbox" name="checkin_required" defaultChecked={c?.checkin_required} />
          <span>{t("Обязательный чек-ин перед жеребьёвкой")}</span>
        </label>
        <label className="field">
          <span>{t("Длительность сезона, дней")}</span>
          <input className="input" type="number" name="season_days" min={0} max={365} defaultValue={c?.season_days ?? 30} />
          <small>{t("Для лиги и групп: после публикации жеребьёвки туры равномерно распределяются на этот срок, у каждого тура — свой крайний день. 0 — без календаря.")}</small>
        </label>
        <label className="field">
          <span>{t("Ожидание соперника, минут")}</span>
          <input className="input" type="number" name="noshow_minutes" min={0} max={120} defaultValue={c?.noshow_minutes ?? 15} />
          <small>{t("Если один игрок отметился «Я на месте», а соперник нет — через столько минут после начала засчитывается техническое поражение. 0 — выключено.")}</small>
        </label>
        <label className="check">
          <input type="checkbox" name="referee_only" defaultChecked={c?.referee_only ?? false} />
          <span>{t("Счёт вносит только судья матча (игроки результат не отправляют)")}</span>
        </label>
        <label className="check">
          <input type="checkbox" name="deadline_forfeit" defaultChecked={c?.deadline_forfeit ?? true} />
          <span>{t("Техническое поражение тому, кто не договорился о времени до срока тура")}</span>
        </label>
      </fieldset>

      <fieldset className="form-grid">
        <legend>{t("Турнирная сетка")} {locked && <span className="small faint">{t("· заблокировано после жеребьёвки")}</span>}</legend>
        <label className="field">
          <span>{t("Количество групп")}</span>
          <input className="input" type="number" name="group_count" min={1} max={16} defaultValue={c?.group_count ?? 4} readOnly={locked} />
          <small>{t("Для формата «Группы + плей-офф»")}</small>
        </label>
        <label className="field">
          <span>{t("Выходят из каждой группы")}</span>
          <input className="input" type="number" name="qualifiers_per_group" min={1} max={16} defaultValue={c?.qualifiers_per_group ?? 2} readOnly={locked} />
          <small>{t("Для лиги: размер призовой зоны в таблице")}</small>
        </label>
        {sel("group_best_of", t("Серия в группах / турах"), 3)}
        {sel("playoff_best_of", t("Серия в плей-офф"), 5)}
        {sel("final_best_of", t("Серия в финале"), 7)}
        <div className="stack" style={{ gap: 10 }}>
          <label className="check">
            <input type="checkbox" name="seeded_draw" defaultChecked={c?.seeded_draw} disabled={locked} />
            <span>{t("Жеребьёвка с посевом (корзины)")}</span>
          </label>
          {locked && c!.seeded_draw && <input type="hidden" name="seeded_draw" value="on" />}
          <label className="check">
            <input type="checkbox" name="double_round_robin" defaultChecked={c?.double_round_robin} disabled={locked} />
            <span>{t("Два круга (дома и в гостях)")}</span>
          </label>
          {locked && c!.double_round_robin && <input type="hidden" name="double_round_robin" value="on" />}
          <label className="check">
            <input type="checkbox" name="third_place" defaultChecked={c ? c.third_place : true} disabled={locked} />
            <span>{t("Матч за 3-е место")}</span>
          </label>
          {locked && c!.third_place && <input type="hidden" name="third_place" value="on" />}
        </div>
      </fieldset>

      <fieldset className="form-grid">
        <legend>{t("Очки и тай-брейки")}</legend>
        <label className="field">
          <span>{t("Очки за победу")}</span>
          <input className="input" type="number" name="points_win" min={0} max={10} defaultValue={c?.points_win ?? 3} />
        </label>
        <label className="field">
          <span>{t("Очки за поражение")}</span>
          <input className="input" type="number" name="points_loss" min={0} max={10} defaultValue={c?.points_loss ?? 0} />
        </label>
        <label className="field full">
          <span>{t("Порядок тай-брейков")}</span>
          <input className="input" name="tiebreakers" defaultValue={(c?.tiebreakers ?? ["points", "goal_diff", "goals_for", "head_to_head"]).join(", ")} />
          <small>{t("Через запятую: points, goal_diff, goals_for, head_to_head, wins")}</small>
        </label>
      </fieldset>

      <div>
        <SubmitButton className="btn btn-lg">{c ? t("Сохранить") : t("Создать соревнование")}</SubmitButton>
      </div>
    </form>
  );
}
