"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown, ChevronLeft, ChevronRight, Download, FileText, FolderOpen, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen,
  PanelRightClose, PanelRightOpen, Plus, Printer, Table2, BarChart3, PenLine, Trash2, ArrowUp, ArrowDown, Upload, Pencil, Settings2, X,
} from "lucide-react";
import { supabase, fire } from "@/lib/supabase/client";
import { dayKey, fmtClock, fmtDuration, nf, addDays, parseDay } from "@/lib/dates";
import {
  compilarMarkdown, contarPalavras, corStatus, ESCALETA, escaletaDeLinhas, lerXlsx, manuscrito, rotuloCena, SECOES, semComentarios, STATUS,
  type Doc, type Projeto, type Secao, type Sessao,
} from "@/lib/escrita";
import { Editor, type EditorHandle } from "@/components/escrita/editor";
import { BarChart } from "@/components/bar-chart";
import { FONTS } from "@/components/reader/types";
import { useTimer } from "@/components/timer-context";

type Aba = "escrever" | "escaleta" | "estatisticas";
interface Prefs { fonte: "times" | "literata" | "inter"; tamanho: number; entrelinha: number; ocioso: number; falas: boolean; maquina: boolean; paragrafo: boolean }
const PREFS0: Prefs = { fonte: "times", tamanho: 13, entrelinha: 1.6, ocioso: 300, falas: true, maquina: true, paragrafo: true };
const CAMPOS_ESCALETA = ["resumo", "pov", "personagens", "personagens_indiretos", "espaco", "tempo", "pagina", "status", "titulo"] as const;

