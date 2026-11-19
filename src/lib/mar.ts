"use client";
/**
 * MAR (imersão) com tempo de verdade — a parte sem tela.
 * - Tipos de mar_titulos e mar_log.
 * - Espelhos exatos das funções do banco (mar_dur_seg e mar_ref): o botão diz o que vai contar antes de clicar.
 * - Chamadas ao banco (mar_registrar, mar_desfazer, mar_vincular_sessao, mar_apagar_sessao, mar_timer).
 * - Indicadores do painel (hoje, média por dia, sequência, total rumo a 1.000 h) e os textos da faixa.
 * Regra única: todo minuto do MAR é uma linha de study_sessions; nada aqui soma tempo a partir do mar_log.
 */
import { supabase } from "./supabase/client";
import { addDays, dayKey, DIAS, MESES, nf, parseDay, weekStart } from "./dates";
import type { Periodo } from "./periodo";
import { MAR_META_HORAS } from "./tempo";

// ─── tipos ───

export type TipoMar = "filme" | "serie" | "youtube" | "podcast" | "livro";
export type Situacao = "quero" | "assistindo" | "visto";
export type Acao = "ep" | "parcial" | "min" | "ajuste";
export type TipoRegistro = Acao | "timer";

/** Uma linha de mar_titulos. */
export interface Titulo {
  id: string;
  user_id?: string;
  idioma: string;
  titulo: string;
  tipo: TipoMar;
  situacao: Situacao;
  onde: string;
  legenda: "en" | "sem";
  nivel: 1 | 2 | 3;
  progresso: string;
  nota: string;
  posicao: number;
  visto_em: string | null;
  created_at: string;
  /** séries: nº de episódios de cada temporada (T1 inteira, depois T2…) */
  temporadas: number[] | null;
  /** episódios já vistos, contando desde o T1E1 */
  ep_vistos: number | null;
  /** minutos de cada episódio (série) ou a duração do filme; vídeo/podcast/livro: minutos por vez */
  min_ep: number | null;
  /** exceções, em minutos: {"2": 23} (toda a T2) e {"10.17": 44} (só o T10E17) */
  minutagem: Record<string, number>;
  /** segundos do próximo episódio (ou do filme) que já contaram ("parei em 12 min") */
  parcial_seg: number;
}

export interface Credito { log: string; seg: number }

/** Uma linha de mar_log (o livro-caixa das ações). */
export interface Registro {
  id: string;
  titulo_id: string;
  dia: string;
  tipo: TipoRegistro;
  episodios: number;
  /** o que a sessão desta linha (sessao_id) tem */
  segundos: number;
  /** o que veio do Timer: [{log: id da corrida, seg}] */
  credito: Credito[];
  /** "T1E3", "T1E3–T1E5", "T1E3 até 12 min", "+30 min", "posição T1E5", "terminei", "Timer" */
  ref: string;
  created_at: string;
  sessao_id: string | null;
  // corrida do Timer (tipo 'timer') e marcações dentro dela
  medido_seg?: number;
  sobra_seg?: number;
  sobra_ate?: string | null;
  corrida?: string | null;
  inicio?: string | null;
  ontem?: boolean;
  sem_timer?: boolean;
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
  chave?: string | null;
}

/** Colunas do mar_log que as telas costumam buscar. */
export const COLUNAS_LOG = "id,titulo_id,dia,tipo,episodios,segundos,credito,ref,created_at,sessao_id,corrida,ontem,sem_timer,sobra_seg,sobra_ate";

export interface RespostaOk {
  ok: true;
  conflito?: false;
  /** o mesmo clique chegou duas vezes: o banco devolveu o que já tinha gravado */
  repetido?: boolean;
  acao: Acao;
  chave: string;
  log: string;
  /** minutagem declarada (segundos) */
  declarado: number;
  /** quanto veio do Timer (sobra de uma corrida) */
  coberto: number;
  /** o que a sessão nova tem (declarado − coberto); 0 = não criou sessão */
  segundos: number;
  /** o dia em que contou (aaaa-mm-dd) */
  dia: string;
  ref: string;
  sessao: string | null;
  /** o título como ficou (troque o cartão por este) */
  titulo: Titulo;
  /** o título como estava antes */
  antes: Titulo;
  ontem: boolean;
  semTimer: boolean;
  /** quando começou o que foi visto (ISO, aproximado: agora − declarado; "foi ontem" = ontem às 12:00) */
  inicio: string;
}
export interface RespostaConflito {
  ok: true;
  conflito: true;
  acao: Acao;
  chave: string;
  /** o título como está no banco (outro aparelho mexeu) */
  titulo: Titulo;
  antes: Titulo;
  ep_vistos: number;
}
export interface RespostaErro {
  ok: false;
  /** pronta para a tela (sem o prefixo "MAR: ") */
  msg: string;
  /** falha de rede: dá para tentar de novo com a mesma chave (não marca duas vezes) */
  rede: boolean;
  acao?: Acao;
  chave?: string;
}
export type RespostaMar = RespostaOk | RespostaConflito | RespostaErro;

export interface OpcoesRegistrar {
  /** 'ep': episódios (1 a 20; padrão 1) · 'parcial': minuto em que parou · 'min': minutos (1 a 300) · 'ajuste': episódios vistos */
  valor?: number | null;
  /** 'ajuste': "parei em" (minutos) do próximo episódio */
  parcialMin?: number | null;
  /** "Foi ontem": conta ontem, fora de qualquer corrida do Timer */
  ontem?: boolean;
  /** 'ajuste': nova situação */
  situacao?: Situacao | null;
  /** "Somar mesmo": não usa a sobra do Timer nem entra em corrida */
  semTimer?: boolean;
  /** ep_vistos que a tela mostrava (padrão: t.ep_vistos); null = não conferir */
  epEsperado?: number | null;
  /** para "Tentar de novo": a mesma chave do clique que falhou */
  chave?: string;
}

// ─── limites e constantes (iguais aos do banco) ───

