"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown, ChevronLeft, ChevronRight, Download, FileText, FolderOpen, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen,
  PanelRightClose, PanelRightOpen, Plus, Printer, Table2, BarChart3, PenLine, Trash2, ArrowUp, ArrowDown, Upload, Pencil, Settings2, X, CornerUpLeft, BookOpenText, Library, Search, Quote,
} from "lucide-react";
import { supabase, fire } from "@/lib/supabase/client";
import { todas } from "@/lib/supabase/todas";
import { dayKey, fmtClock, fmtDuration, nf, addDays, parseDay } from "@/lib/dates";
import {
  compilarMarkdown, contarPalavras, paragrafosHtml, corStatus, ESCALETA, escaletaDeLinhas, lerXlsx, manuscrito, semComentarios, STATUS, estrutura, abnt, ordenarReferencias, sobrenome,
  type Doc, type Estrutura, type Projeto, type Referencia, type Secao, type Sessao,
} from "@/lib/escrita";
import { Editor, type EditorHandle } from "@/components/escrita/editor";
import { BarChart } from "@/components/bar-chart";
import { FONTS } from "@/components/reader/types";
import { useTimerEstado } from "@/components/timer-context";

const SECOES_EXTRA: { id: Secao; label: string }[] = [
  { id: "enredo", label: "Enredo" }, { id: "personagens", label: "Personagens" }, { id: "lugares", label: "Lugares" }, { id: "pesquisa", label: "Pesquisa" },
];
type Aba = "escrever" | "livro" | "escaleta" | "referencias" | "estatisticas";
interface Prefs { fonte: "times" | "literata" | "inter"; tamanho: number; entrelinha: number; ocioso: number; falas: boolean; maquina: boolean; paragrafo: boolean }
const PREFS0: Prefs = { fonte: "times", tamanho: 13, entrelinha: 1.6, ocioso: 300, falas: true, maquina: true, paragrafo: true };

