"use client";
import { supabase } from "./supabase/client";

/** Data a partir da qual o histórico do Anki é trazido (null = todo o histórico). */
export async function ankiSince(): Promise<string | null> {
  const { data } = await supabase().from("user_settings").select("anki_since").maybeSingle();
  return (data?.anki_since as string | null) ?? null;
}

/** Filtra [dia, revisões] do AnkiConnect pela data de início configurada. */
export async function ankiRowsSince(rows: [string, number][]) {
  const since = await ankiSince();
  return since ? rows.filter(([d]) => d >= since) : rows;
}
