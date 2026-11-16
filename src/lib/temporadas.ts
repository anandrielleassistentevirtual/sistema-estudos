"use client";
/**
 * Temporadas: o ano de 12 semanas no ritmo das estações (hemisfério sul).
 * Cada estação tem ~13 semanas, todas de trabalho (a revisão é um momento, não uma semana parada).
 * O plano diz quanto por dia você quer dar a cada área, na unidade que mede o avanço dela: palavras na Leitura,
 * nos Estudos e na Escrita, cartões novos criados no Anki nos Idiomas, minutos no resto. A previsão usa esse plano e o seu
 * ritmo real (palavras por minuto, cartões por minuto…) para dizer o que cabe até o fim da temporada.
 */
import { supabase } from "./supabase/client";
import { todas } from "./supabase/todas";
import { addDays, dayKey, parseDay, weekStart } from "./dates";
import { ankiPorIdioma } from "./tempo";

export type Estacao = "verao" | "outono" | "inverno" | "primavera";
export type Area = "leitura" | "estudos" | "idiomas" | "escrita" | "pesquisa" | "exercicio";

export const ESTACOES: Record<Estacao, { nome: string; mes: number; dia: number }> = {
  verao: { nome: "Verão", mes: 12, dia: 21 },
  outono: { nome: "Outono", mes: 3, dia: 20 },
  inverno: { nome: "Inverno", mes: 6, dia: 21 },
  primavera: { nome: "Primavera", mes: 9, dia: 22 },
};
const ORDEM: Estacao[] = ["outono", "inverno", "primavera", "verao"]; // na ordem do ano civil (o verão começa em dezembro)

export const AREAS: { id: Area; nome: string; cor: string }[] = [
  { id: "leitura", nome: "Leitura", cor: "#3987e5" },
  { id: "estudos", nome: "Estudos", cor: "#8e6fd6" },
  { id: "idiomas", nome: "Idiomas", cor: "#1baf7a" },
  { id: "escrita", nome: "Escrita", cor: "#e8913a" },
  { id: "pesquisa", nome: "Pesquisa", cor: "#c9a227" },
  { id: "exercicio", nome: "Exercício", cor: "#e05d5d" },
];

/** Categoria do Timer → área da temporada (Oração e "Outro" não entram). */
const AREA_DA_CATEGORIA: Record<string, Area> = {
  Leitura: "leitura", Estudos: "estudos", Idiomas: "idiomas", Anki: "idiomas", Escrita: "escrita", Pesquisa: "pesquisa", "Exercício": "exercicio",
};

/** Unidade do plano de cada área (a primeira é a recomendada). */
export type Unidade = "min" | "palavras" | "cartoes";
export const UNIDADES: Record<Area, Unidade[]> = {
  leitura: ["palavras", "min"], estudos: ["palavras", "min"], escrita: ["palavras", "min"],
  idiomas: ["cartoes", "min"], pesquisa: ["min"], exercicio: ["min"],
};
/** "cartões" são cartões novos criados no Anki (o que faz o baralho crescer) */
export const NOME_UNIDADE: Record<Unidade, string> = { min: "min", palavras: "palavras", cartoes: "cartões novos" };
/** Unidade de uma área nesta temporada. */
export const unidadeDe = (t: Pick<Temporada, "unidades">, a: Area): Unidade => t.unidades?.[a] ?? UNIDADES[a][0];

export interface Temporada {
  id?: string;
  ano: number; // ano em que a estação começa (o Verão 2026 vai de dez/2026 a mar/2027)
  estacao: Estacao;
  inicio: string; // aaaa-mm-dd
  fim: string;
  comeca_em: string; // quando você começou de fato
  plano: Partial<Record<Area, number>>; // por dia, na unidade da área
  unidades?: Partial<Record<Area, Unidade>> | null;
  nota?: string;
}

export interface Meta {
  id?: string;
  temporada_id?: string;
  area: Area;
  /** livros; aulas escolhidas; curso (a pasta inteira, metas antigas); palavras escritas; horas numa área; cartões do Anki */
  tipo: "livros" | "aulas" | "curso" | "palavras" | "horas" | "anki";
  titulo: string;
  alvo: number;
  refs: string[];
  posicao?: number;
  /** meta do Anki: "total" (o baralho chega a N cartões), "criados" (N cartões novos) ou "revisoes" */
  medida?: "total" | "criados" | "revisoes" | null;
}

const inicioDe = (e: Estacao, ano: number) => new Date(ano, ESTACOES[e].mes - 1, ESTACOES[e].dia);