export default function SalaDeEscrita() {
  const { id } = useParams<{ id: string }>();
  const timer = useTimerEstado();
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [refs, setRefs] = useState<Referencia[]>([]);
  const [lado, setLado] = useState<"escaleta" | "consulta">("escaleta");
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
      // no celular, árvore e painel começam fechados (viram gavetas sobre o texto)
      const celular = window.innerWidth < 768;
      setArvore(celular ? false : localStorage.getItem("escrita-arvore") !== "0");
      setPainel(celular ? false : localStorage.getItem("escrita-painel") !== "0");
    } catch {}
  }, []);
  const setPrefs = (x: Partial<Prefs>) => setPrefsState((o) => {
    const n = { ...o, ...x };
    try { localStorage.setItem("escrita-prefs", JSON.stringify(n)); } catch {}
    return n;
  });
  useEffect(() => { if (window.innerWidth < 768) return; try { localStorage.setItem("escrita-arvore", arvore ? "1" : "0"); localStorage.setItem("escrita-painel", painel ? "1" : "0"); } catch {} }, [arvore, painel]);

  /* ---------- carregar ---------- */
  useEffect(() => {
    (async () => {
      const sb = supabase();
      const [p, d, s, r] = await Promise.all([
        sb.from("escrita_projetos").select("*").eq("id", id).single(),
        sb.from("escrita_docs").select("*").eq("projeto_id", id).order("posicao"),
        sb.from("escrita_sessoes").select("*").eq("projeto_id", id).gte("dia", dayKey(addDays(new Date(), -60))).order("inicio", { ascending: false }),
        sb.from("escrita_referencias").select("*").eq("projeto_id", id),
      ]);
      setRefs((r.data as Referencia[]) ?? []);
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
  const E = useMemo(() => estrutura(projeto ?? ({ tipo: "romance" } as Projeto), ms), [projeto, ms]);
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
  const sess = useRef({ ativo: 0, ocioso: 0, ultimaAtividade: 0, inicio: "", id: "", studyId: "", escritas: 0, iniciada: false });
  /** maior contagem já alcançada por texto nesta sessão: apagar e redigitar a mesma palavra não conta duas vezes */
  const teto = useRef(new Map<string, number>());
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
    const dados = { segundos: Math.round(s.ativo), ocioso: Math.round(s.ocioso), palavras: Math.round(s.escritas) };
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
    }
    s.ultimaAtividade = Date.now();
  }, []);

  /**
   * Esforço: conta as palavras escritas em qualquer texto do projeto (cenas, rascunhos, notas).
   * Apagar não desconta. Pequenas correções (apagar e redigitar) não contam em dobro;
   * colar um bloco grande de texto não conta como escrito.
   */
  const escrever = useCallback((d: Doc, v: string) => {
    atividade();
    const n = contarPalavras(v);
    const m = teto.current.get(d.id) ?? d.palavras;
    if (n > m) {
      if (n - m <= 150) sess.current.escritas += n - m;
      teto.current.set(d.id, n);
    } else if (m - n >= 5) teto.current.set(d.id, n);
    patch(d.id, { conteudo: v, palavras: n });
  }, [atividade, patch]);

  // callback estável: o editor (memo) não redesenha a cada segundo do cronômetro
  const docAtual = useRef<Doc | null>(null);
  docAtual.current = docs.find((d) => d.id === atual) ?? null;
  const aoEscrever = useCallback((v: string) => { if (docAtual.current) escrever(docAtual.current, v); }, [escrever]);

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
    const tituloNovo = tipo === "capitulo" ? `Capítulo ${n}` : tipo === "cena" ? `${E.Unidade} ${n}` : tipo === "pasta" ? "Nova pasta" : secao === "rascunhos" ? `Rascunho ${n}` : "Nova nota";
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

  /** Insere uma citação onde está o cursor (não conta como palavras escritas: é texto de outro autor). */
  function inserirNoTexto(txt: string) {
    if (!doc || aba !== "escrever") return;
    const pos = editor.current?.cursor() ?? doc.conteudo.length;
    const antes = doc.conteudo.slice(0, pos);
    const sep = antes && !/\s$/.test(antes) ? " " : "";
    const novo = antes + sep + txt + doc.conteudo.slice(pos);
    const n = contarPalavras(novo);
    teto.current.set(doc.id, Math.max(n, teto.current.get(doc.id) ?? 0));
    patch(doc.id, { conteudo: novo, palavras: n });
    setTimeout(() => editor.current?.irPara(pos + sep.length + txt.length), 30);
  }

  /** Um rascunho vira cena: vai para o fim do capítulo escolhido (ou do último). */
  async function paraManuscrito(d: Doc) {
    const atualDoc = docs.find((x) => x.id === atual);
    const capId = atualDoc?.tipo === "capitulo" ? atualDoc.id : atualDoc?.tipo === "cena" ? atualDoc.parent_id : ms[ms.length - 1]?.cap.id;
    const cap = ms.find((c) => c.cap.id === capId) ?? ms[ms.length - 1];
    if (!cap) return alert("Crie um capítulo primeiro.");
    if (!confirm(`Levar “${d.titulo}” para o manuscrito, como a última cena de “${cap.cap.titulo}”?`)) return;
    const posicao = Math.max(-1, ...cap.cenas.map((c) => c.posicao)) + 1;
    const f = { secao: "manuscrito" as const, tipo: "cena" as const, parent_id: cap.cap.id, posicao };
    setDocs((ds) => ds.map((x) => (x.id === d.id ? { ...x, ...f } : x)));
    await supabase().from("escrita_docs").update(f).eq("id", d.id);
  }

  /* ---------- exportar ---------- */
  function baixarMd() {
    if (!projeto) return;
    const blob = new Blob([compilarMarkdown(projeto, docs, E.referencias ? refs : [])], { type: "text/markdown;charset=utf-8" });
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
      `${E.comCap ? `<h2>${esc(cap.titulo)}</h2>` : ""}${pars(cap.conteudo)}${E.unidade === "parte"
        ? cenas.map((c) => `${cenas.length > 1 && c.titulo.trim() ? `<h3>${esc(c.titulo)}</h3>` : ""}${pars(c.conteudo)}`).join("")
        : cenas.map((c) => pars(c.conteudo)).filter(Boolean).join('<p class="sep">* * *</p>')}`).join("")
      + (E.referencias && refs.length ? `<h2 class="refs">Referências</h2>${ordenarReferencias(refs).map((r) => `<p class="ref">${fmt(abnt(r))}</p>`).join("")}` : "");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(projeto.titulo)}</title><style>
      @page{size:A4;margin:2.5cm 3cm}body{font-family:"Times New Roman",Times,serif;font-size:12pt;line-height:1.5;color:#000}
      h1{text-align:center;font-size:20pt;font-weight:normal;margin:30vh 0 .3em}.autor{text-align:center;font-style:italic;page-break-after:always}
      h2{font-size:14pt;font-weight:normal;text-align:center;margin:0 0 2em;page-break-before:always}h3{font-size:12pt;font-weight:bold;margin:1.5em 0 .5em}h3+p{text-indent:0}.ref{text-indent:0;text-align:left;margin:0 0 1em}
      p{margin:0;text-indent:1.25cm;text-align:justify}h2+p,.sep+p{text-indent:0}.sep{text-align:center;text-indent:0;margin:1em 0}
    </style></head><body><h1>${esc(projeto.titulo)}</h1><p class="autor">${esc(projeto.autor)}</p>${corpo}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  }

  if (erro) return <div className="p-8 text-sm"><p className="text-critical">{erro}</p><Link href="/escrita" className="underline">← Voltar</Link></div>;
  if (!projeto) return <div className="fixed inset-0 z-20 bg-bg grid place-items-center text-sm text-muted">Abrindo o projeto…</div>;

  const palavrasSessao = Math.round(sess.current.escritas);
  const hoje = sessoes.filter((s) => s.dia === dayKey() && s.id !== sess.current.id).reduce((n, s) => n + s.palavras, 0) + palavrasSessao;
  const fonte = FONTS[prefs.fonte].css;
  const capDoc = doc?.tipo === "cena" ? ms.find((c) => c.cap.id === doc.parent_id) : undefined;
  const rotulo = doc?.tipo === "cena" && capDoc ? E.rotulo(capDoc.n, capDoc.cenas.findIndex((c) => c.id === doc.id) + 1) : "";

  return (
    <div ref={raiz} className="fixed inset-0 z-20 bg-bg text-ink flex flex-col pt-safe pb-safe">
      {/* cabeçalho */}
      {!foco && (
        <header className="h-12 shrink-0 flex items-center gap-1 sm:gap-2 px-1.5 sm:px-3 border-b border-line">
          <Link href="/escrita" className="p-1.5 text-muted hover:text-ink" title="Voltar aos projetos"><ChevronLeft size={18} /></Link>
          <button className="p-1.5 text-muted hover:text-ink" title={arvore ? "Esconder o projeto" : "Mostrar o projeto"} onClick={() => setArvore(!arvore)}>
            {arvore ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>
          <input className="hidden sm:block min-w-0 w-48 mr-2 bg-transparent outline-none text-sm truncate rounded px-1.5 py-1 hover:bg-surface-2 focus:bg-surface-2"
            title="Clique para renomear o projeto" value={projeto.titulo}
            onChange={(e) => setProjeto({ ...projeto, titulo: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            onBlur={(e) => { const t = e.target.value.trim() || "Sem título"; setProjeto({ ...projeto, titulo: t }); fire(supabase().from("escrita_projetos").update({ titulo: t }).eq("id", id)); }} />
          <nav className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5 text-sm mx-auto">
            {([["escrever", "Escrever", PenLine], ["livro", "Texto inteiro", BookOpenText], ...(E.escaleta ? [["escaleta", "Escaleta", Table2] as const] : []), ...(E.referencias ? [["referencias", "Referências", Library] as const] : []), ["estatisticas", "Estatísticas", BarChart3]] as const).map(([k, l, I]) => (
              <button key={k} onClick={() => setAba(k)} title={l} aria-label={l} className={`flex items-center gap-1.5 px-2 min-[400px]:px-2.5 sm:px-3 py-1.5 sm:py-1 rounded-md ${aba === k ? "bg-seg shadow-sm text-ink" : "text-muted hover:text-ink"}`}>
                <I size={14} /> <span className="hidden sm:inline">{l}</span>
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-0.5">
            <button className="hidden md:block p-1.5 text-muted hover:text-ink" title="Exportar em Markdown (.md)" onClick={baixarMd}><Download size={16} /></button>
            <button className="hidden md:block p-1.5 text-muted hover:text-ink" title="Imprimir / salvar em PDF" onClick={imprimir}><Printer size={16} /></button>
            <button className="p-1.5 text-muted hover:text-ink" title="Aparência do editor" onClick={() => setVerPrefs(!verPrefs)}><Settings2 size={16} /></button>
            {aba === "escrever" && (
              <button className="p-1.5 text-muted hover:text-ink" title={painel ? "Esconder a escaleta da cena" : "Mostrar a escaleta da cena"} onClick={() => setPainel(!painel)}>
                {painel ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
              </button>
            )}
            <button className="btn ml-1 py-1 px-2 sm:px-[0.85rem]" title="Modo foco: tela cheia, sem distrações (Ctrl + Shift + F)" onClick={entrarFoco}><Maximize2 size={14} /> <span className="hidden sm:inline">Foco</span></button>
          </div>
        </header>
      )}

      <div className="flex-1 min-h-0 flex">
        {(arvore || (painel && aba === "escrever")) && !foco && (
          <div className="md:hidden fixed inset-0 z-20 bg-black/40" onClick={() => { setArvore(false); setPainel(false); }} />
        )}
        {/* árvore do projeto */}
        {arvore && !foco && (
          <Arvore E={E} docs={docs} ms={ms} atual={atual} onAbrir={(d) => { void flush(); setAtual(d.id); setAba("escrever"); if (window.innerWidth < 768) setArvore(false); }}
            onCriar={criar} onRenomear={(d, t) => patch(d.id, { titulo: t })} onApagar={apagar} onMover={mover} onTrocarCapitulo={trocarCapitulo} onParaManuscrito={paraManuscrito} />
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
                      {capDoc && E.comCap && <span className="text-xs text-faint truncate max-w-[30%]">{capDoc.cap.titulo}</span>}
                    </div>
                  </div>
                )}
                <div className="flex-1 min-h-0">
                  <Editor key={doc.id} ref={editor} value={doc.conteudo}
                    onChange={aoEscrever}
                    fonte={fonte} tamanhoPt={prefs.tamanho} entrelinha={prefs.entrelinha}
                    focoParagrafo={foco && prefs.paragrafo} maquina={prefs.maquina} destacarFalas={prefs.falas}
                    placeholder={doc.tipo === "cena" ? (E.unidade === "parte" ? "Comece o texto…" : "Comece a cena…") : doc.secao === "rascunhos" ? "Escreva à vontade: tudo o que você escreve aqui conta no esforço do dia." : "Escreva a nota…"} />
                </div>
              </div>
            )
          ) : (
            <div className="h-full grid place-items-center text-sm text-muted">Escolha ou crie uma cena na árvore à esquerda.</div>
          ))}
          {aba === "livro" && <Livro E={E} refs={E.referencias ? refs : []} projeto={projeto} ms={ms} fonte={fonte} tamanhoPt={prefs.tamanho} entrelinha={prefs.entrelinha}
            abrir={(d) => { setAtual(d.id); setAba("escrever"); }} />}
          {aba === "escaleta" && E.escaleta && <Escaleta E={E} ms={ms} patch={patch} criar={criar} abrir={(d) => { setAtual(d.id); setAba("escrever"); }} recarregar={setDocs} projetoId={id} />}
          {aba === "referencias" && <Referencias projetoId={id} refs={refs} setRefs={setRefs} />}
          {aba === "estatisticas" && <Estatisticas E={E} projeto={projeto} total={totalPalavras} sessoes={sessoes} ms={ms}
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

        {/* ao lado do texto: escaleta da cena e consulta (notas e referências) */}
        {aba === "escrever" && painel && !foco && doc && doc.tipo !== "capitulo" && doc.tipo !== "pasta" && (
          <aside className="fixed md:static inset-y-0 right-0 z-30 w-[86vw] max-w-80 md:w-80 shrink-0 border-l border-line bg-bg flex flex-col text-sm min-h-0 shadow-2xl md:shadow-none pt-safe md:pt-0">
            {E.escaleta && doc.tipo === "cena" && (
              <div className="shrink-0 p-3 pb-0">
                <div className="grid grid-cols-2 rounded-lg bg-surface-2 p-0.5 text-[13px]">
                  {(["escaleta", "consulta"] as const).map((k) => (
                    <button key={k} onClick={() => setLado(k)} className={`py-1 rounded-md ${lado === k ? "bg-seg shadow-sm" : "text-muted"}`}>{k === "escaleta" ? "Escaleta" : "Consulta"}</button>
                  ))}
                </div>
              </div>
            )}
            {E.escaleta && doc.tipo === "cena" && lado === "escaleta" ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="text-muted">{rotulo && <span className="font-mono text-faint text-xs">{rotulo}</span>}</div>
                <label className="block"><span className="label">Status</span>
                  <select className="input mt-1" value={doc.status} onChange={(e) => patch(doc.id, { status: e.target.value })}>
                    {STATUS.map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
                  </select></label>
                {ESCALETA.map((c) => (
                  <label key={c.campo} className="block"><span className="label">{c.label}</span>
                    <textarea className="input mt-1 resize-none leading-snug" rows={c.campo === "resumo" ? 5 : 1}
                      style={{ fieldSizing: "content" } as React.CSSProperties}
                      value={String(doc[c.campo] ?? "")} onChange={(e) => patch(doc.id, { [c.campo]: e.target.value } as Partial<Doc>)} /></label>
                ))}
              </div>
            ) : (
              <Consulta refs={E.referencias ? refs : []} onInserir={inserirNoTexto} />
            )}
          </aside>
        )}
      </div>

      {/* barra de status: cronômetro, palavras */}
      <footer className={`h-8 shrink-0 flex items-center gap-3 sm:gap-4 px-4 overflow-hidden whitespace-nowrap text-xs text-muted border-t border-line tabular-nums transition-opacity ${foco ? "opacity-30 hover:opacity-100 border-transparent" : ""}`}>
        <span className="flex items-center gap-1.5" title={relogio.parado ? `Pausado: parado há mais de ${prefs.ocioso < 60 ? `${prefs.ocioso} s` : `${prefs.ocioso / 60} min`}` : "Escrevendo"}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: !sess.current.iniciada ? "var(--faint)" : relogio.parado ? "#d0a24a" : "var(--good)" }} />
          <span className="font-mono text-ink">{fmtClock(relogio.ativo)}</span>
          {relogio.ocioso >= 60 && <span className="text-faint">· parado {fmtDuration(relogio.ocioso)}</span>}
        </span>
        <span title="Palavras escritas nesta sessão, em qualquer texto (cenas, rascunhos, notas). Apagar não desconta.">+{nf.format(palavrasSessao)} escritas</span>
        {doc && doc.tipo !== "capitulo" && doc.tipo !== "pasta" && <span className="hidden sm:inline" title="Palavras neste texto">{nf.format(doc.palavras)} {doc.tipo === "cena" ? (E.unidade === "parte" ? "na parte" : "na cena") : doc.secao === "rascunhos" ? "no rascunho" : "na nota"}</span>}
        <span className="hidden sm:inline" title="Palavras do manuscrito">{nf.format(totalPalavras)}{projeto.meta_palavras ? ` / ${nf.format(projeto.meta_palavras)}` : ""} {E.unidade === "parte" || projeto.tipo === "conto" ? "no texto" : "no livro"}</span>
        <span title="Palavras escritas hoje neste projeto (esforço)">hoje {nf.format(Math.max(0, hoje))}{projeto.meta_diaria > 0 ? ` / ${nf.format(projeto.meta_diaria)}` : ""}</span>
        <span className="ml-auto">{salvo === "salvo" ? "salvo" : salvo === "salvando" ? "salvando…" : "…"}</span>
        {foco && <button className="flex items-center gap-1 hover:text-ink" onClick={sairFoco}><Minimize2 size={12} /> sair do foco (Esc)</button>}
      </footer>
    </div>
  );
}

/* ================= árvore ================= */

function Arvore(p: {
  E: Estrutura;
  docs: Doc[];
  ms: ReturnType<typeof manuscrito>;
  atual: string | null;
  onAbrir: (d: Doc) => void;
  onCriar: (tipo: Doc["tipo"], secao: Secao, parent: string | null) => Promise<Doc | undefined>;
  onRenomear: (d: Doc, t: string) => void;
  onApagar: (d: Doc) => void;
  onMover: (d: Doc, dir: -1 | 1) => void;
  onTrocarCapitulo: (d: Doc, dir: -1 | 1) => void;
  onParaManuscrito: (d: Doc) => void;
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
        {d.tipo === "cena" && p.E.comCap && <Acao t="Mandar para o capítulo seguinte" on={() => p.onTrocarCapitulo(d, 1)}><ChevronRight size={11} /></Acao>}
        {d.secao === "rascunhos" && <Acao t={`Levar para o texto (vira ${p.E.unidade})`} on={() => p.onParaManuscrito(d)}><CornerUpLeft size={11} /></Acao>}
        <Acao t="Apagar" on={() => p.onApagar(d)} perigo><Trash2 size={11} /></Acao>
      </span>
      {d.palavras > 0 && <span className="text-[10px] text-faint tabular-nums group-hover:hidden w-9 text-right">{d.palavras >= 1000 ? `${(d.palavras / 1000).toFixed(1)}k` : d.palavras}</span>}
    </div>
  );

  return (
    <aside className="fixed md:static inset-y-0 left-0 z-30 w-[80vw] max-w-72 md:w-64 shrink-0 border-r border-line bg-bg overflow-y-auto py-3 px-2 select-none shadow-2xl md:shadow-none pt-safe md:pt-3">
      {/* manuscrito */}
      <div className="flex items-center justify-between px-2 mb-1">
        <button className="flex items-center gap-1 text-xs text-faint hover:text-ink" onClick={() => alterna("manuscrito")}>
          {fechados.has("manuscrito") ? <ChevronRight size={12} /> : <ChevronDown size={12} />} {p.E.comCap ? "Manuscrito" : p.E.label}
        </button>
        <div className="flex items-center gap-0.5 text-faint">
          {p.E.capitulos && <button className="text-[11px] px-1.5 py-0.5 rounded hover:bg-surface-2 hover:text-ink" title="Novo capítulo" onClick={() => p.onCriar("capitulo", "manuscrito", null)}>+ cap.</button>}
          <button className="text-[11px] px-1.5 py-0.5 rounded hover:bg-surface-2 hover:text-ink disabled:opacity-40" title={p.E.comCap ? `Nova ${p.E.unidade} no capítulo selecionado` : `Nova ${p.E.unidade}`}
            disabled={!capSel} onClick={() => capSel && p.onCriar("cena", "manuscrito", capSel)}>+ {p.E.unidade}</button>
        </div>
      </div>
      {!fechados.has("manuscrito") && !p.E.comCap && p.ms[0]?.cenas.map((c, i) => item(c, 0, p.E.unidade === "parte" ? `${i + 1}` : `c${i + 1}`))}
      {!fechados.has("manuscrito") && p.E.comCap && p.ms.map(({ cap, n, cenas }) => (
        <div key={cap.id}>
          <div className="flex items-center">
            <button className="p-1 text-faint hover:text-ink" onClick={() => alterna(cap.id)}>{fechados.has(cap.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</button>
            <div className="flex-1 min-w-0">{itemCap(cap, n)}</div>
          </div>
          {!fechados.has(cap.id) && cenas.map((c, i) => item(c, 1, `c${i + 1}`))}
        </div>
      ))}

      {/* apoio */}
      {[...p.E.secoes, ...SECOES_EXTRA.filter((x) => !p.E.secoes.some((y) => y.id === x.id) && p.docs.some((d) => d.secao === x.id))].map((s) => {
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

/* ================= livro: o texto inteiro, como está ficando ================= */

function Livro({ E, refs, projeto, ms, fonte, tamanhoPt, entrelinha, abrir }: {
  E: Estrutura; refs: Referencia[]; projeto: Projeto; ms: ReturnType<typeof manuscrito>; fonte: string; tamanhoPt: number; entrelinha: number; abrir: (d: Doc) => void;
}) {
  const [marcas, setMarcas] = useState(true);
  useEffect(() => { try { setMarcas(localStorage.getItem("escrita-livro-marcas") !== "0"); } catch {} }, []);
  const total = ms.reduce((n, c) => n + c.cap.palavras + c.cenas.reduce((m, x) => m + x.palavras, 0), 0);
  return (
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 bg-bg/90 backdrop-blur border-b border-line px-5 py-2 flex items-center gap-4 text-xs text-muted">
        <span>{nf.format(total)} palavras · ≈ {Math.max(1, Math.round(total / 250)) === 1 ? "1 página" : `${nf.format(Math.round(total / 250))} páginas`}</span>
        <label className="flex items-center gap-1.5 ml-auto cursor-pointer">
          <input type="checkbox" checked={marcas} onChange={(e) => { setMarcas(e.target.checked); try { localStorage.setItem("escrita-livro-marcas", e.target.checked ? "1" : "0"); } catch {} }} />
          Mostrar as cenas na margem
        </label>
      </div>
      <article className="mx-auto max-w-[42rem] px-6 py-14" style={{ fontFamily: fonte, fontSize: `${tamanhoPt}pt`, lineHeight: entrelinha }}>
        <header className="text-center mb-20">
          <h1 className="text-[1.9em] leading-tight">{projeto.titulo}</h1>
          {projeto.autor && <p className="mt-2 italic text-muted">{projeto.autor}</p>}
        </header>
        {ms.map(({ cap, n, cenas }) => (
          <section key={cap.id} className="mb-20">
            {E.comCap && <h2 className="text-center text-[1.3em] mb-10">{cap.titulo}</h2>}
            {paragrafosHtml(cap.conteudo).map((h, i) => <p key={i} className="text-justify" style={{ textIndent: i ? "1.5em" : 0 }} dangerouslySetInnerHTML={{ __html: h }} />)}
            {cenas.map((c, k) => {
              const pars = paragrafosHtml(c.conteudo);
              return (
                <div key={c.id} className="relative group">
                  {E.unidade === "parte"
                    ? cenas.length > 1 && c.titulo.trim() && <h3 className="font-bold mt-10 mb-3">{c.titulo}</h3>
                    : k > 0 && <p className="text-center my-6 text-faint">* * *</p>}
                  {marcas && (
                    <button onClick={() => abrir(c)} title="Abrir esta cena para escrever"
                      className="hidden xl:block absolute right-full mr-8 top-1 w-40 text-right font-sans text-[11px] leading-snug text-faint hover:text-ink" style={{ marginTop: k > 0 ? (E.unidade === "parte" ? "2.6rem" : "4.5em") : 0 }}>
                      <span className="font-mono">{E.rotulo(n, k + 1)}</span><br />{c.titulo}
                      <span className="block mt-0.5">{nf.format(c.palavras)} pal.</span>
                    </button>
                  )}
                  {pars.length ? (
                    <div onDoubleClick={() => abrir(c)} title="Dois cliques para editar esta cena">
                      {pars.map((h, i) => <p key={i} className="text-justify" style={{ textIndent: i ? "1.5em" : 0 }} dangerouslySetInnerHTML={{ __html: h }} />)}
                    </div>
                  ) : (
                    <button onClick={() => abrir(c)} className="block w-full text-left font-sans text-sm text-faint border border-dashed border-line rounded-lg px-4 py-3 hover:text-ink">
                      {E.rotulo(n, k + 1)} · {c.titulo}: ainda não escrita{c.resumo ? ` — ${c.resumo}` : ""}
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        ))}
        {refs.length > 0 && (
          <section className="mt-10">
            <h2 className="text-center text-[1.3em] mb-8">Referências</h2>
            {ordenarReferencias(refs).map((r) => (
              <p key={r.id} className="mb-4 text-left" dangerouslySetInnerHTML={{ __html: paragrafosHtml(abnt(r))[0] ?? "" }} />
            ))}
          </section>
        )}
      </article>
    </div>
  );
}

/* ================= escaleta ================= */

function Escaleta({ E, ms, patch, criar, abrir, recarregar, projetoId }: {
  E: Estrutura;
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
      if (!E.capitulos) linhas.forEach((l) => { l.cap = 1; });
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
          {E.capitulos ? <button className="btn text-sm" onClick={() => criar("capitulo", "manuscrito", null)}><Plus size={14} /> Capítulo</button>
            : ms[0] && <button className="btn text-sm" onClick={() => criar("cena", "manuscrito", ms[0].cap.id)}><Plus size={14} /> {E.Unidade}</button>}
        </div>
        <div className="card overflow-hidden text-[13px]">
          <div className="grid border-b border-line bg-surface-2/60 text-muted" style={{ gridTemplateColumns: colunas }}>
            <div className="px-2.5 py-2">{E.comCap ? "Capítulo e cena" : "Cena"}</div>
            {ESCALETA.map((c) => <div key={c.campo} className="px-2.5 py-2 border-l border-line">{c.label}</div>)}
            <div className="px-2.5 py-2 border-l border-line text-right">Palavras</div>
          </div>
          {ms.map(({ cap, n, cenas }) => (
            <div key={cap.id}>
              {E.comCap && <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-line bg-surface-2/30">
                <span className="font-mono text-xs text-faint">C{n}</span>
                <input className="bg-transparent outline-none flex-1" value={cap.titulo} onChange={(e) => patch(cap.id, { titulo: e.target.value })} />
                <button className="text-xs text-faint hover:text-ink" onClick={() => criar("cena", "manuscrito", cap.id)}>+ cena</button>
              </div>}
              {cenas.map((c, i) => (
                <div key={c.id} className="grid border-b border-line last:border-b-0 group" style={{ gridTemplateColumns: colunas }}>
                  <button className="px-2.5 py-2 text-left align-top hover:bg-surface-2/60" title="Abrir a cena para escrever" onClick={() => abrir(c)}>
                    <div className="font-mono text-xs flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: corStatus(c.status) }} />{E.rotulo(n, i + 1)}</div>
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

function Estatisticas({ E, projeto, total, sessoes, ms, onMeta }: {
  E: Estrutura; projeto: Projeto; total: number; sessoes: Sessao[]; ms: ReturnType<typeof manuscrito>;
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
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card l="Manuscrito" v={`${nf.format(total)}`} h={projeto.meta_palavras ? `${Math.round(pct * 100)}% de ${nf.format(projeto.meta_palavras)}` : "palavras"} />
          <Card l="Hoje" v={`${hoje.palavras >= 0 ? "+" : ""}${nf.format(hoje.palavras)}`} h={projeto.meta_diaria ? `meta ${nf.format(projeto.meta_diaria)} · ${fmtDuration(hoje.segundos)}` : fmtDuration(hoje.segundos)} />
          <Card l="Ritmo" v={ritmo ? `${nf.format(ritmo)}` : "—"} h="palavras por hora escrevendo" />
          <Card l={E.Unidade === "Parte" ? "Partes" : "Cenas"} v={`${cenas.filter((c) => c.status === "pronto").length}/${cenas.length}`} h="prontas" />
        </div>
        {projeto.meta_palavras > 0 && (
          <div className="h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: "var(--chart)" }} /></div>
        )}
        <div className="card p-4 md:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 mb-3 md:mb-4"><h3>Palavras por dia</h3><span className="text-xs text-muted">últimas 3 semanas</span></div>
          <BarChart unit="palavras" height={140}
            data={dias.map((d) => ({ label: parseDay(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), value: Math.max(0, porDia.get(d)?.palavras ?? 0), detail: fmtDuration(porDia.get(d)?.segundos ?? 0) }))} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        {E.comCap && <div className="card p-5">
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
        </div>}
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

/* ================= consulta: suas notas e as referências, ao lado do texto ================= */

interface NotaConsulta { id: string; kind: string; title: string; quote: string | null; content: string; book_id: string | null }
interface LivroLite { id: string; title: string; author: string | null }

const dobrar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function Consulta({ refs, onInserir }: { refs: Referencia[]; onInserir: (txt: string) => void }) {
  const [notas, setNotas] = useState<NotaConsulta[] | null>(null);
  const [livros, setLivros] = useState<Map<string, LivroLite>>(new Map());
  const [q, setQ] = useState("");
  const [aba, setAba] = useState<"notas" | "refs">("notas");
  const [aberta, setAberta] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const sb = supabase();
      const [n, b] = await Promise.all([
        todas<NotaConsulta>((de, ate) => sb.from("notes").select("id,kind,title,quote,content,book_id").in("kind", ["literaria", "atomica"]).order("updated_at", { ascending: false }).order("id").range(de, ate)),
        todas<LivroLite>((de, ate) => sb.from("books").select("id,title,author").order("id").range(de, ate)),
      ]);
      setNotas(n);
      setLivros(new Map(b.map((x) => [x.id, x])));
    })();
  }, []);
  const termos = dobrar(q).split(/\s+/).filter(Boolean);
  const casa = (t: string) => termos.every((w) => dobrar(t).includes(w));
  const lista = (notas ?? []).filter((n) => {
    const l = n.book_id ? livros.get(n.book_id) : undefined;
    return casa(`${n.title} ${n.quote ?? ""} ${n.content} ${l?.title ?? ""} ${l?.author ?? ""}`);
  }).slice(0, 80);
  const listaRefs = ordenarReferencias(refs).filter((r) => casa(`${r.autor} ${r.titulo} ${r.ano} ${r.notas}`));

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 p-3 space-y-2">
        <label className="input flex items-center gap-2 py-1.5">
          <Search size={14} className="text-faint shrink-0" />
          <input className="bg-transparent outline-none flex-1 min-w-0 text-[13px]" placeholder="Buscar nas suas notas…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {refs.length > 0 && (
          <div className="flex gap-3 text-xs">
            {(["notas", "refs"] as const).map((k) => (
              <button key={k} onClick={() => setAba(k)} className={aba === k ? "text-ink" : "text-faint hover:text-ink"}>
                {k === "notas" ? "Notas" : `Referências (${refs.length})`}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
        {aba === "notas" || !refs.length ? (
          <>
            {notas && !lista.length && <p className="text-xs text-muted px-1">{notas.length ? "Nada encontrado." : "Suas notas literárias e atômicas (menu Notas) aparecem aqui para consulta."}</p>}
            {lista.map((n) => {
              const l = n.book_id ? livros.get(n.book_id) : undefined;
              const texto = n.quote?.trim() || n.content.replace(/^>.*$/gm, "").replace(/[#*_>]/g, "").trim();
              const longa = aberta === n.id;
              return (
                <div key={n.id} className="rounded-lg border border-line p-2.5 hover:bg-surface-2/50">
                  <div className="text-[11px] text-faint flex justify-between gap-2">
                    <span className="truncate">{n.kind === "atomica" ? "Nota atômica" : l ? `${l.author ? `${l.author} — ` : ""}${l.title}` : "Nota literária"}</span>
                  </div>
                  <div className="text-[13px] mt-0.5">{n.title}</div>
                  {texto && (
                    <p className={`mt-1 text-[13px] text-muted leading-snug cursor-pointer ${n.quote ? "italic" : ""} ${longa ? "" : "line-clamp-4"}`} style={{ fontFamily: FONTS.times.css }}
                      onClick={() => setAberta(longa ? null : n.id)}>
                      {n.quote ? `“${texto}”` : texto}
                    </p>
                  )}
                  {n.quote?.trim() && (
                    <button className="mt-1.5 text-[11px] text-muted hover:text-ink flex items-center gap-1"
                      title="Insere a citação onde está o cursor"
                      onClick={() => onInserir(`“${n.quote!.trim()}”${l?.author ? ` (${sobrenome(l.author)})` : ""}`)}>
                      <Quote size={11} /> Inserir citação
                    </button>
                  )}
                </div>
              );
            })}
          </>
        ) : (
          listaRefs.map((r) => (
            <div key={r.id} className="rounded-lg border border-line p-2.5 text-[12px] leading-snug">
              <p dangerouslySetInnerHTML={{ __html: paragrafosHtml(abnt(r))[0] ?? "" }} />
              {r.notas && <p className="mt-1 text-muted whitespace-pre-wrap">{r.notas}</p>}
              <button className="mt-1.5 text-[11px] text-muted hover:text-ink flex items-center gap-1" title="Insere (SOBRENOME, ano) onde está o cursor"
                onClick={() => onInserir(`(${sobrenome(r.autor) || r.titulo}${r.ano ? `, ${r.ano}` : ""})`)}>
                <Quote size={11} /> Citar ({sobrenome(r.autor) || r.titulo}{r.ano ? `, ${r.ano}` : ""})
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ================= referências bibliográficas (ensaio) ================= */

const REF0 = { autor: "", titulo: "", subtitulo: "", edicao: "", local: "", editora: "", ano: "", url: "", notas: "", book_id: null as string | null };

function Referencias({ projetoId, refs, setRefs }: { projetoId: string; refs: Referencia[]; setRefs: React.Dispatch<React.SetStateAction<Referencia[]>> }) {
  const [form, setForm] = useState<typeof REF0 & { id?: string }>({ ...REF0 });
  const [livros, setLivros] = useState<LivroLite[]>([]);
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    void todas<LivroLite>((de, ate) => supabase().from("books").select("id,title,author").order("author").order("id").range(de, ate)).then(setLivros).catch(() => {});
  }, []);
  const set = (x: Partial<typeof form>) => setForm((f) => ({ ...f, ...x }));

  async function salvar() {
    if (!form.titulo.trim() && !form.autor.trim()) return;
    const sb = supabase();
    const rid = form.id;
    const dados = Object.fromEntries((Object.keys(REF0) as (keyof typeof REF0)[]).map((k) => [k, form[k]])) as typeof REF0;
    if (rid) {
      await sb.from("escrita_referencias").update(dados).eq("id", rid);
      setRefs((rs) => rs.map((r) => (r.id === rid ? { ...r, ...dados } : r)));
    } else {
      const { data } = await sb.from("escrita_referencias").insert({ ...dados, projeto_id: projetoId }).select().single();
      if (data) setRefs((rs) => [...rs, data as Referencia]);
    }
    setForm({ ...REF0 });
    setAberto(false);
  }
  async function apagar(r: Referencia) {
    if (!confirm(`Apagar a referência “${r.titulo || r.autor}”?`)) return;
    await supabase().from("escrita_referencias").delete().eq("id", r.id);
    setRefs((rs) => rs.filter((x) => x.id !== r.id));
  }

  const campo = (k: keyof typeof REF0, label: string, ph = "", cls = "") => (
    <label className={`block ${cls}`}><span className="label">{label}</span>
      <input className="input mt-1" placeholder={ph} value={String(form[k] ?? "")} onChange={(e) => set({ [k]: e.target.value } as Partial<typeof form>)} /></label>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-5">
        <div className="flex items-center gap-2">
          <div className="mr-auto">
            <h2 className="text-lg">Referências</h2>
            <p className="text-xs text-muted">Formatadas no padrão ABNT. Entram no fim do texto, ao exportar e imprimir.</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setForm({ ...REF0 }); setAberto(true); }}><Plus size={15} /> Referência</button>
        </div>

        {aberto && (
          <div className="card p-5 space-y-3">
            {livros.length > 0 && !form.id && (
              <label className="block"><span className="label">Da Biblioteca (opcional)</span>
                <select className="input mt-1" value={form.book_id ?? ""} onChange={(e) => {
                  const l = livros.find((x) => x.id === e.target.value);
                  set(l ? { book_id: l.id, titulo: l.title, autor: l.author ?? "" } : { book_id: null });
                }}>
                  <option value="">Escolher um livro da sua biblioteca…</option>
                  {livros.map((l) => <option key={l.id} value={l.id}>{l.author ? `${l.author} — ` : ""}{l.title}</option>)}
                </select></label>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {campo("autor", "Autor(es)", "Sobrenome, Nome; Sobrenome, Nome", "sm:col-span-2")}
              {campo("titulo", "Título")}
              {campo("subtitulo", "Subtítulo")}
              {campo("edicao", "Edição", "ex.: 2")}
              {campo("ano", "Ano", "ex.: 2015")}
              {campo("local", "Local", "ex.: São Paulo")}
              {campo("editora", "Editora")}
              {campo("url", "Link (se for on-line)", "", "sm:col-span-2")}
            </div>
            <label className="block"><span className="label">Anotações (só para você)</span>
              <textarea className="input mt-1 min-h-[70px]" value={form.notas} onChange={(e) => set({ notas: e.target.value })} /></label>
            {(form.titulo || form.autor) && (
              <p className="text-sm text-muted">Fica assim: <span className="text-ink" dangerouslySetInnerHTML={{ __html: paragrafosHtml(abnt({ ...form, id: "", projeto_id: "" } as Referencia))[0] ?? "" }} /></p>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setAberto(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar}>Salvar</button>
            </div>
          </div>
        )}

        {!refs.length && !aberto && <div className="card p-8 text-center text-sm text-muted">Nenhuma referência ainda.</div>}
        <ul className="space-y-2">
          {ordenarReferencias(refs).map((r) => (
            <li key={r.id} className="card p-4 group flex gap-3">
              <div className="flex-1 min-w-0 text-[15px] leading-relaxed" style={{ fontFamily: FONTS.times.css }}>
                <p dangerouslySetInnerHTML={{ __html: paragrafosHtml(abnt(r))[0] ?? "" }} />
                {r.notas && <p className="mt-1 text-sm text-muted whitespace-pre-wrap font-sans">{r.notas}</p>}
              </div>
              <div className="flex items-start gap-0.5 text-faint opacity-0 group-hover:opacity-100">
                <button className="p-1 hover:text-ink" title="Editar" onClick={() => { setForm({ ...REF0, ...r }); setAberto(true); }}><Pencil size={14} /></button>
                <button className="p-1 hover:text-critical" title="Apagar" onClick={() => apagar(r)}><Trash2 size={14} /></button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
