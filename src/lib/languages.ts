"use client";
import { supabase } from "./supabase/client";
import { semAcento } from "@/lib/text";

export interface Language {
  id: string;
  name: string;
  weekly_goal_min: number | null;
  position: number;
  /** código da bandeira (ex.: "us"); ver components/bandeira */
  bandeira: string | null;
  /** baralhos de cima do Anki que pertencem a este idioma (ex.: ["English"]) */
  anki_baralhos: string[];
  /** MAR: meta de minutos por dia (o Mairo recomenda no mínimo 60) */
  mar_meta_min: number;
  /** MAR: quando a etapa começou (aaaa-mm-dd); null = desde o 1º registro */
  mar_inicio: string | null;
}

export async function loadLanguages(): Promise<Language[]> {
  const { data } = await supabase().from("languages").select("id,name,weekly_goal_min,position,bandeira,anki_baralhos,mar_meta_min,mar_inicio").order("position").order("name");
  return ((data as Language[]) ?? []).map((l) => ({
    ...l, anki_baralhos: l.anki_baralhos ?? [], mar_meta_min: l.mar_meta_min ?? 60, mar_inicio: l.mar_inicio ?? null,
  }));
}

export const SUGESTOES = ["Inglês", "Italiano", "Francês", "Espanhol", "Alemão", "Latim", "Grego antigo", "Russo", "Japonês", "Mandarim"];

export const ONDE = ["Plataforma do Mairo", "Anki", "Aula / professor", "Leitura", "Série / filme", "Conversação", "Outro"];

/** Palpite dos baralhos do Anki de um idioma, pelo nome (Inglês ↔ "English", "CIMV - Inglês"…). */
export function palpiteDeBaralhos(idioma: string, baralhos: string[]): string[] {
  const chaves: Record<string, string[]> = {
    ingles: ["ingles", "english"], italiano: ["italiano", "italian"], frances: ["frances", "french", "francais"],
    espanhol: ["espanhol", "spanish", "espanol"], alemao: ["alemao", "german", "deutsch"], latim: ["latim", "latin"],
    grego: ["grego", "greek"], russo: ["russo", "russian"], japones: ["japones", "japanese"], mandarim: ["mandarim", "chines", "chinese"],
  };
  const i = semAcento(idioma);
  const palavras = Object.entries(chaves).find(([k]) => i.includes(k))?.[1] ?? [i];
  return baralhos.filter((b) => palavras.some((p) => semAcento(b).includes(p)));
}