export const MAR_LIMITES = {
  /** episódios por vez */
  eps: 20,
  /** minutos por "+ min" */
  min: 300,
  /** "parei em" máximo, em segundos */
  parcialSeg: 5 * 3600,
  /** de 60 min para cima, um clique só pede um 2º toque */
  confirmarSeg: 3600,
  /** o 2º toque só vale depois de… (ms) */
  confirmarEsperaMs: 400,
  /** o 2º toque fica disponível por… (ms) */
  confirmarJanelaMs: 4000,
  /** a sobra do Timer cobre episódios marcados até… (horas) */
  sobraHoras: 6,
  /** a faixa depois de cada ação fica… (ms) */
  faixaMs: 15000,
  /** a pergunta do Timer salvo: só sessões de 5 min ou mais */
  perguntaMinSeg: 300,
} as const;

/** A cor de Idiomas (a parte do MAR nos gráficos). */
export const COR_MAR = "#1baf7a";

export const NOME_SITUACAO: Record<Situacao, string> = { quero: "Quero ver", assistindo: "Assistindo", visto: "Vistos" };

/** Preenche o que pode vir faltando (linhas antigas, o mock): minutagem {}, parcial 0, temporadas []. */
export function normalizarTitulo(x: Partial<Titulo> & { id: string }): Titulo {
  return {
    idioma: "Inglês", titulo: "", tipo: "serie", situacao: "quero", onde: "", legenda: "en", nivel: 2, progresso: "", nota: "",
    posicao: 0, visto_em: null, created_at: "", ep_vistos: 0, min_ep: 25,
    ...x,
    temporadas: x.temporadas ?? [],
    minutagem: x.minutagem && typeof x.minutagem === "object" && !Array.isArray(x.minutagem) ? x.minutagem : {},
    parcial_seg: Number(x.parcial_seg) || 0,
  } as Titulo;
}

// ─── formato ───

/** 1320 → "22 min" · 3600 → "1 h" · 3960 → "1 h 06" */
export function duracao(seg: number): string {
  const total = Math.round(Math.max(0, seg) / 60);
  const h = Math.floor(total / 60), m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}
/** "2026-12-01" → "1/12" */
export const dataCurta = (k: string) => { const [, m, d] = k.split("-"); return `${Number(d)}/${Number(m)}`; };
const hora = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const diasEntre = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 864e5) + 1;

// ─── temporadas (movido do painel) ───

export const totalEps = (t: Pick<Titulo, "temporadas">) => (t.temporadas ?? []).reduce((a, b) => a + b, 0);

/** o último episódio visto: temporada (1…) e episódio dentro dela; 0 = não começou */
export function ondeEsta(t: Pick<Titulo, "temporadas" | "ep_vistos">) {
  let k = t.ep_vistos ?? 0;
  const ts = t.temporadas ?? [];
  if (k <= 0 || !ts.length) return { temp: 1, ep: 0 };
  for (let i = 0; i < ts.length; i++) { if (k <= ts[i]) return { temp: i + 1, ep: k }; k -= ts[i]; }
  return { temp: ts.length, ep: ts[ts.length - 1] };
}

/** "10, 12, 8" ou "3x10" (3 temporadas de 10) → [10, 12, 8] */
export function lerTemporadas(txt: string): number[] {
  const x = txt.trim().toLowerCase().match(/^(\d+)\s*[x×]\s*(\d+)$/);
  if (x) return Array.from({ length: Math.min(60, Number(x[1])) }, () => Number(x[2]));
  return txt.split(/[,;\s]+/).map((v) => parseInt(v, 10)).filter((v) => v > 0 && v < 1000).slice(0, 60);
}

// ─── espelhos do banco ───

/** O valor da minutagem vale se for um inteiro de 1 a 999 (como no banco: ~ '^[0-9]{1,3}$' e nullif 0). */
function minutoValido(v: unknown): number | null {
  let n: number | null = null;
  if (typeof v === "number") n = Number.isInteger(v) && v >= 0 && v <= 999 ? v : null;
  else if (typeof v === "string") n = /^[0-9]{1,3}$/.test(v) ? parseInt(v, 10) : null;
  return n ? n : null;
}

/** Temporada (1…) e episódio dentro dela do episódio k (k = 1 é o T1E1); null fora das temporadas. */
function posicaoDe(temporadas: number[] | null | undefined, k: number): { temp: number; ep: number } | null {
  let antes = 0;
  for (const [i, n] of (temporadas ?? []).entries()) {
    if (k > antes && k <= antes + n) return { temp: i + 1, ep: k - antes };
    antes += n;
  }
  return null;
}

/**
 * Minutagem do episódio k, em segundos — o mesmo que mar_dur_seg no banco:
 * 60 × (minutagem["T.E"] ?? minutagem["T"] ?? min_ep ?? 25). Valor que não seja inteiro de 1 a 999 é ignorado.
 */
export function durSeg(t: Pick<Titulo, "temporadas" | "minutagem" | "min_ep">, k: number): number {
  const p = posicaoDe(t.temporadas, k);
  const mm = (t.minutagem ?? {}) as Record<string, unknown>;
  const ex = p ? minutoValido(mm[`${p.temp}.${p.ep}`]) ?? minutoValido(mm[String(p.temp)]) : null;
  return 60 * (ex ?? t.min_ep ?? 25);
}

/** "T2E5" do episódio k — o mesmo que mar_ref no banco ("E{k}" fora das temporadas). */
export function refEp(t: Pick<Titulo, "temporadas">, k: number): string {
  const p = posicaoDe(t.temporadas, k);
  return p ? `T${p.temp}E${p.ep}` : `E${k}`;
}

/**
 * O que o botão principal vai marcar: série → o próximo episódio; filme → o resto do filme.
 * seg = o que vai contar (já sem o "parei em"); dur = a minutagem inteira. null: vídeo/podcast/livro, série sem
 * temporadas ou que acabou, filme sem duração ou já visto.
 */
export function proximo(t: Titulo): { k: number; ref: string; seg: number; dur: number; parcial: number } | null {
  const parcial = t.parcial_seg ?? 0;
  if (t.tipo === "serie") {
    const total = totalEps(t), k = (t.ep_vistos ?? 0) + 1;
    if (!total || k > total) return null;
    const dur = durSeg(t, k);
    return { k, ref: refEp(t, k), seg: Math.max(0, dur - parcial), dur, parcial };
  }
  if (t.tipo === "filme") {
    if (!t.min_ep || t.situacao === "visto") return null;
    const dur = t.min_ep * 60;
    return { k: 1, ref: "", seg: Math.max(0, dur - parcial), dur, parcial };
  }
  return null;
}

