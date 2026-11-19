"use client";
/**
 * MAR: o cartão de cada título (série, filme, vídeo/podcast/livro, Quero ver, Vistos).
 * - O botão principal diz o que vai contar ("+ E6 · 22 min"); fica ocupado durante o pedido; de 60 min para cima
 *   pede um 2º toque ("Confirmar 1 h 18", que só vale depois de 400 ms).
 * - ▾ abre as outras formas de marcar (vários episódios, "parei em", foi ontem, cronometrar); ⋯ tem o resto.
 * - Nada muda antes da resposta do banco: o painel troca o título pelo que o banco devolveu.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen, Check, ChevronDown, Clapperboard, LifeBuoy, ListPlus, Mic, Pencil, Play, Plus, RotateCcw, SignalHigh,
  SquarePlay, Timer, Trash2, Tv, Undo2, X,
} from "lucide-react";
import {
  COR_MAR, MAR_LIMITES, duracao, lerMinutos, ondeEsta, proximo, proximos, segundosFalta, segundosVisto, textoUltima,
  totalEps, type Acao, type OpcoesRegistrar, type Registro, type TipoMar, type Titulo,
} from "@/lib/mar";
import { RowMenu, type MenuItem } from "./row-menu";
import { describe, useTimerEstado } from "./timer-context";
import { PlataformaIcone, plataformaDe } from "./plataforma";

export const TIPOS: { id: TipoMar; nome: string; icone: typeof Tv }[] = [
  { id: "serie", nome: "Série", icone: Tv },
  { id: "filme", nome: "Filme", icone: Clapperboard },
  { id: "youtube", nome: "Vídeo", icone: SquarePlay },
  { id: "podcast", nome: "Podcast", icone: Mic },
  { id: "livro", nome: "Livro", icone: BookOpen },
];
export const NIVEIS = { 1: "fácil", 2: "médio", 3: "difícil" } as const;
export const COR_NIVEL = { 1: "var(--good)", 2: "#c98a1a", 3: "var(--critical)" } as const;

/** O que o cartão pede ao painel (que fala com o banco). */
export interface AcoesCartao {
  /** soma tempo (episódio, "parei em", minutos): o painel pode perguntar antes sobre o Timer */
  marcar: (t: Titulo, acao: Acao, opts?: OpcoesRegistrar) => void;
  /** muda a posição ou a situação, sem tempo (desfazível) */
  ajustar: (t: Titulo, opts: OpcoesRegistrar) => void;
  desfazer: (t: Titulo) => void;
  /** campos que não são do livro-caixa: nível, boia, tipo, duração */
  mudar: (t: Titulo, campos: Partial<Titulo>) => void;
  editar: (t: Titulo) => void;
  apagar: (t: Titulo) => void;
  comecar: (t: Titulo) => void;
  /** a pergunta única (Sim / Não) */
  responder: (sim: boolean) => void;
  descartarSobra: (t: Titulo) => void;
  /** lembra o último "+ min" usado neste título */
  lembrarMin: (t: Titulo, min: number) => void;
}

export interface PropsCartao {
  t: Titulo;
  idioma: string;
  ocupado: boolean;
  /** a pergunta única, quando é deste cartão */
  pergunta: { pergunta: string; sim: string; nao: string } | null;
  /** tempo do Timer que ainda não virou episódio (segundos; já sem o que foi descartado) */
  sobraSeg: number;
  /** o Timer está ligado a este título */
  noTimer: boolean;
  hojeSeg: number;
  totalSeg: number;
  ultima: Registro | null;
  destaque: boolean;
  /** vídeo/podcast/livro: o último "+ min" usado */
  minUltimo: number;
  acoes: AcoesCartao;
}

// ─── celular: folhas de baixo no lugar dos popovers ───

const CELULAR = "(max-width: 639.98px)";
function useCelular() {
  return useSyncExternalStore(
    (cb) => { const m = matchMedia(CELULAR); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => matchMedia(CELULAR).matches,
    () => false,
  );
}

/**
 * Popover por portal (como o RowMenu: não é cortado pela lista que rola), preso ao botão que o abriu.
 * No celular vira uma folha de baixo, ao alcance do polegar.
 */
export function Pop({ ancora, onFechar, titulo, largura = 300, children }: {
  ancora: HTMLElement | null; onFechar: () => void; titulo?: string; largura?: number; children: React.ReactNode;
}) {
  const celular = useCelular();
  const caixa = useRef<HTMLDivElement>(null);
  const conteudo = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const fechar = useRef(onFechar);
  fechar.current = onFechar;

  // posiciona ao abrir e de novo sempre que o conteúdo muda de tamanho (chip "Vários episódios", a pergunta do
  // Cronometrar…): abre para baixo se couber, senão para cima; nunca passa da janela (rola por dentro)
  useLayoutEffect(() => {
    if (celular || !ancora) return;
    const posicionar = () => {
      const r = ancora.getBoundingClientRect();
      // altura do conteúdo inteiro (sem o limite), mais o p-3 da caixa
      const h = (conteudo.current?.scrollHeight ?? 236) + 24;
      const left = Math.max(8, Math.min(window.innerWidth - largura - 8, r.right - largura));
      const embaixo = window.innerHeight - r.bottom - 12;
      const emcima = r.top - 12;
      const desce = embaixo >= h || embaixo >= emcima;
      setPos(desce
        ? { left, top: r.bottom + 6, maxHeight: Math.max(120, embaixo) }
        : { left, bottom: window.innerHeight - r.top + 6, maxHeight: Math.max(120, emcima) });
    };
    posicionar();
    const ro = typeof ResizeObserver !== "undefined" && conteudo.current ? new ResizeObserver(posicionar) : null;
    if (ro && conteudo.current) ro.observe(conteudo.current);
    return () => ro?.disconnect();
  }, [ancora, celular, largura]);

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (!caixa.current?.contains(alvo) && !ancora?.contains(alvo)) fechar.current();
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { fechar.current(); ancora?.focus(); } };
    // rolar a página (fora do popover) fecha: ele ficaria longe do botão (não nos primeiros instantes: o foco do campo pode rolar)
    const aberto = Date.now();
    const rolar = (e: Event) => { if (!celular && Date.now() - aberto > 300 && !caixa.current?.contains(e.target as Node)) fechar.current(); };
    const redimensionar = () => { if (!celular) fechar.current(); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", rolar, true);
    window.addEventListener("resize", redimensionar);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", rolar, true);
      window.removeEventListener("resize", redimensionar);
    };
  }, [ancora, celular]);

  if (typeof document === "undefined") return null;
  if (celular) {
    return createPortal(
      <div className="fixed inset-0 z-[75] bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
        <div ref={caixa} role="dialog" aria-label={titulo}
          className="absolute inset-x-0 bottom-0 card rounded-b-none border-x-0 border-b-0 px-4 pt-3 shadow-2xl max-h-[85dvh] overflow-y-auto"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))", animation: "folha-sobe 0.22s ease-out" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{titulo}</span>
            <button type="button" className="btn btn-ghost px-2 py-2" aria-label="Fechar" onClick={onFechar}><X size={18} /></button>
          </div>
          {children}
        </div>
      </div>,
      document.body,
    );
  }
  return createPortal(
    <div ref={caixa} role="dialog" aria-label={titulo} className="fixed z-[80] card shadow-xl p-3 overflow-y-auto overscroll-contain"
      style={{ width: largura, left: pos?.left ?? 0, top: pos?.top, bottom: pos?.bottom, maxHeight: pos?.maxHeight, visibility: pos ? "visible" : "hidden" }}>
      <div ref={conteudo}>{children}</div>
    </div>,
    document.body,
  );
}

