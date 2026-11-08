"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { dayKey } from "@/lib/dates";

export type TimerMode = "pomodoro" | "livre";
export type Phase = "foco" | "pausa";

interface TimerState {
  mode: TimerMode;
  phase: Phase;
  running: boolean;
  startedAt: number | null; // ms do último "play"
  elapsed: number; // segundos acumulados antes do último play
  focusMin: number;
  breakMin: number;
  category: string;
  label: string; // texto livre (categorias sem lista)
  language: string; // Idiomas
  bookId: string; // Leitura
  bookTitle: string;
  bookPhysical: boolean;
  noteId: string; // Estudos (transcrição de aula)
  noteTitle: string;
  cycles: number;
}

/** Sessão de livro físico esperando a página onde você parou. */
export interface PendingPages {
  seconds: number;
  startedAt: string;
  state: TimerState;
}

interface TimerApi extends TimerState {
  seconds: number;
  remaining: number;
  start: () => void;
  pause: () => void;
  stop: () => Promise<void>;
  reset: () => void;
  set: (p: Partial<TimerState>) => void;
  lastSaved: number;
  pending: PendingPages | null;
  resolvePending: (page: number | null) => Promise<void>;
  /** rótulo do que está sendo estudado */
  what: string;
}

const KEY = "timer-estado";
const initial: TimerState = {
  mode: "pomodoro",
  phase: "foco",
  running: false,
  startedAt: null,
  elapsed: 0,
  focusMin: 25,
  breakMin: 5,
  category: "Leitura",
  label: "",
  language: "",
  bookId: "",
  bookTitle: "",
  bookPhysical: false,
  noteId: "",
  noteTitle: "",
  cycles: 0,
};

const Ctx = createContext<TimerApi | null>(null);

export const CATEGORIAS = ["Leitura", "Idiomas", "Estudos", "Anki", "Oração", "Escrita", "Outro"];

export function describe(st: TimerState): string {
  if (st.category === "Leitura" && st.bookTitle) return st.bookTitle;
  if (st.category === "Estudos" && st.noteTitle) return st.noteTitle;
  if (st.category === "Idiomas" && st.language) return st.label ? `${st.language} · ${st.label}` : st.language;
  return st.label;
}

function beep() {
  try {
    const ac = new AudioContext();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.value = 660;
    g.gain.setValueAtTime(0.15, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 1.2);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 1.2);
  } catch {}
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<TimerState>(initial);
  const [now, setNow] = useState(() => Date.now());
  const [lastSaved, setLastSaved] = useState(0);
  const [pending, setPending] = useState<PendingPages | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setS({ ...initial, ...JSON.parse(raw) });
      const p = localStorage.getItem(KEY + "-pendente");
      if (p) setPending(JSON.parse(p));
    } catch {}
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
      if (pending) localStorage.setItem(KEY + "-pendente", JSON.stringify(pending));
      else localStorage.removeItem(KEY + "-pendente");
    } catch {}
  }, [s, pending]);

  useEffect(() => {
    if (!s.running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [s.running]);

  const seconds = s.elapsed + (s.running && s.startedAt ? (now - s.startedAt) / 1000 : 0);
  const target = (s.phase === "foco" ? s.focusMin : s.breakMin) * 60;
  const remaining = Math.max(0, target - seconds);

  const insert = useCallback(async (secs: number, st: TimerState, startedIso: string) => {
    await supabase().from("study_sessions").insert({
      day: dayKey(new Date(startedIso)),
      started_at: startedIso,
      seconds: Math.round(secs),
      category: st.category,
      label: describe(st),
      language: st.category === "Idiomas" && st.language ? st.language : null,
      book_id: st.category === "Leitura" && st.bookId ? st.bookId : null,
      note_id: st.category === "Estudos" && st.noteId ? st.noteId : null,
    });
    setLastSaved(Date.now());
  }, []);

  const save = useCallback(async (secs: number, st: TimerState) => {
    if (secs < 30) return;
    const startedIso = new Date(Date.now() - secs * 1000).toISOString();
    // livro físico: pergunta a página antes de salvar (para medir páginas/palavras)
    if (st.category === "Leitura" && st.bookId && st.bookPhysical) {
      setPending({ seconds: secs, startedAt: startedIso, state: st });
      return;
    }
    await insert(secs, st, startedIso);
  }, [insert]);

  const resolvePending = useCallback(async (page: number | null) => {
    const p = pending;
    if (!p) return;
    setPending(null);
    await insert(p.seconds, p.state, p.startedAt);
    if (page === null) return;
    const sb = supabase();
    const { data: book } = await sb.from("books").select("current_page,total_pages,words_per_page,status,started_at").eq("id", p.state.bookId).single();
    if (!book) return;
    const before = book.current_page ?? 0;
    const pages = Math.max(0, page - before);
    const words = pages * (book.words_per_page ?? 300);
    if (pages > 0) {
      await sb.from("reading_sessions").insert({
        book_id: p.state.bookId, day: dayKey(new Date(p.startedAt)), started_at: p.startedAt,
        ended_at: new Date().toISOString(), seconds: Math.round(p.seconds), words, pages, during_timer: true,
      });
    }
    const total = book.total_pages ?? 0;
    const finished = total > 0 && page >= total;
    await sb.from("books").update({
      current_page: page,
      progress: total > 0 ? Math.min(1, page / total) : 0,
      status: finished ? "lido" : book.status === "aguardando" || book.status === "pausado" ? "lendo" : book.status,
      started_at: book.started_at ?? p.startedAt,
      ...(finished ? { finished_at: new Date().toISOString(), queue_position: null } : {}),
    }).eq("id", p.state.bookId);
    setLastSaved(Date.now());
  }, [pending, insert]);

  // fim de fase do pomodoro
  useEffect(() => {
    if (s.mode !== "pomodoro" || !s.running || remaining > 0) return;
    beep();
    if (s.phase === "foco") {
      void save(target, s);
      setS((p) => ({ ...p, phase: "pausa", elapsed: 0, startedAt: Date.now(), cycles: p.cycles + 1 }));
    } else {
      setS((p) => ({ ...p, phase: "foco", elapsed: 0, startedAt: null, running: false }));
    }
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(s.phase === "foco" ? "Foco concluído — hora da pausa" : "Pausa terminada — de volta ao foco");
    }
  }, [remaining, s, save, target]);

  const api: TimerApi = {
    ...s,
    seconds,
    remaining,
    lastSaved,
    pending,
    resolvePending,
    what: describe(s),
    start: () => {
      if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
      setNow(Date.now());
      setS((p) => (p.running ? p : { ...p, running: true, startedAt: Date.now() }));
    },
    pause: () =>
      setS((p) =>
        p.running && p.startedAt ? { ...p, running: false, elapsed: p.elapsed + (Date.now() - p.startedAt) / 1000, startedAt: null } : p,
      ),
    stop: async () => {
      const secs = seconds;
      const snapshot = s;
      setS((p) => ({ ...p, running: false, startedAt: null, elapsed: 0, phase: "foco" }));
      if (snapshot.phase === "foco") await save(secs, snapshot);
    },
    reset: () => setS((p) => ({ ...p, running: false, startedAt: null, elapsed: 0, phase: "foco" })),
    set: (patch) => setS((p) => ({ ...p, ...patch })),
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useTimer() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTimer fora do TimerProvider");
  return c;
}
