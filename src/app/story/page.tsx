import Link from "next/link";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { Flash, type SP } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Badge";
import { Coin } from "@/components/shop";
import { storyState } from "@/lib/story";
import { findItem, iconOf } from "@/lib/engine/shop";
import { chapterAction } from "@/app/actions/story";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Путь чемпиона") };
}

export default async function Story({ searchParams }: { searchParams: SP }) {
  const t = await getT();
  const sp = await searchParams;
  const user = await getUser();
  const st = await storyState(user?.id ?? null);
  const done = st.chapters.filter((c) => c.claimed).length;
  const finalItem = findItem("avatar:pathfinder");

  return (
    <div className="wrap section stack-lg">
      <Flash sp={sp} />
      <header className="story-hero">
        <div className="stack-sm">
          <p className="eyebrow">{t("Сюжет")}</p>
          <h1 className="pass-title">{st.chain.name}</h1>
          <p className="muted" style={{ margin: 0, maxWidth: 560 }}>{t(st.chain.tagline)} · {t("Глав пройдено: {n} из {total}", { n: done, total: st.chapters.length })}</p>
        </div>
        <div className="start-goal">
          <Avatar name={user?.rl_nickname ?? "P"} avatar="pathfinder" size={96} />
          <b>{finalItem?.name}</b>
          <span className="small muted">{t("Легендарный аватар за весь путь")}</span>
        </div>
      </header>

      {!user && (
        <div className="panel row between">
          <span>{t("Войдите, чтобы пройти путь чемпиона.")}</span>
          <Link className="btn" href="/login?next=/story">{t("Войти")}</Link>
        </div>
      )}

      <ol className="road">
        {st.chapters.map((c) => {
          const reward = "coins" in c.reward ? null : findItem(c.reward.item);
          const state = c.claimed ? "claimed" : !c.unlocked ? "locked" : c.done ? "ready" : "active";
          return (
            <li key={c.ref} id={`ch${c.n}`} className={`chapter is-${state}`}>
              <span className="chapter-node num">{c.claimed ? <Icon name="r-check" size={30} /> : state === "locked" ? <Icon name="r-lock" size={24} /> : c.n}</span>
              <div className="chapter-card">
                <div className="chapter-head">
                  <span className="eyebrow">{t("Глава {n}", { n: c.n })}</span>
                  <span className="chapter-reward">
                    {"coins" in c.reward ? (
                      <span className="chip-coin num">+{c.reward.coins} <Coin size={12} /></span>
                    ) : reward ? (
                      <span className="chip-item">
                        {reward.kind === "tag" ? <Icon name={iconOf("tag", reward.key)} size={22} /> : <Avatar name="P" avatar={reward.key} size={22} />} {reward.name}
                      </span>
                    ) : null}
                  </span>
                </div>
                <h2 className="chapter-title">{t(c.title)}</h2>
                <p className="chapter-story">{t(c.story)}</p>
                {state !== "locked" && (
                  <div className="chapter-goals">
                    {c.progress.map((o) => (
                      <div key={o.desc} className={`goal${o.value >= o.target ? " ok" : ""}`}>
                        <span className="small">{t(o.desc, { n: o.target })}</span>
                        <span className="meter-row">
                          <span className="meter"><i style={{ width: `${Math.round((o.value / o.target) * 100)}%` }} /></span>
                          <span className="small num faint">{o.value} / {o.target}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {state === "ready" && (
                  <form action={chapterAction}>
                    <input type="hidden" name="ref" value={c.ref} />
                    <SubmitButton className="btn btn-gold btn-sm">{t("Завершить главу")}</SubmitButton>
                  </form>
                )}
                {state === "locked" && <p className="small faint" style={{ margin: 0 }}>{t("Откроется после предыдущей главы")}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
