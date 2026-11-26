"use client";
/**
 * MAR (imersão) dentro de Idiomas: a sua lista de inglês de verdade — séries, filmes, canais e podcasts —
 * e o TEMPO que ela vira. Este componente é o orquestrador:
 * - carrega os títulos do idioma e o livro-caixa (mar_log); rebusca ao voltar para a aba e quando o Timer grava;
 * - mostra os 3 números de tempo (Hoje, Média por dia, No MAR), as abas, a faixa de 15 s e a lista;
 * - fala com o banco (mar_registrar / mar_desfazer): nada é otimista na posição — o cartão troca pelo
 *   título que o banco devolveu.
 * O tempo vem sempre das sessões (sessoesMar, a fonte única); o livro-caixa só diz o que cada pedaço foi.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ListChecks, Plus, Timer as Relogio } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { addDays, dayKey, nf } from "@/lib/dates";
import type { Periodo } from "@/lib/periodo";
import {
  COLUNAS_LOG, COR_MAR, MAR_LIMITES, desfazer as desfazerNoBanco, desfazerPedeConfirmacao, duracao, indicadores, lerMinutos,
  lerTemporadas, normalizarTitulo, proximo, proximos, registrar, textoConfirmarDesfazer, textoDesfeito, textoFaixa,
  textoPergunta, candidataPergunta, ultimaAcao, vincularSessao,
  type Acao, type Faixa, type OpcoesRegistrar, type Pergunta, type Registro, type RespostaMar, type SessaoIdioma, type Situacao,
  type TipoMar, type Titulo,
} from "@/lib/mar";
import { describe, useTimerEstado } from "./timer-context";
import { MarCartao, NIVEIS, Pop, TIPOS, type AcoesCartao } from "./mar-cartao";
import { MarEditor } from "./mar-editor";
import { MarRegistros } from "./mar-registros";
import { CardHead } from "./page";
import { PLATAFORMAS, PlataformaIcone, plataformaDe } from "./plataforma";
import { Variacao } from "./variacao";

/** Sessão no formato da página (para o patch de onTempo). */
export type SessaoPatch = SessaoIdioma;
export interface PatchTempo { add?: SessaoPatch[]; remove?: string[]; recarregar?: boolean }

const ABAS: { id: Situacao; nome: string; vazio: string }[] = [
  { id: "assistindo", nome: "Assistindo", vazio: "Nada em andamento. Escolha algo em “Quero ver” e toque em Começar." },
  { id: "quero", nome: "Quero ver", vazio: "A fila está vazia. Use “+ Adicionar”." },
  { id: "visto", nome: "Vistos", vazio: "O que você terminar vem para cá." },
];

// ─── lembranças deste aparelho (localStorage, sempre com try) ───
const lerLocal = <T,>(k: string, padrao: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : padrao; } catch { return padrao; } };
const gravarLocal = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
/** "Não" da pergunta do Timer: lembrado por 2 dias (chave da sessão ou do Timer). */
const NAO = "mar-pergunta-nao";
/** sobras do Timer descartadas no ✕ do chip (id da corrida) */
const DESCARTADAS = "mar-sobra-descartada";
/** o último "+ min" de cada vídeo/podcast/livro */
const MIN_ULTIMO = "mar-min-ultimo";

interface EstadoFaixa extends Faixa {
  id: number;
  /** o título antes da ação (para desfazer / somar mesmo) */
  t?: Titulo;
  /** a ação que gerou a faixa (para "Somar mesmo" e "Tentar de novo") */
  acao?: Acao;
  opts?: OpcoesRegistrar;
  /** segundos que a ação pôs (para a confirmação do desfazer) */
  seg?: number;
  ref?: string;
  chave?: string;
}

interface PerguntaPendente { tituloId: string; p: Pergunta; acao: Acao; opts: OpcoesRegistrar; seg: number; em: number }