/** Uma linha de ação dentro do popover (botão grande, fácil de acertar). */
function Linha({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button type="button" disabled={disabled} title={title} onClick={onClick}
      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2.5 sm:py-2 text-[15px] sm:text-[13px] text-left hover:bg-sel disabled:opacity-40">
      {children}
    </button>
  );
}

// ─── o 2º toque (ações de 60 min ou mais) ───

function useSegundoToque() {
  const [desde, setDesde] = useState<number | null>(null);
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    if (desde === null) return;
    const a = setTimeout(() => setPronto(true), MAR_LIMITES.confirmarEsperaMs);
    const b = setTimeout(() => { setDesde(null); setPronto(false); }, MAR_LIMITES.confirmarJanelaMs);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [desde]);
  return {
    pedindo: desde !== null,
    pronto,
    pedir: () => { setPronto(false); setDesde(Date.now()); },
    limpar: () => { setDesde(null); setPronto(false); },
  };
}

/**
 * O botão principal: diz o que vai contar; de 60 min para cima, o 1º toque vira "Confirmar 1 h 18" por 4 s
 * (ativo depois de 400 ms) e só o 2º marca.
 */
function BotaoPrincipal({ rotulo, seg, ocupado, onMarcar, title, desabilitado, className = "" }: {
  rotulo: string; seg: number; ocupado: boolean; onMarcar: () => void; title?: string; desabilitado?: boolean; className?: string;
}) {
  const toque = useSegundoToque();
  const grande = seg >= MAR_LIMITES.confirmarSeg;
  const base = "btn justify-center whitespace-nowrap tabular-nums px-3 py-1.5 sm:py-1 min-h-9 sm:min-h-0 text-[14px] sm:text-[13px]";
  if (toque.pedindo) {
    return (
      <button type="button" className={`${base} btn-primary ${className}`} disabled={!toque.pronto || ocupado}
        title="Toque de novo para marcar" onClick={() => { toque.limpar(); onMarcar(); }}>
        Confirmar {duracao(seg)}
      </button>
    );
  }
  return (
    <button type="button" className={`${base} ${className}`} disabled={ocupado || desabilitado} title={title} aria-busy={ocupado}
      onClick={() => (grande ? toque.pedir() : onMarcar())}>
      {ocupado ? <span className="px-3">…</span> : <><Plus size={14} style={{ color: COR_MAR }} />{rotulo}</>}
    </button>
  );
}

// ─── partes do cartão ───

function Icone({ t }: { t: Titulo }) {
  const T = TIPOS.find((x) => x.id === t.tipo) ?? TIPOS[0];
  return plataformaDe(t.onde)
    ? <PlataformaIcone onde={t.onde} />
    : <span className="w-5 h-5 shrink-0 rounded-[5px] bg-surface-2 grid place-items-center" title={T.nome}><T.icone size={12} className="text-icon" /></span>;
}

/** A barra dividida em temporadas, cada pedaço do tamanho da temporada, preenchida até onde você está. */
function BarraTemporadas({ t }: { t: Titulo }) {
  const ts = t.temporadas ?? [];
  const vistos = t.ep_vistos ?? 0;
  let antes = 0;
  return (
    <div className="flex gap-[3px] flex-1 min-w-[4rem]">
      {ts.map((n, i) => {
        const feitos = Math.max(0, Math.min(n, vistos - antes));
        antes += n;
        return (
          <div key={i} className="h-1.5 rounded-full bg-surface-2 overflow-hidden" style={{ flexGrow: n, flexBasis: 0 }} title={`Temporada ${i + 1}: ${feitos} de ${n} episódios`}>
            <div className="h-full rounded-full" style={{ width: `${(feitos / n) * 100}%`, background: COR_MAR }} />
          </div>
        );
      })}
    </div>
  );
}

