"use client";
import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import { Page } from "@/components/page";
import { CATEGORIAS, useTimer } from "@/components/timer-context";
import { dayKey, fmtClock, fmtDuration } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";

interface Session { id: string; started_at: string; seconds: number; category: string; label: string }

export default function TimerPage() {
  const t = useTimer();
  const [today, setToday] = useState<Session[]>([]);

  const load = () =>
    supabase()
      .from("study_sessions")
      .select("*")
      .eq("day", dayKey())
      .order("started_at", { ascending: false })
      .then(({ data }) => setToday((data as Session[]) ?? []));
  useEffect(() => {
    void load();
  }, [t.lastSaved]);

  const display = t.mode === "pomodoro" ? t.remaining : t.seconds;
  const total = (t.phase === "foco" ? t.focusMin : t.breakMin) * 60;
  const pct = t.mode === "pomodoro" ? 1 - t.remaining / total : (t.seconds % 3600) / 3600;
  const R = 110;
  const C = 2 * Math.PI * R;
  const byCat = today.reduce<Record<string, number>>((a, s) => ((a[s.category] = (a[s.category] ?? 0) + s.seconds), a), {});

  return (
    <Page title="Timer" subtitle="Cada sessão de foco entra no calendário e no dashboard.">
      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <div className="card p-6 flex flex-col items-center">
          <div className="inline-flex rounded-lg bg-surface-2 p-1 text-sm mb-6">
            {(["pomodoro", "livre"] as const).map((m) => (
              <button
                key={m}
                disabled={t.running}
                onClick={() => t.set({ mode: m, phase: "foco", elapsed: 0 })}
                className={`px-4 py-1.5 rounded-md ${t.mode === m ? "bg-surface shadow-sm font-medium" : "text-muted"}`}
              >
                {m === "pomodoro" ? "Pomodoro" : "Cronômetro"}
              </button>
            ))}
          </div>
          <div className="relative w-[260px] h-[260px]">
            <svg viewBox="0 0 260 260" className="w-full h-full -rotate-90">
              <circle cx="130" cy="130" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
              <circle
                cx="130" cy="130" r={R} fill="none"
                stroke={t.phase === "foco" ? "var(--accent)" : "var(--good)"}
                strokeWidth="10" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0, Math.min(1, pct)))}
                style={{ transition: "stroke-dashoffset 0.5s linear" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-xs uppercase tracking-wider text-muted">
                {t.mode === "pomodoro" ? (t.phase === "foco" ? "Foco" : "Pausa") : "Decorrido"}
              </div>
              <div className="text-5xl font-semibold font-mono tabular-nums mt-1">{fmtClock(display)}</div>
              {t.mode === "pomodoro" && <div className="text-xs text-faint mt-1">ciclos hoje: {t.cycles}</div>}
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            {t.running ? (
              <button className="btn btn-primary px-5" onClick={t.pause}><Pause size={16} /> Pausar</button>
            ) : (
              <button className="btn btn-primary px-5" onClick={t.start}><Play size={16} /> {t.seconds > 0 ? "Continuar" : "Iniciar"}</button>
            )}
            <button className="btn" onClick={() => void t.stop()} disabled={t.seconds === 0} title="Encerrar e salvar">
              <Square size={15} /> Encerrar e salvar
            </button>
            <button className="btn btn-ghost" onClick={t.reset} title="Zerar sem salvar"><RotateCcw size={15} /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 w-full max-w-md mt-8">
            <label className="space-y-1">
              <span className="label">Categoria</span>
              <select className="input" value={t.category} onChange={(e) => t.set({ category: e.target.value })}>
                {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="label">O que está estudando</span>
              <input className="input" value={t.label} placeholder="ex.: Divina Comédia, canto V" onChange={(e) => t.set({ label: e.target.value })} />
            </label>
            {t.mode === "pomodoro" && (
              <>
                <label className="space-y-1">
                  <span className="label">Foco (min)</span>
                  <input className="input" type="number" min={1} max={180} value={t.focusMin} disabled={t.running}
                    onChange={(e) => t.set({ focusMin: Number(e.target.value) || 25 })} />
                </label>
                <label className="space-y-1">
                  <span className="label">Pausa (min)</span>
                  <input className="input" type="number" min={1} max={60} value={t.breakMin} disabled={t.running}
                    onChange={(e) => t.set({ breakMin: Number(e.target.value) || 5 })} />
                </label>
              </>
            )}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold">Hoje</h2>
          <p className="text-3xl font-semibold mt-1 tabular-nums">{fmtDuration(today.reduce((a, s) => a + s.seconds, 0))}</p>
          <div className="mt-3 space-y-1">
            {Object.entries(byCat).map(([c, secs]) => (
              <div key={c} className="flex justify-between text-sm"><span className="text-muted">{c}</span><span className="tabular-nums">{fmtDuration(secs)}</span></div>
            ))}
          </div>
          <h3 className="label mt-5 mb-2">Sessões</h3>
          {today.length === 0 && <p className="text-sm text-muted">Nenhuma sessão salva hoje.</p>}
          <ul className="space-y-1.5">
            {today.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm group">
                <span>
                  <span className="text-faint tabular-nums mr-2">
                    {new Date(s.started_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {s.label || s.category}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums text-muted">{fmtDuration(s.seconds)}</span>
                  <button className="opacity-0 group-hover:opacity-100 text-faint hover:text-critical" title="Apagar"
                    onClick={async () => { await supabase().from("study_sessions").delete().eq("id", s.id); void load(); }}>
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Page>
  );
}