export default function SalaDeEscrita() {
  const { id } = useParams<{ id: string }>();
  const timer = useTimer();
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [atual, setAtual] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("escrever");
  const [arvore, setArvore] = useState(true);
  const [painel, setPainel] = useState(true);
  const [foco, setFoco] = useState(false);
  const [dica, setDica] = useState(false);
  const [prefs, setPrefsState] = useState<Prefs>(PREFS0);
  const [verPrefs, setVerPrefs] = useState(false);
  const [salvo, setSalvo] = useState<"salvo" | "salvando" | "pendente">("salvo");
  const [erro, setErro] = useState("");
  const editor = useRef<EditorHandle>(null);
  const raiz = useRef<HTMLDivElement>(null);

  /* ---------- preferências (por aparelho) ---------- */
  useEffect(() => {
    try {
      const p = localStorage.getItem("escrita-prefs");
      if (p) setPrefsState({ ...PREFS0, ...JSON.parse(p) });
      setArvore(localStorage.getItem("escrita-arvore") !== "0");
      setPainel(localStorage.getItem("escrita-painel") !== "0");
    } catch {}
  }, []);
  const setPrefs = (x: Partial<Prefs>) => setPrefsState((o) => {
    const n = { ...o, ...x };
    try { localStorage.setItem("escrita-prefs", JSON.stringify(n)); } catch {}
    return n;
  });
  useEffect(() => { try { localStorage.setItem("escrita-arvore", arvore ? "1" : "0"); localStorage.setItem("escrita-painel", painel ? "1" : "0"); } catch {} }, [arvore, painel]);

  /* ---------- carregar ---------- */
  useEffect(() => {
    (async () => {
      const sb = supabase();
      const [p, d, s] = await Promise.all([
        sb.from("escrita_projetos").select("*").eq("id", id).single(),
        sb.from("escrita_docs").select("*").eq("projeto_id", id).order("posicao"),
        sb.from("escrita_sessoes").select("*").eq("projeto_id", id).gte("dia", dayKey(addDays(new Date(), -60))).order("inicio", { ascending: false }),
      ]);
      if (p.error || !p.data) return setErro("Projeto não encontrado.");
      setProjeto(p.data as Projeto);
      // recontagem local: o contador da sessão parte do número certo
      const lista = ((d.data as Doc[]) ?? []).map((x) => ({ ...x, palavras: contarPalavras(x.conteudo) }));
      setDocs(lista);
      setSessoes((s.data as Sessao[]) ?? []);
      let ultimo: string | null = null;
      try { ultimo = localStorage.getItem(`escrita-ultimo-${id}`); } catch {}
      const primeira = manuscrito(lista).flatMap((c) => c.cenas)[0];
      setAtual(lista.some((x) => x.id === ultimo) ? ultimo : primeira?.id ?? lista[0]?.id ?? null);
    })();
  }, [id]);
  useEffect(() => { if (atual) try { localStorage.setItem(`escrita-ultimo-${id}`, atual); } catch {} }, [atual, id]);

  const doc = docs.find((d) => d.id === atual) ?? null;
  const ms = useMemo(() => manuscrito(docs), [docs]);
  const totalPalavras = useMemo(() => docs.filter((d) => d.secao === "manuscrito").reduce((s, d) => s + d.palavras, 0), [docs]);

  /* ---------- salvar (com espera curta; nada se perde ao trocar de cena ou sair) ---------- */
  const pend = useRef(new Map<string, Partial<Doc>>());
  const tSalvar = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(async () => {
    if (tSalvar.current) clearTimeout(tSalvar.current);
    tSalvar.current = null;
    const itens = [...pend.current.entries()];
    pend.current.clear();
    if (!itens.length) return;
    setSalvo("salvando");
    const sb = supabase();
    const agora = new Date().toISOString();
    await Promise.all(itens.map(([did, f]) => sb.from("escrita_docs").update({ ...f, updated_at: agora }).eq("id", did)));
    fire(sb.from("escrita_projetos").update({ updated_at: agora }).eq("id", id));
    setSalvo(pend.current.size ? "pendente" : "salvo");
  }, [id]);
  const patch = useCallback((did: string, f: Partial<Doc>) => {
    setDocs((ds) => ds.map((d) => (d.id === did ? { ...d, ...f } : d)));
    pend.current.set(did, { ...(pend.current.get(did) ?? {}), ...f });
    setSalvo("pendente");
    if (tSalvar.current) clearTimeout(tSalvar.current);
    tSalvar.current = setTimeout(() => void flush(), 900);
  }, [flush]);

  /* ---------- sessão de escrita: cronômetro que pausa quando você para ---------- */
  const sess = useRef({ ativo: 0, ocioso: 0, ultimaAtividade: 0, inicio: "", id: "", studyId: "", palavrasInicio: 0, iniciada: false });
  const [relogio, setRelogio] = useState({ ativo: 0, ocioso: 0, parado: true });
  const total = useRef(0);
  total.current = totalPalavras;
  const timerRodando = useRef(false);
  timerRodando.current = timer.running;
  const titulo = projeto?.titulo ?? "";

  const salvarSessao = useCallback(async () => {
    const s = sess.current;
    if (!s.iniciada) return;
    const sb = supabase();
    const dados = { segundos: Math.round(s.ativo), ocioso: Math.round(s.ocioso), palavras: total.current - s.palavrasInicio };
    if (!s.id) {
      const { data } = await sb.from("escrita_sessoes").insert({ projeto_id: id, dia: dayKey(), inicio: s.inicio, ...dados }).select().single();
      if (data) { s.id = (data as Sessao).id; setSessoes((x) => [data as Sessao, ...x]); }
    } else {
      await sb.from("escrita_sessoes").update(dados).eq("id", s.id);
      setSessoes((x) => x.map((y) => (y.id === s.id ? { ...y, ...dados } : y)));
    }
    // o tempo também vai para o Dashboard (se o timer geral estiver ligado, ele já conta)
    if (dados.segundos >= 30 && !timerRodando.current) {
      const st = { day: dayKey(new Date(s.inicio)), started_at: s.inicio, seconds: dados.segundos, category: "Escrita", label: `Escrita · ${titulo}` };
      if (!s.studyId) {
        const { data } = await sb.from("study_sessions").insert(st).select("id").single();
        if (data) s.studyId = (data as { id: string }).id;
      } else await sb.from("study_sessions").update(st).eq("id", s.studyId);
    }
  }, [id, titulo]);

  const atividade = useCallback(() => {
    const s = sess.current;
    if (!s.iniciada) {
      s.iniciada = true;
      s.inicio = new Date().toISOString();
      s.palavrasInicio = total.current;
    }
    s.ultimaAtividade = Date.now();
  }, []);

  useEffect(() => {
    let ult = Date.now();
    const t = setInterval(() => {
      const agora = Date.now();
      const dt = (agora - ult) / 1000;
      ult = agora;
      const s = sess.current;
      if (!s.iniciada) return;
      const parado = agora - s.ultimaAtividade > prefs.ocioso * 1000 || document.hidden;
      if (parado) s.ocioso += dt; else s.ativo += dt;
      setRelogio({ ativo: s.ativo, ocioso: s.ocioso, parado });
    }, 1000);
    const g = setInterval(() => void salvarSessao(), 30000);
    const vis = () => { if (document.hidden) { void flush(); void salvarSessao(); } };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); clearInterval(g); document.removeEventListener("visibilitychange", vis); };
  }, [prefs.ocioso, salvarSessao, flush]);
  useEffect(() => () => { void flush(); void salvarSessao(); }, [flush, salvarSessao]);

  /* ---------- modo foco: tela cheia, sem menus ---------- */
  async function entrarFoco() {
    setFoco(true);
    try { await raiz.current?.requestFullscreen?.(); } catch {}
    try { if (!localStorage.getItem("escrita-dica-nao-perturbe")) setDica(true); } catch {}
    setTimeout(() => editor.current?.focus(), 50);
  }
  function sairFoco() {
    setFoco(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }
  useEffect(() => {
    const fs = () => { if (!document.fullscreenElement) setFoco(false); };
    const k = (e: KeyboardEvent) => {
      if (e.key === "F11" || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f")) { e.preventDefault(); if (foco) sairFoco(); else void entrarFoco(); }
      if (e.key === "Escape" && foco && !document.fullscreenElement) setFoco(false);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void flush(); }
    };
    document.addEventListener("fullscreenchange", fs);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("fullscreenchange", fs); document.removeEventListener("keydown", k); };
  });

  /* ---------- árvore: criar, renomear, mover, apagar ---------- */
  async function criar(tipo: Doc["tipo"], secao: Secao, parent: string | null) {
    const irmaos = docs.filter((d) => d.secao === secao && d.parent_id === parent && (secao !== "manuscrito" || d.tipo === tipo));
    const n = irmaos.length + 1;
    const tituloNovo = tipo === "capitulo" ? `Capítulo ${n}` : tipo === "cena" ? `Cena ${n}` : tipo === "pasta" ? "Nova pasta" : "Nova nota";
    const { data, error } = await supabase().from("escrita_docs").insert({
      projeto_id: id, parent_id: parent, tipo, secao, titulo: tituloNovo, posicao: Math.max(-1, ...irmaos.map((d) => d.posicao)) + 1,
    }).select().single();
    if (error || !data) return;
    setDocs((ds) => [...ds, data as Doc]);
    if (tipo !== "capitulo" && tipo !== "pasta") { setAtual((data as Doc).id); setAba("escrever"); }
    return data as Doc;
  }
  async function apagar(d: Doc) {
    const filhos = docs.filter((x) => x.parent_id === d.id).length;
    if (!confirm(`Apagar “${d.titulo}”${filhos ? ` e as ${filhos} cenas/notas dentro` : ""}? Isso não pode ser desfeito.`)) return;
    await supabase().from("escrita_docs").delete().eq("id", d.id);
    setDocs((ds) => ds.filter((x) => x.id !== d.id && x.parent_id !== d.id));
    if (atual === d.id) setAtual(null);
  }
  async function mover(d: Doc, dir: -1 | 1) {
    const irmaos = docs.filter((x) => x.secao === d.secao && x.parent_id === d.parent_id && x.tipo === d.tipo).sort((a, b) => a.posicao - b.posicao);
    const i = irmaos.findIndex((x) => x.id === d.id);
    const j = i + dir;
    if (j < 0 || j >= irmaos.length) return;
    const nova = [...irmaos];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    const pos = new Map(nova.map((x, k) => [x.id, k]));
    setDocs((ds) => ds.map((x) => (pos.has(x.id) ? { ...x, posicao: pos.get(x.id)! } : x)));
    const sb = supabase();
    await Promise.all(nova.map((x, k) => sb.from("escrita_docs").update({ posicao: k }).eq("id", x.id)));
  }
  /** Leva a cena para o capítulo anterior/seguinte (no fim/começo). */
  async function trocarCapitulo(d: Doc, dir: -1 | 1) {
    const i = ms.findIndex((c) => c.cap.id === d.parent_id);
    const destino = ms[i + dir];
    if (!destino) return;
    const posicao = dir > 0 ? Math.min(0, ...destino.cenas.map((c) => c.posicao)) - 1 : Math.max(-1, ...destino.cenas.map((c) => c.posicao)) + 1;
    setDocs((ds) => ds.map((x) => (x.id === d.id ? { ...x, parent_id: destino.cap.id, posicao } : x)));
    await supabase().from("escrita_docs").update({ parent_id: destino.cap.id, posicao }).eq("id", d.id);
  }

  /* ---------- exportar ---------- */
  function baixarMd() {
    if (!projeto) return;
    const blob = new Blob([compilarMarkdown(projeto, docs)], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${projeto.titulo}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function imprimir() {
    if (!projeto) return;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const fmt = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[^\p{L}])[_*](.+?)[_*](?![\p{L}])/gu, "$1<i>$2</i>");
    const pars = (t: string) => semComentarios(t).split(/\n+/).filter((l) => l.trim()).map((l) => `<p>${fmt(l)}</p>`).join("");
    const corpo = ms.map(({ cap, cenas }) =>
      `<h2>${esc(cap.titulo)}</h2>${pars(cap.conteudo)}${cenas.map((c) => pars(c.conteudo)).filter(Boolean).join('<p class="sep">* * *</p>')}`).join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(projeto.titulo)}</title><style>
      @page{size:A4;margin:2.5cm 3cm}body{font-family:"Times New Roman",Times,serif;font-size:12pt;line-height:1.5;color:#000}
      h1{text-align:center;font-size:20pt;font-weight:normal;margin:30vh 0 .3em}.autor{text-align:center;font-style:italic;page-break-after:always}
      h2{font-size:14pt;font-weight:normal;text-align:center;margin:0 0 2em;page-break-before:always}
      p{margin:0;text-indent:1.25cm;text-align:justify}h2+p,.sep+p{text-indent:0}.sep{text-align:center;text-indent:0;margin:1em 0}
    </style></head><body><h1>${esc(projeto.titulo)}</h1><p class="autor">${esc(projeto.autor)}</p>${corpo}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  }

  if (erro) return <div className="p-8 text-sm"><p className="text-critical">{erro}</p><Link href="/escrita" className="underline">← Voltar</Link></div>;
  if (!projeto) return <div className="fixed inset-0 z-20 bg-bg grid place-items-center text-sm text-muted">Abrindo o projeto…</div>;

  const hoje = sessoes.filter((s) => s.dia === dayKey()).reduce((n, s) => n + s.palavras, 0) +
    (sess.current.iniciada && !sess.current.id ? totalPalavras - sess.current.palavrasInicio : 0);
  const palavrasSessao = sess.current.iniciada ? totalPalavras - sess.current.palavrasInicio : 0;
  const fonte = FONTS[prefs.fonte].css;
  const capDoc = doc?.tipo === "cena" ? ms.find((c) => c.cap.id === doc.parent_id) : undefined;
  const rotulo = doc?.tipo === "cena" && capDoc ? rotuloCena(capDoc.n, capDoc.cenas.findIndex((c) => c.id === doc.id) + 1) : "";

  return (
    <div ref={raiz} className="fixed inset-0 z-20 bg-bg text-ink flex flex-col">
      {/* cabeçalho */}
      {!foco && (
        <header className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-line">
          <Link href="/escrita" className="p-1.5 text-muted hover:text-ink" title="Voltar aos projetos"><ChevronLeft size={18} /></Link>
          <button className="p-1.5 text-muted hover:text-ink" title={arvore ? "Esconder o projeto" : "Mostrar o projeto"} onClick={() => setArvore(!arvore)}>
            {arvore ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>
          <div className="min-w-0 mr-2">
            <div className="text-sm truncate">{projeto.titulo}</div>
          </div>
          <nav className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5 text-sm mx-auto">
            {([["escrever", "Escrever", PenLine], ["escaleta", "Escaleta", Table2], ["estatisticas", "Estatísticas", BarChart3]] as const).map(([k, l, I]) => (
              <button key={k} onClick={() => setAba(k)} className={`flex items-center gap-1.5 px-3 py-1 rounded-md ${aba === k ? "bg-surface shadow-sm text-ink" : "text-muted hover:text-ink"}`}>
                <I size={14} /> <span className="hidden sm:inline">{l}</span>
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-0.5">
            <button className="p-1.5 text-muted hover:text-ink" title="Exportar em Markdown (.md)" onClick={baixarMd}><Download size={16} /></button>
            <button className="p-1.5 text-muted hover:text-ink" title="Imprimir / salvar em PDF" onClick={imprimir}><Printer size={16} /></button>
            <button className="p-1.5 text-muted hover:text-ink" title="Aparência do editor" onClick={() => setVerPrefs(!verPrefs)}><Settings2 size={16} /></button>
            {aba === "escrever" && (
              <button className="p-1.5 text-muted hover:text-ink" title={painel ? "Esconder a escaleta da cena" : "Mostrar a escaleta da cena"} onClick={() => setPainel(!painel)}>
                {painel ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
              </button>
            )}
            <button className="btn ml-1 py-1" title="Modo foco: tela cheia, sem distrações (Ctrl + Shift + F)" onClick={entrarFoco}><Maximize2 size={14} /> Foco</button>
          </div>
        </header>
      )}

      <div className="flex-1 min-h-0 flex">
        {/* árvore do projeto */}
        {arvore && !foco && (
          <Arvore docs={docs} ms={ms} atual={atual} onAbrir={(d) => { void flush(); setAtual(d.id); setAba("escrever"); }}
            onCriar={criar} onRenomear={(d, t) => patch(d.id, { titulo: t })} onApagar={apagar} onMover={mover} onTrocarCapitulo={trocarCapitulo} />
        )}

        {/* área principal */}
        <main className="flex-1 min-w-0 relative">
          {aba === "escrever" && (doc ? (
            doc.tipo === "capitulo" || doc.tipo === "pasta" ? (
              <div className="h-full grid place-items-center text-sm text-muted p-8 text-center">
                {doc.tipo === "capitulo" ? "Escolha uma cena deste capítulo na árvore, ou crie uma nova." : "Escolha uma nota desta pasta."}
              </div>
            ) : (
              <div className="h-full flex flex-col">
                {!foco && (
                  <div className="shrink-0 px-6 pt-5">
                    <div className="max-w-[42rem] mx-auto flex items-baseline gap-3">
                      {rotulo && <span className="text-xs text-faint font-mono">{rotulo}</span>}
                      <input className="flex-1 min-w-0 bg-transparent outline-none text-lg" value={doc.titulo}
                        onChange={(e) => patch(doc.id, { titulo: e.target.value })} />
                      {capDoc && <span className="text-xs text-faint truncate max-w-[30%]">{capDoc.cap.titulo}</span>}
                    </div>
                  </div>
                )}
                <div className="flex-1 min-h-0">
                  <Editor key={doc.id} ref={editor} value={doc.conteudo}
                    onChange={(v) => { atividade(); patch(doc.id, { conteudo: v, palavras: contarPalavras(v) }); }}
                    fonte={fonte} tamanhoPt={prefs.tamanho} entrelinha={prefs.entrelinha}
                    focoParagrafo={foco && prefs.paragrafo} maquina={prefs.maquina} destacarFalas={prefs.falas}
                    placeholder={doc.tipo === "cena" ? "Comece a cena…" : "Escreva a nota…"} />
                </div>
              </div>
            )
          ) : (
            <div className="h-full grid place-items-center text-sm text-muted">Escolha ou crie uma cena na árvore à esquerda.</div>
          ))}
          {aba === "escaleta" && <Escaleta ms={ms} patch={patch} criar={criar} abrir={(d) => { setAtual(d.id); setAba("escrever"); }} recarregar={setDocs} projetoId={id} />}
          {aba === "estatisticas" && <Estatisticas projeto={projeto} total={totalPalavras} sessoes={sessoes} ms={ms}
            onMeta={async (x) => { setProjeto({ ...projeto, ...x }); await supabase().from("escrita_projetos").update(x).eq("id", id); }} />}

          {verPrefs && !foco && (
            <div className="absolute right-3 top-3 z-30 card p-4 w-72 space-y-4 shadow-xl text-sm">
              <div className="flex items-center justify-between"><span>Aparência do editor</span><button className="text-muted" onClick={() => setVerPrefs(false)}><X size={15} /></button></div>
              <div><div className="label mb-1.5">Fonte</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.keys(FONTS) as (keyof typeof FONTS)[]).map((f) => (
                    <button key={f} className={`btn justify-center text-xs px-1 ${prefs.fonte === f ? "border-muted" : ""}`} style={{ fontFamily: FONTS[f].css }} onClick={() => setPrefs({ fonte: f })}>{FONTS[f].label.split(" ")[0]}</button>
                  ))}
                </div></div>
              <div><div className="label mb-1.5 flex justify-between"><span>Tamanho</span><span>{prefs.tamanho} pt</span></div>
                <input type="range" min={10} max={22} step={0.5} value={prefs.tamanho} className="w-full" onChange={(e) => setPrefs({ tamanho: Number(e.target.value) })} /></div>
              <div><div className="label mb-1.5">Entrelinha</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[1.3, 1.5, 1.6, 1.8].map((l) => <button key={l} className={`btn justify-center text-xs px-1 ${prefs.entrelinha === l ? "border-muted" : ""}`} onClick={() => setPrefs({ entrelinha: l })}>{l}</button>)}
                </div></div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={prefs.falas} onChange={(e) => setPrefs({ falas: e.target.checked })} /> Destacar falas (— e “aspas”)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={prefs.maquina} onChange={(e) => setPrefs({ maquina: e.target.checked })} /> Máquina de escrever (linha no meio)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={prefs.paragrafo} onChange={(e) => setPrefs({ paragrafo: e.target.checked })} /> No foco, apagar os outros parágrafos</label>
              <div><div className="label mb-1.5">Cronômetro pausa depois de parado por</div>
                <select className="input" value={prefs.ocioso} onChange={(e) => setPrefs({ ocioso: Number(e.target.value) })}>
                  {[30, 60, 120, 300, 600].map((s) => <option key={s} value={s}>{s < 60 ? `${s} segundos` : `${s / 60} min`}</option>)}
                </select></div>
            </div>
          )}

          {dica && foco && (
            <div className="absolute left-1/2 -translate-x-1/2 top-4 z-40 card p-4 max-w-sm shadow-2xl text-sm">
              <p className="mb-1">Para silenciar também as notificações do computador:</p>
              <p className="text-muted">No Windows, aperte <b className="text-ink">Win + N</b> e ligue <b className="text-ink">Não perturbe</b>. No celular, use o modo Foco / Não perturbe.</p>
              <div className="flex justify-end gap-2 mt-3">
                <button className="btn btn-ghost text-xs" onClick={() => setDica(false)}>Fechar</button>
                <button className="btn text-xs" onClick={() => { setDica(false); try { localStorage.setItem("escrita-dica-nao-perturbe", "1"); } catch {} }}>Não mostrar de novo</button>
              </div>
            </div>
          )}
        </main>

        {/* escaleta da cena, ao lado do texto */}
        {aba === "escrever" && painel && !foco && doc?.tipo === "cena" && (
          <aside className="w-72 shrink-0 border-l border-line overflow-y-auto p-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Escaleta {rotulo && <span className="font-mono text-faint text-xs">· {rotulo}</span>}</span>
            </div>
            <label className="block"><span className="label">Status</span>
              <select className="input mt-1" value={doc.status} onChange={(e) => patch(doc.id, { status: e.target.value })}>
                {STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select></label>
            {ESCALETA.map((c) => (
              <label key={c.campo} className="block"><span className="label">{c.label}</span>
                <textarea className="input mt-1 resize-none leading-snug" rows={c.campo === "resumo" ? 5 : 1}
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                  value={String(doc[c.campo] ?? "")} onChange={(e) => patch(doc.id, { [c.campo]: e.target.value } as Partial<Doc>)} /></label>
            ))}
          </aside>
        )}
      </div>

      {/* barra de status: cronômetro, palavras */}
      <footer className={`h-8 shrink-0 flex items-center gap-4 px-4 text-xs text-muted border-t border-line tabular-nums transition-opacity ${foco ? "opacity-30 hover:opacity-100 border-transparent" : ""}`}>
        <span className="flex items-center gap-1.5" title={relogio.parado ? `Pausado: parado há mais de ${prefs.ocioso < 60 ? `${prefs.ocioso} s` : `${prefs.ocioso / 60} min`}` : "Escrevendo"}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: !sess.current.iniciada ? "var(--faint)" : relogio.parado ? "#d0a24a" : "var(--good)" }} />
          <span className="font-mono text-ink">{fmtClock(relogio.ativo)}</span>
          {relogio.ocioso >= 60 && <span className="text-faint">· parado {fmtDuration(relogio.ocioso)}</span>}
        </span>
        <span title="Palavras nesta sessão">{palavrasSessao >= 0 ? "+" : ""}{nf.format(palavrasSessao)} sessão</span>
        {doc && doc.tipo !== "capitulo" && doc.tipo !== "pasta" && <span title="Palavras neste texto">{nf.format(doc.palavras)} {doc.tipo === "cena" ? "na cena" : "na nota"}</span>}
        <span title="Palavras do manuscrito">{nf.format(totalPalavras)}{projeto.meta_palavras ? ` / ${nf.format(projeto.meta_palavras)}` : ""} no livro</span>
        {projeto.meta_diaria > 0 && <span title="Meta do dia">hoje {nf.format(Math.max(0, hoje))} / {nf.format(projeto.meta_diaria)}</span>}
        <span className="ml-auto">{salvo === "salvo" ? "salvo" : salvo === "salvando" ? "salvando…" : "…"}</span>
        {foco && <button className="flex items-center gap-1 hover:text-ink" onClick={sairFoco}><Minimize2 size={12} /> sair do foco (Esc)</button>}
      </footer>
    </div>
  );
}

