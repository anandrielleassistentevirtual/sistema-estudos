"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookHeart, BookOpen, Feather, Pause, Play, RotateCcw, Square } from "lucide-react";
import { CATEGORIAS, useTimer } from "./timer-context";
import { fmtClock } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";
import { Language, loadLanguages } from "@/lib/languages";
import { bookName } from "@/lib/folders";
import { Combobox } from "./combobox";

interface BookOpt { id: string; title: string; author: string | null; format: string; status: string; current_page: number | null; total_pages: number | null }
interface NoteOpt { id: string; title: string; professor: string; course: string; situacao?: string; progresso?: number }

/** Controles do timer (usados na tela Timer e no timer flutuante). */
export function TimerControls({ compact = false }: { compact?: boolean }) {
  const t = useTimer();
  const router = useRouter();

  /** Leva ao lugar de estudo em modo foco (menu e lista recolhidos) e liga o timer. */
  function goFocus(path: string | null) {
    try { localStorage.setItem("menu-oculto", "1"); localStorage.setItem("lista-oculta", "1"); } catch {}
    window.dispatchEvent(new CustomEvent("modo-foco", { detail: { oculto: true } }));
    if (!t.running) t.start();
    if (path) router.push(path);
  }
  const [books, setBooks] = useState<BookOpt[]>([]);
  const [notes, setNotes] = useState<NoteOpt[]>([]);
  const [langs, setLangs] = useState<Language[]>([]);

  useEffect(() => {
    const sb = supabase();
    // o que já foi concluído continua na lista, mas vai para o fim
    const ordemLivro: Record<string, number> = { lendo: 0, aguardando: 1, pausado: 1, lido: 2 };
    void sb.from("books").select("id,title,author,format,status,current_page,total_pages").order("author").order("title")
      .then(({ data }) => setBooks(((data as BookOpt[]) ?? []).sort((a, b) => (ordemLivro[a.status] ?? 1) - (ordemLivro[b.status] ?? 1))));
    void sb.from("notes").select("id,title,professor,course,situacao,progresso").eq("kind", "estudo")
      .then(({ data }) => setNotes(((data as NoteOpt[]) ?? []).sort((a, b) =>
        Number(a.situacao === "concluida") - Number(b.situacao === "concluida") ||
        a.course.localeCompare(b.course, "pt-BR") || a.title.localeCompare(b.title, "pt-BR", { numeric: true }))));
    void loadLanguages().then(setLangs);
  }, [t.lastSaved]);

  const display = t.mode === "pomodoro" ? t.remaining : t.seconds;
  const total = (t.phase === "foco" ? t.focusMin : t.breakMin) * 60;
  const pct = t.mode === "pomodoro" ? 1 - t.remaining / total : (t.seconds % 3600) / 3600;
  const size = compact ? 150 : 260;
  const R = compact ? 64 : 110;
  const C = 2 * Math.PI * R;
  const book = books.find((b) => b.id === t.bookId);

  return (
    <div className="flex flex-col items-center w-full">
      <div className={`inline-flex rounded-lg bg-surface-2 p-1 text-sm ${compact ? "mb-3" : "mb-6"}`}>
        {(["pomodoro", "livre"] as const).map((m) => (
          <button key={m} disabled={t.running} onClick={() => t.set({ mode: m, phase: "foco", elapsed: 0 })}
            className={`px-3 py-1 rounded-md ${t.mode === m ? "bg-seg shadow-sm font-medium" : "text-muted"}`}>
            {m === "pomodoro" ? "Pomodoro" : "Cronômetro"}
          </button>
        ))}
      </div>

      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="var(--surface-2)" strokeWidth={compact ? 7 : 10} />
          <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={t.phase === "foco" ? "var(--accent)" : "var(--good)"}
            strokeWidth={compact ? 7 : 10} strokeLinecap="round" strokeDasharray={C}
            strokeDashoffset={C * (1 - Math.max(0, Math.min(1, pct)))} style={{ transition: "stroke-dashoffset 0.5s linear" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[10px] uppercase tracking-wider text-muted">
            {t.mode === "pomodoro" ? (t.phase === "foco" ? "Foco" : "Pausa") : "Decorrido"}
          </div>
          <div className={`${compact ? "text-3xl" : "text-5xl"} font-medium font-mono tabular-nums mt-0.5`}>{fmtClock(display)}</div>
          {t.mode === "pomodoro" && !compact && <div className="text-xs text-faint mt-1">ciclos hoje: {t.cycles}</div>}
        </div>
      </div>

      <div className={`flex gap-2 ${compact ? "mt-3" : "mt-6"}`}>
        {t.running ? (
          <button className="btn btn-primary px-4" onClick={t.pause}><Pause size={16} /> Pausar</button>
        ) : (
          <button className="btn btn-primary px-4" onClick={t.start}><Play size={16} /> {t.seconds > 0 ? "Continuar" : "Iniciar"}</button>
        )}
        <button className="btn" onClick={() => void t.stop()} disabled={t.seconds === 0} title="Encerrar e salvar">
          <Square size={15} /> {compact ? "Encerrar" : "Encerrar e salvar"}
        </button>
        <button className="btn btn-ghost px-2" onClick={t.reset} title="Zerar sem salvar"><RotateCcw size={15} /></button>
      </div>

      <div className={`grid gap-3 w-full ${compact ? "mt-4" : "sm:grid-cols-2 max-w-md mt-8"}`}>
        <label className="space-y-1">
          <span className="label">Categoria</span>
          <select className="input" value={t.category} onChange={(e) => t.set({ category: e.target.value })}>
            {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>

        {t.category === "Leitura" && (
          <label className="space-y-1">
            <span className="label">Livro</span>
            <Combobox
              value={t.bookId}
              placeholder="Digite o título ou o autor…"
              emptyText="Nenhum livro com esse nome"
              options={books.map((b) => ({
                value: b.id,
                label: `${b.format === "fisico" ? "📖 " : ""}${bookName(b)}`,
                hint: [
                  b.format === "fisico" ? `livro físico${b.current_page ? ` · p. ${b.current_page}` : ""}` : null,
                  b.status === "lendo" ? "lendo" : b.status === "lido" ? "✓ lido" : null,
                ].filter(Boolean).join(" · ") || undefined,
              }))}
              onChange={(id) => {
                const b = books.find((x) => x.id === id);
                t.set({ bookId: b?.id ?? "", bookTitle: b ? bookName(b) : "", bookPhysical: b?.format === "fisico" });
                if (b) goFocus(b.format === "fisico" ? null : `/ler/${b.id}`);
              }}
            />
            {book && book.format !== "fisico" && (
              <Link href={`/ler/${book.id}`} className="text-xs text-accent inline-flex items-center gap-1"><BookOpen size={12} /> abrir no leitor</Link>
            )}
            {book && book.format === "fisico" && (
              <span className="text-xs text-muted">Livro físico{book.current_page ? ` · você parou na p. ${book.current_page}` : ""}{book.total_pages ? ` de ${book.total_pages}` : ""}. Ao encerrar, pergunto a página.</span>
            )}
            {books.length === 0 && <span className="text-xs text-muted">Cadastre livros no Mapa da Ignorância (inclusive físicos).</span>}
          </label>
        )}

        {t.category === "Estudos" && (
          <label className="space-y-1">
            <span className="label">Aula / transcrição</span>
            <Combobox
              value={t.noteId}
              placeholder="Digite o nome da aula ou do curso…"
              emptyText="Nenhuma aula com esse nome"
              options={notes.map((n) => ({
                value: n.id,
                label: n.title,
                hint: [
                  n.situacao === "concluida" ? "✓ concluída" : n.situacao === "lendo" ? `lendo${(n.progresso ?? 0) > 0.01 ? ` · ${Math.round((n.progresso ?? 0) * 100)}%` : ""}` : null,
                  n.course, n.professor,
                ].filter(Boolean).join(" · ") || undefined,
              }))}
              onChange={(id) => {
                const n = notes.find((x) => x.id === id);
                t.set({ noteId: n?.id ?? "", noteTitle: n?.title ?? "" });
                if (n) goFocus(`/estudos/${n.id}`);
              }}
            />
            {notes.length === 0 && <span className="text-xs text-muted">Suas transcrições aparecem aqui (menu Estudos).</span>}
          </label>
        )}

        {t.category === "Idiomas" && (
          <>
            <label className="space-y-1">
              <span className="label">Idioma</span>
              <select className="input" value={t.language} onChange={(e) => t.set({ language: e.target.value })}>
                <option value="">Escolha o idioma…</option>
                {langs.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="label">Onde / o quê</span>
              <input className="input" value={t.label} placeholder="ex.: Plataforma do Mairo" onChange={(e) => t.set({ label: e.target.value })} />
            </label>
          </>
        )}

        {t.category === "Oração" && (
          <div className="space-y-1">
            <span className="label">Oração</span>
            <button type="button" className="btn btn-primary w-full justify-center" onClick={() => {
              try { localStorage.setItem("menu-oculto", "1"); } catch {}
              window.dispatchEvent(new CustomEvent("modo-foco", { detail: { oculto: true } }));
              router.push("/lectio");
            }}>
              <BookHeart size={15} /> Rezar a Lectio Divina
            </button>
            <span className="text-xs text-muted block">A Lectio tem o próprio relógio das 4 etapas e registra o tempo sozinha.</span>
            <input className="input mt-2" value={t.label} placeholder="ou outra oração com o timer (ex.: Terço)" onChange={(e) => t.set({ label: e.target.value })} />
          </div>
        )}

        {t.category === "Escrita" && (
          <div className="space-y-1">
            <span className="label">Escrita</span>
            <button type="button" className="btn btn-primary w-full justify-center" onClick={() => router.push("/escrita")}>
              <Feather size={15} /> Abrir a sala de escrita
            </button>
            <span className="text-xs text-muted block">A sala de escrita tem cronômetro próprio, que pausa quando você para, e conta as palavras.</span>
          </div>
        )}

        {!["Leitura", "Estudos", "Idiomas", "Oração", "Escrita"].includes(t.category) && (
          <label className="space-y-1">
            <span className="label">O que está estudando</span>
            <input className="input" value={t.label} placeholder="ex.: redação do capítulo 2" onChange={(e) => t.set({ label: e.target.value })} />
          </label>
        )}

        {t.mode === "pomodoro" && (
          <div className={`grid grid-cols-2 gap-3 ${compact ? "" : "sm:col-span-2"}`}>
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
          </div>
        )}
      </div>
    </div>
  );
}