export function MarPainel({
  idioma, periodo, className = "", sessoesMar, sessoesIdioma, meta, inicio, onTempo, onConfigurar,
}: {
  idioma: string; periodo: Periodo; className?: string;
  /** numa coluna da página (as três listas viram abas) — hoje é o único jeito */
  compacto?: boolean;
  /** as sessões do idioma que são MAR (ehMar), de todo o histórico: a fonte única do tempo */
  sessoesMar: SessaoIdioma[];
  /** todas as sessões do idioma (para a pergunta sobre o Timer) */
  sessoesIdioma: SessaoIdioma[];
  /** minutos por dia (0 = sem meta) */
  meta: number;
  /** languages.mar_inicio (aaaa-mm-dd) ou null */
  inicio: string | null;
  /** o tempo mudou: a página aplica o patch e recarrega as sessões */
  onTempo: (patch: PatchTempo) => void;
  /** abre "Configurar" do idioma (meta e começo do MAR) */
  onConfigurar?: () => void;
}) {
  const timer = useTimerEstado();
  const [lista, setLista] = useState<Titulo[] | null>(null);
  const [log, setLog] = useState<Registro[]>([]);
  const [aba, setAba] = useState<Situacao | null>(null);
  const [ocupados, setOcupados] = useState<Set<string>>(() => new Set());
  const [faixa, setFaixa] = useState<EstadoFaixa | null>(null);
  const [pergunta, setPergunta] = useState<PerguntaPendente | null>(null);
  const [editando, setEditando] = useState<Titulo | null>(null);
  const [registros, setRegistros] = useState(false);
  const [adicionar, setAdicionar] = useState<HTMLElement | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null);
  const [dispensadas, setDispensadas] = useState<Record<string, number>>({});
  const [descartadas, setDescartadas] = useState<string[]>([]);
  const [minUltimo, setMinUltimo] = useState<Record<string, number>>({});
  const montado = useRef(true);
  // (no modo estrito do React o efeito roda duas vezes: liga de novo na volta)
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

  // lembranças do aparelho
  useEffect(() => {
    const agora = Date.now();
    const nao = Object.fromEntries(Object.entries(lerLocal<Record<string, number>>(NAO, {})).filter(([, ate]) => ate > agora));
    setDispensadas(nao);
    setDescartadas(lerLocal<string[]>(DESCARTADAS, []).slice(-50));
    setMinUltimo(lerLocal<Record<string, number>>(MIN_ULTIMO, {}));
  }, []);

  // ─── carregar ───
  const hoje = dayKey();
  const desde = useMemo(() => {
    const h30 = dayKey(addDays(new Date(), -30));
    return [periodo.antDe, periodo.de, h30].sort()[0];
  }, [periodo.antDe, periodo.de]);

  const carregarTitulos = useCallback(async () => {
    const { data } = await supabase().from("mar_titulos").select("*").eq("idioma", idioma).order("posicao").order("created_at");
    if (montado.current && data) setLista((data as Titulo[]).map((x) => normalizarTitulo(x)));
  }, [idioma]);
  const carregarLog = useCallback(async () => {
    const { data } = await supabase().from("mar_log").select(`${COLUNAS_LOG},depois`).gte("dia", desde).order("created_at");
    if (montado.current && data) setLog(data as Registro[]);
  }, [desde]);
  const recarregar = useCallback(() => { void carregarTitulos(); void carregarLog(); }, [carregarTitulos, carregarLog]);

  useEffect(() => { setLista(null); void carregarTitulos(); }, [carregarTitulos]);
  useEffect(() => { void carregarLog(); }, [carregarLog]);
  // outro aparelho pode ter marcado: rebusca ao voltar para a aba
  useEffect(() => {
    const ver = () => { if (document.visibilityState === "visible") recarregar(); };
    document.addEventListener("visibilitychange", ver);
    return () => document.removeEventListener("visibilitychange", ver);
  }, [recarregar]);
  // o Timer gravou (pode ser uma corrida do MAR): rebusca
  const ultimoSalvo = useRef(timer.lastSaved);
  useEffect(() => {
    if (timer.lastSaved === ultimoSalvo.current) return;
    ultimoSalvo.current = timer.lastSaved;
    recarregar();
  }, [timer.lastSaved, recarregar]);

  // ─── derivados ───
  const ids = useMemo(() => new Set((lista ?? []).map((t) => t.id)), [lista]);
  const meuLog = useMemo(() => log.filter((l) => ids.has(l.titulo_id)), [log, ids]);
  const col = useMemo(() => {
    const l = lista ?? [];
    return {
      assistindo: l.filter((t) => t.situacao === "assistindo"),
      // do mais fácil ao mais difícil
      quero: l.filter((t) => t.situacao === "quero").sort((a, b) => a.nivel - b.nivel || a.posicao - b.posicao),
      visto: l.filter((t) => t.situacao === "visto").sort((a, b) => (b.visto_em ?? "").localeCompare(a.visto_em ?? "")),
    };
  }, [lista]);
  const atual: Situacao = aba ?? (lista && !col.assistindo.length && col.quero.length ? "quero" : "assistindo");

  const ind = useMemo(() => indicadores(sessoesMar, periodo, meta, inicio, hoje), [sessoesMar, periodo, meta, inicio, hoje]);

  // tempo de cada título (hoje e no total) e a parte que veio do Timer no período
  const porTitulo = useMemo(() => {
    const m = new Map<string, { hoje: number; total: number }>();
    for (const s of sessoesMar) {
      if (!s.mar_titulo_id) continue;
      const x = m.get(s.mar_titulo_id) ?? { hoje: 0, total: 0 };
      x.total += s.seconds;
      if (s.day === hoje) x.hoje += s.seconds;
      m.set(s.mar_titulo_id, x);
    }
    return m;
  }, [sessoesMar, hoje]);
  const doPeriodo = useMemo(() => {
    const sessTimer = new Set(meuLog.filter((l) => l.tipo === "timer" && l.sessao_id).map((l) => l.sessao_id!));
    let timerSeg = 0, marcado = 0;
    for (const s of sessoesMar) {
      if (s.day < periodo.de || s.day > periodo.ate) continue;
      if (sessTimer.has(s.id)) timerSeg += s.seconds; else marcado += s.seconds;
    }
    const eps = meuLog.filter((l) => l.tipo === "ep" && l.dia >= periodo.de && l.dia <= periodo.ate).reduce((a, l) => a + (l.episodios ?? 0), 0);
    const vistos = (lista ?? []).filter((t) => t.visto_em && dayKey(new Date(t.visto_em)) >= periodo.de && dayKey(new Date(t.visto_em)) <= periodo.ate).length;
    return { timerSeg, marcado, eps, vistos };
  }, [meuLog, sessoesMar, periodo.de, periodo.ate, lista]);

  // sobras do Timer (tempo medido que ainda não virou episódio), por título
  const sobras = useMemo(() => {
    const agora = Date.now();
    const m = new Map<string, { seg: number; ids: string[]; descartada: boolean }>();
    for (const l of meuLog) {
      if (l.tipo !== "timer" || !l.sessao_id || !(Number(l.sobra_seg) > 0) || !l.sobra_ate || Date.parse(l.sobra_ate) < agora) continue;
      const x = m.get(l.titulo_id) ?? { seg: 0, ids: [], descartada: false };
      if (descartadas.includes(l.id)) x.descartada = true; else x.seg += Number(l.sobra_seg);
      x.ids.push(l.id);
      m.set(l.titulo_id, x);
    }
    return m;
  }, [meuLog, descartadas]);

  const emUso = [...col.assistindo, ...col.visto];
  const semBoia = emUso.length ? Math.round((emUso.filter((t) => t.legenda === "sem").length / emUso.length) * 100) : null;

  // o Timer está ligado a um título daqui?
  const st = timer.ver();
  const tituloNoTimer = st.marTituloId && ids.has(st.marTituloId) ? st.marTituloId : "";
  const contando = !!tituloNoTimer && timer.running && timer.phase === "foco";

  // ─── faixa (15 s) ───
  const faixaN = useRef(0);
  const mostrar = useCallback((f: Omit<EstadoFaixa, "id">) => { faixaN.current++; setFaixa({ ...f, id: faixaN.current }); }, []);
  useEffect(() => {
    if (!faixa) return;
    const id = faixa.id;
    const x = setTimeout(() => setFaixa((f) => (f?.id === id ? null : f)), MAR_LIMITES.faixaMs);
    return () => clearTimeout(x);
  }, [faixa]);

  // ─── banco ───
  const ocupar = (id: string, sim: boolean) => setOcupados((s) => { const n = new Set(s); if (sim) n.add(id); else n.delete(id); return n; });
  const trocar = (novo: Titulo) => setLista((l) => l?.map((x) => (x.id === novo.id ? novo : x)) ?? null);

  /** Manda a ação ao banco, troca o título pelo que voltou, mostra a faixa e avisa a página. */
  const executar = useCallback(async (t: Titulo, acao: Acao, opts: OpcoesRegistrar = {}, ligouAgora = false) => {
    // (ligouAgora: "Sim, é do MAR" acabou de ligar o Timer; o estado dele ainda não chegou ao ver())
    const noTimer = (ligouAgora || timer.ver().marTituloId === t.id) && acao !== "ajuste";
    ocupar(t.id, true);
    const r: RespostaMar = await registrar(t, acao, opts);
    ocupar(t.id, false);
    if (!montado.current) return r;
    if (r.ok) trocar(r.titulo);
    const f = textoFaixa(r, t);
    if (r.ok && !r.conflito && noTimer && !opts.semTimer) {
      // o Timer está ligado a este título: ele conta o maior entre o medido e a minutagem
      f.texto = `✓ ${t.titulo}${r.ref && !r.ref.startsWith("+") ? ` ${r.ref}` : ""} · conta no Timer`;
      f.somarMesmo = false;
    }
    if (r.ok && !r.conflito && r.repetido) f.texto = f.texto.replace(/^✓/, "✓ (já estava salvo)");
    mostrar({
      ...f, t, acao, opts: { ...opts, chave: undefined },
      ...(r.ok && !r.conflito ? { seg: r.segundos + r.coberto, ref: r.ref } : {}),
      ...(!r.ok ? { chave: r.chave } : {}),
    });
    if (r.ok) {
      void carregarLog();
      const add: SessaoIdioma[] = !r.conflito && r.sessao && r.segundos > 0 && !r.repetido
        ? [{ id: r.sessao, day: r.dia, started_at: r.inicio, seconds: r.segundos, label: `MAR · ${t.titulo}`, language: idioma, mar_titulo_id: t.id }]
        : [];
      onTempo({ add, recarregar: true });
    }
    return r;
  }, [timer, idioma, onTempo, carregarLog, mostrar]);

  /** Desfaz a última ação do título (com confirmação de 60 min para cima). */
  const desfazerTitulo = useCallback(async (t: Titulo, info?: { seg: number; ref: string; acao?: Acao }) => {
    const ult = ultimaAcao(meuLog, t.id);
    const reg: Registro | null = info
      ? { id: "", titulo_id: t.id, dia: "", tipo: info.acao ?? "ep", episodios: 0, segundos: info.seg, credito: [], ref: info.ref, created_at: "", sessao_id: null }
      : ult;
    if (reg && desfazerPedeConfirmacao(reg) && !confirm(textoConfirmarDesfazer(t, reg))) return false;
    ocupar(t.id, true);
    const r = await desfazerNoBanco(t);
    ocupar(t.id, false);
    if (!montado.current) return false;
    if (!r.ok) { mostrar({ texto: r.msg, tom: "erro", desfazer: false, somarMesmo: false, tentar: false }); return false; }
    trocar(r.titulo);
    mostrar({ texto: textoDesfeito(r), tom: "ok", desfazer: false, somarMesmo: false, tentar: false });
    void carregarLog();
    onTempo({ remove: ult?.sessao_id ? [ult.sessao_id] : [], recarregar: true });
    return true;
  }, [meuLog, mostrar, carregarLog, onTempo]);

  // ─── a pergunta única (Timer de Idiomas sem vínculo) ───
  // (depois de "Continuar", a parte do foco já salva é outra sessão: a pergunta fala só do trecho novo)
  const timerParaPergunta = () => {
    const s = timer.ver();
    const segundos = Math.max(0, s.elapsed + (s.running && s.startedAt ? (Date.now() - s.startedAt) / 1000 : 0) - s.salvo);
    return { category: s.category, language: s.language, label: s.label, marTituloId: s.marTituloId, phase: s.phase, segundos, rotulo: describe(s) };
  };
  /**
   * As sessões que ESTE foco já salvou (Continuar): do idioma, sem título, com o mesmo rótulo do Timer, começadas
   * depois do começo do foco. "Sim, é do MAR" as vincula antes de ligar o Timer (senão contariam em dobro).
   */
  const salvasDoFoco = (): SessaoIdioma[] => {
    const s = timer.ver();
    if (!(s.salvo > 0)) return [];
    const agora = Date.now();
    const comeco = agora - (s.elapsed + (s.running && s.startedAt ? (agora - s.startedAt) / 1000 : 0)) * 1000;
    const rotulo = describe(s);
    return sessoesIdioma.filter((x) => x.language === idioma && !x.mar_titulo_id && x.label === rotulo && !!x.started_at
      && Date.parse(x.started_at) >= comeco - 120e3 && Date.parse(x.started_at) <= agora);
  };
  const segDaAcao = (t: Titulo, acao: Acao, opts: OpcoesRegistrar) => {
    if (acao === "min") return (opts.valor ?? 0) * 60;
    if (acao === "parcial") return Math.max(0, (opts.valor ?? 0) * 60 - (t.parcial_seg ?? 0));
    if (t.tipo === "serie") return (opts.valor && opts.valor > 1 ? proximos(t, opts.valor)?.seg : proximo(t)?.seg) ?? 0;
    return proximo(t)?.seg ?? 0;
  };

  /** Marcar tempo: antes, se for o caso, pergunta sobre o Timer. */
  const marcar = useCallback((t: Titulo, acao: Acao, opts: OpcoesRegistrar = {}) => {
    const sobra = sobras.get(t.id);
    // a sobra foi descartada (✕): a marcação vai com "Somar mesmo"
    const o: OpcoesRegistrar = sobra?.descartada && !sobra.seg ? { ...opts, semTimer: true } : opts;
    if (!o.ontem && !o.semTimer && timer.ver().marTituloId !== t.id) {
      const p = candidataPergunta(sessoesIdioma, idioma, Date.now(), Object.keys(dispensadas), timerParaPergunta());
      if (p) { setPergunta({ tituloId: t.id, p, acao, opts: o, seg: segDaAcao(t, acao, o), em: Date.now() }); return; }
    }
    setPergunta(null);
    void executar(t, acao, o);
  }, [sobras, sessoesIdioma, idioma, dispensadas, executar]); // eslint-disable-line react-hooks/exhaustive-deps

  const responder = useCallback(async (sim: boolean) => {
    const q = pergunta;
    if (!q) return;
    const t = (lista ?? []).find((x) => x.id === q.tituloId);
    setPergunta(null);
    if (!t) return;
    if (!sim) {
      const nova = { ...dispensadas, [q.p.chave]: Date.now() + 2 * 864e5 };
      setDispensadas(nova); gravarLocal(NAO, nova);
      void executar(t, q.acao, { ...q.opts, semTimer: true });
      return;
    }
    // a pergunta pode estar velha (o Timer parou, trocou de categoria ou salvou): confere de novo na hora
    const agora = candidataPergunta(sessoesIdioma, idioma, Date.now(), Object.keys(dispensadas), timerParaPergunta());
    if (agora?.chave !== q.p.chave) {
      if (q.p.tipo === "rodando" && !agora && timer.lastSaved >= q.em) {
        // o Timer acabou de salvar e a sessão ainda não chegou à tela: não somar às cegas
        mostrar({ texto: "O Timer acabou de salvar. Marque de novo para escolher.", tom: "aviso", desfazer: false, somarMesmo: false, tentar: false });
        return;
      }
      marcar(t, q.acao, q.opts);
      return;
    }
    if (q.p.tipo === "rodando") {
      // a parte deste foco que já foi salva (Continuar) vira MAR primeiro; o Timer liga só no trecho novo
      const salvas = salvasDoFoco();
      let vinculadas = salvas.length > 0;
      if (salvas.length) {
        ocupar(t.id, true);
        for (const x of salvas) {
          const v = await vincularSessao(x.id, t);
          if (!v.ok) { vinculadas = false; break; }
        }
        ocupar(t.id, false);
        onTempo({ recarregar: true });
      }
      // o Timer que está contando passa a ser deste título (desde o começo deste foco, ou do trecho novo)
      timer.ligarMar({ id: t.id, titulo: t.titulo }, { salvoVinculado: vinculadas });
      void executar(t, q.acao, q.opts, true);
      return;
    }
    // a sessão já salva vira uma corrida deste título; a marcação usa esse tempo
    ocupar(t.id, true);
    const v = await vincularSessao(q.p.sessaoId, t);
    ocupar(t.id, false);
    if (!v.ok) { mostrar({ texto: v.msg, tom: "erro", desfazer: false, somarMesmo: false, tentar: false }); return; }
    onTempo({ recarregar: true });
    void executar(t, q.acao, q.opts);
  }, [pergunta, lista, dispensadas, executar, timer, mostrar, onTempo, sessoesIdioma, idioma, marcar]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── outras ações dos cartões ───
  const mudar = useCallback(async (t: Titulo, campos: Partial<Titulo>) => {
    // nível, boia, tipo e duração (não são do livro-caixa): aplica já e volta se o banco recusar
    trocar({ ...t, ...campos });
    const { data, error } = await supabase().from("mar_titulos").update(campos).eq("id", t.id).select().single();
    if (error) { trocar(t); alert(`Não salvou (${error.message}). Nada mudou.`); return; }
    if (data) trocar(normalizarTitulo({ ...t, ...campos, ...(data as Partial<Titulo>), id: t.id }));
  }, []);

  const apagar = useCallback(async (t: Titulo) => {
    const tempo = porTitulo.get(t.id)?.total ?? 0;
    if (!confirm(`Tirar “${t.titulo}” da lista?${tempo > 0 ? ` O tempo já contado (${duracao(tempo)}) continua no histórico.` : ""}`)) return;
    ocupar(t.id, true);
    const { error } = await supabase().from("mar_titulos").delete().eq("id", t.id);
    ocupar(t.id, false);
    if (error) { alert(`Não consegui tirar (${error.message}).`); return; }
    setLista((l) => l?.filter((x) => x.id !== t.id) ?? null);
  }, [porTitulo]);

  const acoes: AcoesCartao = useMemo(() => ({
    marcar,
    ajustar: (t, opts) => { setPergunta(null); void executar(t, "ajuste", opts); },
    desfazer: (t) => void desfazerTitulo(t),
    mudar: (t, campos) => void mudar(t, campos),
    editar: (t) => setEditando(t),
    apagar: (t) => void apagar(t),
    comecar: async (t) => {
      const r = await executar(t, "ajuste", { situacao: "assistindo" });
      if (r.ok && !r.conflito) {
        setAba("assistindo");
        setDestaque(t.id);
        setTimeout(() => setDestaque((d) => (d === t.id ? null : d)), 2500);
      }
    },
    responder: (sim) => void responder(sim),
    descartarSobra: (t) => {
      const x = sobras.get(t.id);
      if (!x) return;
      const nova = [...new Set([...descartadas, ...x.ids])].slice(-50);
      setDescartadas(nova); gravarLocal(DESCARTADAS, nova);
    },
    lembrarMin: (t, min) => { const n = { ...minUltimo, [t.id]: min }; setMinUltimo(n); gravarLocal(MIN_ULTIMO, n); },
  }), [marcar, executar, desfazerTitulo, mudar, apagar, responder, sobras, descartadas, minUltimo]);

  // ─── faixa: botões ───
  const faixaDesfazer = async () => {
    const f = faixa;
    if (!f?.t) return;
    const t = (lista ?? []).find((x) => x.id === f.t!.id) ?? f.t;
    await desfazerTitulo(t, f.seg !== undefined ? { seg: f.seg, ref: f.ref ?? "", acao: f.acao } : undefined);
  };
  const faixaSomarMesmo = async () => {
    const f = faixa;
    if (!f?.t || !f.acao) return;
    const t = (lista ?? []).find((x) => x.id === f.t!.id) ?? f.t;
    setFaixa(null);
    ocupar(t.id, true);
    const r = await desfazerNoBanco(t);
    ocupar(t.id, false);
    if (!r.ok) { mostrar({ texto: r.msg, tom: "erro", desfazer: false, somarMesmo: false, tentar: false }); return; }
    void executar(r.titulo, f.acao, { ...f.opts, semTimer: true });
  };
  const faixaTentar = () => {
    const f = faixa;
    if (!f?.t || !f.acao) return;
    const t = (lista ?? []).find((x) => x.id === f.t!.id) ?? f.t;
    setFaixa(null);
    void executar(t, f.acao, { ...f.opts, chave: f.chave });
  };

  const tituloAberto = (lista ?? []).find((x) => x.id === pergunta?.tituloId);
  const textoDaPergunta = pergunta && tituloAberto ? textoPergunta(pergunta.p, pergunta.seg) : null;
  const metaTxt = meta > 0 ? `meta ${duracao(meta * 60)}/dia` : "sem meta";
  const diasTxt = ind.metaSeg > 0 && ind.diasP > 1 ? `meta em ${ind.diasNaMeta} de ${ind.diasP} dias` : `${ind.diasComMar} ${ind.diasComMar === 1 ? "dia" : "dias"} com MAR`;
  // o que era a célula do período (marcado × Timer, episódios, terminados, anterior) fica no title da Média
  const detalheMedia = `Média por dia: ${duracao(ind.mediaP)}. ${ind.resumo}. ${periodo.nome}: ${duracao(ind.totalP)} de MAR — marcado ${duracao(doPeriodo.marcado)} · Timer ${duracao(doPeriodo.timerSeg)}. ${nf.format(doPeriodo.eps)} ${doPeriodo.eps === 1 ? "episódio" : "episódios"}${doPeriodo.vistos ? `, ${doPeriodo.vistos} ${doPeriodo.vistos === 1 ? "título terminado" : "títulos terminados"}` : ""}. Período anterior: ${duracao(ind.totalA)}.`;

  return (
    <section id="mar" className={`card p-4 min-w-0 flex flex-col xl:h-full min-h-0 ${className}`}>
      {/* 1) cabeçalho: o mesmo de todos os cartões; a meta abre Configurar */}
      <CardHead className="shrink-0" titulo="MAR"
        meta={<>
          <span title={`${idioma} de verdade — séries, filmes, canais e podcasts. Do mais fácil, com boia, ao sem boia.`}>{idioma.toLowerCase()} de verdade</span>
          {" · "}
          {onConfigurar
            ? <button type="button" className="hover:text-ink underline-offset-2 hover:underline" title="Mudar a meta por dia (Configurar)" onClick={onConfigurar}>{metaTxt}</button>
            : metaTxt}
        </>}
        acao={
          <button type="button" className="btn py-2 sm:py-1 px-2.5 text-[13px]" aria-expanded={!!adicionar}
            onClick={(e) => setAdicionar(adicionar ? null : e.currentTarget)}>
            <Plus size={14} /> Adicionar
          </button>
        } />

      {/* 2) três números na mesma régua: hoje × meta, a média por dia e o total rumo às 1.000 h.
          Cada célula: rótulo, número, uma faixa de altura fixa (as dicas ficam na mesma linha) e a dica.
          No celular, Hoje ocupa a linha e as outras duas fecham em par, como na <Faixa> */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-line border border-line rounded-lg overflow-hidden shrink-0">
        {/* (flex-col: o botão centraliza o conteúdo na altura; assim ele começa no topo, como nas outras células) */}
        <button type="button" onClick={() => setRegistros(true)} title="MAR de hoje. O Mairo recomenda no mínimo 1 h por dia. (Toque para ver os registros.)"
          className={`${CELULA} col-span-2 sm:col-span-1 flex flex-col text-left hover:bg-surface-2 transition-colors`}>
          <Rotulo>Hoje</Rotulo>
          <Valor>{duracao(ind.hoje)}</Valor>
          <Trilho>
            <div className="w-full h-1 rounded-full overflow-hidden bg-line">
              <div className="h-full rounded-full" style={{ width: `${ind.metaSeg ? Math.min(100, (ind.hoje / ind.metaSeg) * 100) : 0}%`, background: COR_MAR }} />
            </div>
          </Trilho>
          <Dica>
            {contando ? <span style={{ color: COR_MAR }}><Relogio size={10} className="inline -mt-px" /> contando · </span> : null}
            <span style={ind.naMetaHoje ? { color: "var(--good)" } : undefined}>{ind.dicaHoje}</span>
          </Dica>
        </button>

        <div className={CELULA} title={detalheMedia} aria-label={detalheMedia}>
          <Rotulo>Média por dia</Rotulo>
          <Valor>{duracao(ind.mediaP)}</Valor>
          <Trilho><Barrinhas ind={ind} /></Trilho>
          {/* duas linhas fixas: o total com a comparação, e os dias (na meta ou com MAR) */}
          <div className="ind-nota mt-1.5 leading-snug min-w-0">
            <div className="truncate">
              total {duracao(ind.totalP)}
              {ind.totalA > 0 && <> · <Variacao atual={ind.totalP} base={ind.totalA} /></>}
            </div>
            <div className="truncate">{diasTxt}</div>
          </div>
        </div>

        <div className={CELULA} title={`${ind.tituloTotal} (${ind.dicaTotal})`}>
          <Rotulo>No MAR</Rotulo>
          <Valor>{duracao(ind.total)}</Valor>
          <Trilho>
            <div className="w-full h-1 rounded-full overflow-hidden bg-line">
              <div className="h-full rounded-full" style={{ width: ind.total > 0 ? `max(4px, ${ind.fracTotal * 100}%)` : 0, background: COR_MAR }} />
            </div>
          </Trilho>
          <Dica>{ind.dicaTotal}</Dica>
        </div>
      </div>

      {/* 3) abas · sem boia, Registros — ou a faixa de 15 s no mesmo lugar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3 shrink-0">
        <div className="inline-flex rounded-lg bg-surface-2 p-0.5 text-[13px]" role="tablist" aria-label="Listas do MAR">
          {ABAS.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={x.id === atual} onClick={() => setAba(x.id)}
              className={`px-2.5 py-2 sm:py-1 min-h-9 sm:min-h-0 rounded-md whitespace-nowrap ${x.id === atual ? "bg-seg shadow-sm font-medium" : "text-muted hover:text-ink"}`}>
              {x.nome} <span className="tabular-nums text-muted font-normal">{col[x.id].length}</span>
            </button>
          ))}
        </div>
        <div className="w-full sm:w-auto sm:flex-1 min-w-0 flex items-center justify-end gap-x-3 min-h-7">
          {faixa ? (
            <FaixaMar f={faixa} ocupado={!!faixa.t && ocupados.has(faixa.t.id)} onDesfazer={() => void faixaDesfazer()}
              onSomarMesmo={() => void faixaSomarMesmo()} onTentar={faixaTentar} onFechar={() => setFaixa(null)} />
          ) : (
            <div className="flex items-center gap-x-3 text-xs text-muted min-w-0">
              {semBoia !== null && (
                <span className="whitespace-nowrap shrink-0" title="Do que você assiste e já viu, quanto é sem legenda. Com boia = com legenda em inglês; o objetivo, com o tempo, é tirar a boia.">
                  sem boia <b className="font-medium text-ink tabular-nums">{semBoia}%</b>
                </span>
              )}
              <button type="button" className="btn btn-ghost py-2 sm:py-1 px-2 text-xs shrink-0 min-h-9 sm:min-h-0" onClick={() => setRegistros(true)} title="O que contou em cada dia (últimos 30 dias)">
                <ListChecks size={14} /> Registros
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4) a lista: rola por dentro no computador */}
      <div className="mt-2 xl:flex-1 xl:min-h-0 xl:overflow-y-auto -mx-1 px-1 pb-0.5">
        {lista === null ? <p className="text-sm text-muted py-2">Carregando…</p>
          : col[atual].length === 0 ? <p className="text-sm text-muted py-2">{lista.length === 0
            ? "Sua lista está vazia. Use “+ Adicionar” para pôr uma série, um filme, um canal ou um podcast."
            : atual === "assistindo" && col.quero.length === 0 ? ABAS.find((x) => x.id === "quero")!.vazio
            : ABAS.find((x) => x.id === atual)!.vazio}</p>
          : (
            <ul className="space-y-2">
              {col[atual].map((t) => (
                <MarCartao key={t.id} t={t} idioma={idioma} ocupado={ocupados.has(t.id)}
                  pergunta={pergunta?.tituloId === t.id ? textoDaPergunta : null}
                  sobraSeg={sobras.get(t.id)?.seg ?? 0} noTimer={tituloNoTimer === t.id}
                  hojeSeg={porTitulo.get(t.id)?.hoje ?? 0} totalSeg={porTitulo.get(t.id)?.total ?? 0}
                  ultima={ultimaAcao(meuLog, t.id)} destaque={destaque === t.id}
                  minUltimo={minUltimo[t.id] ?? t.min_ep ?? 15} acoes={acoes} />
              ))}
            </ul>
          )}
      </div>

      {adicionar && (
        <Pop ancora={adicionar} onFechar={() => setAdicionar(null)} titulo="Adicionar ao MAR" largura={380}>
          <FormAdicionar idioma={idioma} posicao={Math.max(0, ...(lista ?? []).map((x) => x.posicao)) + 1}
            onAdicionado={(t) => { setLista((l) => [...(l ?? []), t]); setAba(t.situacao); setAdicionar(null); }} />
        </Pop>
      )}
      {editando && typeof document !== "undefined" && createPortal(
        <MarEditor t={(lista ?? []).find((x) => x.id === editando.id) ?? editando} onFechar={() => setEditando(null)}
          onSalvo={(novo, ajuste) => {
            trocar(novo);
            setEditando(null);
            if (ajuste) {
              mostrar({ ...textoFaixa(ajuste, editando), t: editando, acao: "ajuste" });
              void carregarLog();
            }
          }} />,
        document.body,
      )}
      {registros && typeof document !== "undefined" && createPortal(
        <MarRegistros lista={lista ?? []} log={meuLog} sessoesMar={sessoesMar} metaMin={meta} ocupados={ocupados}
          onDesfazer={(t) => void desfazerTitulo(t)} onConfigurar={onConfigurar ? () => { setRegistros(false); onConfigurar(); } : undefined}
          onFechar={() => setRegistros(false)} />,
        document.body,
      )}
    </section>
  );
}

// ─── peças ───

/** As células dos três números: o fundo do cartão, separadas pelas linhas de 1px da grade. */
const CELULA = "bg-surface px-3 py-2 min-w-0";
const Rotulo = ({ children }: { children: React.ReactNode }) => <div className="ind-rotulo"><span className="truncate">{children}</span></div>;
const Valor = ({ children }: { children: React.ReactNode }) => <div className="mt-1.5 text-lg font-medium tracking-[-0.02em] tabular-nums leading-none truncate">{children}</div>;
/** A faixa visual (barra da meta, barrinhas, barra das 1.000 h): mesma altura nas três, encostada embaixo. */
const Trilho = ({ children }: { children: React.ReactNode }) => <div className="mt-1.5 h-[18px] flex items-end">{children}</div>;
/** Até duas linhas, nas três células (com a mesma altura de começo, as dicas ficam alinhadas). */
const Dica = ({ children }: { children: React.ReactNode }) => <div className="ind-nota mt-1.5 leading-snug line-clamp-2">{children}</div>;

/** As barrinhas da Média: uma por dia (ou semana, ou mês), com a linha tracejada da meta. */
function Barrinhas({ ind }: { ind: ReturnType<typeof indicadores> }) {
  const H = 18;
  const meta = ind.metaSeg;
  const topo = Math.max(meta, ...ind.barrinhas.map((b) => b.porDia), 1);
  return (
    <div className="relative w-full flex items-end gap-[2px]" style={{ height: H }} aria-hidden>
      {meta > 0 && <div className="absolute inset-x-0 border-t border-dashed pointer-events-none" style={{ bottom: (meta / topo) * H, borderColor: "var(--text)", opacity: 0.45 }} />}
      {ind.barrinhas.map((b) => (
        <div key={b.de} className="flex-1 min-w-0 h-full flex items-end" title={b.title}>
          {/* a barra fica na cor da série: clara abaixo da meta, cheia quando chega nela (sem o verde de situação) */}
          <div className="w-full rounded-[2px]" style={{
            height: b.porDia > 0 ? Math.max(2, (b.porDia / topo) * H) : 2,
            background: b.porDia <= 0 ? "var(--border)" : b.naMeta || meta <= 0 ? COR_MAR : `color-mix(in srgb, ${COR_MAR} 45%, transparent)`,
          }} />
        </div>
      ))}
    </div>
  );
}

/** A faixa de 15 s depois de cada ação: o que contou, e os botões Desfazer / Somar mesmo / Tentar de novo. */
function FaixaMar({ f, ocupado, onDesfazer, onSomarMesmo, onTentar, onFechar }: {
  f: EstadoFaixa; ocupado: boolean; onDesfazer: () => void; onSomarMesmo: () => void; onTentar: () => void; onFechar: () => void;
}) {
  const cor = f.tom === "erro" ? "var(--critical)" : f.tom === "aviso" ? "var(--warn)" : COR_MAR;
  const botao = "btn py-1 px-2.5 text-xs shrink-0 sm:py-0.5 min-h-9 sm:min-h-7";
  return (
    <div role="status" aria-live="polite" className="w-full sm:w-auto min-w-0 flex flex-wrap sm:flex-nowrap items-center justify-end gap-1.5 rounded-lg pl-2.5 pr-1 py-0.5"
      style={{ background: `color-mix(in srgb, ${cor} 12%, transparent)` }}>
      <span className="text-[13px] min-w-0 flex-1 sm:flex-initial truncate" title={f.texto} style={f.tom === "erro" ? { color: "var(--critical)" } : undefined}>{f.texto}</span>
      {f.tentar && <button type="button" className={`${botao} btn-primary`} disabled={ocupado} onClick={onTentar}>Tentar de novo</button>}
      {f.desfazer && <button type="button" className={botao} disabled={ocupado} onClick={onDesfazer}>Desfazer</button>}
      {f.somarMesmo && <button type="button" className={botao} disabled={ocupado} onClick={onSomarMesmo}
        title="Não usar o tempo do Timer: somar a minutagem inteira">Somar mesmo</button>}
      <button type="button" className="text-muted hover:text-ink px-1.5 text-base leading-none shrink-0" aria-label="Fechar o aviso" onClick={onFechar}>×</button>
    </div>
  );
}

/** "+ Adicionar": título, tipo, onde, nível e o que cada tipo precisa (episódios, duração, min por vez). */
function FormAdicionar({ idioma, posicao, onAdicionado }: { idioma: string; posicao: number; onAdicionado: (t: Titulo) => void }) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoMar>("serie");
  const [onde, setOnde] = useState("");
  const [nivel, setNivel] = useState<1 | 2 | 3>(1);
  const [eps, setEps] = useState("");
  const [minEp, setMinEp] = useState("22");
  const [dur, setDur] = useState("");
  const [porVez, setPorVez] = useState("15");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // (autoFocus não funciona: o Pop nasce invisível até se posicionar)
  const campoTitulo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const x = setTimeout(() => campoTitulo.current?.focus({ preventScroll: true }), 30);
    return () => clearTimeout(x);
  }, []);

  const durMin = lerMinutos(dur);
  const ok = !!titulo.trim() && (tipo !== "filme" || (!!durMin && durMin <= MAR_LIMITES.min));
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!ok || salvando) return;
    const min_ep = tipo === "serie" ? Math.max(1, Math.min(300, lerMinutos(minEp) ?? 22))
      : tipo === "filme" ? durMin!
      : Math.max(1, Math.min(300, lerMinutos(porVez) ?? 15));
    setSalvando(true); setErro(null);
    const { data, error } = await supabase().from("mar_titulos").insert({
      idioma, titulo: titulo.trim(), tipo, onde: onde.trim(), nivel, posicao, situacao: "quero", legenda: "en", progresso: "", nota: "",
      temporadas: tipo === "serie" ? lerTemporadas(eps) : [], ep_vistos: 0, min_ep,
    }).select().single();
    setSalvando(false);
    if (error || !data) return setErro(`Não salvou (${error?.message ?? "sem resposta"}).`);
    onAdicionado(normalizarTitulo(data as Titulo));
  }
  const campo = "space-y-1 block";
  return (
    <form onSubmit={salvar} className="space-y-3 text-sm">
      <label className={campo}>
        <span className="label block">Título</span>
        <input ref={campoTitulo} className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="ex.: Friends" />
      </label>
      <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label="Tipo">
        {TIPOS.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={tipo === x.id} onClick={() => setTipo(x.id)}
            className={`flex flex-col items-center gap-1 rounded-lg border py-2 text-xs ${tipo === x.id ? "border-transparent font-medium" : "border-line text-muted hover:text-ink"}`}
            style={tipo === x.id ? { background: `color-mix(in srgb, ${COR_MAR} 16%, transparent)`, color: "var(--text)" } : undefined}>
            <x.icone size={16} style={tipo === x.id ? { color: COR_MAR } : undefined} />{x.nome}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <label className={campo}>
          <span className="label block">Onde</span>
          <span className="relative flex items-center">
            {plataformaDe(onde) && <span className="absolute left-2.5 pointer-events-none"><PlataformaIcone onde={onde} tamanho={16} /></span>}
            <input className={`input ${plataformaDe(onde) ? "pl-9" : ""}`} list="mar-plataformas" value={onde} onChange={(e) => setOnde(e.target.value)} placeholder="Netflix, YouTube…" />
          </span>
          <datalist id="mar-plataformas">{PLATAFORMAS.map((p) => <option key={p.id} value={p.nome} />)}</datalist>
        </label>
        <label className={campo}>
          <span className="label block">Nível</span>
          <select className="input w-auto" value={nivel} onChange={(e) => setNivel(Number(e.target.value) as 1 | 2 | 3)}>
            {([1, 2, 3] as const).map((n) => <option key={n} value={n}>{NIVEIS[n]}</option>)}
          </select>
        </label>
      </div>
      {tipo === "serie" && (
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
          <label className={campo}>
            <span className="label block">Episódios por temporada</span>
            <input className="input" value={eps} onChange={(e) => setEps(e.target.value)} placeholder="10, 12, 8 ou 3x10" />
          </label>
          <label className={campo}>
            <span className="label block">Min/ep.</span>
            <input className="input text-right tabular-nums" inputMode="numeric" value={minEp} onChange={(e) => setMinEp(e.target.value)} />
          </label>
        </div>
      )}
      {tipo === "filme" && (
        <label className={campo}>
          <span className="label block">Duração (min ou 1h52)</span>
          <input className="input" inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} placeholder="ex.: 1h52" />
          {dur && !ok && titulo.trim() && <span className="text-xs text-critical">Não entendi. Use minutos (ex.: 112) ou 1h52.</span>}
        </label>
      )}
      {(tipo === "youtube" || tipo === "podcast" || tipo === "livro") && (
        <label className={campo}>
          <span className="label block">Minutos por vez (o botão “+” usa este valor)</span>
          <input className="input w-28 text-right tabular-nums" inputMode="numeric" value={porVez} onChange={(e) => setPorVez(e.target.value)} />
        </label>
      )}
      {erro && <p className="text-xs text-critical">{erro}</p>}
      <button className="btn btn-primary w-full justify-center py-2" disabled={!ok || salvando}>
        <Plus size={15} /> {salvando ? "Salvando…" : "Adicionar em “Quero ver”"}
      </button>
    </form>
  );
}