/* ================= árvore ================= */

function Arvore(p: {
  docs: Doc[];
  ms: ReturnType<typeof manuscrito>;
  atual: string | null;
  onAbrir: (d: Doc) => void;
  onCriar: (tipo: Doc["tipo"], secao: Secao, parent: string | null) => Promise<Doc | undefined>;
  onRenomear: (d: Doc, t: string) => void;
  onApagar: (d: Doc) => void;
  onMover: (d: Doc, dir: -1 | 1) => void;
  onTrocarCapitulo: (d: Doc, dir: -1 | 1) => void;
}) {
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<string | null>(null);
  const alterna = (k: string) => setFechados((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const capAtual = p.docs.find((d) => d.id === p.atual);
  const capSel = capAtual?.tipo === "capitulo" ? capAtual.id : capAtual?.tipo === "cena" ? capAtual.parent_id : p.ms[p.ms.length - 1]?.cap.id;

  const item = (d: Doc, nivel: number, rotulo?: string) => (
    <div key={d.id} className={`group flex items-center gap-1.5 rounded-md pr-1 text-[13px] cursor-pointer ${p.atual === d.id ? "bg-surface-2 text-ink" : "text-muted hover:text-ink hover:bg-surface-2/60"}`}
      style={{ paddingLeft: 8 + nivel * 14 }} onClick={() => p.onAbrir(d)} onDoubleClick={() => setEditando(d.id)}>
      {d.tipo === "cena" ? <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: corStatus(d.status) }} title={STATUS.find((s) => s.id === d.status)?.label} />
        : <FileText size={13} className="shrink-0 opacity-60" />}
      {editando === d.id ? (
        <input autoFocus className="flex-1 min-w-0 bg-transparent outline-none border-b border-faint py-1" defaultValue={d.titulo}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => { p.onRenomear(d, e.target.value.trim() || d.titulo); setEditando(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditando(null); }} />
      ) : (
        <span className="flex-1 min-w-0 truncate py-1">{d.titulo || "Sem título"}</span>
      )}
      {rotulo && <span className="text-[10px] font-mono text-faint group-hover:hidden">{rotulo}</span>}
      <span className="hidden group-hover:flex items-center text-faint">
        <Acao t="Renomear" on={() => setEditando(d.id)}><Pencil size={11} /></Acao>
        <Acao t="Subir" on={() => p.onMover(d, -1)}><ArrowUp size={11} /></Acao>
        <Acao t="Descer" on={() => p.onMover(d, 1)}><ArrowDown size={11} /></Acao>
        {d.tipo === "cena" && <Acao t="Mandar para o capítulo seguinte" on={() => p.onTrocarCapitulo(d, 1)}><ChevronRight size={11} /></Acao>}
        <Acao t="Apagar" on={() => p.onApagar(d)} perigo><Trash2 size={11} /></Acao>
      </span>
      {d.palavras > 0 && <span className="text-[10px] text-faint tabular-nums group-hover:hidden w-9 text-right">{d.palavras >= 1000 ? `${(d.palavras / 1000).toFixed(1)}k` : d.palavras}</span>}
    </div>
  );

  return (
    <aside className="w-64 shrink-0 border-r border-line overflow-y-auto py-3 px-2 select-none">
      {/* manuscrito */}
      <div className="flex items-center justify-between px-2 mb-1">
        <button className="flex items-center gap-1 text-xs text-faint hover:text-ink" onClick={() => alterna("manuscrito")}>
          {fechados.has("manuscrito") ? <ChevronRight size={12} /> : <ChevronDown size={12} />} Manuscrito
        </button>
        <div className="flex items-center gap-0.5 text-faint">
          <button className="text-[11px] px-1.5 py-0.5 rounded hover:bg-surface-2 hover:text-ink" title="Novo capítulo" onClick={() => p.onCriar("capitulo", "manuscrito", null)}>+ cap.</button>
          <button className="text-[11px] px-1.5 py-0.5 rounded hover:bg-surface-2 hover:text-ink disabled:opacity-40" title="Nova cena no capítulo selecionado"
            disabled={!capSel} onClick={() => capSel && p.onCriar("cena", "manuscrito", capSel)}>+ cena</button>
        </div>
      </div>
      {!fechados.has("manuscrito") && p.ms.map(({ cap, n, cenas }) => (
        <div key={cap.id}>
          <div className="flex items-center">
            <button className="p-1 text-faint hover:text-ink" onClick={() => alterna(cap.id)}>{fechados.has(cap.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</button>
            <div className="flex-1 min-w-0">{itemCap(cap, n)}</div>
          </div>
          {!fechados.has(cap.id) && cenas.map((c, i) => item(c, 1, `c${i + 1}`))}
        </div>
      ))}

      {/* apoio */}
      {SECOES.filter((s) => s.id !== "manuscrito").map((s) => {
        const notas = p.docs.filter((d) => d.secao === s.id).sort((a, b) => a.posicao - b.posicao);
        return (
          <div key={s.id} className="mt-4">
            <div className="flex items-center justify-between px-2 mb-1">
              <button className="flex items-center gap-1 text-xs text-faint hover:text-ink" onClick={() => alterna(s.id)}>
                {fechados.has(s.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />} {s.label}
              </button>
              <button className="text-faint hover:text-ink p-0.5" title={`Nova nota em ${s.label}`} onClick={() => p.onCriar("nota", s.id, null)}><Plus size={13} /></button>
            </div>
            {!fechados.has(s.id) && notas.map((d) => item(d, 0))}
          </div>
        );
      })}
    </aside>
  );

  function itemCap(d: Doc, n: number) {
    return (
      <div className={`group flex items-center gap-1.5 rounded-md pr-1 text-[13px] cursor-pointer ${p.atual === d.id ? "bg-surface-2 text-ink" : "text-ink/90 hover:bg-surface-2/60"}`}
        onClick={() => p.onAbrir(d)} onDoubleClick={() => setEditando(d.id)}>
        <FolderOpen size={13} className="shrink-0 text-faint" />
        {editando === d.id ? (
          <input autoFocus className="flex-1 min-w-0 bg-transparent outline-none border-b border-faint py-1" defaultValue={d.titulo}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => { p.onRenomear(d, e.target.value.trim() || d.titulo); setEditando(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditando(null); }} />
        ) : <span className="flex-1 min-w-0 truncate py-1">{d.titulo}</span>}
        <span className="text-[10px] font-mono text-faint group-hover:hidden">C{n}</span>
        <span className="hidden group-hover:flex items-center text-faint">
          <Acao t="Nova cena neste capítulo" on={() => p.onCriar("cena", "manuscrito", d.id)}><Plus size={11} /></Acao>
          <Acao t="Renomear" on={() => setEditando(d.id)}><Pencil size={11} /></Acao>
          <Acao t="Subir" on={() => p.onMover(d, -1)}><ArrowUp size={11} /></Acao>
          <Acao t="Descer" on={() => p.onMover(d, 1)}><ArrowDown size={11} /></Acao>
          <Acao t="Apagar capítulo" on={() => p.onApagar(d)} perigo><Trash2 size={11} /></Acao>
        </span>
      </div>
    );
  }
}

function Acao({ t, on, children, perigo }: { t: string; on: () => void; children: React.ReactNode; perigo?: boolean }) {
  return (
    <button title={t} className={`p-1 rounded ${perigo ? "hover:text-critical" : "hover:text-ink"}`} onClick={(e) => { e.stopPropagation(); on(); }}>{children}</button>
  );
}

/* ================= escaleta ================= */

function Escaleta({ ms, patch, criar, abrir, recarregar, projetoId }: {
  ms: ReturnType<typeof manuscrito>;
  patch: (id: string, f: Partial<Doc>) => void;
  criar: (tipo: Doc["tipo"], secao: Secao, parent: string | null) => Promise<Doc | undefined>;
  abrir: (d: Doc) => void;
  recarregar: React.Dispatch<React.SetStateAction<Doc[]>>;
  projetoId: string;
}) {
  const arquivo = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const colunas = `84px ${ESCALETA.map((c) => c.largura).join(" ")} 64px`;

  async function importar(f: File) {
    setMsg("Lendo a planilha…");
    try {
      const linhas = escaletaDeLinhas(await lerXlsx(f));
      if (!linhas.length) return setMsg("Não achei cenas na planilha.");
      if (!confirm(`Importar ${linhas.length} cenas da escaleta? Capítulos e cenas que faltarem serão criados; os que já existem recebem os dados da planilha (o texto escrito não muda).`)) return setMsg("");
      const sb = supabase();
      // capítulos que faltam
      const maxCap = Math.max(...linhas.map((l) => l.cap));
      const caps = ms.map((c) => c.cap);
      if (maxCap > caps.length) {
        const { data } = await sb.from("escrita_docs").insert(
          Array.from({ length: maxCap - caps.length }, (_, i) => ({ projeto_id: projetoId, tipo: "capitulo", secao: "manuscrito", titulo: `Capítulo ${caps.length + i + 1}`, posicao: (caps[caps.length - 1]?.posicao ?? -1) + i + 1 })),
        ).select();
        caps.push(...((data as Doc[]) ?? []));
      }
      const novos: Partial<Doc>[] = [];
      for (const l of linhas) {
        const cap = caps[l.cap - 1];
        if (!cap) continue;
        const cenas = ms.find((c) => c.cap.id === cap.id)?.cenas ?? [];
        const campos = { resumo: l.resumo, pov: l.pov, personagens: l.personagens, personagens_indiretos: l.personagens_indiretos, espaco: l.espaco, tempo: l.tempo, pagina: l.pagina };
        const existente = cenas[l.cena - 1];
        if (existente) patch(existente.id, campos);
        else novos.push({ projeto_id: projetoId, parent_id: cap.id, tipo: "cena", secao: "manuscrito", titulo: `Cena ${l.cena}`, posicao: l.cena - 1, ...campos });
      }
      if (novos.length) await sb.from("escrita_docs").insert(novos);
      const { data } = await sb.from("escrita_docs").select("*").eq("projeto_id", projetoId).order("posicao");
      if (data) recarregar(data as Doc[]);
      setMsg(`Escaleta importada: ${linhas.length} cenas.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não consegui ler a planilha.");
    }
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-5 min-w-[1100px]">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg mr-auto">Escaleta</h2>
          {msg && <span className="text-xs text-muted">{msg}</span>}
          <input ref={arquivo} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importar(f); e.target.value = ""; }} />
          <button className="btn text-sm" onClick={() => arquivo.current?.click()}><Upload size={14} /> Importar planilha (.xlsx)</button>
          <button className="btn text-sm" onClick={() => criar("capitulo", "manuscrito", null)}><Plus size={14} /> Capítulo</button>
        </div>
        <div className="card overflow-hidden text-[13px]">
          <div className="grid border-b border-line bg-surface-2/60 text-muted" style={{ gridTemplateColumns: colunas }}>
            <div className="px-2.5 py-2">Capítulo e cena</div>
            {ESCALETA.map((c) => <div key={c.campo} className="px-2.5 py-2 border-l border-line">{c.label}</div>)}
            <div className="px-2.5 py-2 border-l border-line text-right">Palavras</div>
          </div>
          {ms.map(({ cap, n, cenas }) => (
            <div key={cap.id}>
              <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-line bg-surface-2/30">
                <span className="font-mono text-xs text-faint">C{n}</span>
                <input className="bg-transparent outline-none flex-1" value={cap.titulo} onChange={(e) => patch(cap.id, { titulo: e.target.value })} />
                <button className="text-xs text-faint hover:text-ink" onClick={() => criar("cena", "manuscrito", cap.id)}>+ cena</button>
              </div>
              {cenas.map((c, i) => (
                <div key={c.id} className="grid border-b border-line last:border-b-0 group" style={{ gridTemplateColumns: colunas }}>
                  <button className="px-2.5 py-2 text-left align-top hover:bg-surface-2/60" title="Abrir a cena para escrever" onClick={() => abrir(c)}>
                    <div className="font-mono text-xs flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: corStatus(c.status) }} />{rotuloCena(n, i + 1)}</div>
                    <div className="text-[11px] text-faint truncate mt-0.5 group-hover:text-muted">{c.titulo}</div>
                  </button>
                  {ESCALETA.map((col) => (
                    <textarea key={col.campo} rows={1} className="border-l border-line bg-transparent px-2.5 py-2 resize-none outline-none focus:bg-surface-2/50 leading-snug"
                      style={{ fieldSizing: "content", minHeight: 36 } as React.CSSProperties}
                      value={String(c[col.campo] ?? "")} onChange={(e) => patch(c.id, { [col.campo]: e.target.value } as Partial<Doc>)} />
                  ))}
                  <div className="border-l border-line px-2.5 py-2 text-right tabular-nums text-muted">{nf.format(c.palavras)}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================= estatísticas ================= */

function Estatisticas({ projeto, total, sessoes, ms, onMeta }: {
  projeto: Projeto; total: number; sessoes: Sessao[]; ms: ReturnType<typeof manuscrito>;
  onMeta: (x: Partial<Projeto>) => void;
}) {
  const dias = Array.from({ length: 21 }, (_, i) => dayKey(addDays(new Date(), i - 20)));
  const porDia = new Map<string, { palavras: number; segundos: number }>();
  for (const s of sessoes) {
    const d = porDia.get(s.dia) ?? { palavras: 0, segundos: 0 };
    d.palavras += s.palavras; d.segundos += s.segundos;
    porDia.set(s.dia, d);
  }
  const hoje = porDia.get(dayKey()) ?? { palavras: 0, segundos: 0 };
  const tempoTotal = sessoes.reduce((n, s) => n + s.segundos, 0);
  const ritmo = tempoTotal > 300 ? Math.round(sessoes.reduce((n, s) => n + Math.max(0, s.palavras), 0) / (tempoTotal / 3600)) : 0;
  const pct = projeto.meta_palavras ? Math.min(1, total / projeto.meta_palavras) : 0;
  const cenas = ms.flatMap((c) => c.cenas);
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card l="Manuscrito" v={`${nf.format(total)}`} h={projeto.meta_palavras ? `${Math.round(pct * 100)}% de ${nf.format(projeto.meta_palavras)}` : "palavras"} />
          <Card l="Hoje" v={`${hoje.palavras >= 0 ? "+" : ""}${nf.format(hoje.palavras)}`} h={projeto.meta_diaria ? `meta ${nf.format(projeto.meta_diaria)} · ${fmtDuration(hoje.segundos)}` : fmtDuration(hoje.segundos)} />
          <Card l="Ritmo" v={ritmo ? `${nf.format(ritmo)}` : "—"} h="palavras por hora escrevendo" />
          <Card l="Cenas" v={`${cenas.filter((c) => c.status === "pronto").length}/${cenas.length}`} h="prontas" />
        </div>
        {projeto.meta_palavras > 0 && (
          <div className="h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: "var(--chart)" }} /></div>
        )}
        <div className="card p-5">
          <div className="flex items-baseline justify-between mb-4"><h3>Palavras por dia</h3><span className="text-xs text-muted">últimas 3 semanas</span></div>
          <BarChart unit="palavras" height={140}
            data={dias.map((d) => ({ label: parseDay(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), value: Math.max(0, porDia.get(d)?.palavras ?? 0), detail: fmtDuration(porDia.get(d)?.segundos ?? 0) }))} />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card p-5">
            <h3 className="mb-3">Sessões</h3>
            {sessoes.length === 0 && <p className="text-sm text-muted">As sessões aparecem aqui quando você escreve.</p>}
            <table className="w-full text-sm tabular-nums">
              <tbody>
                {sessoes.slice(0, 15).map((s) => (
                  <tr key={s.id} className="border-t border-line first:border-0">
                    <td className="py-1.5 text-muted">{parseDay(s.dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} {new Date(s.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="py-1.5 text-right">{fmtDuration(s.segundos)}</td>
                    <td className="py-1.5 text-right text-faint" title="Tempo parado">{s.ocioso >= 60 ? fmtDuration(s.ocioso) : ""}</td>
                    <td className="py-1.5 text-right">{s.palavras >= 0 ? "+" : ""}{nf.format(s.palavras)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card p-5 space-y-3">
            <h3>Metas</h3>
            <label className="block"><span className="label">Meta do livro (palavras)</span>
              <input className="input mt-1" inputMode="numeric" defaultValue={projeto.meta_palavras || ""} onBlur={(e) => onMeta({ meta_palavras: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
            <label className="block"><span className="label">Meta por dia (palavras)</span>
              <input className="input mt-1" inputMode="numeric" defaultValue={projeto.meta_diaria || ""} onBlur={(e) => onMeta({ meta_diaria: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
            <label className="block"><span className="label">Autor</span>
              <input className="input mt-1" defaultValue={projeto.autor} onBlur={(e) => onMeta({ autor: e.target.value.trim() })} /></label>
            <label className="block"><span className="label">Título</span>
              <input className="input mt-1" defaultValue={projeto.titulo} onBlur={(e) => e.target.value.trim() && onMeta({ titulo: e.target.value.trim() })} /></label>
          </div>
        </div>
        <div className="card p-5">
          <h3 className="mb-3">Capítulos</h3>
          <table className="w-full text-sm tabular-nums">
            <tbody>
              {ms.map(({ cap, n, cenas: cs }) => {
                const p = cs.reduce((s, c) => s + c.palavras, 0) + cap.palavras;
                return (
                  <tr key={cap.id} className="border-t border-line first:border-0">
                    <td className="py-1.5 w-10 font-mono text-xs text-faint">C{n}</td>
                    <td className="py-1.5">{cap.titulo}</td>
                    <td className="py-1.5 text-right text-muted">{cs.length} cenas</td>
                    <td className="py-1.5 text-right w-24">{nf.format(p)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Card({ l, v, h }: { l: string; v: string; h?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[13px] text-muted">{l}</div>
      <div className="text-[1.6rem] tracking-tight tabular-nums mt-1 leading-none">{v}</div>
      {h && <div className="text-xs text-faint mt-2">{h}</div>}
    </div>
  );
}
