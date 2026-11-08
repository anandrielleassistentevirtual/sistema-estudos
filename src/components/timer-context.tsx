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
  label: string;
  language: string;
  cycles: number;
}

interface TimerApi extends TimerState {
  seconds: number; // decorrido na fase atual
  remaining: number; // pomodoro: restante
  start: () => void;
  pause: () => void;
  stop: () => Promise<void>;
  reset: () => void;
  set: (p: Partial<TimerState>) => void;
  lastSaved: number;
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
  cycles: 0,
};

const Ctx = createContext<TimerApi | null>(null);

export const CATEGORIAS = ["Leitura", "Idiomas", "Estudos", "Anki", "Escrita", "Outro"];

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
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setS({ ...initial, ...JSON.parse(raw) });
    } catch {}
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {}
  }, [s]);

  useEffect(() => {
    if (!s.running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [s.running]);

  const seconds = s.elapsed + (s.running && s.startedAt ? (now - s.startedAt) / 1000 : 0);
  const target = (s.phase === "foco" ? s.focusMin : s.breakMin) * 60;
  const remaining = Math.max(0, target - seconds);

  const save = useCallback(async (secs: number, st: TimerState) => {
    if (secs < 30) return;
    const started = new Date(Date.now() - secs * 1000);
    await supabase()
      .from("study_sessions")
      .insert({
        day: dayKey(started), started_at: started.toISOString(), seconds: Math.round(secs), category: st.category, label: st.label,
        language: st.category === "Idiomas" && st.language ? st.language : null,
      });
    setLastSaved(Date.now());
  }, []);

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
