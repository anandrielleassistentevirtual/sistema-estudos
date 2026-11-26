"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookHeart, BookOpen, ChevronDown, Feather, ListChecks, Pause, Play, RotateCcw, SkipForward, Square, Waves, X } from "lucide-react";
import { CATEGORIAS, TimerState, useTimer } from "./timer-context";
import { dayKey, fmtClock } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";
import { todas } from "@/lib/supabase/todas";
import { Language, loadLanguages } from "@/lib/languages";
import { bookName } from "@/lib/folders";
import { porOrdem } from "@/lib/estudos";
import { COR_MAR } from "@/lib/mar";
import { Combobox } from "./combobox";
import { areaDaCategoria, corDaCategoria } from "@/lib/cores";

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
  /** Os campos do MAR vazios (o rótulo "MAR · título" posto pelo vínculo também sai). */
  const semMar = (): Partial<TimerState> => ({
    marTituloId: "", marTitulo: "", marCorrida: "", marDesde: 0,
    ...(t.label === `MAR · ${t.marTitulo}` ? { label: "" } : {}),
  });

  /**
   * Troca de categoria, idioma, rótulo ou modo (a regra é do provider, a mesma da Biblioteca e das Tarefas):
   * ligado ao MAR com tempo contado, pergunta se encerra e salva antes; com o Timer zerado, desliga do MAR.
   */
  const trocar = (patch: Partial<TimerState>) => t.trocar(patch);

  const [books, setBooks] = useState<BookOpt[]>([]);
  const [notes, setNotes] = useState<NoteOpt[]>([]);
  const [langs, setLangs] = useState<Language[]>([]);
  const [maisMin, setMaisMin] = useState(5);

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
  const serie = t.ciclosDia === dayKey() ? t.serie : 0;
  const foco = t.phase === "foco";
  const pct = t.mode === "pomodoro" ? 1 - t.remaining / total : (t.seconds % 3600) / 3600;
  const size = compact ? 150 : 236;
  const R = compact ? 64 : 100;
  const C = 2 * Math.PI * R;
  const book = books.find((b) => b.id === t.bookId);
  // ocupa a linha toda da grade de 2 colunas (no painel rápido a grade já tem uma coluna só)
  const largo = compact ? "" : "@[26rem]:col-span-2";
  // a cor dos focos: a da categoria (a mesma do Dashboard); "outro" não tem cor de área
  const corFoco = areaDaCategoria(t.category) === "outro" ? "var(--accent)" : corDaCategoria(t.category);
  // a série em pontinhos: na pausa longa a série zerou, mas os focos dela foram todos feitos
  const nSerie = Math.max(1, t.ciclosAteLonga);
  const feitos = foco ? Math.min(serie, nSerie - 1) : t.pausaLonga ? nSerie : Math.min(serie, nSerie);
  const rotuloSerie = foco ? `Foco ${feitos + 1} de ${nSerie}` : `${feitos} de ${nSerie} focos feitos`;
  // o ícone sozinho precisa do nome da ação (leitor de tela e title)
  const rotuloPular = foco ? "Ir para a pausa" : "Pular a pausa";
  /** Um botão de ajuste da fase atual (±min); não deixa a fase abaixo de 1 min nem abaixo do que já foi salvo. */
  const ajuste = (m: number) => (
    <button className="btn btn-ghost px-2 py-0.5 text-xs tabular-nums" disabled={m < 0 && (t.alvo + m * 60 < 60 || t.alvo + m * 60 < t.salvo + 60)}
      onClick={() => t.ajustar(m)} title={`${m > 0 ? "Acrescentar" : "Tirar"} ${Math.abs(m)} min ${foco ? "deste foco" : "desta pausa"}`}>
      {m > 0 ? `+${m}` : `−${-m}`}
    </button>
  );

  return (
    // na tela do Timer: relógio à esquerda e ajustes à direita quando o cartão (um @container) tem largura para os dois;
    // a coluna da direita, de altura variável conforme a categoria, fica centrada ao lado do relógio
    <div className={compact ? "flex flex-col items-center w-full" : "w-full grid grid-cols-1 @[43rem]:grid-cols-[auto_minmax(300px,1fr)] gap-6 @[43rem]:gap-10 items-center"}>
    <div className="flex flex-col items-center min-w-0">
      <div className={`seg seg-md ${compact ? "mb-3" : "mb-4"}`}>
        {(["pomodoro", "livre"] as const).map((m) => (
          <button key={m} disabled={t.running} onClick={() => { if (m !== t.mode) void trocar({ mode: m, phase: "foco", elapsed: 0 }); }} aria-pressed={t.mode === m}
            className="px-3 disabled:cursor-default">
            {m === "pomodoro" ? "Pomodoro" : "Cronômetro"}
          </button>
        ))}
      </div>

      <div className="relative aspect-square max-w-full" style={{ width: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="var(--surface-2)" strokeWidth={compact ? 7 : 10} />
          {/* no foco, a cor da categoria (a mesma do Dashboard); na pausa, cinza: o tempo de pausa não conta */}
          <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={foco ? corFoco : "var(--faint)"}
            strokeWidth={compact ? 7 : 10} strokeLinecap="round" strokeDasharray={C}
            strokeDashoffset={C * (1 - Math.max(0, Math.min(1, pct)))} style={{ transition: "stroke-dashoffset 0.5s linear" }} />
        </svg>
        {/* dentro do anel, só a fase e o tempo; a posição na série vira pontinhos */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[10px] uppercase tracking-wider text-muted">
            {t.mode === "pomodoro" ? (foco ? "Foco" : t.pausaLonga ? "Pausa longa" : "Pausa") : "Decorrido"}
          </div>
          <div className={`${compact ? "text-[2rem]" : "text-[3.4rem]"} font-light tracking-[-0.03em] tabular-nums leading-none mt-1`}>{fmtClock(display)}</div>
          {t.mode === "pomodoro" && (
            <div className={`flex items-center gap-1.5 ${compact ? "mt-2" : "mt-3"}`} role="img" aria-label={rotuloSerie} title={rotuloSerie}>
              {Array.from({ length: nSerie }, (_, i) => (
                // os que faltam em bg-line: no tema claro, o surface-2 some no branco do cartão
                <span key={i} className={`w-1.5 h-1.5 rounded-full ${i < feitos || (foco && i === feitos) ? "" : "bg-line"}`}
                  style={i < feitos ? { background: corFoco } : foco && i === feitos ? { background: `color-mix(in srgb, ${corFoco} 45%, transparent)` } : undefined} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`flex flex-wrap justify-center gap-2 ${compact ? "mt-3" : "mt-4"}`}>
        {t.running ? (
          <button className="btn btn-primary px-4 py-2.5 sm:py-[0.45rem]" onClick={t.pause}><Pause size={16} /> Pausar</button>
        ) : (
          <button className="btn btn-primary px-4 py-2.5 sm:py-[0.45rem]" onClick={t.start}><Play size={16} /> {t.seconds > 0 ? "Continuar" : "Iniciar"}</button>
        )}
        {/* o quadrado cheio é o "parar" (o vazado parecia uma caixa de marcar); "e salvar" só quando a linha cabe inteira */}
        <button className="btn py-2.5 sm:py-[0.45rem] whitespace-nowrap" onClick={() => void t.stop()} disabled={t.seconds === 0} title="Encerrar e salvar">
          <Square size={12} fill="currentColor" /> <span>Encerrar{!compact && <span className="hidden @[24rem]:inline"> e salvar</span>}</span>
        </button>
        {t.mode === "pomodoro" && (
          // pular e zerar juntos, como na Lectio
          <button className="btn btn-ghost px-2" onClick={t.pular} disabled={foco && t.seconds < 1} aria-label={rotuloPular}
            title={`${rotuloPular}: ${foco ? "encerra o foco agora (o tempo feito é salvo) e começa a pausa" : "encerra a pausa e prepara um foco novo"}`}>
            <SkipForward size={15} />
          </button>
        )}
        <button className="btn btn-ghost px-2" onClick={t.reset} title="Zerar sem salvar" aria-label="Zerar sem salvar"><RotateCcw size={15} /></button>
      </div>

      {t.mode === "pomodoro" && (
        // ajusta só a fase atual (mesmo com o timer rodando): os menos de um lado, os mais do outro
        <div className={`flex items-center justify-center gap-1 ${compact ? "mt-2" : "mt-3"}`}>
          {ajuste(-5)}{ajuste(-1)}
          <span className="min-w-[6.5rem] text-center text-xs text-muted tabular-nums whitespace-nowrap">
            {foco ? "Foco" : t.pausaLonga ? "Pausa longa" : "Pausa"} · {Math.round(t.alvo / 60)} min
          </span>
          {ajuste(1)}{ajuste(5)}
        </div>
      )}

      {t.anterior && (!foco || (!t.running && t.seconds === 0)) && (
        // o foco terminou (ou foi encerrado): dá para voltar a ele e acrescentar alguns minutos.
        // w-0 min-w-full: a linha quebra na largura da coluna e não a alarga (o relógio não pula para o lado na pausa)
        <div className={`flex flex-wrap items-center justify-center gap-1 w-0 min-w-full ${compact ? "mt-2" : "mt-3"}`}>
          <span className="text-xs text-muted mr-1">Voltar ao foco anterior ({Math.round(t.anterior.feito / 60)} min)</span>
          {t.mode === "livre" ? (
            <button className="btn btn-ghost px-2 py-0.5 text-xs" onClick={() => t.continuarFoco(0)} title="Continua contando a partir daquele foco">Continuar</button>
          ) : (
            // qualquer quantidade de minutos: digite e continue (Enter também serve)
            <form className="inline-flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (maisMin >= 1) t.continuarFoco(maisMin); }}>
              <span className="text-xs text-muted">por mais</span>
              <input type="number" min={1} max={240} aria-label="Minutos a mais" className="input w-16 py-0.5 px-2 text-xs text-right tabular-nums"
                value={maisMin || ""} onChange={(e) => setMaisMin(Math.min(240, Math.max(0, Math.round(Number(e.target.value) || 0))))} />
              <span className="text-xs text-muted">min</span>
              <button type="submit" className="btn px-2 py-0.5 text-xs" disabled={maisMin < 1}
                title="Continua aquele foco (o que já foi salvo não conta duas vezes)"><Play size={12} /> Continuar</button>
            </form>
          )}
        </div>
      )}

    </div>

    <div className={compact ? "contents" : "flex flex-col w-full"}>
      {t.marTituloId ? (
        // ligado a um título do MAR: o tempo gravado vai para ele (os episódios marcados não somam de novo)
        <div className={`flex items-center gap-2 rounded-full bg-surface-2 pl-3 pr-1.5 py-1 text-xs max-w-full ${compact ? "mt-3" : "mb-4 self-start"}`}
          title="O tempo deste Timer conta no MAR deste título">
          <Waves size={13} className="shrink-0" style={{ color: COR_MAR }} />
          <span className="truncate">MAR · {t.marTitulo}</span>
          {/* aria-disabled (e não disabled) para o title aparecer ao passar o mouse */}
          <button className={`shrink-0 ${t.seconds > 0 ? "text-faint opacity-40 cursor-not-allowed" : "text-faint hover:text-ink"}`}
            aria-disabled={t.seconds > 0} aria-label="Desligar do MAR"
            title={t.seconds > 0 ? "Encerre o Timer para desligar do MAR" : "Desligar do MAR"}
            onClick={() => { if (t.seconds === 0) t.set(semMar()); }}><X size={13} /></button>
        </div>
      ) : t.tarefaId && (
        // o foco está ligado a uma tarefa dos Estudos: o tempo fica somado nela
        <div className={`flex items-center gap-2 rounded-full bg-surface-2 pl-3 pr-1.5 py-1 text-xs max-w-full ${compact ? "mt-3" : "mb-4 self-start"}`}>
          <ListChecks size={13} className="text-icon shrink-0" />
          <span className="truncate">Tarefa: {t.tarefaTexto}</span>
          <button className="text-faint hover:text-ink shrink-0" title="Desligar da tarefa" onClick={() => t.set({ tarefaId: "", tarefaTexto: "" })}><X size={13} /></button>
        </div>
      )}

      {/* os campos em 2 colunas quando cada uma passa de ~200px (o cartão do Timer é o @container) */}
      <div className={`grid grid-cols-1 gap-3 w-full ${compact ? "mt-4" : "@[26rem]:grid-cols-2"}`}>
        <label className="space-y-1">
          <span className="label">Categoria</span>
          <select className="input" value={t.category} onChange={(e) => void trocar({ category: e.target.value, tarefaId: "", tarefaTexto: "" })}>
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
              <select className="input" value={t.language} onChange={(e) => void trocar({ language: e.target.value })}>
                <option value="">Escolha o idioma…</option>
                {langs.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
              </select>
            </label>
            <label className={`space-y-1 ${largo}`}>
              <span className="label">Onde / o quê</span>
              <input className="input" value={t.label} placeholder="ex.: Plataforma do Mairo" list="rotulos-idiomas" onChange={(e) => void trocar({ label: e.target.value })} />
              {/* "MAR" no começo do rótulo conta no MAR do idioma (sem título ligado, só pelo rótulo) */}
              <datalist id="rotulos-idiomas"><option value="MAR" /></datalist>
            </label>
          </>
        )}

        {t.category === "Oração" && (
          <>
            {/* botão secundário: o único botão branco da tela é o do relógio */}
            <div className="space-y-1 min-w-0">
              <span className="label">Oração</span>
              {/* com o relógio ao lado, a meia coluna é estreita: o verbo sai do texto visível (fica no nome do botão) */}
              <button type="button" className="btn w-full justify-center whitespace-nowrap" aria-label="Rezar a Lectio Divina" onClick={() => {
                try { localStorage.setItem("menu-oculto", "1"); } catch {}
                window.dispatchEvent(new CustomEvent("modo-foco", { detail: { oculto: true } }));
                router.push("/lectio");
              }}>
                <BookHeart size={15} className="shrink-0" /> <span><span className="@[43rem]:hidden">Rezar a </span>Lectio Divina</span>
              </button>
              <span className="text-xs text-faint block truncate" title="A Lectio tem o próprio relógio das 4 etapas e registra o tempo sozinha.">Registra o tempo sozinha.</span>
            </div>
            <label className={`space-y-1 ${largo}`}>
              <span className="label">Outra oração com o timer</span>
              <input className="input" value={t.label} placeholder="ex.: Terço" onChange={(e) => t.set({ label: e.target.value })} />
            </label>
          </>
        )}

        {t.category === "Escrita" && (
          <div className="space-y-1 min-w-0">
            <span className="label">Escrita</span>
            <button type="button" className="btn w-full justify-center whitespace-nowrap" aria-label="Abrir a sala de escrita" onClick={() => router.push("/escrita")}>
              <Feather size={15} className="shrink-0" /> <span className="@[43rem]:hidden">Abrir a sala de escrita</span><span className="hidden @[43rem]:inline">Sala de escrita</span>
            </button>
            <span className="text-xs text-faint block truncate" title="A sala de escrita tem cronômetro próprio, que pausa quando você para, e conta as palavras.">Conta o tempo e as palavras.</span>
          </div>
        )}

        {!["Leitura", "Estudos", "Idiomas", "Oração", "Escrita"].includes(t.category) && (
          <label className="space-y-1">
            <span className="label">O que está estudando</span>
            <input className="input" value={t.label} placeholder="ex.: redação do capítulo 2" onChange={(e) => t.set({ label: e.target.value })} />
          </label>
        )}

        {t.mode === "pomodoro" && (
          // os tempos padrão quase nunca mudam: ficam recolhidos num resumo (e valem também para a fase em andamento)
          <details className={`group ${largo}`}>
            <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-center justify-between gap-2 rounded-lg bg-surface-2/60 hover:bg-surface-2 px-3 py-2 text-sm"
              title="Foco · pausa · pausa longa (min) e de quantos em quantos focos vem a pausa longa">
              <span className="text-muted">Ciclo</span>
              <span className="flex items-center gap-2 min-w-0">
                <span className="tabular-nums truncate">{t.focusMin} · {t.breakMin} · {t.longBreakMin} min · longa a cada {t.ciclosAteLonga}</span>
                <ChevronDown size={14} className="text-muted shrink-0 transition-transform group-open:rotate-180" />
              </span>
            </summary>
            <div className={`grid grid-cols-2 gap-3 mt-3 ${compact ? "" : "2xl:grid-cols-4"}`}>
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
          </details>
        )}
      </div>
    </div>
    </div>
  );
}
