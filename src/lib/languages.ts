"use client";
import { supabase } from "./supabase/client";

export interface Language {
  id: string;
  name: string;
  weekly_goal_min: number | null;
  position: number;
  /** código da bandeira (ex.: "us"); ver components/bandeira */
  bandeira: string | null;
  /** baralhos de cima do Anki que pertencem a este idioma (ex.: ["English"]) */
  anki_baralhos: string[];
}

export async function loadLanguages(): Promise<Language[]> {
  const { data } = await supabase().from("languages").select("id,name,weekly_goal_min,position,bandeira,anki_baralhos").order("position").order("name");
  return ((data as Language[]) ?? []).map((l) => ({ ...l, anki_baralhos: l.anki_baralhos ?? [] }));
}

export const SUGESTOES = ["Inglês", "Italiano", "Francês", "Espanhol", "Alemão", "Latim", "Grego antigo", "Russo", "Japonês", "Mandarim"];

export const ONDE = ["Plataforma do Mairo", "Anki", "Aula / professor", "Leitura", "Série / filme", "Conversação", "Outro"];

/** Palpite dos baralhos do Anki de um idioma, pelo nome (Inglês ↔ "English", "CIMV - Inglês"…). */
export function palpiteDeBaralhos(idioma: string, baralhos: string[]): string[] {
  const tira = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const chaves: Record<string, string[]> = {
    ingles: ["ingles", "english"], italiano: ["italiano", "italian"], frances: ["frances", "french", "francais"],
    espanhol: ["espanhol", "spanish", "espanol"], alemao: ["alemao", "german", "deutsch"], latim: ["latim", "latin"],
    grego: ["grego", "greek"], russo: ["russo", "russian"], japones: ["japones", "japanese"], mandarim: ["mandarim", "chines", "chinese"],
  };
  const i = tira(idioma);
  const palavras = Object.entries(chaves).find(([k]) => i.includes(k))?.[1] ?? [i];
  return baralhos.filter((b) => palavras.some((p) => tira(b).includes(p)));
}
