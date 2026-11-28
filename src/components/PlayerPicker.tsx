"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/client";
import { Avatar, Nick } from "@/components/Badge";
import { Icon } from "@/components/Icon";

export type PickPlayer = { id: string; nick: string; avatar: string | null; color: string | null; rating: number; games: number };

function Picker({ players, value, onChange, placeholder, exclude }: { players: PickPlayer[]; value: string | null; onChange: (id: string) => void; placeholder: string; exclude: string | null }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const current = players.find((p) => p.id === value) ?? null;
  const list = useMemo(() => {
    const s = query.trim().toLowerCase();
    return players.filter((p) => p.id !== exclude && (!s || p.nick.toLowerCase().includes(s)));
  }, [players, query, exclude]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHi(0);
    setTimeout(() => search.current?.focus(), 0);
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const pick = (p: PickPlayer) => {
    onChange(p.id);
    setOpen(false);
  };

  return (
    <div className={`pp${open ? " open" : ""}`} ref={box}>
      <button type="button" className="pp-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
        {current ? (
          <>
            <Avatar name={current.nick} avatar={current.avatar} size={30} />
            <span className="pp-name"><Nick name={current.nick} color={current.color} /></span>
            <span className="pp-meta num">{current.rating}</span>
          </>
        ) : (
          <>
            <span className="pp-empty"><Icon name="ui-players" size={18} /></span>
            <span className="pp-name muted">{placeholder}</span>
          </>
        )}
        <span className="pp-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="pp-pop">
          <input
            ref={search}
            className="input pp-search"
            value={query}
            placeholder={t("Поиск по нику")}
            onChange={(e) => {
              setQuery(e.target.value);
              setHi(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHi((h) => Math.min(h + 1, list.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHi((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (list[hi]) pick(list[hi]);
              } else if (e.key === "Escape") setOpen(false);
            }}
          />
          <ul className="pp-list" role="listbox">
            {list.length ? (
              list.map((p, i) => (
                <li key={p.id} role="option" aria-selected={p.id === value}>
                  <button type="button" className={`pp-opt${i === hi ? " hi" : ""}${p.id === value ? " sel" : ""}`} onMouseEnter={() => setHi(i)} onClick={() => pick(p)}>
                    <Avatar name={p.nick} avatar={p.avatar} size={28} />
                    <span className="pp-name"><Nick name={p.nick} color={p.color} /></span>
                    <span className="pp-meta">
                      <b className="num">{p.rating}</b>
                      <small>{t("матчей: {n}", { n: p.games })}</small>
                    </span>
                  </button>
                </li>
              ))
            ) : (
              <li className="pp-none small muted">{t("Никого не нашли")}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Two player dropdowns; the comparison opens as soon as both are chosen. */
export function ComparePicker({ players, a, b }: { players: PickPlayer[]; a: string | null; b: string | null }) {
  const t = useT();
  const router = useRouter();
  const [left, setLeft] = useState(a);
  const [right, setRight] = useState(b);
  const go = (x: string | null, y: string | null) => {
    if (x && y && x !== y) router.push(`/players/compare?a=${x}&b=${y}`);
  };
  return (
    <div className="pp-row panel">
      <Picker players={players} value={left} exclude={right} placeholder={t("Выберите первого игрока")} onChange={(id) => { setLeft(id); go(id, right); }} />
      <button type="button" className="pp-swap" title={t("Поменять местами")} onClick={() => { setLeft(right); setRight(left); go(right, left); }}>
        <span className="num">VS</span>
      </button>
      <Picker players={players} value={right} exclude={left} placeholder={t("Выберите второго игрока")} onChange={(id) => { setRight(id); go(left, id); }} />
    </div>
  );
}
