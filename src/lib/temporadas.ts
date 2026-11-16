"use client";
/**
 * Temporadas: o ano de 12 semanas no ritmo das estações (hemisfério sul).
 * Cada estação tem ~13 semanas: 12 de execução + a última de revisão e descanso (sazonalidade, à Cal Newport).
 * O plano diz quantos minutos por dia você quer dar a cada área; a previsão usa esse plano e o seu ritmo real
 * (minutos por dia e palavras por minuto) para dizer o que cabe até o fim da temporada.
 */
import { supabase } from "./supabase/client";
import { todas } from "./supabase/todas";
import { addDays, dayKey, parseDay, weekStart } from "./dates";
import { ankiPorIdioma } from "./tempo";

export type Estacao = "verao" | "outono" | "inverno" | "primavera";
export type Area = "leitura" | "estudos" | "idiomas" | "escrita" | "pesquisa" | "exercicio";

export const ESTACOES: Record<Estacao, { nome: string; emoji: string; mes: number; dia: number }> = {
  verao: { nome: "Verão", emoji: "☀️", mes: 12, dia: 21 },
  outono: { nome: "Outono", emoji: "🍂", mes: 3, dia: 20 },
  inverno: { nome: "Inverno", emoji: "❄️", mes: 6, dia: 21 },
  primavera: { nome: "Primavera", emoji: "🌸", mes: 9, dia: 22 },
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

export interface Temporada {
  id?: string;
  ano: number; // ano em que a estação começa (o Verão 2026 vai de dez/2026 a mar/2027)
  estacao: Estacao;
  inicio: string; // aaaa-mm-dd
  fim: string;
  comeca_em: string; // quando você começou de fato
  plano: Partial<Record<Area, number>>; // minutos por dia
  nota?: string;
}

export interface Meta {
  id?: string;
  temporada_id?: string;
  area: Area;
  tipo: "livros" | "curso" | "palavras" | "horas";
  titulo: string;
  alvo: number;
  refs: string[];
  posicao?: number;
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
 * Semanas da temporada: da segunda-feira em que você começou até o fim; a última é a de revisão.
 * Execução = todas menos a última (no máximo 12).
 */
export function semanasDa(t: Pick<Temporada, "comeca_em" | "fim">) {
  const ini = weekStart(parseDay(t.comeca_em));
  const fim = parseDay(t.fim);
  const semanas: { de: string; ate: string }[] = [];
  for (let w = ini; w <= fim; w = addDays(w, 7)) semanas.push({ de: dayKey(w), ate: dayKey(addDays(w, 6) > fim ? fim : addDays(w, 6)) });
  const execucao = semanas.length > 1 ? semanas.slice(0, Math.min(12, semanas.length - 1)) : semanas;
  return { semanas, execucao, revisao: semanas.length > 1 ? semanas.slice(execucao.length) : [] };
}

/** Segundos por área em cada dia (mesma regra do resto do sistema; Exercício e Pesquisa vêm do Timer). */
export async function tempoPorArea(desde: string): Promise<Map<string, Record<Area, number>>> {
  const sb = supabase();
  const [sess, leit, anki] = await Promise.all([
    todas<{ day: string; seconds: number; category: string; label: string }>((de, ate) =>
      sb.from("study_sessions").select("day,seconds,category,label").gte("day", desde).order("id").range(de, ate)),
    todas<{ day: string; seconds: number; book_id: string | null; note_id: string | null; during_timer: boolean }>((de, ate) =>
      sb.from("reading_sessions").select("day,seconds,book_id,note_id,during_timer").gte("day", desde).order("id").range(de, ate)),
    ankiPorIdioma(desde),
  ]);
  const m = new Map<string, Record<Area, number>>();
  const add = (dia: string, a: Area, s: number) => {
    const v = m.get(dia) ?? { leitura: 0, estudos: 0, idiomas: 0, escrita: 0, pesquisa: 0, exercicio: 0 };
    v[a] += s;
    m.set(dia, v);
  };
  for (const s of sess) {
    const a = AREA_DA_CATEGORIA[s.category];
    if (!a || (anki.ankiWeb && s.label.startsWith("Anki ·"))) continue;
    add(s.day, a, s.seconds);
  }
  for (const r of leit) if (!r.during_timer) add(r.day, r.note_id ? "estudos" : "leitura", r.seconds);
  for (const a of anki.dias) add(a.day, "idiomas", a.segundos);
  return m;
}

/** Minutos por dia em cada área nos últimos `dias` (contando a partir do primeiro registro). */
export function ritmoPorArea(mapa: Map<string, Record<Area, number>>, dias = 28): Record<Area, number> {
  const hoje = new Date();
  let ini = dayKey(addDays(hoje, -(dias - 1)));
  const primeiro = [...mapa.keys()].sort()[0];
  if (primeiro && primeiro > ini) ini = primeiro;
  const n = Math.max(1, Math.round((hoje.getTime() - parseDay(ini).getTime()) / 864e5) + 1);
  const r = { leitura: 0, estudos: 0, idiomas: 0, escrita: 0, pesquisa: 0, exercicio: 0 } as Record<Area, number>;
  for (const [k, v] of mapa) if (k >= ini) for (const a of AREAS) r[a.id] += v[a.id];
  for (const a of AREAS) r[a.id] = r[a.id] / 60 / n;
  return r;
}

/** Soma (segundos) de uma área entre dois dias. */
export function somaArea(mapa: Map<string, Record<Area, number>>, a: Area, de: string, ate: string) {
  let t = 0;
  for (const [k, v] of mapa) if (k >= de && k <= ate) t += v[a];
  return t;
}

/** Ênfase pelo plano: o que a temporada privilegia. */
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
export function execucaoDaSemana(mapa: Map<string, Record<Area, number>>, plano: Partial<Record<Area, number>>, de: string, ate: string) {
  const dias = Math.round((parseDay(ate).getTime() - parseDay(de).getTime()) / 864e5) + 1;
  let peso = 0, feito = 0;
  for (const a of AREAS) {
    const p = (plano[a.id] ?? 0) * 60 * dias;
    if (p <= 0) continue;
    peso += p;
    feito += Math.min(p, somaArea(mapa, a.id, de, ate));
  }
  return peso ? feito / peso : null;
}

export async function carregarTemporadas(): Promise<{ temporadas: Temporada[]; metas: Meta[] }> {
  const sb = supabase();
  const [t, m] = await Promise.all([
    sb.from("temporadas").select("id,ano,estacao,inicio,fim,comeca_em,plano,nota").order("inicio"),
    sb.from("temporada_metas").select("id,temporada_id,area,tipo,titulo,alvo,refs,posicao").order("posicao").order("created_at"),
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
