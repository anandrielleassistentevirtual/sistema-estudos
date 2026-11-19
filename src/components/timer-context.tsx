"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { dayKey } from "@/lib/dates";
import { ehMar } from "@/lib/tempo";
import { duracao, enviarTrecho, fuso, novoId, type TrechoTimer } from "@/lib/mar";

export type TimerMode = "pomodoro" | "livre";
export type Phase = "foco" | "pausa";

export interface TimerState {
  mode: TimerMode;
  phase: Phase;
  running: boolean;
  startedAt: number | null; // ms do último "play"
  elapsed: number; // segundos acumulados antes do último play
  focusMin: number;
  breakMin: number;
  /** pomodoro clássico: depois de `ciclosAteLonga` focos, uma pausa longa */
  longBreakMin: number;
  ciclosAteLonga: number;
  /** focos concluídos na série atual (volta a 0 depois da pausa longa) */
  serie: number;
  /** a pausa em andamento é a longa? */
  pausaLonga: boolean;
  /** minutos acrescentados (ou tirados) só na fase atual, em segundos */
  ajuste: number;
  /** dia dos "ciclos hoje" (para zerar a cada dia) */
  ciclosDia: string;
  category: string;
  label: string; // texto livre (categorias sem lista)
  language: string; // Idiomas
  bookId: string; // Leitura
  bookTitle: string;
  bookPhysical: boolean;
  noteId: string; // Estudos (transcrição de aula)
  noteTitle: string;
  /** tarefa dos Estudos em andamento (o tempo do foco fica somado nela) */
  tarefaId: string;
  tarefaTexto: string;
  cycles: number;
  /** segundos desta fase que já foram salvos (ao continuar um foco que tinha terminado) */
  salvo: number;
  /** o último foco que terminou: dá para voltar a ele e acrescentar minutos */
  anterior: FocoAnterior | null;
  /** este foco é a continuação de um que já contou como ciclo (ao terminar, não conta de novo) */
  jaContou: boolean;
  /**
   * MAR: o Timer ligado a um título (▶ Cronometrar / "Sim, é do MAR"). Cada gravação vai para mar_timer, que conta
   * o MAIOR entre o tempo medido e a minutagem dos episódios marcados durante a corrida — nunca a soma.
   */
  marTituloId: string;
  marTitulo: string;
  /** a corrida (uuid): todas as gravações deste Timer ligado somam nela */
  marCorrida: string;
  /** quando a corrida começou (ms) */
  marDesde: number;
}

export interface MarVinculo { id: string; titulo: string; corrida: string; desde: number }
export interface FocoAnterior {
  feito: number; contouCiclo: boolean; pausaLonga: boolean;
  /** o foco estava ligado ao MAR: continuar volta à mesma corrida */
  mar?: MarVinculo;
  /** quando esse foco terminou (ms): continuar muito depois começa outra corrida */
  fim?: number;
}

/** Sessão de livro físico esperando a página onde você parou. */
export interface PendingPages {
  seconds: number;
  startedAt: string;
  state: TimerState;
}

interface TimerApi extends TimerState {
  seconds: number;
  remaining: number;
  /** duração da fase atual, em segundos (já com o ajuste) */
  alvo: number;
  /** muda só a fase atual: +1, −5… minutos (pode ser com o timer rodando) */
  ajustar: (minutos: number) => void;
  /** vai já para a próxima fase (o foco feito até aqui é salvo) */
  pular: () => void;
  /** volta ao foco que terminou e continua por mais `minutos` (o que já foi salvo não conta de novo) */
  continuarFoco: (minutos: number) => void;
  start: () => void;
  pause: () => void;
  stop: () => Promise<void>;
  reset: () => void;
  set: (p: Partial<TimerState>) => void;
  /** troca categoria, idioma, rótulo, livro, tarefa…: ligado ao MAR com tempo contado, pergunta se encerra antes */
  trocar: (p: Partial<TimerState>) => Promise<boolean>;
  lastSaved: number;
  pending: PendingPages | null;
  resolvePending: (page: number | null) => Promise<void>;
  /** rótulo do que está sendo estudado */
  what: string;
}

