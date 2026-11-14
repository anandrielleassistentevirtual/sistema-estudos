"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookHeart, BookOpen, Feather, ListChecks, Pause, Play, RotateCcw, Square, X } from "lucide-react";
import { CATEGORIAS, useTimer } from "./timer-context";
import { dayKey, fmtClock } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";
import { todas } from "@/lib/supabase/todas";
import { Language, loadLanguages } from "@/lib/languages";
import { bookName } from "@/lib/folders";
import { porOrdem } from "@/lib/estudos";
import { Combobox } from "./combobox";

interface BookOpt { id: string; title: string; author: string | null; format: string; status: string; current_page: number | null; total_pages: number | null }
interface NoteOpt { id: string; title: string; professor: string; course: string; situacao?: string; progresso?: number; ordem?: number | null }

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
    void todas<BookOpt>((de, ate) => sb.from("books").select("id,title,author,format,status,current_page,total_pages").order("author").order("title").order("id").range(de, ate))
      .then((data) => setBooks(data.sort((a, b) => (ordemLivro[a.status] ?? 1) - (ordemLivro[b.status] ?? 1)))).catch(() => {});
    void todas<NoteOpt>((de, ate) => sb.from("notes").select("id,title,professor,course,situacao,progresso,ordem").eq("kind", "estudo").order("id").range(de, ate))
      .then((data) => setNotes(data.sort((a, b) =>
        Number(a.situacao === "concluida") - Number(b.situacao === "concluida") ||
        a.course.localeCompare(b.course, "pt-BR") || porOrdem(a, b)))).catch(() => {});
    void loadLanguages().then(setLangs);
  }, [t.lastSaved]);

  const display = t.mode === "pomodoro" ? t.remaining : t.seconds;
  const total = t.alvo;
  const hoje = dayKey();
  const serie = t.ciclosDia === hoje ? t.serie : 0;
  const ciclosHoje = t.ciclosDia === hoje ? t.cycles : 0;
  const foco = t.phase === "foco";
  const pct = t.mode === "pomodoro" ? 1 - t.remaining / total : (t.seconds % 3600) / 3600;
  const size = compact ? 150 : 236;
  const R = compact ? 64 : 100;
  const C = 2 * Math.PI * R;
  const book = books.find((b) => b.id === t.bookId);

  return (
    // na tela do Timer (computador): relógio à esquerda, ajustes à direita — tudo sem precisar rolar
    <div className={compact ? "flex flex-col items-center w-full" : "w-full grid lg:grid-cols-[auto_minmax(300px,1fr)] gap-6 lg:gap-10 items-center"}>
    <div className="flex flex-col items-center">
      <div className={`inline-flex rounded-lg bg-surface-2 p-1 text-sm ${compact ? "mb-3" : "mb-4"}`}>
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
            {t.mode === "pomodoro" ? (foco ? `Foco · ${serie + 1} de ${t.ciclosAteLonga}` : t.pausaLonga ? "Pausa longa" : "Pausa") : "Decorrido"}
          </div>
          <div className={`${compact ? "text-3xl" : "text-5xl"} font-medium font-mono tabular-nums mt-0.5`}>{fmtClock(display)}</div>
          {t.mode === "pomodoro" && !compact && <div className="text-xs text-faint mt-1">ciclos hoje: {ciclosHoje}</div>}
        </div>
      </div>

      <div className={`flex gap-2 ${compact ? "mt-3" : "mt-4"}`}>
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

      {t.mode === "pomodoro" && (
        // ajusta só a fase atual (mesmo com o timer rodando) e permite pular para a próxima
        <div className={`flex flex-wrap items-center justify-center gap-1 ${compact ? "mt-2" : "mt-3"}`}>
          <span className="text-xs text-muted mr-1 tabular-nums">{foco ? "Foco" : t.pausaLonga ? "Pausa longa" : "Pausa"} de {Math.round(t.alvo / 60)} min</span>
          {[-5, -1, 1, 5].map((m) => (
            <button key={m} className="btn btn-ghost px-2 py-0.5 text-xs tabular-nums" disabled={m < 0 && t.alvo + m * 60 < 60}
              onClick={() => t.ajustar(m)} title={`${m > 0 ? "Acrescentar" : "Tirar"} ${Math.abs(m)} min ${foco ? "deste foco" : "desta pausa"}`}>
              {m > 0 ? `+${m}` : `−${-m}`}
            </button>
          ))}
          <button className="btn px-2 py-0.5 text-xs" onClick={t.pular} disabled={foco && t.seconds < 1}
            title={foco ? "Encerra o foco agora (o tempo feito é salvo) e começa a pausa" : "Encerra a pausa"}>
            {foco ? "Ir para a pausa" : "Voltar ao foco"}
          </button>
        </div>
      )}

    </div>

    <div className={compact ? "contents" : "flex flex-col w-full"}>
      {t.tarefaId && (
        // o foco está ligado a uma tarefa dos Estudos: o tempo fica somado nela
        <div className={`flex items-center gap-2 rounded-full bg-surface-2 pl-3 pr-1.5 py-1 text-xs max-w-full ${compact ? "mt-3" : "mb-4 self-start"}`}>
          <ListChecks size={13} className="text-icon shrink-0" />
          <span className="truncate">Tarefa: {t.tarefaTexto}</span>
          <button className="text-faint hover:text-ink shrink-0" title="Desligar da tarefa" onClick={() => t.set({ tarefaId: "", tarefaTexto: "" })}><X size={13} /></button>
        </div>
      )}

      <div className={`grid gap-3 w-full ${compact ? "mt-4" : "sm:grid-cols-2"}`}>
        <label className="space-y-1">
          <span className="label">Categoria</span>
          <select className="input" value={t.category} onChange={(e) => t.set({ category: e.target.value, tarefaId: "", tarefaTexto: "" })}>
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
            {books.length === 0 && <span className="text-xs text-muted">Cadastre livros na Biblioteca (inclusive físicos).</span>}
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
          // os tempos padrão podem mudar a qualquer momento (valem também para a fase em andamento)
          <div className={`grid grid-cols-2 gap-3 ${compact ? "" : "2xl:grid-cols-4 sm:col-span-2"}`}>
            <label className="space-y-1">
              <span className="label">Foco (min)</span>
              <input className="input" type="number" min={1} max={180} value={t.focusMin}
                onChange={(e) => t.set({ focusMin: Math.max(1, Number(e.target.value) || 25) })} />
            </label>
            <label className="space-y-1">
              <span className="label">Pausa (min)</span>
              <input className="input" type="number" min={1} max={60} value={t.breakMin}
                onChange={(e) => t.set({ breakMin: Math.max(1, Number(e.target.value) || 5) })} />
            </label>
            <label className="space-y-1">
              <span className="label">Longa (min)</span>
              <input className="input" type="number" min={1} max={90} value={t.longBreakMin}
                onChange={(e) => t.set({ longBreakMin: Math.max(1, Number(e.target.value) || 15) })} />
            </label>
            <label className="space-y-1">
              <span className="label">Longa a cada</span>
              <select className="input" value={t.ciclosAteLonga} onChange={(e) => t.set({ ciclosAteLonga: Number(e.target.value) })}>
                {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} focos</option>)}
              </select>
            </label>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
