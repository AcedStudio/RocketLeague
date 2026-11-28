// "What do I do now?" — one clear next step per match or duel.
export type Tone = "urgent" | "today" | "soon" | "wait";
export type Step = { key: string; label: string; cta: string; tone: Tone };

export type MatchFacts = {
  status: "upcoming" | "ready" | "live" | "under_review" | "postponed" | "completed";
  scheduledAt: Date | null;
  playBy: Date | null;
  refereeOnly: boolean;
  /** A time proposal from the opponent waits for my answer. */
  theirProposal: boolean;
  /** I proposed a time and wait for the opponent. */
  myProposal: boolean;
  /** The opponent reported a score that I must confirm or dispute. */
  theirReport: boolean;
  /** I reported, waiting for the opponent. */
  myReport: boolean;
};

const H = 3600_000;

export function matchStep(f: MatchFacts, now = new Date()): Step {
  const n = now.getTime();
  if (f.status === "upcoming") return { key: "tbd", label: "Соперник определится позже", cta: "Открыть", tone: "wait" };
  if (f.theirReport) return { key: "confirm", label: "Соперник внёс счёт — подтвердите", cta: "Подтвердить счёт", tone: "urgent" };
  if (f.status === "under_review" || f.myReport) return { key: "review", label: "Счёт отправлен, ждём подтверждения", cta: "Открыть", tone: "wait" };
  if (f.scheduledAt) {
    const at = f.scheduledAt.getTime();
    if (at <= n + 15 * 60_000) {
      return f.refereeOnly
        ? { key: "play-ref", label: "Время матча — играйте, счёт внесёт судья", cta: "Открыть матч", tone: "urgent" }
        : { key: "report", label: "Сыграйте и внесите счёт", cta: "Внести счёт", tone: "urgent" };
    }
    return { key: "scheduled", label: "Матч назначен", cta: "Открыть матч", tone: at - n < 24 * H ? "today" : "soon" };
  }
  if (f.theirProposal) return { key: "answer", label: "Соперник предложил время — ответьте", cta: "Ответить", tone: "urgent" };
  if (f.myProposal) return { key: "proposed", label: "Вы предложили время, ждём ответа", cta: "Открыть", tone: "wait" };
  const late = f.playBy && f.playBy.getTime() - n < 48 * H;
  return { key: "schedule", label: "Договоритесь о времени", cta: "Выбрать время", tone: late ? "urgent" : "soon" };
}

export type DuelFacts = { status: "pending" | "accepted" | "reported"; mine: "challenger" | "opponent"; reportedByMe: boolean };

export function duelStep(d: DuelFacts): Step {
  if (d.status === "pending") {
    return d.mine === "opponent"
      ? { key: "duel-accept", label: "Вам бросили вызов", cta: "Принять вызов", tone: "urgent" }
      : { key: "duel-wait", label: "Вызов отправлен, ждём ответа", cta: "Открыть", tone: "wait" };
  }
  if (d.status === "reported") {
    return d.reportedByMe
      ? { key: "duel-review", label: "Счёт отправлен, ждём подтверждения", cta: "Открыть", tone: "wait" }
      : { key: "duel-confirm", label: "Соперник внёс счёт — подтвердите", cta: "Подтвердить счёт", tone: "urgent" };
  }
  return { key: "duel-play", label: "Дуэль принята — сыграйте и внесите счёт", cta: "Внести счёт", tone: "today" };
}

const RANK: Record<Tone, number> = { urgent: 0, today: 1, soon: 2, wait: 3 };
/** Urgent first, then by time. */
export function sortTasks<T extends { step: Step; when: Date | null }>(list: T[]) {
  return [...list].sort((a, b) => RANK[a.step.tone] - RANK[b.step.tone] || (a.when?.getTime() ?? Infinity) - (b.when?.getTime() ?? Infinity));
}
