"use client";
import { supabase } from "./supabase/client";

export interface Language {
  id: string;
  name: string;
  weekly_goal_min: number | null;
  position: number;
}

export async function loadLanguages(): Promise<Language[]> {
  const { data } = await supabase().from("languages").select("id,name,weekly_goal_min,position").order("position").order("name");
  return (data as Language[]) ?? [];
}

export const SUGESTOES = ["Inglês", "Italiano", "Francês", "Espanhol", "Alemão", "Latim", "Grego antigo", "Russo", "Japonês", "Mandarim"];

export const ONDE = ["Plataforma do Mairo", "Anki", "Aula / professor", "Leitura", "Série / filme", "Conversação", "Outro"];