const KEY = "timer-estado";
const initial: TimerState = {
  mode: "pomodoro",
  phase: "foco",
  running: false,
  startedAt: null,
  elapsed: 0,
  focusMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  ciclosAteLonga: 4,
  serie: 0,
  pausaLonga: false,
  ajuste: 0,
  ciclosDia: "",
  category: "Leitura",
  label: "",
  language: "",
  bookId: "",
  bookTitle: "",
  bookPhysical: false,
  noteId: "",
  noteTitle: "",
  tarefaId: "",
  tarefaTexto: "",
  cycles: 0,
  salvo: 0,
  anterior: null,
  jaContou: false,
  marTituloId: "",
  marTitulo: "",
  marCorrida: "",
  marDesde: 0,
};

/** Os campos do MAR vazios; o rótulo "MAR · título" que o próprio vínculo pôs também sai. */
const semMar = (p: TimerState): Partial<TimerState> => ({
  marTituloId: "", marTitulo: "", marCorrida: "", marDesde: 0,
  ...(p.marTituloId && p.label === `MAR · ${p.marTitulo}` ? { label: "" } : {}),
});
const vinculoDe = (p: TimerState): MarVinculo | undefined =>
  p.marTituloId && p.marCorrida ? { id: p.marTituloId, titulo: p.marTitulo, corrida: p.marCorrida, desde: p.marDesde } : undefined;

/** "Continuar" um foco ligado ao MAR volta à mesma corrida só se ele terminou há pouco. */
const CONTINUAR_MESMA_CORRIDA_MS = 15 * 60e3;