function Chips({ t, noTimer, sobraSeg, acoes }: { t: Titulo; noTimer: boolean; sobraSeg: number; acoes: AcoesCartao }) {
  if (noTimer) {
    return <span className="inline-flex items-center gap-1 rounded-full px-2 py-px text-[11px] whitespace-nowrap" style={{ background: "color-mix(in srgb, #1baf7a 14%, transparent)", color: COR_MAR }}
      title="O Timer está ligado a este título: o tempo dele e os episódios marcados não se somam duas vezes."><Timer size={11} /> no Timer</span>;
  }
  if (sobraSeg >= 60) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full pl-2 pr-0.5 py-px text-[11px] whitespace-nowrap bg-surface-2 text-muted"
        title="Tempo do Timer que ainda não virou episódio: os próximos episódios usam este tempo em vez de somar de novo. Vale por 6 h.">
        <Timer size={11} /> {duracao(sobraSeg)} do Timer
        <button type="button" className="rounded-full p-1 hover:text-ink hover:bg-sel" aria-label="Descartar o tempo do Timer"
          title="Descartar: a próxima marcação soma a minutagem inteira (o tempo do Timer continua contado)" onClick={() => acoes.descartarSobra(t)}><X size={11} /></button>
      </span>
    );
  }
  return null;
}

function Pergunta({ p, ocupado, onResponder }: { p: NonNullable<PropsCartao["pergunta"]>; ocupado: boolean; onResponder: (sim: boolean) => void }) {
  return (
    <div className="mt-2 rounded-lg px-2.5 py-2 text-[12.5px] leading-snug" style={{ background: "color-mix(in srgb, #1baf7a 10%, transparent)" }} role="alertdialog" aria-label="O Timer">
      <p>{p.pergunta}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button type="button" className="btn btn-primary py-1.5 sm:py-1 min-h-9 sm:min-h-0 text-[13px]" disabled={ocupado} onClick={() => onResponder(true)}>{p.sim}</button>
        <button type="button" className="btn py-1.5 sm:py-1 min-h-9 sm:min-h-0 text-[13px]" disabled={ocupado} onClick={() => onResponder(false)}>{p.nao}</button>
      </div>
    </div>
  );
}

/** "Foi ontem" (vale para as ações do menu) */
function FoiOntem({ v, set }: { v: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 px-2.5 py-2 text-[15px] sm:text-[13px] cursor-pointer select-none">
      <input type="checkbox" className="w-4 h-4" checked={v} onChange={(e) => set(e.target.checked)} /> Foi ontem
    </label>
  );
}

/** Campo de minutos com Enter = salvar. */
function CampoMin({ valor, set, onEnter, min, max, rotulo, autoFocus }: {
  valor: string; set: (v: string) => void; onEnter: () => void; min?: number; max?: number; rotulo: string; autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // foco sem rolar a página (o popover ainda está se posicionando)
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus({ preventScroll: true }), 30); }, [autoFocus]);
  return (
    <input ref={ref} className="input py-1.5 px-2 w-20 text-right tabular-nums" inputMode="numeric" aria-label={rotulo} placeholder={min ? String(min) : ""}
      value={valor} onChange={(e) => set(e.target.value.replace(/[^\d:hm ]/gi, ""))}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEnter(); } }}
      {...(max ? { "data-max": max } : {})} />
  );
}

/** "▶ Cronometrar com o Timer" — com o Timer ocupado, pergunta antes "Encerrar e cronometrar". */
function Cronometrar({ t, idioma, onFeito, onPerguntando }: { t: Titulo; idioma: string; onFeito: () => void; onPerguntando?: (sim: boolean) => void }) {
  const timer = useTimerEstado();
  const [pergunta, setPerguntaBruta] = useState<string | null>(null);
  // avisa quem abriu (o ▾ do vídeo esconde o "Somar" enquanto pergunta: um botão principal só)
  const setPergunta = (v: string | null) => { setPerguntaBruta(v); onPerguntando?.(v !== null); };
  const [encerrando, setEncerrando] = useState(false);
  const ocupadoAgora = () => {
    const st = timer.ver();
    const segs = st.elapsed + (st.running && st.startedAt ? (Date.now() - st.startedAt) / 1000 : 0);
    return { st, segs, ocupado: st.running || segs > 0 };
  };
  if (pergunta) {
    return (
      <div className="rounded-lg bg-surface-2/70 px-2.5 py-2 text-[13px] leading-snug">
        <p>{pergunta}</p>
        <div className="mt-2 flex gap-1.5">
          <button type="button" className="btn btn-primary py-1.5 sm:py-1 min-h-9 sm:min-h-0 text-[13px]" disabled={encerrando} onClick={async () => {
            setEncerrando(true);
            await timer.stop();
            timer.cronometrarMar({ id: t.id, titulo: t.titulo }, idioma);
            setEncerrando(false);
            onFeito();
          }}>{encerrando ? "Salvando…" : "Encerrar e cronometrar"}</button>
          <button type="button" className="btn py-1.5 sm:py-1 min-h-9 sm:min-h-0 text-[13px]" onClick={() => setPergunta(null)}>Cancelar</button>
        </div>
      </div>
    );
  }
  return (
    <Linha onClick={() => {
      const { st, segs, ocupado } = ocupadoAgora();
      if (st.marTituloId === t.id) return onFeito();
      if (!ocupado) { timer.cronometrarMar({ id: t.id, titulo: t.titulo }, idioma); return onFeito(); }
      const oque = st.category === "Idiomas" ? describe(st) || "Idiomas" : [st.category, describe(st)].filter(Boolean).join(" · ");
      setPergunta(`O Timer está contando ${oque} (${duracao(segs)}). Encerrar e salvar, e cronometrar “${t.titulo}”?`);
    }}>
      <Play size={15} style={{ color: COR_MAR }} /> Cronometrar com o Timer
    </Linha>
  );
}

/** "O Timer está contando…" para o ⋯ (lá não cabe a pergunta inline: usa confirm) */
function useCronometrarDireto(t: Titulo, idioma: string) {
  const timer = useTimerEstado();
  return useCallback(async () => {
    const st = timer.ver();
    const segs = st.elapsed + (st.running && st.startedAt ? (Date.now() - st.startedAt) / 1000 : 0);
    if (st.marTituloId === t.id) return;
    if (st.running || segs > 0) {
      const oque = st.category === "Idiomas" ? describe(st) || "Idiomas" : [st.category, describe(st)].filter(Boolean).join(" · ");
      if (!confirm(`O Timer está contando ${oque} (${duracao(segs)}). Encerrar e salvar, e cronometrar “${t.titulo}”?`)) return;
      await timer.stop();
    }
    timer.cronometrarMar({ id: t.id, titulo: t.titulo }, idioma);
  }, [timer, t.id, t.titulo, idioma]);
}

