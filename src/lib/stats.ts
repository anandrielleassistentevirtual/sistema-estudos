"use client";
import { supabase } from "./supabase/client";

export interface DayStats {
  study: number; // segundos no timer
  reading: number; // segundos lendo fora do timer (para não contar duas vezes)
  readingAll: number; // todo o tempo de leitura medido (para palavras/minuto)
  words: number; // palavras lidas
  reads: number; // frases lidas (idiomas)
  listens: number; // escutas completas (idiomas)
  anki: number; // revisões no Anki
}

export const emptyDay = (): DayStats => ({ study: 0, reading: 0, readingAll: 0, words: 0, reads: 0, listens: 0, anki: 0 });

/** Agrega tudo por dia a partir de `from` (AAAA-MM-DD). */
export async function loadDaily(from: string): Promise<Map<string, DayStats>> {
  const sb = supabase();
  const [study, reading, lang, anki] = await Promise.all([
    sb.from("study_sessions").select("day,seconds").gte("day", from).limit(20000),
    sb.from("reading_sessions").select("day,seconds,words,during_timer").gte("day", from).limit(20000),
    sb.from("language_daily").select("day,reads,listens").gte("day", from),
    sb.from("anki_daily").select("day,reviews").gte("day", from),
  ]);
  const map = new Map<string, DayStats>();
  const get = (d: string) => {
    let v = map.get(d);
    if (!v) map.set(d, (v = emptyDay()));
    return v;
  };
  for (const r of study.data ?? []) get(r.day).study += r.seconds;
  for (const r of reading.data ?? []) {
    const v = get(r.day);
    if (!r.during_timer) v.reading += r.seconds;
    v.readingAll += r.seconds;
    v.words += r.words;
  }
  for (const r of lang.data ?? []) {
    const v = get(r.day);
    v.reads += r.reads;
    v.listens += r.listens;
  }
  for (const r of anki.data ?? []) get(r.day).anki += r.reviews;
  return map;
}

export type Metric = "tempo" | "palavras" | "frases" | "anki";

export const METRICS: { id: Metric; label: string; unit: string }[] = [
  { id: "tempo", label: "Tempo de estudo", unit: "min" },
  { id: "palavras", label: "Palavras lidas", unit: "palavras" },
  { id: "frases", label: "Frases (idiomas)", unit: "leituras" },
  { id: "anki", label: "Revisões do Anki", unit: "revisões" },
];

export function metricValue(d: DayStats | undefined, m: Metric): number {
  if (!d) return 0;
  switch (m) {
    case "tempo":
      return Math.round((d.study + d.reading) / 60);
    case "palavras":
      return d.words;
    case "frases":
      return d.reads;
    case "anki":
      return d.anki;
  }
}