/** Gravações do Timer ligado ao MAR que não chegaram ao banco (sem conexão): reenviadas com o mesmo trecho. */
const PENDENTES = "timer-mar-pendentes";
interface TrechoPendente { chamada: TrechoTimer; titulo: string; idioma: string; startedIso: string }
function lerPendentes(): TrechoPendente[] {
  try { const v = JSON.parse(localStorage.getItem(PENDENTES) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function gravarPendentes(l: TrechoPendente[]) {
  try { if (l.length) localStorage.setItem(PENDENTES, JSON.stringify(l)); else localStorage.removeItem(PENDENTES); } catch {}
}

const Ctx = createContext<TimerApi | null>(null);

export const CATEGORIAS = ["Leitura", "Idiomas", "Estudos", "Anki", "Oração", "Escrita", "Pesquisa", "Exercício", "Outro"];

export function describe(st: TimerState): string {
  if (st.category === "Leitura" && st.bookTitle) return st.bookTitle;
  if (st.category === "Estudos" && st.noteTitle) return st.noteTitle;
  // MAR (imersão) fica "MAR · título", para ser reconhecido em todo lugar (o idioma já vai na coluna language)
  if (st.category === "Idiomas" && ehMar(st.label)) return st.label;
  if (st.category === "Idiomas" && st.language) return st.label ? `${st.language} · ${st.label}` : st.language;
  return st.label;
}

function beep() {
  try {
    const ac = new AudioContext();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.value = 660;
    g.gain.setValueAtTime(0.15, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 1.2);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 1.2);
  } catch {}
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<TimerState>(initial);
  // o estado de agora, para quem só precisa consultá-lo num clique (sem redesenhar a cada segundo)
  const atual = useRef(s);
  atual.current = s;
  const ver = useCallback(() => atual.current, []);
  const [now, setNow] = useState(() => Date.now());
  const [lastSaved, setLastSaved] = useState(0);
  const [pending, setPending] = useState<PendingPages | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setS({ ...initial, ...JSON.parse(raw) });
      const p = localStorage.getItem(KEY + "-pendente");
      if (p) setPending(JSON.parse(p));
    } catch {}
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
      if (pending) localStorage.setItem(KEY + "-pendente", JSON.stringify(pending));
      else localStorage.removeItem(KEY + "-pendente");
    } catch {}
  }, [s, pending]);

  useEffect(() => {
    if (!s.running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [s.running]);

  const seconds = s.elapsed + (s.running && s.startedAt ? (now - s.startedAt) / 1000 : 0);
  const target = Math.max(60, (s.phase === "foco" ? s.focusMin : s.pausaLonga ? s.longBreakMin : s.breakMin) * 60 + s.ajuste);
  const remaining = Math.max(0, target - seconds);

  // insert comum (também o do MAR quando o título sumiu: fica "MAR · título", sem vínculo)
  const insertComum = useCallback(async (secs: number, st: TimerState, startedIso: string) => {
    await supabase().from("study_sessions").insert({
      day: dayKey(new Date(startedIso)),
      started_at: startedIso,
      seconds: Math.round(secs),
      category: st.category,
      label: describe(st),
      language: st.category === "Idiomas" && st.language ? st.language : null,
      book_id: st.category === "Leitura" && st.bookId ? st.bookId : null,
      note_id: st.category === "Estudos" && st.noteId ? st.noteId : null,
      ...(st.tarefaId ? { tarefa_id: st.tarefaId } : {}),
    });
  }, []);

  // envia um trecho do Timer ligado; sem conexão, guarda para reenviar (o mesmo trecho nunca soma duas vezes)
  const enviando = useRef(false);
  // trechos sendo enviados agora (o reenvio não manda o mesmo ao mesmo tempo)
  const emVoo = useRef(new Set<string>());
  const mandarTrecho = useCallback(async (item: TrechoPendente): Promise<boolean> => {
    const id = item.chamada.p_trecho;
    if (emVoo.current.has(id)) return false;
    emVoo.current.add(id);
    let r: Awaited<ReturnType<typeof enviarTrecho>>;
    try { r = await enviarTrecho(item.chamada); } finally { emVoo.current.delete(id); }
    if (r === "sem-titulo") {
      // o título foi apagado: o tempo fica como sessão comum "MAR · título" (a única vez que há insert comum)
      await insertComum(item.chamada.p_segundos, { ...initial, category: "Idiomas", language: item.idioma, label: `MAR · ${item.titulo}` }, item.startedIso);
      return true;
    }
    return r === "ok";
  }, [insertComum]);
  const reenviarPendentes = useCallback(async () => {
    if (enviando.current) return;
    const fila = lerPendentes();
    if (!fila.length) return;
    enviando.current = true;
    try {
      let algum = false;
      for (const item of fila) {
        if (await mandarTrecho(item)) {
          algum = true;
          gravarPendentes(lerPendentes().filter((x) => x.chamada.p_trecho !== item.chamada.p_trecho));
        }
      }
      if (algum) setLastSaved(Date.now());
    } finally {
      enviando.current = false;
    }
  }, [mandarTrecho]);
  useEffect(() => {
    void reenviarPendentes();
    const online = () => void reenviarPendentes();
    window.addEventListener("online", online);
    const t = setInterval(() => void reenviarPendentes(), 60_000);
    return () => { window.removeEventListener("online", online); clearInterval(t); };
  }, [reenviarPendentes]);

  const insert = useCallback(async (secs: number, st: TimerState, startedIso: string) => {
    if (st.category === "Idiomas" && st.marTituloId && st.marCorrida) {
      const item: TrechoPendente = {
        chamada: {
          p_corrida: st.marCorrida, p_titulo: st.marTituloId, p_segundos: Math.round(secs),
          p_desde: new Date(st.marDesde || Date.parse(startedIso)).toISOString(), p_tz: fuso(), p_trecho: novoId(),
        },
        titulo: st.marTitulo, idioma: st.language, startedIso,
      };
      // guarda antes de enviar: se a página fechar no meio, o trecho é reenviado (e não soma duas vezes)
      gravarPendentes([...lerPendentes(), item]);
      if (await mandarTrecho(item)) gravarPendentes(lerPendentes().filter((x) => x.chamada.p_trecho !== item.chamada.p_trecho));
    } else {
      await insertComum(secs, st, startedIso);
    }
    setLastSaved(Date.now());
  }, [insertComum, mandarTrecho]);

  const save = useCallback(async (secs: number, st: TimerState) => {
    if (secs < 30) return;
    const startedIso = new Date(Date.now() - secs * 1000).toISOString();
    // livro físico: pergunta a página antes de salvar (para medir páginas/palavras)
    if (st.category === "Leitura" && st.bookId && st.bookPhysical) {
      setPending({ seconds: secs, startedAt: startedIso, state: st });
      return;
    }
    await insert(secs, st, startedIso);
  }, [insert]);

  const resolvePending = useCallback(async (page: number | null) => {
    const p = pending;
    if (!p) return;
    setPending(null);
    await insert(p.seconds, p.state, p.startedAt);
    if (page === null) return;
    const sb = supabase();
    const { data: book } = await sb.from("books").select("current_page,total_pages,words_per_page,status,started_at").eq("id", p.state.bookId).single();
    if (!book || book.status === "consulta") return; // obra de consulta: não vira leitura nem muda a página
    const before = book.current_page ?? 0;
    const pages = Math.max(0, page - before);
    const words = pages * (book.words_per_page ?? 300);
    if (pages > 0) {
      await sb.from("reading_sessions").insert({
        book_id: p.state.bookId, day: dayKey(new Date(p.startedAt)), started_at: p.startedAt,
        ended_at: new Date().toISOString(), seconds: Math.round(p.seconds), words, pages, during_timer: true,
      });
    }
    const total = book.total_pages ?? 0;
    const finished = total > 0 && page >= total;
    await sb.from("books").update({
      current_page: page,
      progress: total > 0 ? Math.min(1, page / total) : 0,
      status: finished ? "lido" : book.status === "aguardando" || book.status === "pausado" ? "lendo" : book.status,
      started_at: book.started_at ?? p.startedAt,
      ...(finished ? { finished_at: new Date().toISOString(), queue_position: null } : {}),
    }).eq("id", p.state.bookId);
    setLastSaved(Date.now());
  }, [pending, insert]);

  // passagem de fase: foco → pausa (longa depois do 4º foco) → foco
  const paraPausa = useCallback((agora: number, feito: number) => setS((p) => {
    if (p.jaContou) {
      // continuação de um foco que já contou: volta à mesma pausa, sem somar outro ciclo
      const longa = p.anterior?.pausaLonga ?? false;
      return { ...p, phase: "pausa", elapsed: 0, startedAt: agora, running: true, ajuste: 0, pausaLonga: longa, salvo: 0, jaContou: false,
        anterior: { feito, contouCiclo: true, pausaLonga: longa, mar: vinculoDe(p), fim: agora } };
    }
    const hoje = dayKey();
    const serie = (p.ciclosDia === hoje ? p.serie : 0) + 1;
    const longa = serie >= Math.max(1, p.ciclosAteLonga);
    return {
      ...p, phase: "pausa", elapsed: 0, startedAt: agora, running: true, ajuste: 0, pausaLonga: longa, salvo: 0,
      anterior: { feito, contouCiclo: true, pausaLonga: longa, mar: vinculoDe(p), fim: agora },
      serie: longa ? 0 : serie, cycles: (p.ciclosDia === hoje ? p.cycles : 0) + 1, ciclosDia: hoje,
    };
  }), []);
  const paraFoco = useCallback(() => setS((p) => ({ ...p, phase: "foco", elapsed: 0, startedAt: null, running: false, ajuste: 0, pausaLonga: false, salvo: 0, jaContou: false })), []);

  // fim de fase do pomodoro
  useEffect(() => {
    if (s.mode !== "pomodoro" || !s.running || remaining > 0) return;
    beep();
    const eraFoco = s.phase === "foco";
    const vaiSerLonga = eraFoco && (s.ciclosDia === dayKey() ? s.serie : 0) + 1 >= Math.max(1, s.ciclosAteLonga);
    if (eraFoco) { void save(target - s.salvo, s); paraPausa(Date.now(), target); } else paraFoco();
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(eraFoco ? (vaiSerLonga ? "Foco concluído — hora da pausa longa" : "Foco concluído — hora da pausa") : "Pausa terminada — de volta ao foco");
    }
  }, [remaining, s, save, target, paraPausa, paraFoco]);

  const start = useCallback(() => {
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    const agora = Date.now();
    setNow(agora);
    setS((p) => (p.running ? p : {
      ...p, running: true, startedAt: agora,
      // começar um foco novo (do zero) esquece o anterior; ligado ao MAR, é outra corrida (que começa agora):
      // o pomodoro não fica com uma corrida aberta por horas (a sobra do foco anterior continua valendo)
      ...(p.phase === "foco" && p.elapsed === 0
        ? { anterior: null, salvo: 0, jaContou: false, ...(p.marTituloId ? { marCorrida: novoId(), marDesde: agora } : {}) }
        : {}),
    }));
  }, []);
  const set = useCallback((patch: Partial<TimerState>) => setS((p) => ({ ...p, ...patch })), []);

  // MAR: liga o Timer zerado ao título, em Cronômetro, Idiomas, no idioma do título
  // (com o Timer ocupado não faz nada: a tela pergunta "Encerrar e cronometrar" e chama stop() antes)
  const cronometrarMar = useCallback((t: { id: string; titulo: string }, idioma: string) => {
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    const agora = Date.now();
    setNow(agora);
    const corrida = novoId();
    setS((p) => (p.running || p.elapsed > 0 ? p : {
      ...p, mode: "livre", phase: "foco", running: true, startedAt: agora, elapsed: 0, salvo: 0, ajuste: 0, pausaLonga: false,
      anterior: null, jaContou: false, category: "Idiomas", language: idioma, label: `MAR · ${t.titulo}`,
      bookId: "", bookTitle: "", bookPhysical: false, noteId: "", noteTitle: "", tarefaId: "", tarefaTexto: "",
      marTituloId: t.id, marTitulo: t.titulo, marCorrida: corrida, marDesde: agora,
    }));
  }, []);
  // MAR: "Sim, é do MAR" com o Timer contando — o tempo desde o começo deste foco passa a ser deste título.
  // salvoVinculado: a parte deste foco que já foi salva (Continuar) já virou MAR (mar_vincular_sessao); a corrida
  // nova começa onde ela terminou. Só liga um foco de Idiomas com tempo contado e ainda sem título.
  const ligarMar = useCallback((t: { id: string; titulo: string }, opcoes: { salvoVinculado?: boolean } = {}) => {
    setS((p) => {
      const agora = Date.now();
      const segs = p.elapsed + (p.running && p.startedAt ? (agora - p.startedAt) / 1000 : 0);
      if (p.phase !== "foco" || p.category !== "Idiomas" || p.marTituloId || segs <= 0) return p;
      const novo = Math.max(0, segs - (opcoes.salvoVinculado ? p.salvo : 0));
      return { ...p, label: `MAR · ${t.titulo}`, marTituloId: t.id, marTitulo: t.titulo, marCorrida: novoId(), marDesde: agora - Math.round(novo * 1000) };
    });
  }, []);
  // stop estável (o de api muda a cada tique): para quem só precisa encerrar num clique
  const stopRef = useRef<() => Promise<void>>(async () => {});
  const stopEstavel = useCallback(() => stopRef.current(), []);

  /**
   * Troca de categoria, idioma, rótulo, livro, tarefa ou modo — de qualquer tela. Ligado ao MAR com tempo contado:
   * pergunta se encerra e salva antes (trocar no meio da corrida contaria em dobro); não → nada muda (false).
   * Com o Timer zerado, a troca também desliga do MAR.
   */
  const trocar = useCallback(async (patch: Partial<TimerState>): Promise<boolean> => {
    const p = atual.current;
    if (!p.marTituloId) { set(patch); return true; }
    const segs = p.elapsed + (p.running && p.startedAt ? (Date.now() - p.startedAt) / 1000 : 0);
    if (segs > 0) {
      if (!confirm(`O Timer está ligado ao MAR (${p.marTitulo}, ${duracao(segs)}). Encerrar e salvar antes de trocar?`)) return false;
      await stopRef.current();   // salva e já desliga do MAR
      set(patch);
      return true;
    }
    setS((q) => ({ ...q, ...semMar(q), ...patch }));
    return true;
  }, [set]);

  // estado sem o relógio: só muda quando o timer liga, pausa, troca de fase ou salva
  const estado = useMemo<TimerEstado>(
    () => ({ running: s.running, phase: s.phase, set, trocar, start, ver, lastSaved, cronometrarMar, ligarMar, stop: stopEstavel }),
    [s.running, s.phase, set, trocar, start, ver, lastSaved, cronometrarMar, ligarMar, stopEstavel],
  );

  const api: TimerApi = {
    ...s,
    seconds,
    remaining,
    lastSaved,
    pending,
    resolvePending,
    what: describe(s),
    start,
    pause: () =>
      setS((p) =>
        p.running && p.startedAt ? { ...p, running: false, elapsed: p.elapsed + (Date.now() - p.startedAt) / 1000, startedAt: null } : p,
      ),
    stop: async () => {
      const secs = seconds;
      const snapshot = s;
      setS((p) => ({
        ...p, running: false, startedAt: null, elapsed: 0, phase: "foco", ajuste: 0, pausaLonga: false, salvo: 0,
        // encerrou um foco: ainda dá para voltar a ele e continuar (ligado ao MAR: na mesma corrida)
        jaContou: false,
        anterior: p.phase === "foco" && secs >= 30
          ? { feito: secs, contouCiclo: p.jaContou, pausaLonga: p.anterior?.pausaLonga ?? false, mar: vinculoDe(p), fim: Date.now() }
          : p.anterior,
        // a gravação (abaixo) usa o snapshot, que ainda tem o vínculo; o Timer zerado fica livre
        ...semMar(p),
      }));
      if (snapshot.phase === "foco") await save(secs - snapshot.salvo, snapshot);
    },
    reset: () => setS((p) => ({ ...p, running: false, startedAt: null, elapsed: 0, phase: "foco", ajuste: 0, pausaLonga: false, salvo: 0, ...semMar(p) })),
    set,
    trocar,
    alvo: target,
    ajustar: (minutos: number) => setS((p) => {
      const base = (p.phase === "foco" ? p.focusMin : p.pausaLonga ? p.longBreakMin : p.breakMin) * 60;
      // nunca menos de 1 min no total
      return { ...p, ajuste: Math.max(60 - base, p.ajuste + minutos * 60) };
    }),
    pular: () => {
      if (s.phase === "foco") {
        if (s.mode === "pomodoro") { void save(seconds - s.salvo, s); paraPausa(Date.now(), seconds); }
      } else paraFoco();
    },
    continuarFoco: (minutos: number) => { const agora = Date.now(); setNow(agora); setS((p) => {
      const a = p.anterior;
      if (!a) return p;
      return {
        ...p, phase: "foco", running: true, startedAt: agora, elapsed: a.feito, salvo: a.feito, pausaLonga: false,
        // o alvo passa a ser o que já foi feito + os minutos pedidos
        ajuste: a.feito + minutos * 60 - p.focusMin * 60,
        // aquele foco já contou como ciclo: ao terminar de novo, não conta outra vez
        jaContou: a.contouCiclo,
        anterior: { ...a },
        // estava ligado ao MAR: volta à mesma corrida (o mesmo começo), se o Timer ainda está em Idiomas e o foco
        // terminou há pouco; muito depois, é outra corrida, que começa agora (não puxa o que foi marcado no meio)
        ...(a.mar && p.category === "Idiomas" && !p.marTituloId
          ? (agora - (a.fim ?? 0) <= CONTINUAR_MESMA_CORRIDA_MS
            ? { marTituloId: a.mar.id, marTitulo: a.mar.titulo, marCorrida: a.mar.corrida, marDesde: a.mar.desde, label: `MAR · ${a.mar.titulo}` }
            : { marTituloId: a.mar.id, marTitulo: a.mar.titulo, marCorrida: novoId(), marDesde: agora, label: `MAR · ${a.mar.titulo}` })
          : {}),
      };
    }); },
  };
  stopRef.current = api.stop;

  return (
    <EstadoCtx.Provider value={estado}>
      <Ctx.Provider value={api}>{children}</Ctx.Provider>
    </EstadoCtx.Provider>
  );
}