// ─── o menu ⋯ ───

function itensComuns(t: Titulo, acoes: AcoesCartao, ultima: Registro | null): { desfazer: MenuItem; nivel: MenuItem[]; boia: MenuItem; tipos: MenuItem[]; apagar: MenuItem; quero: MenuItem } {
  return {
    desfazer: { label: ultima ? `Desfazer o último (${textoUltima(t, ultima)})` : "Desfazer o último", icon: Undo2, onClick: () => acoes.desfazer(t) },
    nivel: ([1, 2, 3] as const).filter((n) => n !== t.nivel).map((n, i) => ({ label: `Nível: ${NIVEIS[n]}`, icon: SignalHigh, onClick: () => acoes.mudar(t, { nivel: n }), separar: i === 0 })),
    boia: { label: t.legenda === "en" ? "Tirar a boia" : "Pôr a boia", icon: LifeBuoy, onClick: () => acoes.mudar(t, { legenda: t.legenda === "en" ? "sem" : "en" }) },
    tipos: TIPOS.filter((x) => x.id !== t.tipo).map((x, i) => ({
      label: `É ${x.nome.toLowerCase()}`, icon: x.icone, separar: i === 0,
      onClick: () => {
        if (x.id !== "filme") return acoes.mudar(t, { tipo: x.id });
        // filme: pede a duração (é ela que conta ao terminar)
        const v = prompt("Duração do filme (min ou 1h52)", "");
        if (v === null) return;
        const m = lerMinutos(v);
        if (!m || m > MAR_LIMITES.min) return alert("Não entendi a duração. Use minutos (ex.: 102) ou 1h42.");
        acoes.mudar(t, { tipo: "filme", min_ep: m });
      },
    })),
    apagar: { label: "Tirar da lista", icon: Trash2, danger: true, separar: true, onClick: () => acoes.apagar(t) },
    quero: { label: "Voltar para “Quero ver”", icon: RotateCcw, onClick: () => acoes.ajustar(t, { situacao: "quero" }) },
  };
}

/** Filme sem duração de verdade (a coluna nasce com 25, o padrão de episódio): pede a duração antes. */
export const filmeSemDuracao = (t: Titulo) => t.tipo === "filme" && (!t.min_ep || (t.min_ep === 25 && !(t.parcial_seg > 0)));

// ─── o cartão ───

type QualPop = null | "mais" | "min" | "parei" | "terminei";

