"use client";
import { supabase } from "./supabase/client";
import { addDays, dayKey, weekStart } from "./dates";

export interface DayStats {
  study: number; // segundos no timer
  reading: number; // segundos lendo fora do timer (para não contar duas vezes)
  readingAll: number; // todo o tempo de leitura medido (para palavras/minuto)
  words: number; // palavras lidas
  anki: number; // revisões no Anki
  written: number; // palavras escritas (Escrita: esforço do dia)
}

export const emptyDay = (): DayStats => ({ study: 0, reading: 0, readingAll: 0, words: 0, anki: 0, written: 0 });

/** Início padrão: as últimas 53 semanas (o que o Dashboard e o calendário mostram de cara). */
export const inicio12Meses = () => dayKey(addDays(weekStart(new Date()), -53 * 7));

// a mesma consulta pedida por vários painéis ao mesmo tempo vira uma só (vale por 20 s)
const cache = new Map<string, { em: number; p: Promise<Map<string, DayStats>> }>();

/** Agrega tudo por dia a partir de `from` (AAAA-MM-DD). */
export function loadDaily(from: string): Promise<Map<string, DayStats>> {
  const c = cache.get(from);
  if (c && Date.now() - c.em < 20000) return c.p;
  const p = carregar(from);
  cache.set(from, { em: Date.now(), p });
  p.catch(() => cache.delete(from));
  return p;
}

async function carregar(from: string): Promise<Map<string, DayStats>> {
  // o banco já devolve os totais somados por dia (uma linha por dia: não esbarra no limite de 1000 linhas)
  const { data, error } = await supabase().rpc("estatisticas_por_dia", { desde: from });
  if (error) throw new Error(error.message);
  const map = new Map<string, DayStats>();
  type Linha = { dia: string; estudo: number; leitura: number; leitura_total: number; palavras: number; anki: number; escritas: number };
  for (const r of (data as Linha[] | null) ?? []) {
    map.set(r.dia, {
      ...emptyDay(),
      study: Number(r.estudo), reading: Number(r.leitura), readingAll: Number(r.leitura_total),
      words: Number(r.palavras), anki: Number(r.anki), written: Number(r.escritas),
    });
  }
  return map;
}

export type Metric = "tempo" | "palavras" | "escritas" | "anki";

export const METRICS: { id: Metric; label: string; unit: string }[] = [
  { id: "tempo", label: "Tempo", unit: "min" },
  { id: "palavras", label: "Lidas", unit: "palavras lidas" },
  { id: "escritas", label: "Escritas", unit: "palavras escritas" },
  { id: "anki", label: "Anki", unit: "revisões" },
];

export function metricValue(d: DayStats | undefined, m: Metric): number {
  if (!d) return 0;
  switch (m) {
    case "tempo":
      return Math.round((d.study + d.reading) / 60);
    case "palavras":
      return d.words;
    case "escritas":
      return d.written;
    case "anki":
      return d.anki;
  }
}
