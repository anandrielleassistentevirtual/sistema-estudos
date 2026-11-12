"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Pause, Play, Timer, X } from "lucide-react";
import { useTimer } from "./timer-context";
import { TimerControls } from "./timer-controls";
import { fmtClock } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";

/** Timer sempre à mão: botão flutuante em todas as telas (inclusive no leitor). */
export function FloatingTimer() {
  const t = useTimer();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const onTimerPage = path === "/timer";
  const reader = path.startsWith("/ler/") || /^\/estudos\/(?!tarefas(\/|$))[^/]+/.test(path);
  // a sala de escrita tem o próprio cronômetro e não deve ter nada piscando na tela
  const salaEscrita = /^\/escrita\/[^/]+/.test(path);
  const active = t.running || t.seconds > 0;
  const clock = fmtClock(t.mode === "pomodoro" ? t.remaining : t.seconds);

  return (
    <>
      <PagesPrompt />
      {!onTimerPage && !salaEscrita && (
        <div className="fixed right-4 z-[60] flex flex-col items-end gap-2" style={{ bottom: `calc(${reader ? 48 : 16}px + env(safe-area-inset-bottom))` }}>
          {open && (
            <div className="card shadow-2xl p-4 w-[min(340px,calc(100vw-2rem))] max-h-[75vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-sm">Timer</span>
                <button onClick={() => setOpen(false)} className="text-muted"><X size={16} /></button>
              </div>
              <TimerControls compact />
            </div>
          )}
          <div className={`flex items-center rounded-full shadow-lg border border-line ${active ? "bg-accent text-accent-ink border-accent" : "bg-surface"}`}>
            <button className="flex items-center gap-2 pl-3.5 pr-2 py-2 text-sm" onClick={() => setOpen(!open)} title="Abrir o timer">
              <Timer size={16} />
              {active ? (
                <>
                  <span className="font-mono tabular-nums font-medium">{clock}</span>
                  <span className="hidden sm:inline max-w-[160px] truncate opacity-90">{t.phase === "pausa" ? "Pausa" : t.what || t.category}</span>
                </>
              ) : (
                <span>Timer</span>
              )}
            </button>
            {active && (
              <button className="pr-3 pl-1 py-2" onClick={t.running ? t.pause : t.start} title={t.running ? "Pausar" : "Continuar"}>
                {t.running ? <Pause size={15} /> : <Play size={15} />}
              </button>
            )}
            {!active && <span className="pr-1.5" />}
          </div>
        </div>
      )}
    </>
  );
}

/** Pergunta "até que página você leu?" ao encerrar um livro físico. */
function PagesPrompt() {
  const t = useTimer();
  const [page, setPage] = useState("");
  const [info, setInfo] = useState<{ current: number | null; total: number | null } | null>(null);
  const p = t.pending;

  useEffect(() => {
    if (!p) return;
    void supabase().from("books").select("current_page,total_pages").eq("id", p.state.bookId).single().then(({ data }) => {
      setInfo(data ? { current: data.current_page, total: data.total_pages } : null);
      setPage(data?.current_page ? String(data.current_page) : "");
    });
  }, [p]);

  if (!p) return null;
  const n = Number(page);
  const pages = info?.current ? n - info.current : n;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4 bg-black/40">
      <form className="card w-full max-w-sm p-5 space-y-3" onSubmit={(e) => { e.preventDefault(); void t.resolvePending(n > 0 ? n : null); }}>
        <h2 className="font-medium">Até que página você chegou?</h2>
        <p className="text-sm text-muted">
          {p.state.bookTitle} · {fmtClock(p.seconds)} de leitura
          {info?.current ? ` · você estava na p. ${info.current}` : ""}{info?.total ? ` (de ${info.total})` : ""}
        </p>
        <input className="input text-lg" type="number" min={info?.current ?? 1} max={info?.total ?? undefined} autoFocus required
          value={page} onChange={(e) => setPage(e.target.value)} placeholder="nº da página" />
        {n > 0 && pages > 0 && <p className="text-xs text-muted">{pages} {pages === 1 ? "página lida" : "páginas lidas"} nesta sessão.</p>}
        <div className="flex justify-between gap-2">
          <button type="button" className="btn btn-ghost text-xs" onClick={() => void t.resolvePending(null)}>Salvar só o tempo</button>
          <button className="btn btn-primary">Salvar</button>
        </div>
      </form>
    </div>
  );
}