export function MarCartao(props: PropsCartao) {
  const { t, idioma, ocupado, pergunta, sobraSeg, noTimer, hojeSeg, totalSeg, ultima, destaque, minUltimo, acoes } = props;
  const [pop, setPop] = useState<QualPop>(null);
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const abrir = (q: QualPop, el: HTMLElement | null) => { if (pop === q) { setPop(null); return; } setAncora(el); setPop(q); };
  const fechar = () => setPop(null);
  const cronometrarDireto = useCronometrarDireto(t, idioma);
  const raiz = useRef<HTMLLIElement>(null);
  useEffect(() => { if (destaque) raiz.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [destaque]);

  const c = itensComuns(t, acoes, ultima);
  const titulo = <span className={`text-sm font-medium truncate ${t.situacao === "visto" ? "text-muted font-normal" : ""}`} title={t.titulo}>{t.titulo}</span>;
  const cls = `rounded-lg border bg-surface px-2.5 py-2 transition-shadow ${destaque ? "border-transparent ring-2" : "border-line"}`;
  const estilo = destaque ? ({ "--tw-ring-color": COR_MAR } as React.CSSProperties) : undefined;

  // ── Quero ver ──
  if (t.situacao === "quero") {
    const T = TIPOS.find((x) => x.id === t.tipo) ?? TIPOS[0];
    const info = t.tipo === "serie" && totalEps(t) ? `${totalEps(t)} ep. · ${duracao(segundosFalta(t))}` : t.tipo === "filme" && !filmeSemDuracao(t) ? duracao((t.min_ep ?? 0) * 60) : "";
    return (
      <li ref={raiz} className={cls} style={estilo}>
        <div className="flex items-center gap-2.5">
          <Icone t={t} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 min-w-0">{titulo}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
              <span className="whitespace-nowrap">{T.nome}{t.onde ? ` · ${t.onde}` : ""}{info ? ` · ${info}` : ""}</span>
              <select aria-label="Nível" value={t.nivel} onChange={(e) => acoes.mudar(t, { nivel: Number(e.target.value) as 1 | 2 | 3 })}
                className="outline-none cursor-pointer rounded px-1.5 py-1.5 sm:py-px bg-surface-2" style={{ color: COR_NIVEL[t.nivel] }}>
                {([1, 2, 3] as const).map((n) => <option key={n} value={n}>{NIVEIS[n]}</option>)}
              </select>
              <button type="button" className="rounded px-2 py-1.5 sm:py-px bg-surface-2 hover:text-ink" title="Com boia = legenda em inglês · sem boia = sem legenda (toque para trocar)"
                onClick={() => acoes.mudar(t, { legenda: t.legenda === "en" ? "sem" : "en" })}>{t.legenda === "en" ? "com boia" : "sem boia"}</button>
            </div>
          </div>
          <button type="button" className="btn py-1.5 sm:py-1 min-h-9 sm:min-h-0 px-2.5 text-[13px] shrink-0" disabled={ocupado} onClick={() => acoes.comecar(t)} title="Passa para Assistindo (não soma tempo)">
            {ocupado ? "…" : <><Play size={13} style={{ color: COR_MAR }} /> Começar</>}
          </button>
          <RowMenu botaoClass="p-2.5 sm:p-1.5" items={[
            ...(t.tipo === "serie" ? [{ label: "Temporadas e minutagem…", icon: Tv, onClick: () => acoes.editar(t) }] : []),
            ...(t.tipo === "filme" ? [duracaoItem(t, acoes)] : []),
            ...c.tipos, c.apagar,
          ]} />
        </div>
      </li>
    );
  }

  // ── Vistos ──
  if (t.situacao === "visto") {
    const T = TIPOS.find((x) => x.id === t.tipo) ?? TIPOS[0];
    return (
      <li ref={raiz} className={cls} style={estilo}>
        <div className="flex items-center gap-2.5">
          <Icone t={t} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 min-w-0">{titulo}</div>
            <div className="mt-0.5 text-[11px] text-muted truncate">
              {T.nome}{t.onde ? ` · ${t.onde}` : ""}{totalSeg > 0 ? ` · ${duracao(totalSeg)} no MAR` : ""}{t.visto_em ? ` · visto em ${new Date(t.visto_em).toLocaleDateString("pt-BR", { day: "numeric", month: "numeric" })}` : ""}
            </div>
          </div>
          {ocupado && <span className="text-sm text-muted px-2">…</span>}
          <RowMenu botaoClass="p-2.5 sm:p-1.5" items={[
            { label: "Assistir de novo", icon: Play, onClick: () => acoes.ajustar(t, { situacao: "assistindo", valor: 0, parcialMin: 0 }) },
            c.quero, c.desfazer,
            ...(t.tipo === "serie" ? [{ label: "Temporadas e minutagem…", icon: Tv, onClick: () => acoes.editar(t) }] : []),
            c.apagar,
          ]} />
        </div>
      </li>
    );
  }

  // ── Assistindo ──
  const linha2 = pergunta ? <Pergunta p={pergunta} ocupado={ocupado} onResponder={acoes.responder} /> : null;

  if (t.tipo === "serie") {
    const total = totalEps(t);
    const prox = proximo(t);
    const { temp, ep } = ondeEsta(t);
    const ts = t.temporadas ?? [];
    const vistos = t.ep_vistos ?? 0;
    const refBotao = prox ? (() => {
      const k = prox.k;
      // a temporada vira: "T2E1"; senão só o episódio: "E6"
      let antes = 0, tp = 1, e = k;
      for (const [i, n] of ts.entries()) { if (k <= antes + n) { tp = i + 1; e = k - antes; break; } antes += n; }
      return tp > 1 && e === 1 ? `T${tp}E1` : `E${e}`;
    })() : "";
    const rotulo = noTimer ? `${refBotao} · no Timer` : `${refBotao} · ${duracao(prox?.seg ?? 0)}`;
    const dicaBotao = prox ? (prox.parcial > 0 ? `${Math.round(prox.parcial / 60)} dos ${Math.round(prox.dur / 60)} já contados` : `Vi o ${prox.ref} (${duracao(prox.dur)})`) : undefined;
    const botoes = (celular: boolean) => total > 0 && prox ? (
      <>
        <BotaoPrincipal rotulo={rotulo} seg={noTimer ? 0 : prox.seg} ocupado={ocupado} title={dicaBotao}
          className={celular ? "flex-1" : ""} onMarcar={() => acoes.marcar(t, "ep")} />
        <button type="button" className={`btn px-2 py-1.5 sm:py-1 min-h-9 min-w-9 sm:min-h-0 sm:min-w-0 justify-center ${pop === "mais" ? "bg-surface-2" : ""}`} aria-label="Outras formas de marcar" title="Vários episódios, parei em…, foi ontem, cronometrar"
          aria-expanded={pop === "mais"} disabled={ocupado} onClick={(e) => abrir("mais", e.currentTarget)}><ChevronDown size={15} /></button>
      </>
    ) : total > 0 ? (
      // viu tudo (ex.: posição salva no último episódio pelo editor): falta só mover para Vistos
      <button type="button" className={`btn py-1.5 sm:py-1 min-h-9 sm:min-h-0 px-2.5 text-[13px] ${celular ? "flex-1 justify-center" : ""}`} disabled={ocupado}
        title="Todos os episódios estão vistos. Não soma tempo." onClick={() => acoes.ajustar(t, { situacao: "visto" })}>
        <Check size={14} style={{ color: COR_MAR }} /> Terminei · mover para Vistos
      </button>
    ) : (
      <button type="button" className={`btn py-1.5 sm:py-1 min-h-9 sm:min-h-0 px-2.5 text-[13px] ${celular ? "flex-1 justify-center" : ""}`} onClick={() => acoes.editar(t)}>
        <ListPlus size={14} style={{ color: COR_MAR }} /> episódios por temporada
      </button>
    );
    const menu = (
      <RowMenu botaoClass="p-2.5 sm:p-1.5" items={[
        c.desfazer,
        { label: "Temporadas e minutagem…", icon: Tv, onClick: () => acoes.editar(t) },
        ...(total === 0 ? [{ label: "+ min…", icon: Plus, onClick: () => { setAncora(raiz.current?.querySelector<HTMLElement>("[data-ancora]") ?? null); setPop("min"); } }] : []),
        ...(total > 0 ? [{ label: vistos < total ? "Marcar como vista…" : "Marcar como vista", icon: Check, onClick: () => {
          const faltam = total - vistos;
          if (faltam <= 0) { acoes.ajustar(t, { situacao: "visto" }); return; }
          if (confirm(`Marcar ${t.titulo} como vista? Faltam ${faltam} ${faltam === 1 ? "episódio" : "episódios"} (${duracao(segundosFalta(t))}). Não soma tempo.`)) acoes.ajustar(t, { situacao: "visto" });
        } }] : []),
        c.quero, ...c.nivel, c.boia, ...c.tipos, c.apagar,
      ]} />
    );
    return (
      <li ref={raiz} className={cls} style={estilo}>
        <div className="flex items-center gap-2.5" data-ancora>
          <Icone t={t} />
          <div className="min-w-0 flex-1 flex items-baseline gap-2">
            {titulo}
            {total > 0 && <span className="text-xs text-muted tabular-nums whitespace-nowrap">{vistos === 0 ? `T1 · ${ts[0]} ep.` : `T${temp} · E${ep} de ${ts[temp - 1]}`}</span>}
          </div>
          <div className="hidden sm:flex items-center gap-1 shrink-0">{botoes(false)}{menu}</div>
          <div className="sm:hidden">{menu}</div>
        </div>
        {linha2 ?? (total > 0 ? (
          <div className="mt-1.5 flex items-center gap-2.5 sm:pl-[30px]">
            <BarraTemporadas t={t} />
            <span className="text-[11px] text-muted tabular-nums whitespace-nowrap">
              {vistos}/{total}{vistos < total ? ` · faltam ${duracao(segundosFalta(t))}` : ""}{t.parcial_seg > 0 ? ` · parei em ${Math.round(t.parcial_seg / 60)} min` : ""}
            </span>
            <Chips t={t} noTimer={noTimer} sobraSeg={sobraSeg} acoes={acoes} />
          </div>
        ) : <div className="mt-1 text-[11px] text-faint sm:pl-[30px]">Diga quantos episódios tem cada temporada para marcar episódio por episódio.</div>)}
        <div className="sm:hidden mt-2 flex items-center gap-1.5">{botoes(true)}</div>
        {pop === "mais" && prox && (
          <MenuSerie t={t} idioma={idioma} ancora={ancora} onFechar={fechar} acoes={acoes} />
        )}
        {pop === "min" && <MenuMin t={t} idioma={idioma} ancora={ancora} onFechar={fechar} acoes={acoes} padrao={minUltimo} />}
      </li>
    );
  }

  if (t.tipo === "filme") {
    const semDur = filmeSemDuracao(t);
    const dur = (t.min_ep ?? 0) * 60;
    const visto = segundosVisto(t);
    const falta = segundosFalta(t);
    const botoes = (celular: boolean) => (
      <>
        <button type="button" className={`btn px-2.5 py-1.5 sm:py-1 min-h-9 sm:min-h-0 text-[13px] ${celular ? "flex-1 justify-center" : ""}`} disabled={ocupado || semDur}
          onClick={(e) => abrir("parei", e.currentTarget)} aria-expanded={pop === "parei"}>{ocupado ? "…" : "Parei em"}</button>
        <button type="button" className={`btn px-2.5 py-1.5 sm:py-1 min-h-9 sm:min-h-0 text-[13px] ${celular ? "flex-1 justify-center" : ""}`} disabled={ocupado || semDur}
          onClick={(e) => abrir("terminei", e.currentTarget)} aria-expanded={pop === "terminei"}><Check size={14} style={{ color: COR_MAR }} /> Terminei</button>
      </>
    );
    const menu = (
      <RowMenu botaoClass="p-2.5 sm:p-1.5" items={[
        c.desfazer, duracaoItem(t, acoes),
        { label: noTimer ? "Já está no Timer" : "Cronometrar com o Timer", icon: Play, disabled: noTimer, onClick: () => void cronometrarDireto() },
        c.quero, ...c.nivel, c.boia, ...c.tipos, c.apagar,
      ]} />
    );
    return (
      <li ref={raiz} className={cls} style={estilo}>
        <div className="flex items-center gap-2.5">
          <Icone t={t} />
          <div className="min-w-0 flex-1 flex items-baseline gap-2">{titulo}<span className="text-xs text-muted whitespace-nowrap">filme</span></div>
          <div className="hidden sm:flex items-center gap-1 shrink-0">{botoes(false)}{menu}</div>
          <div className="sm:hidden">{menu}</div>
        </div>
        {linha2 ?? (semDur ? <DuracaoInline t={t} acoes={acoes} /> : (
          <div className="mt-1.5 flex items-center gap-2.5 sm:pl-[30px]">
            <div className="h-1.5 flex-1 min-w-[4rem] rounded-full bg-surface-2 overflow-hidden" title={`${duracao(visto)} de ${duracao(dur)}`}>
              <div className="h-full rounded-full" style={{ width: `${dur ? Math.min(100, (visto / dur) * 100) : 0}%`, background: COR_MAR }} />
            </div>
            <span className="text-[11px] text-muted tabular-nums whitespace-nowrap">{duracao(visto)} de {duracao(dur)}{visto > 0 ? ` · faltam ${duracao(falta)}` : ""}</span>
            <Chips t={t} noTimer={noTimer} sobraSeg={sobraSeg} acoes={acoes} />
          </div>
        ))}
        <div className="sm:hidden mt-2 flex items-center gap-1.5">{botoes(true)}</div>
        {pop === "parei" && <MenuParei t={t} ancora={ancora} onFechar={fechar} acoes={acoes} />}
        {pop === "terminei" && (
          <Pop ancora={ancora} onFechar={fechar} titulo={`${t.titulo} · terminei`} largura={320}>
            <p className="text-[13px] px-1 pb-2.5 leading-snug">{falta > 0 ? <>Somar <b className="font-medium">{duracao(falta)}</b> e mover para Vistos?</> : "Mover para Vistos?"}</p>
            <div className="flex gap-1.5">
              <button type="button" className="btn btn-primary flex-[1.4] justify-center py-2 sm:py-1.5 whitespace-nowrap" onClick={() => { fechar(); acoes.marcar(t, "ep"); }}>
                {falta > 0 ? `Somar ${duracao(falta)} e mover` : "Mover"}
              </button>
              {falta > 0 && <button type="button" className="btn flex-1 justify-center py-2 sm:py-1.5 whitespace-nowrap" title="Para um filme visto antes do MAR: vai para Vistos sem somar tempo"
                onClick={() => { fechar(); acoes.ajustar(t, { situacao: "visto" }); }}>Só mover</button>}
            </div>
            {falta > 0 && <p className="px-1 pt-2 text-[11px] text-faint">“Só mover” é para filme visto antes do MAR: não soma tempo.</p>}
          </Pop>
        )}
      </li>
    );
  }

  // ── vídeo, podcast, livro: minutos ──
  const botoes = (celular: boolean) => (
    <>
      <BotaoPrincipal rotulo={noTimer ? "no Timer" : duracao(minUltimo * 60)} seg={noTimer ? 0 : minUltimo * 60} ocupado={ocupado} className={celular ? "flex-1" : ""}
        title={`Somar ${duracao(minUltimo * 60)} (o último valor usado neste título)`} onMarcar={() => acoes.marcar(t, "min", { valor: minUltimo })} />
      <button type="button" className={`btn px-2 py-1.5 sm:py-1 min-h-9 min-w-9 sm:min-h-0 sm:min-w-0 justify-center ${pop === "min" ? "bg-surface-2" : ""}`} aria-label="Outros minutos" title="Outros minutos, foi ontem, cronometrar"
        aria-expanded={pop === "min"} disabled={ocupado} onClick={(e) => abrir("min", e.currentTarget)}><ChevronDown size={15} /></button>
    </>
  );
  const menu = (
    <RowMenu botaoClass="p-2.5 sm:p-1.5" items={[
      c.desfazer,
      { label: "Terminei (vai para Vistos)", icon: Check, onClick: () => acoes.ajustar(t, { situacao: "visto" }) },
      c.quero, ...c.nivel, c.boia, ...c.tipos, c.apagar,
    ]} />
  );
  return (
    <li ref={raiz} className={cls} style={estilo}>
      <div className="flex items-center gap-2.5">
        <Icone t={t} />
        <div className="min-w-0 flex-1 flex items-baseline gap-2">{titulo}<span className="text-xs text-muted whitespace-nowrap">{TIPOS.find((x) => x.id === t.tipo)?.nome.toLowerCase()}</span></div>
        <div className="hidden sm:flex items-center gap-1 shrink-0">{botoes(false)}{menu}</div>
        <div className="sm:hidden">{menu}</div>
      </div>
      {linha2 ?? (
        <div className="mt-1 flex items-center gap-2.5 sm:pl-[30px] text-[11px] text-muted tabular-nums">
          <span>hoje {duracao(hojeSeg)} · total {duracao(totalSeg)}</span>
          <Chips t={t} noTimer={noTimer} sobraSeg={sobraSeg} acoes={acoes} />
        </div>
      )}
      <div className="sm:hidden mt-2 flex items-center gap-1.5">{botoes(true)}</div>
      {pop === "min" && <MenuMin t={t} idioma={idioma} ancora={ancora} onFechar={fechar} acoes={acoes} padrao={minUltimo} />}
    </li>
  );
}

function duracaoItem(t: Titulo, acoes: AcoesCartao): MenuItem {
  return {
    label: "Duração do filme…", icon: Pencil, onClick: () => {
      const v = prompt("Duração do filme (min ou 1h52)", filmeSemDuracao(t) ? "" : String(t.min_ep ?? ""));
      if (v === null) return;
      const m = lerMinutos(v);
      if (!m || m > MAR_LIMITES.min) return alert("Não entendi a duração. Use minutos (ex.: 102) ou 1h42.");
      acoes.mudar(t, { min_ep: m });
    },
  };
}

/** Filme sem duração: pede antes de marcar. */
function DuracaoInline({ t, acoes }: { t: Titulo; acoes: AcoesCartao }) {
  const [v, setV] = useState("");
  const m = lerMinutos(v);
  const ok = !!m && m <= MAR_LIMITES.min;
  const salvar = () => { if (ok) acoes.mudar(t, { min_ep: m! }); };
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:pl-[30px] text-[12px] text-muted">
      <span className="w-full sm:w-auto">Quanto dura o filme? (min ou 1h52)</span>
      <input className="input py-1 px-2 w-28 tabular-nums" inputMode="numeric" placeholder="ex.: 1h52" aria-label="Duração do filme"
        value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") salvar(); }} />
      <button type="button" className="btn py-1.5 sm:py-1 min-h-9 sm:min-h-0 px-2.5 text-[13px]" disabled={!ok} onClick={salvar}>Salvar</button>
    </div>
  );
}

