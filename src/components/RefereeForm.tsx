import type { T } from "@/lib/i18n/core";
import { refereeResultAction } from "@/app/actions/match";
import { GamesInput, SubmitButton } from "@/components/client";

/** The referee's score form: what happened, the score, an optional note. Same on the match page and in the referee desk. */
export function RefereeForm({
  t, matchId, bestOf, homeName, awayName, initial, back, compact,
}: {
  t: T;
  matchId: string;
  bestOf: number;
  homeName: string;
  awayName: string;
  initial?: { home: number; away: number }[];
  back?: "/referee";
  compact?: boolean;
}) {
  return (
    <form action={refereeResultAction} className={`ref-form stack${compact ? " compact" : ""}`}>
      <input type="hidden" name="match_id" value={matchId} />
      {back && <input type="hidden" name="back" value={back} />}
      <fieldset className="ref-outcome">
        <legend className="small muted">{t("Что произошло?")}</legend>
        <label>
          <input type="radio" name="forfeit" value="" defaultChecked />
          <span>🎮 {t("Матч сыгран — вписываю счёт")}</span>
        </label>
        <label>
          <input type="radio" name="forfeit" value="home" />
          <span>🚫 {t("{name} не явился", { name: awayName })} → {t("победа {name}", { name: homeName })}</span>
        </label>
        <label>
          <input type="radio" name="forfeit" value="away" />
          <span>🚫 {t("{name} не явился", { name: homeName })} → {t("победа {name}", { name: awayName })}</span>
        </label>
      </fieldset>
      <div className="ref-score">
        <GamesInput bestOf={bestOf} homeName={homeName} awayName={awayName} initial={initial} />
      </div>
      {!compact && (
        <label className="field">
          <span>{t("Комментарий (необязательно)")}</span>
          <input className="input" name="note" maxLength={500} placeholder={t("Например: овертайм, переигровка из-за вылета")} />
        </label>
      )}
      <SubmitButton className="btn btn-gold" confirm={t("Утвердить результат? Таблица и сетка обновятся.")}>
        ✅ {t("Утвердить результат")}
      </SubmitButton>
    </form>
  );
}
