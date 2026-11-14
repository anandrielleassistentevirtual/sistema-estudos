"use client";
/**
 * A regra única de "tempo de estudo", usada em todo o sistema (Dashboard, Calendário, Timer, Idiomas,
 * "Onde está indo seu tempo") — a mesma da função estatisticas_por_dia no banco:
 *   Timer e registros (inclui Listening e Aulas) + leitura no leitor sem o Timer
 *   + tempo no Anki, só nos baralhos ligados a um idioma.
 * Com o AnkiWeb ligado, a revisão feita dentro do sistema ("Anki · 12 cartões") não conta de novo:
 * ela já vem no tempo do Anki.
 */
import { supabase } from "./supabase/client";
import { todas } from "./supabase/todas";

export interface AnkiIdiomaDia { day: string; idioma: string; segundos: number; reviews: number }

/** Tempo e revisões do Anki por dia e por idioma (só baralhos ligados a um idioma). */
export async function ankiPorIdioma(desde: string): Promise<{ dias: AnkiIdiomaDia[]; ankiWeb: boolean }> {
  const sb = supabase();
  const [langs, linhas, conta] = await Promise.all([
    sb.from("languages").select("name,anki_baralhos"),
    todas<{ day: string; baralho: string; segundos: number; reviews: number }>((de, ate) =>
      sb.from("anki_baralho_dia").select("day,baralho,segundos,reviews").gte("day", desde).order("day").order("baralho").range(de, ate)).catch(() => []),
    sb.from("anki_conta").select("user_id").maybeSingle(),
  ]);
  const dono = new Map<string, string>();
  for (const l of (langs.data as { name: string; anki_baralhos: string[] | null }[] | null) ?? []) for (const b of l.anki_baralhos ?? []) dono.set(b, l.name);
  const dias = linhas.filter((r) => dono.has(r.baralho)).map((r) => ({ day: r.day, idioma: dono.get(r.baralho)!, segundos: r.segundos, reviews: r.reviews }));
  return { dias, ankiWeb: !!conta.data };
}

/** A sessão entra no tempo de estudo? (a revisão feita no sistema não conta de novo quando o AnkiWeb está ligado) */
export const contaComoEstudo = (label: string | null | undefined, ankiWeb: boolean) => !(ankiWeb && (label ?? "").startsWith("Anki ·"));