/**
 * Para telas que só precisam saber se o timer está ligado (leitor, aulas, escrita, lectio…).
 * Não redesenha a tela a cada tique do relógio, ao contrário de useTimer().
 */
export interface TimerEstado {
  running: boolean;
  phase: TimerState["phase"];
  set: (patch: Partial<TimerState>) => void;
  /** troca categoria, livro, tarefa…: ligado ao MAR com tempo contado, pergunta "Encerrar e salvar antes?" (não → false) */
  trocar: (patch: Partial<TimerState>) => Promise<boolean>;
  start: () => void;
  /** o estado completo de agora (categoria, idioma, rótulo…), lido na hora — não redesenha a tela */
  ver: () => Readonly<TimerState>;
  /** quando o Timer gravou pela última vez (ms; 0 = ainda não gravou): para recarregar os números */
  lastSaved: number;
  /** MAR "▶ Cronometrar": com o Timer parado e zerado, liga em Cronômetro, Idiomas, no idioma, rótulo "MAR · título" */
  cronometrarMar: (t: { id: string; titulo: string }, idioma: string) => void;
  /**
   * MAR "Sim, é do MAR" com o Timer contando: liga o foco atual ao título (desde o começo deste foco; com
   * salvoVinculado, só a parte ainda não salva). Só age num foco de Idiomas com tempo e sem título.
   */
  ligarMar: (t: { id: string; titulo: string }, opcoes?: { salvoVinculado?: boolean }) => void;
  /** Encerrar e salvar (estável: não muda a cada tique) */
  stop: () => Promise<void>;
}
const EstadoCtx = createContext<TimerEstado | null>(null);
export function useTimerEstado() {
  const c = useContext(EstadoCtx);
  if (!c) throw new Error("useTimerEstado fora do TimerProvider");
  return c;
}

export function useTimer() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTimer fora do TimerProvider");
  return c;
}