/** A estação do calendário que contém o dia. */
export function estacaoDe(d = new Date()): { estacao: Estacao; ano: number; inicio: string; fim: string } {
  const candidatos: { estacao: Estacao; ano: number; ini: Date }[] = [];
  for (const ano of [d.getFullYear() - 1, d.getFullYear()]) for (const e of ORDEM) candidatos.push({ estacao: e, ano, ini: inicioDe(e, ano) });
  const atual = candidatos.filter((c) => c.ini <= d).sort((a, b) => b.ini.getTime() - a.ini.getTime())[0];
  return { estacao: atual.estacao, ano: atual.ano, ...limites(atual.estacao, atual.ano) };
}

/** Começo e fim (o dia antes da próxima estação). */
export function limites(e: Estacao, ano: number) {
  const i = ORDEM.indexOf(e);
  const prox = i === ORDEM.length - 1 ? inicioDe(ORDEM[0], ano + 1) : inicioDe(ORDEM[i + 1], ano);
  return { inicio: dayKey(inicioDe(e, ano)), fim: dayKey(addDays(prox, -1)) };
}

/** A estação seguinte / anterior. */
export function vizinha(e: Estacao, ano: number, passo: 1 | -1): { estacao: Estacao; ano: number } {
  const i = ORDEM.indexOf(e) + passo;
  if (i >= ORDEM.length) return { estacao: ORDEM[0], ano: ano + 1 };
  if (i < 0) return { estacao: ORDEM[ORDEM.length - 1], ano: ano - 1 };
  return { estacao: ORDEM[i], ano };
}

export const nomeDaTemporada = (e: Estacao, ano: number) => `${ESTACOES[e].nome} ${e === "verao" ? `${ano}–${String(ano + 1).slice(2)}` : ano}`;

/**
 * Semanas da temporada: da segunda-feira em que você começou até o fim, todas de trabalho.
 * (`revisao` fica vazia: a última semana conta como as outras.)
 * Execução = todas menos a última (no máximo 12).
 */
export function semanasDa(t: Pick<Temporada, "comeca_em" | "fim">) {
  const ini = weekStart(parseDay(t.comeca_em));
  const fim = parseDay(t.fim);
  const semanas: { de: string; ate: string }[] = [];
  for (let w = ini; w <= fim; w = addDays(w, 7)) semanas.push({ de: dayKey(w), ate: dayKey(addDays(w, 6) > fim ? fim : addDays(w, 6)) });
  return { semanas, execucao: semanas, revisao: [] as { de: string; ate: string }[] };
}

type PorDia = Map<string, Record<Area, number>>;
/** O que foi feito por dia: segundos por área e a quantidade (palavras lidas/escritas, cartões novos criados no Anki). */
export interface Registros {
  seg: PorDia;
  qtd: PorDia;
  /** os segundos que produziram as quantidades (leitura no leitor, Anki, sala de escrita): dão o rendimento por minuto */
  segQ: PorDia;
}
const zero = (): Record<Area, number> => ({ leitura: 0, estudos: 0, idiomas: 0, escrita: 0, pesquisa: 0, exercicio: 0 });

/** Tempo (mesma regra do resto do sistema; Exercício e Pesquisa vêm do Timer) e quantidades por área e dia. */
export async function tempoPorArea(desde: string): Promise<Registros> {
  const sb = supabase();
  const [sess, leit, anki, esc] = await Promise.all([
    todas<{ day: string; seconds: number; category: string; label: string }>((de, ate) =>
      sb.from("study_sessions").select("day,seconds,category,label").gte("day", desde).order("id").range(de, ate)),
    todas<{ day: string; seconds: number; words: number | null; book_id: string | null; note_id: string | null; during_timer: boolean }>((de, ate) =>
      sb.from("reading_sessions").select("day,seconds,words,book_id,note_id,during_timer").gte("day", desde).order("id").range(de, ate)),
    ankiPorIdioma(desde),
    todas<{ dia: string; palavras: number; segundos: number }>((de, ate) =>
      sb.from("escrita_sessoes").select("dia,palavras,segundos").gte("dia", desde).order("id").range(de, ate)).catch(() => []),
  ]);
  const seg: PorDia = new Map(), qtd: PorDia = new Map(), segQ: PorDia = new Map();
  const add = (m: PorDia, dia: string, a: Area, v: number) => {
    const x = m.get(dia) ?? zero();
    x[a] += v;
    m.set(dia, x);
  };
  for (const s of sess) {
    const a = AREA_DA_CATEGORIA[s.category];
    if (!a || (anki.ankiWeb && s.label.startsWith("Anki ·"))) continue;
    add(seg, s.day, a, s.seconds);
  }
  for (const r of leit) {
    const a: Area = r.note_id ? "estudos" : "leitura";
    if (!r.during_timer) add(seg, r.day, a, r.seconds);
    add(qtd, r.day, a, r.words ?? 0);
    if (r.words) add(segQ, r.day, a, r.seconds);
  }
  for (const a of anki.dias) { add(seg, a.day, "idiomas", a.segundos); add(qtd, a.day, "idiomas", a.criados); add(segQ, a.day, "idiomas", a.segundos); }
  for (const e of esc) { add(qtd, e.dia, "escrita", Math.max(0, e.palavras)); add(segQ, e.dia, "escrita", e.segundos); }
  return { seg, qtd, segQ };
}