/** ▾ da série: marcar o próximo, vários episódios, "parei em", foi ontem, cronometrar. */
function MenuSerie({ t, idioma, ancora, onFechar, acoes }: { t: Titulo; idioma: string; ancora: HTMLElement | null; onFechar: () => void; acoes: AcoesCartao }) {
  const [ontem, setOntem] = useState(false);
  const [n, setN] = useState<number | null>(null);
  const [parei, setParei] = useState("");
  const prox = proximo(t)!;
  const faltam = totalEps(t) - (t.ep_vistos ?? 0);
  const varios = n ? proximos(t, n) : null;
  const minP = Math.floor(prox.parcial / 60) + 1, maxP = Math.ceil(prox.dur / 60) - 1;
  const vParei = Number(parei);
  const pareiOk = Number.isInteger(vParei) && vParei >= minP && vParei <= maxP;
  const feito = (acao: Acao, opts: OpcoesRegistrar) => { onFechar(); acoes.marcar(t, acao, { ...opts, ontem }); };
  return (
    <Pop ancora={ancora} onFechar={onFechar} titulo={t.titulo} largura={344}>
      <Linha onClick={() => feito("ep", {})}>
        <Plus size={15} style={{ color: COR_MAR }} /> Marcar {prox.ref.replace(/^T\d+(?=E)/, (x) => (prox.k === 1 || prox.ref.endsWith("E1") ? x : ""))} · {duracao(prox.seg)}
      </Linha>
      {faltam > 1 && (
        <div className="px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 text-[15px] sm:text-[13px]">
            <span className="mr-auto">Vários episódios</span>
            {[2, 3, 4, 5].filter((x) => x <= faltam).map((x) => (
              <button key={x} type="button" className={`btn px-0 w-9 sm:w-8 justify-center py-1.5 sm:py-1 min-h-9 sm:min-h-0 text-[13px] tabular-nums ${n === x ? "border-transparent" : ""}`}
                style={n === x ? { background: COR_MAR, color: "#fff" } : undefined} aria-pressed={n === x} onClick={() => setN(n === x ? null : x)}>{x}</button>
            ))}
          </div>
          {varios && (
            <button type="button" className="btn btn-primary w-full justify-center mt-2 py-2 sm:py-1.5 text-[13px]" onClick={() => feito("ep", { valor: varios.n })}>
              Somar {varios.n} episódios · {varios.ref} · {duracao(varios.seg)}
            </button>
          )}
        </div>
      )}
      {maxP >= minP && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 text-[15px] sm:text-[13px]">
          <span className="whitespace-nowrap">Parei em</span>
          <CampoMin rotulo="Parei em (minutos)" valor={parei} set={setParei} min={minP} max={maxP} onEnter={() => { if (pareiOk) feito("parcial", { valor: vParei }); }} />
          <span className="text-muted whitespace-nowrap">min de {Math.round(prox.dur / 60)}</span>
          <button type="button" className="btn ml-auto py-1.5 sm:py-1 min-h-9 sm:min-h-0 px-2.5 text-[13px]" disabled={!pareiOk} title={pareiOk ? `Soma ${duracao(vParei * 60 - prox.parcial)}` : `De ${minP} a ${maxP}`}
            onClick={() => feito("parcial", { valor: vParei })}>Somar</button>
        </div>
      )}
      <div className="my-1 border-t border-line" />
      <FoiOntem v={ontem} set={setOntem} />
      <Cronometrar t={t} idioma={idioma} onFeito={onFechar} />
    </Pop>
  );
}