/**
 * Os próximos n episódios ("Vários episódios"): n limitado ao que falta e a 20, ref curta ("T1E6–E8",
 * "T1E24–T2E2") e o total que vai contar (sem o "parei em"), igual ao banco.
 */
export function proximos(t: Titulo, n: number): { n: number; ref: string; seg: number } | null {
  const total = totalEps(t), ini = (t.ep_vistos ?? 0) + 1;
  if (t.tipo !== "serie" || !total || ini > total) return null;
  const q = Math.max(1, Math.min(Math.floor(n) || 1, MAR_LIMITES.eps, total - ini + 1));
  let seg = 0;
  for (let k = ini; k < ini + q; k++) seg += durSeg(t, k);
  seg = Math.max(0, seg - (t.parcial_seg ?? 0));
  const a = posicaoDe(t.temporadas, ini)!, z = posicaoDe(t.temporadas, ini + q - 1)!;
  const ref = q === 1 ? `T${a.temp}E${a.ep}` : a.temp === z.temp ? `T${a.temp}E${a.ep}–E${z.ep}` : `T${a.temp}E${a.ep}–T${z.temp}E${z.ep}`;
  return { n: q, ref, seg };
}

/** Segundos já vistos (minutagem dos episódios vistos + o "parei em"); filme: o "parei em" (ou tudo, se visto). */
export function segundosVisto(t: Titulo): number {
  if (t.tipo === "filme") return t.situacao === "visto" ? (t.min_ep ?? 0) * 60 : t.parcial_seg ?? 0;
  if (t.tipo !== "serie") return 0;
  const v = Math.min(t.ep_vistos ?? 0, totalEps(t));
  let s = 0;
  for (let k = 1; k <= v; k++) s += durSeg(t, k);
  return s + (v < totalEps(t) ? t.parcial_seg ?? 0 : 0);
}
/** Segundos que faltam (minutagem dos episódios que faltam − o "parei em"); filme: duração − "parei em". */
export function segundosFalta(t: Titulo): number {
  if (t.tipo === "filme") return t.situacao === "visto" ? 0 : Math.max(0, (t.min_ep ?? 0) * 60 - (t.parcial_seg ?? 0));
  if (t.tipo !== "serie") return 0;
  const total = totalEps(t), v = t.ep_vistos ?? 0;
  if (v >= total) return 0;
  let s = 0;
  for (let k = v + 1; k <= total; k++) s += durSeg(t, k);
  return Math.max(0, s - (t.parcial_seg ?? 0));
}
/** Minutos já vistos (Σ durSeg dos vistos + "parei em"). */
export const minutosVisto = (t: Titulo) => Math.round(segundosVisto(t) / 60);
/** Minutos que faltam (Σ durSeg dos que faltam − "parei em"). */
export const minutosFalta = (t: Titulo) => Math.round(segundosFalta(t) / 60);
/** Minutagem da série inteira, em segundos. */
export function segundosSerie(t: Titulo): number {
  let s = 0;
  for (let k = 1; k <= totalEps(t); k++) s += durSeg(t, k);
  return s;
}

// ─── leitura de minutos ───

/**
 * Minutos de um texto: "22", "22m", "22 min" → 22 · "22:30" → 23 (min:seg, arredonda) · "1h52", "1 h 52", "1:52" → 112
 * · "1:52:30" → 113 · "90 min" → 90 · "22.5" → 23. Com dois números e ":", o 1º abaixo de 5 é hora
 * ("1:52" = 1 h 52), de 5 para cima é minuto ("22:30" = 22 min 30 s). null se não entender ou fora de 1 a 999.
 */
