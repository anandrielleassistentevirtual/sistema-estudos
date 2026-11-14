"use client";
/**
 * Listening automático no curso do Mairo: um script do Tampermonkey mede o áudio que toca de verdade em
 * curso.mairovergara.com e manda os segundos para o banco com uma chave pessoal (registrar_escuta).
 * Não usa a senha do curso nem o login do sistema; a chave só serve para somar minutos de escuta.
 */
import { supabase } from "./supabase/client";

export const ROTULO_LISTENING = "Listening";

export interface ChaveListening { id: string; idioma: string; aparelho: string; created_at: string; ultimo_uso: string | null; revogada: boolean }

export async function chavesListening(): Promise<ChaveListening[]> {
  const { data } = await supabase().from("integracao_chaves").select("id,idioma,aparelho,created_at,ultimo_uso,revogada").eq("revogada", false).order("created_at");
  return (data as ChaveListening[] | null) ?? [];
}

/** Cria a chave (o texto só existe agora; no banco fica só o hash). */
export async function criarChaveListening(idioma: string): Promise<string> {
  const { data, error } = await supabase().rpc("criar_chave_listening", { p_idioma: idioma });
  if (error || !data) throw new Error(error?.message ?? "Não consegui criar a chave.");
  return data as string;
}

export async function cancelarChaveListening(id: string) {
  await supabase().from("integracao_chaves").update({ revogada: true }).eq("id", id);
}

export { scriptListening } from "./listening-script";

/** Cria a chave deste aparelho e um código de instalação (vale 30 min). */
export async function criarInstalacaoListening(idioma: string, aparelho: string): Promise<{ codigo: string; chave: string }> {
  const { data, error } = await supabase().rpc("criar_instalacao_listening", { p_idioma: idioma, p_aparelho: aparelho });
  if (error || !data) throw new Error(error?.message ?? "Não consegui criar a chave.");
  return data as { codigo: string; chave: string };
}