/** ▾ do vídeo/podcast/livro (e "+ min" da série sem temporadas): chips de minutos, campo, foi ontem, cronometrar. */
function MenuMin({ t, idioma, ancora, onFechar, acoes, padrao }: { t: Titulo; idioma: string; ancora: HTMLElement | null; onFechar: () => void; acoes: AcoesCartao; padrao: number }) {
  const [v, setV] = useState(String(padrao));
  const [ontem, setOntem] = useState(false);
  const [perguntando, setPerguntando] = useState(false);
  const m = lerMinutos(v);
  const ok = !!m && m <= MAR_LIMITES.min;
  const somar = () => { if (!ok) return; onFechar(); acoes.lembrarMin(t, m!); acoes.marcar(t, "min", { valor: m!, ontem }); };
  return (
    <Pop ancora={ancora} onFechar={onFechar} titulo={t.titulo} largura={320}>
      <div className="grid grid-cols-7 gap-1 px-1 pb-2">
        {[5, 10, 15, 20, 30, 45, 60].map((x) => (
          <button key={x} type="button" className={`btn px-0 justify-center py-2 sm:py-1 text-[13px] tabular-nums ${m === x ? "border-transparent" : ""}`}
            style={m === x ? { background: COR_MAR, color: "#fff" } : undefined} onClick={() => setV(String(x))}>{x}</button>
        ))}
      </div>
      <div className="flex items-center gap-2 px-2.5 py-1 text-[15px] sm:text-[13px]">
        <CampoMin rotulo="Minutos" valor={v} set={setV} onEnter={somar} autoFocus />
        <span className="text-muted">min</span>
        {v && !ok && <span className="text-[12px] text-critical">de 1 a {MAR_LIMITES.min}</span>}
      </div>
      <FoiOntem v={ontem} set={setOntem} />
      <Cronometrar t={t} idioma={idioma} onFeito={onFechar} onPerguntando={setPerguntando} />
      {!perguntando && (
        <button type="button" className="btn btn-primary w-full justify-center mt-1 py-2 sm:py-1.5" disabled={!ok} onClick={somar}>
          {ok ? `Somar ${duracao(m! * 60)}` : "Somar"}
        </button>
      )}
    </Pop>
  );
}