export function lerMinutos(txt: string): number | null {
  const s = String(txt ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  let m: RegExpMatchArray | null;
  let v: number | null = null;
  if ((m = s.match(/^(\d{1,2}) ?h(?:oras?)? ?(?:(\d{1,2}) ?(?:m|min|minutos?)?)?$/))) v = Number(m[1]) * 60 + Number(m[2] ?? 0);
  else if ((m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/))) v = Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 60;
  else if ((m = s.match(/^(\d{1,3}):(\d{2})$/))) v = Number(m[1]) < 5 ? Number(m[1]) * 60 + Number(m[2]) : Number(m[1]) + Number(m[2]) / 60;
  else if ((m = s.match(/^(\d{1,3}(?:[.,]\d+)?) ?(?:m|min|minutos?|')?$/))) v = Number(m[1].replace(",", "."));
  if (v === null || !Number.isFinite(v)) return null;
  const r = Math.round(v);
  return r >= 1 && r <= 999 ? r : null;
}

/**
 * "Colar a lista": "22 22 23 44", "22 min, 23 min", "22:30\n21:58"… → minutos, um por episódio.
 * qtd = episódios da temporada (o que passar é ignorado); padrao = minutos do padrão (para contar os diferentes).
 * aviso: "24 preenchidos · 3 diferentes do padrão · 2 a mais ignorados".
 */
export function lerListaMinutos(txt: string, qtd?: number, padrao?: number): {
  minutos: number[]; preenchidos: number; diferentes: number; aMais: number; invalidos: number; aviso: string;
} {
  const norm = String(txt ?? "").toLowerCase()
    .replace(/(\d)\s*h(?:oras?)?\s*(\d)/g, "$1h$2")
    .replace(/(\d)\s*h(?:oras?)?\b/g, "$1h")
    .replace(/(\d)\s*(?:minutos?|min|m|')(?![a-z])/g, "$1m");
  const tokens = norm.split(/[\s,;|]+/).filter(Boolean);
  const lidos: number[] = [];
  let invalidos = 0;
  for (const tk of tokens) { const v = lerMinutos(tk); if (v === null) invalidos++; else lidos.push(v); }
  const limite = qtd !== undefined && qtd >= 0 ? qtd : lidos.length;
  const minutos = lidos.slice(0, limite);
  const aMais = Math.max(0, lidos.length - minutos.length);
  const diferentes = padrao ? minutos.filter((v) => v !== padrao).length : minutos.length;
  const partes = [`${minutos.length} ${minutos.length === 1 ? "preenchido" : "preenchidos"}`];
  if (padrao) partes.push(`${diferentes} ${diferentes === 1 ? "diferente" : "diferentes"} do padrão`);
  if (aMais) partes.push(`${aMais} a mais ${aMais === 1 ? "ignorado" : "ignorados"}`);
  if (invalidos) partes.push(`${invalidos} não ${invalidos === 1 ? "entendido" : "entendidos"}`);
  return { minutos, preenchidos: minutos.length, diferentes, aMais, invalidos, aviso: partes.join(" · ") };
}

/**
 * Tirar a temporada `temporadaTirada` (1…) do meio: as exceções dela saem e as das seguintes descem uma
 * ("3" → "2", "3.5" → "2.5"). Chaves de outro formato ficam como estão.
 */
export function deslocarMinutagem(minutagem: Record<string, number>, temporadaTirada: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(minutagem ?? {})) {
    const m = k.match(/^(\d+)(\.\d+)?$/);
    if (!m) { out[k] = v; continue; }
    const tp = Number(m[1]);
    if (tp === temporadaTirada) continue;
    out[tp > temporadaTirada ? `${tp - 1}${m[2] ?? ""}` : k] = v;
  }
  return out;
}

/** O fuso do aparelho (o dia de cada marcação é o deste fuso). */
export function fuso(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo"; } catch { return "America/Sao_Paulo"; }
}

/** Um id novo (uuid v4): crypto.randomUUID, com reserva para páginas fora de https. */
export function novoId(): string {
  try { if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID(); } catch {}
  const b = new Uint8Array(16);
  try { crypto.getRandomValues(b); } catch { for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ─── banco ───

const MSG_REDE = "Não salvou (sem conexão?). Nada mudou.";
type ErroPg = { message?: string; code?: string } | null;

/** Erro de rede (o pedido nem chegou ou a resposta se perdeu)? Erros do Postgres/PostgREST sempre têm código. */
export function ehErroDeRede(error: ErroPg, status?: number): boolean {
  if (!error) return false;
  if (status === 0) return true;
  if (!error.code && (status === undefined || status >= 500)) return true;
  return /failed to fetch|networkerror|load failed|fetch failed|network request failed/i.test(error.message ?? "");
}
function erro(error: ErroPg, status: number | undefined, extra: { acao?: Acao; chave?: string } = {}): RespostaErro {
  const m = String(error?.message ?? "");
  if (/^MAR:\s*/.test(m)) return { ok: false, msg: m.replace(/^MAR:\s*/, ""), rede: false, ...extra };
  if (!error || ehErroDeRede(error, status)) return { ok: false, msg: MSG_REDE, rede: true, ...extra };
  return { ok: false, msg: `Não salvou (${m || "erro no servidor"}). Nada mudou.`, rede: false, ...extra };
}
async function chamar<T>(fn: string, args: Record<string, unknown>): Promise<{ data: T | null; error: ErroPg; status?: number }> {
  try {
    const r = await supabase().rpc(fn, args);
    return { data: (r.data ?? null) as T | null, error: r.error as ErroPg, status: r.status };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) }, status: 0 };
  }
}

/**
 * Marca uma ação no MAR (mar_registrar): episódio(s), "parei em", minutos livres ou ajuste de posição.
 * Um clique = uma chave (passe a mesma em "Tentar de novo"). Nada é otimista: troque o cartão pelo `titulo` devolvido.
 */
export async function registrar(t: Titulo, acao: Acao, opts: OpcoesRegistrar = {}): Promise<RespostaMar> {
  const chave = opts.chave ?? novoId();
  const ep = opts.epEsperado === undefined ? t.ep_vistos ?? 0 : opts.epEsperado;
  const { data, error, status } = await chamar<Record<string, unknown>>("mar_registrar", {
    p_titulo: t.id,
    p_acao: acao,
    p_valor: opts.valor ?? null,
    p_parcial_min: opts.parcialMin ?? null,
    p_ontem: !!opts.ontem,
    p_tz: fuso(),
    p_chave: chave,
    p_situacao: opts.situacao ?? null,
    p_ep_esperado: ep,
    p_sem_timer: !!opts.semTimer,
  });
  if (error || !data || typeof data !== "object") return erro(error, error ? status : 0, { acao, chave });
  const titulo = data.titulo ? normalizarTitulo(data.titulo as Titulo) : t;
  if (data.conflito) return { ok: true, conflito: true, acao, chave, titulo, antes: t, ep_vistos: Number(data.ep_vistos ?? titulo.ep_vistos ?? 0) };
  const segundos = Number(data.segundos ?? 0);
  const declarado = data.declarado === undefined ? segundos : Number(data.declarado);
  const ontem = !!opts.ontem;
  const inicio = ontem
    ? (() => { const d = parseDay(String(data.dia ?? dayKey(addDays(new Date(), -1)))); d.setHours(12, 0, 0, 0); return d.toISOString(); })()
    : new Date(Date.now() - declarado * 1000).toISOString();
  return {
    ok: true, repetido: !!data.repetido, acao, chave,
    log: String(data.log ?? ""), declarado, coberto: Number(data.coberto ?? 0), segundos,
    dia: String(data.dia ?? dayKey()), ref: String(data.ref ?? ""), sessao: (data.sessao as string | null) ?? null,
    titulo, antes: t, ontem, semTimer: !!opts.semTimer, inicio,
  };
}

export type RespostaDesfazer =
  | { ok: true; nada: boolean; ref: string; segundos: number; tipo: TipoRegistro | ""; titulo: Titulo; antes: Titulo }
  | RespostaErro;

/** Desfaz a última ação do título (mar_desfazer, a mais recente primeiro). nada = não havia o que desfazer. */
export async function desfazer(t: Titulo): Promise<RespostaDesfazer> {
  const { data, error, status } = await chamar<Record<string, unknown>>("mar_desfazer", { p_titulo: t.id });
  if (error) return erro(error, status);
  if (!data) return { ok: true, nada: true, ref: "", segundos: 0, tipo: "", titulo: t, antes: t };
  return {
    ok: true, nada: false, ref: String(data.ref ?? ""), segundos: Number(data.segundos ?? 0), tipo: (data.tipo as TipoRegistro) ?? "",
    titulo: data.titulo ? normalizarTitulo(data.titulo as Titulo) : t, antes: t,
  };
}

/** "Sim, é do MAR" com o Timer já salvo: a sessão do Timer passa a ser deste título (vira uma corrida). */
export async function vincularSessao(sessaoId: string, t: Titulo): Promise<{ ok: true; log: string | null } | RespostaErro> {
  const { data, error, status } = await chamar<string>("mar_vincular_sessao", { p_sessao: sessaoId, p_titulo: t.id });
  if (error) return erro(error, status);
  return { ok: true, log: data ?? null };
}

/** Apaga uma sessão do MAR na tela do Timer sem desacertar o livro-caixa (mar_apagar_sessao). */
export async function apagarSessaoMar(id: string): Promise<{ ok: true } | RespostaErro> {
  const { error, status } = await chamar<null>("mar_apagar_sessao", { p_sessao: id });
  if (error) return erro(error, status);
  return { ok: true };
}

/** Uma gravação do Timer ligado a um título (os parâmetros de mar_timer). */
export interface TrechoTimer {
  p_corrida: string;
  p_titulo: string;
  p_segundos: number;
  p_desde: string;
  p_tz: string;
  p_trecho: string;
}
/**
 * Envia uma gravação do Timer ligado (mar_timer). 'ok' · 'rede' (guarde e reenvie com o mesmo trecho: não soma
 * de novo) · 'sem-titulo' (o título foi apagado: grave como sessão comum) · 'erro' (outro erro do servidor).
 */
export async function enviarTrecho(p: TrechoTimer): Promise<"ok" | "rede" | "sem-titulo" | "erro"> {
  const { error, status } = await chamar<string>("mar_timer", { ...p });
  if (!error) return "ok";
  if (/MAR:\s*título não encontrado/i.test(error.message ?? "")) return "sem-titulo";
  return ehErroDeRede(error, status) ? "rede" : "erro";
}

// ─── livro-caixa ───

/** A última ação desfazível do título (a mais recente que não seja do Timer). */
export function ultimaAcao(log: Registro[], tituloId: string): Registro | null {
  let r: Registro | null = null;
  for (const l of log) {
    if (l.titulo_id !== tituloId || l.tipo === "timer") continue;
    if (!r || l.created_at > r.created_at || (l.created_at === r.created_at && l.id > r.id)) r = l;
  }
  return r;
}
/** O tempo que a ação pôs: a sessão dela + o que veio do Timer. */
export const segundosDaAcao = (r: Pick<Registro, "segundos" | "credito">) => (r.segundos ?? 0) + (r.credito ?? []).reduce((a, c) => a + (Number(c.seg) || 0), 0);

function rotuloAcao(nome: string, tipo: string, ref: string): string {
  if (tipo === "ep") return ref || nome;
  if (tipo === "parcial") return ref.startsWith("até") ? `${nome} ${ref}` : ref || nome;
  if (tipo === "ajuste") return ref === "terminei" ? `${nome} → Vistos` : `${nome} · ${ref}`;
  return nome;
}
/** "T1E5 · 22 min" (para "Desfazer o último (…)"). */
export function textoUltima(t: Pick<Titulo, "titulo">, r: Registro): string {
  const s = segundosDaAcao(r);
  return `${rotuloAcao(t.titulo, r.tipo, r.ref)}${s > 0 ? ` · ${duracao(s)}` : ""}`;
}
/** De 60 min para cima, desfazer pede confirmação. */
export const desfazerPedeConfirmacao = (r: Pick<Registro, "segundos" | "credito">) => segundosDaAcao(r) >= MAR_LIMITES.confirmarSeg;
/** 'Desfazer “Interstellar” (−1 h 42)?' */
export function textoConfirmarDesfazer(t: Pick<Titulo, "titulo">, r: Registro): string {
  return `Desfazer “${rotuloAcao(t.titulo, r.tipo, r.ref)}” (−${duracao(segundosDaAcao(r))})?`;
}
/** 'Desfeito: T1E6 (−22 min)' */
export function textoDesfeito(r: Extract<RespostaDesfazer, { ok: true }>): string {
  if (r.nada) return "Nada para desfazer.";
  return `Desfeito: ${rotuloAcao(r.antes.titulo, r.tipo, r.ref)}${r.segundos > 0 ? ` (−${duracao(r.segundos)})` : ""}`;
}

// ─── faixa (15 s depois de cada ação) ───

export interface Faixa {
  /** o texto, sem os botões ("✓ Friends T1E6 · +22 min") */
  texto: string;
  tom: "ok" | "aviso" | "erro";
  /** mostrar [Desfazer] */
  desfazer: boolean;
  /** mostrar [Somar mesmo] (a marcação usou tempo do Timer) */
  somarMesmo: boolean;
  /** mostrar [Tentar de novo] (falha de rede; use a mesma chave) */
  tentar: boolean;
}

/** O episódio seguinte em forma curta para o aviso de conflito: "E6", ou "T2E1" ao virar de temporada. */
function refCurta(base: Titulo, x: Titulo): string {
  const a = proximo(base), b = proximo(x);
  if (!b) return "";
  const pa = posicaoDe(base.temporadas, a?.k ?? 0), pb = posicaoDe(x.temporadas, b.k);
  return pb && pa && pa.temp === pb.temp ? `E${pb.ep}` : b.ref;
}

/**
 * Os textos da faixa. t = o título como a tela o mostrava antes do clique.
 * '✓ Friends T1E6 · +22 min' · '✓ T1E6 · +10 min (12 já contados)' · '✓ T1E6 · coberto pelo Timer'
 * · '✓ T1E6 · +4 min (18 do Timer)' · '✓ T1E6 · +22 min · contou em ontem (começou 23:43)' · '✓ T1 completa · +22 min'
 * · '✓ Friends terminada · foi para Vistos' · '✓ English with Lucy · +15 min'
 * · 'Outro aparelho já marcou o E6. Agora o próximo é o E7.' · 'Não salvou (sem conexão?). Nada mudou.'
 */
export function textoFaixa(r: RespostaMar, t: Titulo): Faixa {
  const nada = { desfazer: false, somarMesmo: false, tentar: false };
  if (!r.ok) return { texto: r.msg, tom: "erro", ...nada, tentar: r.rede };
  if (r.conflito) {
    const antes = proximo(t), agora = proximo(r.titulo);
    const ja = antes ? (posicaoDe(t.temporadas, antes.k) ? `E${posicaoDe(t.temporadas, antes.k)!.ep}` : antes.ref) : "";
    const texto = t.tipo === "serie" && ja
      ? `Outro aparelho já marcou o ${ja}. ${agora ? `Agora o próximo é o ${refCurta(t, r.titulo)}.` : "A série já acabou."}`
      : "Outro aparelho mudou este título. A tela foi atualizada.";
    return { texto, tom: "aviso", ...nada };
  }
  const nome = t.titulo, depois = r.titulo;
  const ok = { tom: "ok" as const, desfazer: true, somarMesmo: false, tentar: false };
  if (r.acao === "ajuste") {
    if (depois.situacao !== t.situacao) return { texto: `✓ ${nome} → ${NOME_SITUACAO[depois.situacao]}`, ...ok };
    return { texto: `✓ ${nome} · ${r.ref || "posição corrigida"}`, ...ok };
  }
  // quando contou: "foi ontem" ou o começo caiu ontem (a regra do Timer)
  const hoje = dayKey();
  const quando = r.ontem ? " · foi ontem"
    : r.dia !== hoje ? ` · contou em ${r.dia === dayKey(addDays(new Date(), -1)) ? "ontem" : dataCurta(r.dia)} (começou ${hora(r.inicio)})` : "";
  const timer = r.coberto > 0 && !r.semTimer;
  const somar = (s: number) => `+${duracao(s)}`;
  const tempo = timer
    ? r.segundos > 0 ? `${somar(r.segundos)} (${Math.round(r.coberto / 60)} do Timer)` : "coberto pelo Timer"
    : somar(r.segundos);
  const fim = { ...ok, somarMesmo: timer };

  if (t.tipo === "serie" && r.acao === "ep" && depois.situacao === "visto" && t.situacao !== "visto") {
    return { texto: `✓ ${nome} terminada · foi para Vistos${quando}`, ...fim };
  }
  if (t.tipo === "filme" && r.acao === "ep") {
    return { texto: `✓ ${nome} · ${r.declarado > 0 ? `${tempo} · ` : ""}foi para Vistos${quando}`, ...fim };
  }
  if (r.acao === "min") return { texto: `✓ ${nome} · ${tempo}${quando}`, ...fim };

  // série (ep/parcial) e filme (parcial)
  let rotulo = r.acao === "parcial" && t.tipo === "filme" ? `${nome} ${r.ref}` : r.ref || nome;
  let comNome = !(rotulo.startsWith(nome));
  if (t.tipo === "serie" && r.acao === "ep") {
    const p = ondeEsta(depois);
    const ts = depois.temporadas ?? [];
    if (p.ep > 0 && p.ep === ts[p.temp - 1] && (depois.ep_vistos ?? 0) < totalEps(depois)) { rotulo = `T${p.temp} completa`; comNome = false; }
  }
  if (timer) return { texto: `✓ ${rotulo} · ${tempo}${quando}`, ...fim };
  if (r.acao === "ep" && (t.parcial_seg ?? 0) > 0) return { texto: `✓ ${rotulo} · ${tempo} (${Math.round(t.parcial_seg / 60)} já contados)${quando}`, ...fim };
  if (quando) return { texto: `✓ ${rotulo} · ${tempo}${quando}`, ...fim };
  return { texto: `✓ ${comNome ? `${nome} ` : ""}${rotulo} · ${tempo}`, ...fim };
}

// ─── pergunta única (Timer sem vínculo) ───

/** Sessão de Idiomas (para a pergunta e os indicadores). */
export interface SessaoIdioma {
  id: string;
  day: string;
  started_at: string | null;
  seconds: number;
  label: string | null;
  language: string | null;
  mar_titulo_id?: string | null;
}
/** O que a pergunta precisa do Timer (de timer.ver(), lido no clique). rotulo = describe(estado). */
export interface TimerParaPergunta {
  category: string;
  language: string;
  label: string;
  marTituloId?: string;
  phase: string;
  /** segundos contados na fase atual */
  segundos: number;
  rotulo: string;
}
export type Pergunta =
  | { tipo: "rodando"; chave: string; rotulo: string; segundos: number }
  | { tipo: "salvo"; chave: string; rotulo: string; segundos: number; sessaoId: string; fim: string };

const foraDaPergunta = (rotulo: string, idioma: string) => {
  const r = rotulo.startsWith(`${idioma} · `) ? rotulo.slice(idioma.length + 3) : rotulo;
  return /^(listening|aulas?\b|anki|lição|licao)/i.test(r);
};
/** A chave do "Não" lembrado: a sessão salva, ou o Timer (rótulo + dia) — o "Não" ao Timer rodando vale para a sessão que ele salvar. */
const chaveTimer = (idioma: string, rotulo: string, dia: string) => `t:${idioma}|${rotulo}|${dia}`;

/**
 * Antes de somar um episódio: o Timer de Idiomas, no mesmo idioma e sem vínculo, está contando (ou salvou nas
 * últimas 6 h uma sessão de 5 min ou mais, fora de Listening/Aulas/Anki/Lição)? Então pergunte. dispensadas = as
 * chaves dos "Não" já dados neste aparelho. null = não pergunte.
 */
export function candidataPergunta(
  sessoes: SessaoIdioma[], idioma: string, agora: number, dispensadas: Iterable<string>, timer?: TimerParaPergunta | null,
): Pergunta | null {
  const fora = new Set(dispensadas);
  const hoje = dayKey(new Date(agora));
  if (timer && timer.category === "Idiomas" && timer.language === idioma && !timer.marTituloId && timer.phase === "foco"
    && timer.segundos > 0 && !/^MAR\b/.test(timer.rotulo) && !foraDaPergunta(timer.rotulo, idioma)) {
    const chave = chaveTimer(idioma, timer.rotulo, hoje);
    if (!fora.has(chave)) return { tipo: "rodando", chave, rotulo: timer.rotulo, segundos: Math.round(timer.segundos) };
  }
  let melhor: Pergunta | null = null, melhorFim = 0;
  for (const s of sessoes) {
    if (s.language !== idioma || s.mar_titulo_id || /^MAR\b/.test(s.label ?? "") || s.seconds < MAR_LIMITES.perguntaMinSeg) continue;
    // o Timer grava "Inglês · Netflix"; um rótulo sem o idioma (registro antigo ou manual) ganha o prefixo
    const rotulo = !s.label ? idioma : s.label === idioma || s.label.startsWith(`${idioma} · `) ? s.label : `${idioma} · ${s.label}`;
    if (foraDaPergunta(rotulo, idioma) || !s.started_at) continue;
    const fim = Date.parse(s.started_at) + s.seconds * 1000;
    if (!Number.isFinite(fim) || fim < agora - MAR_LIMITES.sobraHoras * 3600e3 || fim > agora + 60e3) continue;
    const chave = `s:${s.id}`;
    if (fora.has(chave) || fora.has(chaveTimer(idioma, rotulo, s.day))) continue;
    if (fim > melhorFim) { melhorFim = fim; melhor = { tipo: "salvo", chave, rotulo, segundos: s.seconds, sessaoId: s.id, fim: new Date(fim).toISOString() }; }
  }
  return melhor;
}

/**
 * Os textos da pergunta. segEpisodio = o que o episódio somaria ("Não, somar 22 min").
 * 'O Timer está contando Inglês · Netflix (35 min). Este episódio está nesse tempo?'
 * 'O Timer salvou 23 min de Inglês · Netflix hoje às 20:10. Este episódio está nesse tempo?'
 */
export function textoPergunta(p: Pergunta, segEpisodio: number, agora = Date.now()): { pergunta: string; sim: string; nao: string } {
  const quando = (iso: string) => {
    const d = dayKey(new Date(iso));
    const dia = d === dayKey(new Date(agora)) ? "hoje" : d === dayKey(addDays(new Date(agora), -1)) ? "ontem" : dataCurta(d);
    return `${dia} às ${hora(iso)}`;
  };
  const pergunta = p.tipo === "rodando"
    ? `O Timer está contando ${p.rotulo} (${duracao(p.segundos)}). Este episódio está nesse tempo?`
    : `O Timer salvou ${duracao(p.segundos)} de ${p.rotulo} ${quando(p.fim)}. Este episódio está nesse tempo?`;
  return { pergunta, sim: "Sim, é do MAR", nao: `Não, somar ${duracao(segEpisodio)}` };
}

// ─── indicadores ───

export interface Barrinha {
  de: string;
  ate: string;
  /** total do grupo (segundos) */
  seg: number;
  /** média por dia no grupo (para comparar com a meta diária); num dia, = seg */
  porDia: number;
  /** bateu a meta (sem meta: teve MAR) */
  naMeta: boolean;
  /** 'qua 19/11 · 44 min' · 'semana de 17/11 · 5 h 10 · 44 min/dia' · 'nov · 20 h · 40 min/dia' */
  title: string;
}
export interface Indicadores {
  /** segundos de MAR hoje */
  hoje: number;
  metaSeg: number;
  naMetaHoje: boolean;
  /** começo efetivo (aaaa-mm-dd): o mais antigo entre mar_inicio e o 1º dia com MAR; sem nenhum, hoje */
  comeco: string;
  /** mar_inicio ainda no futuro */
  antesDoComeco: boolean;
  /** média por dia no período, contando a partir do começo efetivo (segundos) */
  mediaP: number;
  /** dias do período a partir do começo efetivo (até hoje) */
  diasP: number;
  diasComMar: number;
  /** dias do período que bateram a meta (sem meta: dias com MAR) */
  diasNaMeta: number;
  /** dias seguidos na meta até hoje (hoje ainda sem a meta não quebra) */
  sequencia: number;
  totalP: number;
  /** período anterior equivalente */
  totalA: number;
  /** "No MAR": desde mar_inicio (ou desde sempre) */
  total: number;
  /** total / 1.000 h, de 0 a 1 */
  fracTotal: number;
  /** média por dia nos últimos 30 dias (a partir do começo efetivo) */
  ritmo30: number;
  barrinhas: Barrinha[];
  granularidade: "dia" | "semana" | "mes";
  /** '4 de 7 dias com 1 h · 3 dias seguidos na meta' (title e aria-label do mini "Por dia") */
  resumo: string;
  /** 'de 1 h · faltam 22' · 'meta ✓' · 'sem meta' · 'começa em 1/12' */
  dicaHoje: string;
  /** 'de 1.000 h · desde 1/12' · 'começa em 1/12' · 'de 1.000 h · desde o 1º registro' */
  dicaTotal: string;
  /** 'O Mairo fala em 800 a 1.000 h para começar a entender. No ritmo dos últimos 30 dias (52 min/dia), faltam ~3 anos.' */
  tituloTotal: string;
}

/**
 * Os números do MAR (regra R18). sessoesMar = as sessões do idioma que são MAR (ehMar); metaMin = minutos por dia
 * (0 = sem meta); inicio = languages.mar_inicio; hoje = dayKey().
 */
export function indicadores(
  sessoesMar: Pick<SessaoIdioma, "day" | "seconds">[], periodo: Pick<Periodo, "de" | "ate" | "antDe" | "antAte">,
  metaMin: number, inicio: string | null, hoje: string,
): Indicadores {
  const porDia = new Map<string, number>();
  let primeiro: string | null = null;
  for (const s of sessoesMar) {
    if (!s.seconds) continue;
    porDia.set(s.day, (porDia.get(s.day) ?? 0) + s.seconds);
    if (!primeiro || s.day < primeiro) primeiro = s.day;
  }
  const seg = (d: string) => porDia.get(d) ?? 0;
  const somaEntre = (a: string, z: string) => { let t = 0; for (const [d, v] of porDia) if (d >= a && d <= z) t += v; return t; };
  const metaSeg = Math.max(0, Math.round(metaMin || 0)) * 60;
  const bate = (v: number) => (metaSeg > 0 ? v >= metaSeg : v > 0);

  const candidatos = [inicio, primeiro].filter((x): x is string => !!x).sort();
  const comeco = candidatos[0] ?? hoje;
  const antesDoComeco = !!inicio && inicio > hoje;

  // período: a média conta a partir do começo efetivo
  const fimP = periodo.ate < hoje ? periodo.ate : hoje;
  const iniP = periodo.de > comeco ? periodo.de : comeco;
  const diasP = iniP <= fimP ? diasEntre(iniP, fimP) : 0;
  let diasComMar = 0, diasNaMeta = 0;
  for (let i = 0; i < diasP; i++) { const v = seg(dayKey(addDays(parseDay(iniP), i))); if (v > 0) diasComMar++; if (bate(v)) diasNaMeta++; }
  const totalP = somaEntre(periodo.de, periodo.ate);
  const totalA = somaEntre(periodo.antDe, periodo.antAte);
  const mediaP = diasP ? totalP / diasP : 0;

  // sequência: dias seguidos na meta terminando hoje; hoje ainda sem a meta não quebra (conta a partir de ontem)
  let sequencia = 0;
  let d = parseDay(hoje);
  if (!bate(seg(hoje))) d = addDays(d, -1);
  for (let i = 0; i < 3660 && bate(seg(dayKey(d))); i++) { sequencia++; d = addDays(d, -1); }

  const total = inicio ? [...porDia].reduce((a, [k, v]) => (k >= inicio ? a + v : a), 0) : [...porDia.values()].reduce((a, v) => a + v, 0);
  const metaTotal = MAR_META_HORAS * 3600;
  const fracTotal = Math.min(1, total / metaTotal);
  const ini30 = dayKey(addDays(parseDay(hoje), -29));
  const a30 = ini30 > comeco ? ini30 : comeco;
  const ritmo30 = a30 <= hoje ? somaEntre(a30, hoje) / diasEntre(a30, hoje) : 0;

  // barrinhas: por dia (até 35), por semana (até 190), por mês; período curto mostra os 7 dias até o fim
  let bIni = periodo.de;
  const bFim = periodo.ate;
  if (diasEntre(bIni, bFim) < 7) bIni = dayKey(addDays(parseDay(bFim), -6));
  const nDias = diasEntre(bIni, bFim);
  const granularidade: Indicadores["granularidade"] = nDias <= 35 ? "dia" : nDias <= 190 ? "semana" : "mes";
  const grupos: { a: string; z: string; rot: string }[] = [];
  const ini = parseDay(bIni), fim = parseDay(bFim);
  if (granularidade === "dia") {
    for (let x = ini; x <= fim; x = addDays(x, 1)) grupos.push({ a: dayKey(x), z: dayKey(x), rot: `${DIAS[(x.getDay() + 6) % 7]} ${dataCurta(dayKey(x))}` });
  } else if (granularidade === "semana") {
    for (let w = weekStart(ini); w <= fim; w = addDays(w, 7)) {
      const a = w < ini ? ini : w, z = addDays(w, 6) > fim ? fim : addDays(w, 6);
      grupos.push({ a: dayKey(a), z: dayKey(z), rot: `semana de ${dataCurta(dayKey(w))}` });
    }
  } else {
    for (let m = new Date(ini.getFullYear(), ini.getMonth(), 1); m <= fim; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      const zm = new Date(m.getFullYear(), m.getMonth() + 1, 0);
      grupos.push({ a: dayKey(m < ini ? ini : m), z: dayKey(zm > fim ? fim : zm), rot: `${MESES[m.getMonth()]}${m.getFullYear() !== parseDay(hoje).getFullYear() ? ` ${m.getFullYear()}` : ""}` });
    }
  }
  const barrinhas: Barrinha[] = grupos.map((g) => {
    const s = somaEntre(g.a, g.z);
    const zz = g.z < hoje ? g.z : hoje;
    const n = g.a <= zz ? diasEntre(g.a, zz) : 1;
    const pd = s / n;
    return {
      de: g.a, ate: g.z, seg: s, porDia: pd, naMeta: bate(pd),
      title: granularidade === "dia" ? `${g.rot} · ${duracao(s)}` : `${g.rot} · ${duracao(s)} · ${duracao(pd)}/dia`,
    };
  });

  const metaTxt = duracao(metaSeg);
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  const resumo = metaSeg > 0
    ? `${diasNaMeta} de ${plural(diasP, "dia", "dias")} com ${metaTxt}${sequencia ? ` · ${plural(sequencia, "dia seguido", "dias seguidos")} na meta` : ""}`
    : `${diasComMar} de ${plural(diasP, "dia", "dias")} com MAR${sequencia ? ` · ${plural(sequencia, "dia seguido", "dias seguidos")}` : ""}`;
  const hojeSeg = seg(hoje);
  const falta = Math.max(0, metaSeg - hojeSeg);
  const dicaHoje = antesDoComeco ? `começa em ${dataCurta(inicio!)}`
    : metaSeg === 0 ? "sem meta"
    : hojeSeg >= metaSeg ? "meta ✓"
    : `de ${metaTxt} · faltam ${falta < 3600 ? Math.ceil(falta / 60) : duracao(falta)}`;
  const mil = `${nf.format(MAR_META_HORAS)} h`;
  const dicaTotal = antesDoComeco ? `começa em ${dataCurta(inicio!)}` : inicio ? `de ${mil} · desde ${dataCurta(inicio)}` : `de ${mil} · desde o 1º registro`;
  let tituloTotal = `O Mairo fala em 800 a ${mil} para começar a entender.`;
  if (total >= metaTotal) tituloTotal += ` Você já passou de ${mil}.`;
  else if (ritmo30 > 0) tituloTotal += ` No ritmo dos últimos 30 dias (${duracao(ritmo30)}/dia), faltam ~${quantoFalta((metaTotal - total) / ritmo30)}.`;

  return {
    hoje: hojeSeg, metaSeg, naMetaHoje: metaSeg > 0 && hojeSeg >= metaSeg, comeco, antesDoComeco,
    mediaP, diasP, diasComMar, diasNaMeta, sequencia, totalP, totalA, total, fracTotal, ritmo30,
    barrinhas, granularidade, resumo, dicaHoje, dicaTotal, tituloTotal,
  };
}

/** 20 → "20 dias" · 240 → "8 meses" · 1100 → "3 anos" */
function quantoFalta(dias: number): string {
  if (dias < 60) return `${Math.max(1, Math.round(dias))} dias`;
  if (dias < 730) return `${Math.round(dias / 30.4)} meses`;
  const a = Math.round(dias / 365);
  return `${a} ${a === 1 ? "ano" : "anos"}`;
}