/** Por dia em cada área nos últimos `dias` (contando a partir do primeiro registro), na unidade de cada área. */
export function ritmoPorArea(r: Registros, unidade: (a: Area) => Unidade = () => "min", dias = 28): Record<Area, number> {
  const hoje = new Date();
  let ini = dayKey(addDays(hoje, -(dias - 1)));
  const primeiro = [...r.seg.keys(), ...r.qtd.keys()].sort()[0];
  if (primeiro && primeiro > ini) ini = primeiro;
  const n = Math.max(1, Math.round((hoje.getTime() - parseDay(ini).getTime()) / 864e5) + 1);
  const out = zero();
  for (const a of AREAS) out[a.id] = feitoEm(r, a.id, unidade(a.id), ini, dayKey(hoje)) / n;
  return out;
}

/** Soma de uma área entre dois dias, na unidade pedida (minutos, palavras ou cartões). */
export function feitoEm(r: Registros, a: Area, u: Unidade, de: string, ate: string) {
  const m = u === "min" ? r.seg : r.qtd;
  let t = 0;
  for (const [k, v] of m) if (k >= de && k <= ate) t += v[a];
  return u === "min" ? t / 60 : t;
}

/** Quanto cada área rende por minuto (palavras/min, cartões/min), para converter o plano entre unidades. */
export function rendimento(r: Registros, dias = 60): Record<Area, number> {
  const ate = dayKey(), de = dayKey(addDays(new Date(), -(dias - 1)));
  const padrao: Record<Area, number> = { leitura: 220, estudos: 220, escrita: 15, idiomas: 0.3, pesquisa: 0, exercicio: 0 };
  const out = zero();
  for (const a of AREAS) {
    const min = feitoEm({ ...r, seg: r.segQ }, a.id, "min", de, ate), q = feitoEm(r, a.id, "palavras", de, ate);
    out[a.id] = min >= 20 && q > 0 ? q / min : padrao[a.id];
  }
  return out;
}

/** Ênfase pelo plano (em minutos por dia, convertidos da unidade da área): o que a temporada privilegia. */
export function enfase(minDia: number): { nome: string; nivel: 0 | 1 | 2 | 3 } {
  if (minDia <= 0) return { nome: "pausa", nivel: 0 };
  if (minDia < 20) return { nome: "leve", nivel: 1 };
  if (minDia < 60) return { nome: "média", nivel: 2 };
  return { nome: "forte", nivel: 3 };
}

/**
 * Nota da semana (como no método das 12 semanas): para cada área com plano, o quanto do planejado foi feito
 * (até 100%), com peso pelo tempo planejado. 85% ou mais é uma semana bem executada.
 */
export function execucaoDaSemana(r: Registros, t: Pick<Temporada, "unidades">, plano: Record<Area, number>, de: string, ate: string, rend: Record<Area, number>) {
  const dias = Math.round((parseDay(ate).getTime() - parseDay(de).getTime()) / 864e5) + 1;
  let peso = 0, feito = 0;
  for (const a of AREAS) {
    const u = unidadeDe(t, a.id);
    const p = (plano[a.id] ?? 0) * dias;
    if (p <= 0) continue;
    const pesoMin = u === "min" ? p : p / (rend[a.id] || 1); // o peso de cada área é o tempo que ela pede
    peso += pesoMin;
    feito += pesoMin * Math.min(1, feitoEm(r, a.id, u, de, ate) / p);
  }
  return peso ? feito / peso : null;
}

export async function carregarTemporadas(): Promise<{ temporadas: Temporada[]; metas: Meta[] }> {
  const sb = supabase();
  const [t, m] = await Promise.all([
    sb.from("temporadas").select("id,ano,estacao,inicio,fim,comeca_em,plano,unidades,nota").order("inicio"),
    sb.from("temporada_metas").select("id,temporada_id,area,tipo,titulo,alvo,refs,posicao,medida").order("posicao").order("created_at"),
  ]);
  return { temporadas: (t.data as Temporada[] | null) ?? [], metas: (m.data as Meta[] | null) ?? [] };
}

export async function salvarTemporada(t: Temporada): Promise<Temporada> {
  const { id, ...campos } = t;
  const sb = supabase();
  const { data, error } = id
    ? await sb.from("temporadas").update(campos).eq("id", id).select().single()
    : await sb.from("temporadas").insert(campos).select().single();
  if (error) throw new Error(error.message);
  return data as Temporada;
}

export const DIA_MS = 864e5;
export const diasEntre = (de: string, ate: string) => Math.max(0, Math.round((parseDay(ate).getTime() - parseDay(de).getTime()) / DIA_MS) + 1);