/** Filme: "Parei em [__] min de 102" [Somar]. */
function MenuParei({ t, ancora, onFechar, acoes }: { t: Titulo; ancora: HTMLElement | null; onFechar: () => void; acoes: AcoesCartao }) {
  const prox = proximo(t);
  const [v, setV] = useState("");
  const [ontem, setOntem] = useState(false);
  if (!prox) return null;
  const minP = Math.floor(prox.parcial / 60) + 1, maxP = Math.ceil(prox.dur / 60) - 1;
  const n = Number(v);
  const ok = Number.isInteger(n) && n >= minP && n <= maxP;
  const somar = () => { if (!ok) return; onFechar(); acoes.marcar(t, "parcial", { valor: n, ontem }); };
  return (
    <Pop ancora={ancora} onFechar={onFechar} titulo={`${t.titulo} · parei em`} largura={300}>
      <div className="flex items-center gap-2 px-1.5 py-1 text-[15px] sm:text-[13px]">
        <CampoMin rotulo="Parei em (minutos)" valor={v} set={setV} min={minP} max={maxP} onEnter={somar} autoFocus />
        <span className="text-muted whitespace-nowrap">min de {Math.round(prox.dur / 60)}</span>
        <button type="button" className="btn btn-primary ml-auto py-1.5 sm:py-1 min-h-9 sm:min-h-0 px-3 text-[13px]" disabled={!ok} onClick={somar}
          title={ok ? `Soma ${duracao(n * 60 - prox.parcial)}` : `De ${minP} a ${maxP}`}>Somar</button>
      </div>
      {ok && <p className="px-1.5 text-[12px] text-muted">Soma {duracao(n * 60 - prox.parcial)}.</p>}
      <FoiOntem v={ontem} set={setOntem} />
    </Pop>
  );
}
