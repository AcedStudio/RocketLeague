import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getCompetition, getEntries, entryCounts, getMatches, getGroups, getPrizes, type Competition } from "@/lib/data";
import { ENTRY_STATUS_LABELS, PAYOUT_LABELS, fmtDateTime, fmtMoney, toLocalInput } from "@/lib/format";
import { CompetitionForm } from "@/components/CompetitionForm";
import { CompStatusBadge, Flash, MatchStatusBadge, pick, stageLabel, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import {
  setCompetitionStatus, deleteCompetition, entryAction, editEntry, drawAction, scheduleRound, savePrizeSettings, addPrize, prizeAction,
} from "@/app/actions/admin";
import { scheduleAction } from "@/app/actions/match";

const TABS = [
  ["settings", "Настройки"],
  ["participants", "Участники"],
  ["draw", "Жеребьёвка"],
  ["matches", "Матчи"],
  ["prizes", "Призы"],
] as const;

export default async function ManageCompetition({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const comp = await getCompetition(id);
  if (!comp) notFound();
  const tab = (TABS.find(([k]) => k === pick(sp, "tab"))?.[0] ?? "settings") as (typeof TABS)[number][0];
  const counts = await entryCounts(comp.id);

  return (
    <>
      <div className="stack" style={{ gap: 10 }}>
        <div className="row small">
          <Link href="/admin/competitions" className="muted">← Все соревнования</Link>
          <Link href={`/c/${comp.slug}`} className="muted" style={{ marginLeft: "auto" }}>Открыть на сайте →</Link>
        </div>
        <div className="row">
          <h1 style={{ fontSize: "1.9rem" }}>{comp.name}</h1>
          <CompStatusBadge status={comp.status} />
          <span className="tag">{comp.mode}</span>
        </div>
        <p className="small muted">
          Подтверждено {counts.confirmed} · на проверке {counts.pending} · неполных {counts.incomplete} · ожидают {counts.waitlist} · мест {comp.capacity}
        </p>
      </div>

      <LifecycleBar comp={comp} />
      <Flash sp={sp} />

      <nav className="subtabs" aria-label="Разделы управления">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/admin/c/${comp.id}?tab=${k}`} aria-current={tab === k ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === "settings" && (
        <>
          <CompetitionForm c={comp} />
          {user.role === "superadmin" && (
            <form action={deleteCompetition} className="panel stack" style={{ borderColor: "rgba(255,123,136,.4)" }}>
              <input type="hidden" name="id" value={comp.id} />
              <h3>Удалить соревнование</h3>
              <p className="small muted">Удалит заявки, матчи и результаты без возможности восстановления.</p>
              <div className="row">
                <input className="input" name="confirm" placeholder="Введите УДАЛИТЬ" style={{ maxWidth: 240 }} />
                <SubmitButton className="btn btn-danger">Удалить</SubmitButton>
              </div>
            </form>
          )}
        </>
      )}
      {tab === "participants" && <ParticipantsTab comp={comp} q={pick(sp, "q")} status={pick(sp, "status")} />}
      {tab === "draw" && <DrawTab comp={comp} />}
      {tab === "matches" && <MatchesTab comp={comp} status={pick(sp, "status")} />}
      {tab === "prizes" && <PrizesTab comp={comp} />}
    </>
  );
}

function LifecycleBar({ comp }: { comp: Competition }) {
  const btn = (action: string, label: string, cls = "btn btn-sm", confirm?: string) => (
    <form action={setCompetitionStatus}>
      <input type="hidden" name="id" value={comp.id} />
      <input type="hidden" name="action" value={action} />
      <SubmitButton className={cls} confirm={confirm}>{label}</SubmitButton>
    </form>
  );
  return (
    <div className="panel panel-tight row">
      <span className="small muted" style={{ marginRight: 8 }}>Этап:</span>
      {(comp.status === "draft" || (comp.status === "closed" && comp.draw_state === "none")) && btn("open", "Открыть регистрацию")}
      {comp.status === "registration" && btn("close", "Закрыть регистрацию", "btn btn-sm", "Закрыть регистрацию? Новые заявки приниматься не будут.")}
      {["registration", "closed"].includes(comp.status) && comp.draw_state !== "published" && comp.checkin_required &&
        (comp.checkin_open ? btn("checkin_close", "Закрыть чек-ин", "btn btn-ghost btn-sm") : btn("checkin_open", "Открыть чек-ин", "btn btn-ghost btn-sm"))}
      {comp.status === "closed" && comp.draw_state !== "published" && (
        <Link href={`/admin/c/${comp.id}?tab=draw`} className="btn btn-gold btn-sm">Перейти к жеребьёвке</Link>
      )}
      {["registration", "closed"].includes(comp.status) && comp.draw_state === "none" && btn("unpublish", "Скрыть (черновик)", "btn btn-ghost btn-sm")}
      {["in_progress", "playoffs"].includes(comp.status) && <span className="small">Идёт турнир: результаты обновляют таблицу и сетку автоматически.</span>}
      {comp.status === "finished" && <span className="small">Соревнование завершено.</span>}
    </div>
  );
}

async function ParticipantsTab({ comp, q, status }: { comp: Competition; q: string; status: string }) {
  const entries = await getEntries(comp.id, { search: q.slice(0, 60), status: status in ENTRY_STATUS_LABELS ? status : undefined });
  const act = (entryId: string, action: string, label: string, cls = "btn btn-ghost btn-sm", confirm?: string) => (
    <form action={entryAction}>
      <input type="hidden" name="competition_id" value={comp.id} />
      <input type="hidden" name="entry_id" value={entryId} />
      <input type="hidden" name="action" value={action} />
      <SubmitButton className={cls} confirm={confirm}>{label}</SubmitButton>
    </form>
  );
  return (
    <div className="stack">
      <form className="row" role="search">
        <input type="hidden" name="tab" value="participants" />
        <input className="input" name="q" defaultValue={q} placeholder="Поиск по названию, нику или ID" style={{ maxWidth: 320 }} />
        <select className="input" name="status" defaultValue={status} style={{ maxWidth: 220 }}>
          <option value="">Все статусы</option>
          {Object.entries(ENTRY_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button className="btn btn-ghost">Фильтр</button>
        <a className="btn btn-ghost" href={`/api/export/${comp.id}/participants`}>Экспорт CSV</a>
      </form>
      {entries.length === 0 ? (
        <div className="empty">Заявок нет</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>№</th>
                <th>Название / посев</th>
                <th>Игроки</th>
                <th>Статус</th>
                <th className="r">Действия</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="num faint">#{e.number}</td>
                  <td>
                    <form action={editEntry} className="inline-form">
                      <input type="hidden" name="competition_id" value={comp.id} />
                      <input type="hidden" name="entry_id" value={e.id} />
                      <input className="input" name="name" defaultValue={e.name} style={{ width: 160, minHeight: 36 }} aria-label="Название" />
                      <input className="input" name="seed" defaultValue={e.seed ?? ""} placeholder="посев" style={{ width: 72, minHeight: 36 }} aria-label="Посев" />
                      <SubmitButton className="btn btn-ghost btn-sm">OK</SubmitButton>
                    </form>
                  </td>
                  <td className="small">
                    {e.members.map((m) => (
                      <div key={m.user_id}>
                        {m.rl_nickname} <span className="faint">· {m.rl_id}</span>
                      </div>
                    ))}
                  </td>
                  <td>
                    <span className="badge">{ENTRY_STATUS_LABELS[e.status]}</span>
                    {e.checked_in_at && <div className="small" style={{ color: "var(--ok)", marginTop: 4 }}>чек-ин</div>}
                  </td>
                  <td>
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      {e.status === "pending" && act(e.id, "approve", "Одобрить", "btn btn-sm")}
                      {e.status === "waitlist" && act(e.id, "confirm_waitlist", "В основной список", "btn btn-sm")}
                      {e.status === "pending" && act(e.id, "reject", "Отклонить", "btn btn-danger btn-sm", "Отклонить заявку?")}
                      {["confirmed", "incomplete", "waitlist"].includes(e.status) && comp.draw_state === "none" &&
                        act(e.id, "remove", "Снять", "btn btn-danger btn-sm", "Снять участника с соревнования?")}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

async function DrawTab({ comp }: { comp: Competition }) {
  const [groups, entries, matches, counts] = await Promise.all([getGroups(comp.id), getEntries(comp.id), getMatches(comp.id), entryCounts(comp.id)]);
  const names = new Map(entries.map((e) => [e.id, e.name]));
  const eligible = entries.filter((e) => e.status === "confirmed" && (!comp.checkin_required || e.checked_in_at)).length;
  const act = (action: string, label: string, cls: string, confirm?: string, extra?: React.ReactNode) => (
    <form action={drawAction} className="row">
      <input type="hidden" name="id" value={comp.id} />
      <input type="hidden" name="action" value={action} />
      {extra}
      <SubmitButton className={cls} confirm={confirm}>{label}</SubmitButton>
    </form>
  );
  const groupLeft = matches.filter((m) => m.stage === "group" && m.status !== "completed").length;

  return (
    <div className="stack-lg">
      <div className="panel stack">
        <dl className="facts-list">
          <dt>Допущено к жеребьёвке</dt>
          <dd>
            {eligible} {comp.checkin_required ? "(подтверждены и прошли чек-ин)" : "(подтверждённые заявки)"}
          </dd>
          <dt>Не попадут</dt>
          <dd className="muted">
            неполные команды: {counts.incomplete}, на проверке: {counts.pending}, лист ожидания: {counts.waitlist}
          </dd>
          <dt>Состояние</dt>
          <dd>{{ none: "Не проводилась", preview: "Предварительная (видна только админам)", published: "Опубликована и заблокирована" }[comp.draw_state]}</dd>
          {comp.draw_seed && (
            <>
              <dt>Код жеребьёвки</dt>
              <dd className="num">{comp.draw_seed}</dd>
            </>
          )}
        </dl>
        <div className="row">
          {comp.status !== "closed" && comp.draw_state === "none" && <span className="small muted">Чтобы провести жеребьёвку, закройте регистрацию.</span>}
          {comp.status === "closed" && comp.draw_state === "none" && act("run", "Провести жеребьёвку", "btn btn-gold")}
          {comp.draw_state === "preview" && (
            <>
              {act("run", "Перетянуть заново", "btn btn-ghost", "Провести жеребьёвку заново? Текущий предварительный результат будет заменён.")}
              {act("reset", "Сбросить", "btn btn-danger", "Сбросить предварительную жеребьёвку?")}
              {act("publish", "Опубликовать", "btn btn-gold", "Опубликовать жеребьёвку? После публикации её нельзя изменить.",
                <label className="check small"><input type="checkbox" name="confirm" required /> <span>Понимаю, что после публикации изменить нельзя</span></label>)}
            </>
          )}
          {comp.format === "groups_knockout" && comp.draw_state === "published" && !comp.playoffs_generated && (
            <>
              <span className="small muted">Групповой этап: осталось {groupLeft} матчей. Плей-офф создастся автоматически после последнего матча.</span>
              {groupLeft === 0 && act("playoffs", "Создать плей-офф", "btn btn-gold")}
            </>
          )}
        </div>
      </div>

      {groups.length > 0 && comp.format === "groups_knockout" && (
        <div className="groups">
          {groups.map((g) => (
            <section key={g.id} className="group-card">
              <h3>{g.name}</h3>
              <ol>{g.entry_ids.map((eid) => <li key={eid}>{names.get(eid)}</li>)}</ol>
            </section>
          ))}
        </div>
      )}
      {comp.draw_state !== "none" && (
        <p className="small muted">
          Сгенерировано матчей: {matches.filter((m) => !m.is_bye).length}
          {matches.some((m) => m.is_bye) ? `, проходов без игры (bye): ${matches.filter((m) => m.is_bye).length}` : ""}.{" "}
          <Link href={`/c/${comp.slug}/${comp.format === "knockout" ? "bracket" : comp.format === "round_robin" ? "matches" : "draw"}`}>Посмотреть на сайте</Link>
        </p>
      )}
    </div>
  );
}

async function MatchesTab({ comp, status }: { comp: Competition; status: string }) {
  const all = (await getMatches(comp.id)).filter((m) => !m.is_bye);
  const list = status ? all.filter((m) => m.status === status) : all;
  const rounds = Math.max(0, ...all.filter((m) => m.stage === "knockout").map((m) => m.round));
  const roundKeys = [...new Map(all.map((m) => [`${m.stage}:${m.round}`, stageLabel({ ...m, group_name: m.stage === "group" ? "Группы" : null }, rounds)])).entries()];
  if (!all.length) return <div className="empty">Матчей пока нет — они появятся после жеребьёвки.</div>;
  return (
    <div className="stack-lg">
      <form action={scheduleRound} className="panel stack">
        <input type="hidden" name="id" value={comp.id} />
        <h3>Назначить время целому туру</h3>
        <div className="row">
          <select className="input" name="round_key" style={{ maxWidth: 260 }}>
            {roundKeys.map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <input className="input" type="datetime-local" name="scheduled_at" required style={{ maxWidth: 240 }} />
          <SubmitButton className="btn">Назначить</SubmitButton>
        </div>
        <small className="faint">Время в поясе {comp.timezone}. Участники получат уведомление.</small>
      </form>
      <div className="subtabs">
        <Link href={`/admin/c/${comp.id}?tab=matches`} aria-current={!status ? "page" : undefined}>Все</Link>
        {(["ready", "live", "under_review", "postponed", "completed"] as const).map((s) => (
          <Link key={s} href={`/admin/c/${comp.id}?tab=matches&status=${s}`} aria-current={status === s ? "page" : undefined}>
            {{ ready: "Готовы", live: "Идут", under_review: "Споры", postponed: "Перенесены", completed: "Завершены" }[s]}
          </Link>
        ))}
        <a href={`/api/export/${comp.id}/matches`}>CSV</a>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>№</th>
              <th>Этап</th>
              <th>Матч</th>
              <th>Счёт</th>
              <th>Статус</th>
              <th>Время</th>
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id}>
                <td className="num"><Link href={`/match/${m.id}`}>#{m.number}</Link></td>
                <td className="small muted">{stageLabel(m, rounds)}</td>
                <td><Link href={`/match/${m.id}`}>{m.home_name ?? "?"} — {m.away_name ?? "?"}</Link></td>
                <td className="num">{m.status === "completed" ? (m.forfeit ? "ТП" : `${m.home_wins}:${m.away_wins}`) : ""}</td>
                <td><MatchStatusBadge status={m.status} /></td>
                <td>
                  <form action={scheduleAction} className="inline-form">
                    <input type="hidden" name="match_id" value={m.id} />
                    <input type="hidden" name="back" value={`/admin/c/${comp.id}?tab=matches`} />
                    <input className="input" type="datetime-local" name="scheduled_at" defaultValue={toLocalInput(m.scheduled_at, comp.timezone)} style={{ minHeight: 36, width: 200 }} aria-label="Время матча" />
                    <SubmitButton className="btn btn-ghost btn-sm">OK</SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small faint">Текущее время сервера: {fmtDateTime(new Date(), comp.timezone)}</p>
    </div>
  );
}

async function PrizesTab({ comp }: { comp: Competition }) {
  const [prizes, entries] = await Promise.all([getPrizes(comp.id), getEntries(comp.id, { status: "confirmed" })]);
  return (
    <div className="stack-lg">
      <form action={savePrizeSettings} className="panel form-grid">
        <input type="hidden" name="id" value={comp.id} />
        <label className="field">
          <span>Призовой фонд</span>
          <input className="input" name="prize_pool" inputMode="decimal" defaultValue={comp.prize_pool ?? ""} placeholder="Пусто — не объявлен" />
        </label>
        <label className="field">
          <span>Валюта</span>
          <input className="input" name="prize_currency" defaultValue={comp.prize_currency} maxLength={3} />
        </label>
        <label className="field">
          <span>Статус выплат</span>
          <select className="input" name="payout_status" defaultValue={comp.payout_status}>
            {Object.entries(PAYOUT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="field full">
          <span>Условия выплаты</span>
          <textarea className="input" name="prize_notes" defaultValue={comp.prize_notes} maxLength={2000} />
        </label>
        <div className="full"><SubmitButton className="btn">Сохранить</SubmitButton></div>
      </form>

      <section className="stack">
        <h3>Награды</h3>
        {prizes.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Место</th><th>Награда</th><th>Сумма</th><th>Получатель</th><th>Выплата</th><th /></tr>
              </thead>
              <tbody>
                {prizes.map((p) => (
                  <tr key={p.id}>
                    <td>{p.place ?? "Спец."}</td>
                    <td>{p.title}<div className="small faint">{p.description}</div></td>
                    <td className="num">{fmtMoney(p.amount, comp.prize_currency) ?? "—"}</td>
                    <td>
                      <form action={prizeAction} className="inline-form">
                        <input type="hidden" name="id" value={comp.id} />
                        <input type="hidden" name="prize_id" value={p.id} />
                        <input type="hidden" name="action" value="recipient" />
                        <select className="input" name="entry_id" defaultValue={p.recipient_entry_id ?? ""} style={{ minHeight: 36, maxWidth: 180 }} aria-label="Получатель">
                          <option value="">—</option>
                          {entries.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                        <SubmitButton className="btn btn-ghost btn-sm">OK</SubmitButton>
                      </form>
                    </td>
                    <td>
                      <form action={prizeAction}>
                        <input type="hidden" name="id" value={comp.id} />
                        <input type="hidden" name="prize_id" value={p.id} />
                        <input type="hidden" name="action" value="paid" />
                        <SubmitButton className={`btn btn-sm ${p.paid ? "" : "btn-ghost"}`}>{p.paid ? "Выплачено" : "Отметить выплату"}</SubmitButton>
                      </form>
                    </td>
                    <td>
                      <form action={prizeAction}>
                        <input type="hidden" name="id" value={comp.id} />
                        <input type="hidden" name="prize_id" value={p.id} />
                        <input type="hidden" name="action" value="delete" />
                        <SubmitButton className="btn btn-danger btn-sm" confirm="Удалить награду?">Удалить</SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">Награды не добавлены</div>
        )}
        <p className="small faint">Получатели 1–3 мест назначаются автоматически, когда соревнование завершается. Их можно изменить вручную.</p>
      </section>

      <form action={addPrize} className="panel form-grid">
        <input type="hidden" name="id" value={comp.id} />
        <h3 className="full">Добавить награду</h3>
        <label className="field">
          <span>Место (пусто — специальная награда)</span>
          <input className="input" name="place" type="number" min={1} max={64} />
        </label>
        <label className="field">
          <span>Название</span>
          <input className="input" name="title" required maxLength={80} placeholder="Чемпион, MVP…" />
        </label>
        <label className="field">
          <span>Сумма</span>
          <input className="input" name="amount" inputMode="decimal" />
        </label>
        <label className="field">
          <span>Описание</span>
          <input className="input" name="description" maxLength={300} />
        </label>
        <div className="full"><SubmitButton className="btn">Добавить</SubmitButton></div>
      </form>
    </div>
  );
}
