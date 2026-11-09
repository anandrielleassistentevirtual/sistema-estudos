"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TextReader } from "./text-reader";
import { themeColors, type ReaderHandle, type ReaderPrefs } from "./types";
import { ReadingTracker } from "@/lib/reading-tracker";
import { useTimerEstado } from "@/components/timer-context";
import { fmtClock, nf } from "@/lib/dates";
import type { Note } from "@/lib/types";
import { supabase, fire } from "@/lib/supabase/client";

/**
 * Leitura de uma aula (Estudos) igual à dos livros: páginas, palavras por minuto,
 * tempo e progresso. A sessão vai para reading_sessions com note_id da aula.
 */
export function LessonReader({ note, prefs, onProgress, onPosition }: {
  note: Note; prefs: ReaderPrefs; onProgress?: (p: number) => void; onPosition?: (location: string) => void;
}) {
  const reader = useRef<ReaderHandle>(null);
  const tracker = useRef<ReadingTracker | null>(null);
  const timer = useTimerEstado();
  const timerOn = useRef(false);
  timerOn.current = timer.running && timer.phase === "foco";
  const [session, setSession] = useState({ seconds: 0, words: 0 });
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const key = `aula-pos-${note.id}`;

  const blob = useMemo(() => new Blob([note.content], { type: "text/markdown" }), [note.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // posição salva no banco (notes.location) — vale em qualquer aparelho; localStorage como reserva
  const startAt = useMemo(() => {
    if (note.location && /^p:\d+$/.test(note.location)) return note.location;
    try { return localStorage.getItem(key); } catch { return null; }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const pendingPos = useRef<string | null>(null);
  const salva = useRef<string | null>(note.location ?? null);
  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;
  const posTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePos = useCallback(() => {
    if (posTimer.current) { clearTimeout(posTimer.current); posTimer.current = null; }
    const loc = pendingPos.current;
    if (!loc) return;
    pendingPos.current = null;
    if (loc === salva.current) return; // nada mudou: não grava de novo
    salva.current = loc;
    fire(supabase().from("notes").update({ location: loc }).eq("id", note.id));
    onPositionRef.current?.(loc);
  }, [note.id]);
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") savePos(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", savePos);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", savePos);
      savePos();
    };
  }, [savePos]);

  useEffect(() => {
    const t = new ReadingTracker(null, () => timerOn.current, note.id);
    t.onChange = () => setSession({ ...t.session });
    tracker.current = t;
    setSession({ seconds: 0, words: 0 });
    return () => { void t.close(); };
  }, [note.id]);

  const t = themeColors(prefs.theme);
  const wpm = session.seconds > 30 ? Math.round(session.words / (session.seconds / 60)) : 0;
  const line = prefs.theme === "escuro" ? "#2f2f2c" : "#00000014";

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: t.bg, color: t.fg }}>
      <div className="flex items-center gap-3 px-4 h-9 text-xs border-b shrink-0" style={{ borderColor: line }}>
        <span className="truncate opacity-70 flex-1">{label}</span>
        <span className="tabular-nums font-mono opacity-70" title="Esta sessão de leitura">
          {fmtClock(session.seconds)} · {nf.format(session.words)} pal. · {wpm ? `${wpm} ppm` : "— ppm"}
        </span>
        <span className="tabular-nums opacity-70 w-10 text-right" title="Progresso na aula">{Math.round(progress * 100)}%</span>
      </div>
      <div className="flex-1 min-h-0">
        <TextReader
          ref={reader}
          data={blob}
          format="md"
          startAt={startAt}
          prefs={prefs}
          annotations={[]}
          knownWords={null}
          onTurn={(words, forward) => tracker.current?.turn(words, forward)}
          onView={(words, last) => tracker.current?.see(words, last)}
          onLocation={(loc, p, l) => {
            setProgress(p);
            onProgress?.(p);
            if (l) setLabel(l);
            try { localStorage.setItem(key, loc); } catch {}
            if (loc !== note.location) {
              pendingPos.current = loc;
              if (posTimer.current) clearTimeout(posTimer.current);
              posTimer.current = setTimeout(savePos, 1200);
            }
          }}
          onSelect={() => {}}
          onWordCount={() => {}}
          onAnnotationClick={() => {}}
        />
      </div>
      <div className="shrink-0 flex items-center gap-2 px-3 h-8 text-xs opacity-80">
        <button className="p-1" onClick={() => reader.current?.prev()} aria-label="Página anterior"><ChevronLeft size={16} /></button>
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: line }}>
          <div className="h-full opacity-60" style={{ width: `${progress * 100}%`, background: "currentColor" }} />
        </div>
        <button className="p-1" onClick={() => reader.current?.next()} aria-label="Próxima página"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
