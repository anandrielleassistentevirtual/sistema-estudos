"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check, ChevronLeft, ChevronRight, CircleCheck, Download, ListTree, NotebookPen, Pencil, Quote, Type, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { TextReader } from "@/components/reader/text-reader";
import { PrefsPanel } from "@/components/reader/prefs-panel";
import { stepZoom, useEffectiveTheme, useReaderPrefs, zoomOf, ZOOM } from "@/components/reader/prefs";
import { THEMES, type ReaderHandle, type TocItem } from "@/components/reader/types";
import { ReadingTracker } from "@/lib/reading-tracker";
import { useTimerEstado } from "@/components/timer-context";
import { supabase, fire } from "@/lib/supabase/client";
import { fmtClock, fmtDuration, nf } from "@/lib/dates";
import { countWords } from "@/lib/text";
import { baixarAula, camposDaSituacao, ppmMedio } from "@/lib/estudos";
import type { SituacaoAula } from "@/components/status-pill";
import type { Note } from "@/lib/types";

type AulaCompleta = Note & { anotacoes: string; palavras: number; progresso: number; situacao: SituacaoAula };

/** Uma aula aberta: o mesmo leitor dos livros, com as suas anotações ao lado. */
export default function AulaAberta() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [aula, setAula] = useState<AulaCompleta | null>(null);
  const aulaRef = useRef<AulaCompleta | null>(null);
  aulaRef.current = aula;
  const [erro, setErro] = useState<string | null>(null);
  const [prefs, setPrefs] = useReaderPrefs();
  const tema = useEffectiveTheme(prefs.theme);
  const view = { ...prefs, theme: tema };
  const t = THEMES[tema];
  const linha = tema === "escuro" ? "#2f2f2c" : "#00000014";
  const zoom = zoomOf(prefs);

  const [painel, setPainel] = useState<null | "aa" | "sumario">(null);
  const [notas, setNotas] = useState(false);
  const [editar, setEditar] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [local, setLocal] = useState("");
  const [rotulo, setRotulo] = useState("");
  const [progresso, setProgresso] = useState(0);
  const [sessao, setSessao] = useState({ seconds: 0, words: 0 });
  const [sel, setSel] = useState<{ location: string; quote: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<"salvo" | "salvando" | "pendente">("salvo");
  const [ppmBase, setPpmBase] = useState(220);
  useEffect(() => { void ppmMedio().then((r) => setPpmBase(r.ppm)); }, []);
  const reader = useRef<ReaderHandle>(null);
  const tracker = useRef<ReadingTracker | null>(null);
  const timer = useTimerEstado();
  const timerOn = useRef(false);
  timerOn.current = timer.running && timer.phase === "foco";

  // carregar a aula
  useEffect(() => {
    void supabase().from("notes").select("*").eq("id", id).single().then(({ data, error }) => {
      if (error || !data) return setErro("Aula não encontrada.");
      setAula(data as AulaCompleta);
    });
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get("editar")) { setEditar(true); window.history.replaceState(null, "", window.location.pathname); }
      setNotas(localStorage.getItem("estudos-anotacoes") === "1" && window.innerWidth >= 1024);
    } catch {}
    const tr = new ReadingTracker(null, () => timerOn.current, id);
    tr.onChange = () => setSessao({ ...tr.session });
    tracker.current = tr;
    return () => { void tr.close(); };
  }, [id]);
  useEffect(() => { try { if (window.innerWidth >= 1024) localStorage.setItem("estudos-anotacoes", notas ? "1" : "0"); } catch {} }, [notas]);

  // texto da aula para o leitor (refeito ao sair do modo de edição)
  const [versao, setVersao] = useState(0);
  const blob = useMemo(() => (aula ? new Blob([aula.content], { type: "text/markdown" }) : null), [aula?.id, versao]); // eslint-disable-line react-hooks/exhaustive-deps

  // posição: grava com atraso curto e na hora ao sair
  const posPendente = useRef<{ loc: string; p: number } | null>(null);
  const posSalva = useRef<string | null>(null);
  useEffect(() => { posSalva.current = aula?.location ?? "p:0"; }, [aula?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const tPos = useRef<ReturnType<typeof setTimeout> | null>(null);
  const salvarPos = useCallback(() => {
    if (tPos.current) { clearTimeout(tPos.current); tPos.current = null; }
    const pos = posPendente.current;
    posPendente.current = null;
    if (!pos || pos.loc === posSalva.current) return;
    posSalva.current = pos.loc;
    fire(supabase().from("notes").update({ location: pos.loc, progresso: Math.round(pos.p * 1000) / 1000 }).eq("id", id));
  }, [id]);

  // salvar textos (anotações / transcrição) com atraso curto
  const pend = useRef<Partial<AulaCompleta>>({});
  const tSalvar = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(async () => {
    if (tSalvar.current) { clearTimeout(tSalvar.current); tSalvar.current = null; }
    const p = pend.current;
    pend.current = {};
    if (!Object.keys(p).length) return;
    setSalvo("salvando");
    await supabase().from("notes").update(p).eq("id", id);
    setSalvo(Object.keys(pend.current).length ? "pendente" : "salvo");
  }, [id]);
  const patch = (p: Partial<AulaCompleta>) => {
    setAula((a) => (a ? { ...a, ...p } : a));
    pend.current = { ...pend.current, ...p };
    setSalvo("pendente");
    if (tSalvar.current) clearTimeout(tSalvar.current);
    tSalvar.current = setTimeout(() => void flush(), 800);
  };
  useEffect(() => {
    const sair = () => { if (document.visibilityState === "hidden") { salvarPos(); void flush(); } };
    document.addEventListener("visibilitychange", sair);
    window.addEventListener("pagehide", salvarPos);
    return () => {
      document.removeEventListener("visibilitychange", sair);
      window.removeEventListener("pagehide", salvarPos);
      salvarPos();
      void flush();
    };
  }, [salvarPos, flush]);

  // zoom pelo teclado (+ e −)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select") || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "+" || e.key === "=") setPrefs((p) => stepZoom(p, 1));
      if (e.key === "-" || e.key === "_") setPrefs((p) => stepZoom(p, -1));
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!aviso) return; const h = setTimeout(() => setAviso(null), 2500); return () => clearTimeout(h); }, [aviso]);

  const feita = aula?.situacao === "concluida";
  async function alternarConcluida() {
    if (!aula) return;
    const campos = camposDaSituacao(feita ? "lendo" : "concluida", aula);
    setAula({ ...aula, ...campos });
    await supabase().from("notes").update(campos).eq("id", id);
    if (!feita) setAviso("Aula concluída. Muito bem!");
  }

  /** Leva o trecho selecionado para as anotações, como citação. */
  function citar() {
    if (!sel || !aula) return;
    const pagina = sel.location.startsWith("p:") ? Number(sel.location.slice(2)) + 1 : null;
    const bloco = `> ${sel.quote.replace(/\s+/g, " ").trim()}${pagina ? ` (p. ${pagina})` : ""}\n\n`;
    const atual = aula.anotacoes ?? "";
    patch({ anotacoes: atual + (atual && !atual.endsWith("\n\n") ? (atual.endsWith("\n") ? "\n" : "\n\n") : "") + bloco });
    setNotas(true);
    setSel(null);
    window.getSelection()?.removeAllRanges();
    setAviso("Trecho levado para as anotações.");
  }

  function sairDaEdicao() {
    void flush();
    setEditar(false);
    setVersao((v) => v + 1);
  }

  const wpm = sessao.seconds > 30 ? Math.round(sessao.words / (sessao.seconds / 60)) : 0;

  if (erro) {
    return (
      <div className="p-8 text-sm">
        <p className="text-critical">{erro}</p>
        <Link href="/estudos" className="underline">← Voltar aos Estudos</Link>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-20 flex flex-col pt-safe pb-safe" style={{ background: t.bg, color: t.fg }}>
      <header className="flex items-center gap-1.5 px-3 h-12 border-b shrink-0" style={{ borderColor: linha }}>
        <button onClick={() => { void flush(); router.push("/estudos"); }} className="p-2 opacity-70 hover:opacity-100" title="Voltar aos Estudos"><ChevronLeft size={18} /></button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{aula?.title ?? "Abrindo a aula…"}</div>
          <div className="text-[11px] opacity-60 truncate">{[aula?.course, aula?.folder, rotulo].filter(Boolean).join(" · ")}</div>
        </div>
        {!editar && (
          <>
            <div className="hidden md:flex items-center gap-3 text-xs opacity-70 tabular-nums font-mono" title="Esta sessão de leitura">
              <span>{fmtClock(sessao.seconds)}</span>
              <span>{nf.format(sessao.words)} pal.</span>
              <span>{wpm ? `${wpm} ppm` : "— ppm"}</span>
            </div>
            <span className="text-xs opacity-70 tabular-nums text-right whitespace-nowrap" title={`Progresso na aula · tempo que falta no seu ritmo médio (${ppmBase} ppm)`}>
              {Math.round(progresso * 100)}%
              {aula?.palavras ? <span className="hidden sm:inline"> · faltam ≈ {fmtDuration((aula.palavras * (1 - progresso)) / ppmBase * 60)}</span> : null}
            </span>
            <div className="hidden sm:flex items-center rounded-lg border mx-1" style={{ borderColor: linha }} title="Zoom (teclas + e −)">
              <button className="p-1.5 opacity-70 hover:opacity-100 disabled:opacity-30" onClick={() => setPrefs((p) => stepZoom(p, -1))} disabled={zoom <= ZOOM[0]} aria-label="Diminuir"><ZoomOut size={16} /></button>
              <button className="text-xs tabular-nums w-11 text-center opacity-80 hover:opacity-100" onClick={() => setPrefs((p) => ({ ...p, sizePt: 12 }))} title="Voltar a 100%">{zoom}%</button>
              <button className="p-1.5 opacity-70 hover:opacity-100 disabled:opacity-30" onClick={() => setPrefs((p) => stepZoom(p, 1))} disabled={zoom >= ZOOM[ZOOM.length - 1]} aria-label="Aumentar"><ZoomIn size={16} /></button>
            </div>
          </>
        )}
        {aula && (
          <button onClick={alternarConcluida} title={feita ? "Voltar para “Lendo”" : "Marcar a aula como concluída"}
            className={`btn text-xs py-1 ${feita ? "" : progresso >= 0.97 ? "btn-primary" : ""}`}
            style={feita ? { color: "var(--good)", borderColor: "color-mix(in srgb, var(--good) 40%, transparent)" } : undefined}>
            {feita ? <CircleCheck size={14} /> : <Check size={14} />}
            <span className="hidden sm:inline">{feita ? "Concluída" : "Concluir aula"}</span>
          </button>
        )}
        {editar ? (
          <button className="btn btn-primary text-xs py-1 ml-1" onClick={sairDaEdicao}><Check size={14} /> Voltar a ler</button>
        ) : (
          <>
            <button className="p-2 opacity-70 hover:opacity-100 hidden sm:block" title="Editar a transcrição" onClick={() => { setEditar(true); setPainel(null); }}><Pencil size={17} /></button>
            <button className="p-2 opacity-70 hover:opacity-100 hidden sm:block" title="Baixar a transcrição (.md)" onClick={() => aula && void baixarAula(aula)}><Download size={17} /></button>
            {toc.length > 0 && (
              <button className="p-2 opacity-70 hover:opacity-100" title="Sumário" onClick={() => setPainel(painel === "sumario" ? null : "sumario")}><ListTree size={18} /></button>
            )}
            <button className="p-2 opacity-70 hover:opacity-100" title="Aparência" onClick={() => setPainel(painel === "aa" ? null : "aa")}><Type size={18} /></button>
          </>
        )}
        <button className={`p-2 hover:opacity-100 relative ${notas ? "opacity-100" : "opacity-70"}`} title="Minhas anotações" onClick={() => setNotas(!notas)}>
          <NotebookPen size={18} />
          {!!aula?.anotacoes?.trim() && !notas && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-current" />}
        </button>
      </header>

      <div className="flex-1 min-h-0 flex">
        <div className="relative flex-1 min-w-0">
          {editar && aula ? (
            <div className="h-full flex flex-col">
              <textarea className="flex-1 w-full resize-none bg-transparent outline-none p-4 md:p-8 font-mono text-sm leading-relaxed max-w-4xl mx-auto"
                value={aula.content} spellCheck lang="pt-BR" autoFocus
                onChange={(e) => patch({ content: e.target.value })} placeholder="# Título da aula&#10;&#10;Texto da transcrição em Markdown…" />
              <div className="shrink-0 px-4 py-1.5 text-xs opacity-60 flex justify-between max-w-4xl mx-auto w-full">
                <span>Markdown: # título, ## seção, **negrito**, _itálico_</span>
                <span>{nf.format(countWords(aula.content))} palavras · {salvo === "salvo" ? "salvo" : "salvando…"}</span>
              </div>
            </div>
          ) : blob && aula ? (
            <TextReader ref={reader} data={blob} format="md" startAt={local || (aula.location && /^p:\d+$/.test(aula.location) ? aula.location : null)} prefs={view}
              annotations={[]} knownWords={null}
              onTurn={(w, fwd) => {
                tracker.current?.turn(w, fwd);
                // como nos livros: virou a página de uma aula pendente, ela passa a "Lendo"
                if (fwd && aulaRef.current?.situacao === "pendente") {
                  setAula((a) => (a ? { ...a, situacao: "lendo" } : a));
                  fire(supabase().from("notes").update({ situacao: "lendo" }).eq("id", id));
                }
              }}
              onView={(w, last) => tracker.current?.see(w, last)}
              onToc={setToc}
              onLocation={(loc, p, l) => {
                if (loc) setLocal(loc);
                setProgresso(p);
                if (l) setRotulo(l);
                if (!loc) return;
                posPendente.current = { loc, p };
                if (tPos.current) clearTimeout(tPos.current);
                tPos.current = setTimeout(salvarPos, 1200);
              }}
              onSelect={setSel} onWordCount={() => {}} onAnnotationClick={() => setNotas(true)} />
          ) : (
            <div className="p-10 opacity-60 text-sm">Abrindo a aula…</div>
          )}

          {painel === "sumario" && (
            <aside className="absolute left-0 top-0 bottom-0 z-30 w-full sm:w-80 bg-surface text-ink border-r border-line flex flex-col shadow-xl">
              <div className="flex items-center justify-between px-4 h-12 border-b border-line">
                <span className="font-medium text-sm">Sumário</span>
                <button onClick={() => setPainel(null)}><X size={18} /></button>
              </div>
              <nav className="overflow-y-auto flex-1 py-2">
                {toc.map((item, i) => {
                  const pag = (l: string) => (l.startsWith("p:") ? Number(l.slice(2)) : -1);
                  const atual = pag(local);
                  const prox = toc[i + 1];
                  const aqui = atual >= 0 && pag(item.location) <= atual && (!prox || pag(prox.location) > atual);
                  return (
                    <button key={i} onClick={() => { reader.current?.goTo(item.location); setPainel(null); }}
                      className={`block w-full text-left text-sm py-1.5 pr-3 hover:bg-surface-2 ${aqui ? "font-medium" : "text-ink/85"}`}
                      style={{ paddingLeft: 16 + (item.level - 1) * 16 }}>
                      {item.label}
                    </button>
                  );
                })}
              </nav>
            </aside>
          )}
          {painel === "aa" && <PrefsPanel prefs={prefs} setPrefs={setPrefs} />}

          {sel && !editar && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-30 card shadow-xl p-3 w-[min(480px,calc(100%-2rem))] text-ink">
              <p className="text-xs text-muted line-clamp-2 font-serif">“{sel.quote}”</p>
              <div className="flex gap-2 mt-2 justify-end">
                <button className="btn btn-ghost px-2 py-1.5" onClick={() => setSel(null)}><X size={15} /></button>
                <button className="btn btn-primary py-1.5" onClick={citar}><Quote size={14} /> Levar para as anotações</button>
              </div>
            </div>
          )}
          {aviso && (
            <div className="absolute left-1/2 -translate-x-1/2 top-4 z-40 rounded-lg px-4 py-2 text-sm shadow-lg" style={{ background: "var(--text)", color: "var(--bg)" }}>
              {aviso}
            </div>
          )}
        </div>

        {/* minhas anotações, ao lado do texto */}
        {notas && aula && (
          <aside className="fixed lg:static inset-y-0 right-0 z-40 w-[min(420px,92vw)] lg:w-[380px] shrink-0 bg-surface text-ink border-l border-line flex flex-col shadow-2xl lg:shadow-none pt-safe lg:pt-0">
            <div className="flex items-center justify-between px-4 h-12 border-b border-line shrink-0">
              <span className="font-medium text-sm flex items-center gap-2"><NotebookPen size={15} className="text-icon" /> Minhas anotações</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-faint">{salvo === "salvo" ? "salvo" : "salvando…"}</span>
                <button onClick={() => setNotas(false)} className="text-muted hover:text-ink"><X size={18} /></button>
              </span>
            </div>
            <textarea className="flex-1 w-full resize-none bg-transparent outline-none px-4 py-3 text-[15px] leading-relaxed"
              value={aula.anotacoes ?? ""} spellCheck lang="pt-BR"
              onChange={(e) => patch({ anotacoes: e.target.value })}
              placeholder={"Suas anotações desta aula…\n\nDica: selecione um trecho do texto e toque em “Levar para as anotações” para citar."} />
            <div className="shrink-0 px-4 py-2 border-t border-line text-xs text-faint flex justify-between">
              <span>{nf.format(countWords(aula.anotacoes ?? ""))} palavras</span>
            </div>
          </aside>
        )}
      </div>

      {!editar && (
        <footer className="shrink-0 flex items-center gap-2 px-3 h-9 text-xs opacity-80">
          <button className="p-1" onClick={() => reader.current?.prev()} aria-label="Página anterior"><ChevronLeft size={16} /></button>
          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: linha }}>
            <div className="h-full opacity-60" style={{ width: `${progresso * 100}%`, background: "currentColor" }} />
          </div>
          <button className="p-1" onClick={() => reader.current?.next()} aria-label="Próxima página"><ChevronRight size={16} /></button>
        </footer>
      )}
    </div>
  );
}
