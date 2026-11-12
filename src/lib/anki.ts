"use client";
/**
 * Anki no sistema, de dois jeitos:
 * 1) AnkiWeb (principal): o servidor do sistema baixa uma cópia da sua coleção quando você toca em Atualizar
 *    (ou sozinho, se os números estão velhos). Não precisa do Anki aberto; funciona no celular.
 * 2) AnkiConnect (opcional): o navegador conversa com o Anki aberto no computador (add-on 2055492159),
 *    para revisar dentro do sistema e mandar destaques de leitura como cartões.
 */
import { supabase } from "./supabase/client";
import { LEITOR_ANKI } from "./anki-versao";
const DEFAULT_URL = "http://127.0.0.1:8765";

export function ankiUrl(): string {
  try {
    return localStorage.getItem("anki-url") || DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}

export async function anki<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(ankiUrl(), {
    method: "POST",
    body: JSON.stringify({ action, version: 6, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result as T;
}

export async function ankiOnline(): Promise<boolean> {
  try {
    await anki<number>("version");
    return true;
  } catch {
    return false;
  }
}

export async function addBasicNote(
  deck: string, front: string, back: string, tags: string[] = [],
  audio?: { data: string; filename: string },
) {
  await anki("createDeck", { deck }).catch(() => {});
  return anki<number>("addNote", {
    note: {
      deckName: deck,
      modelName: "Basic",
      fields: { Front: front, Back: back },
      options: { allowDuplicate: false, duplicateScope: "deck" },
      tags: ["sistema-estudos", ...tags],
      ...(audio ? { audio: [{ data: audio.data, filename: audio.filename, fields: ["Front"] }] } : {}),
    },
  });
}

/** Baixa um arquivo e devolve em base64 (para mandar áudio ao Anki). */
export async function toBase64(url: string): Promise<string> {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** A contagem de revisões do Anki no sistema começa neste dia (o histórico anterior do Anki não entra). */
export const ANKI_INICIO = "2026-11-08";

// ───────────── AnkiWeb ─────────────

export interface BaralhoAnki { id: number; nome: string; revisar: number; aprendendo: number; novos: number; total: number }
export interface ContaAnki {
  usuario: string;
  sincronizado_em: string | null;
  erro: string | null;
  baralhos: BaralhoAnki[] | null;
  resumo: { cartoes: number; revisar_hoje: number; aprendendo: number; novos: number; retencao_30d: number | null; revisoes_30d: number; leitor?: number } | null;
}

/** Os números precisam ser buscados de novo: há mais de `horas`, ou o sistema passou a contar algo novo. */
export function ankiPrecisaAtualizar(c: ContaAnki, horas: number) {
  if (!c.sincronizado_em || (c.resumo?.leitor ?? 0) < LEITOR_ANKI) return true;
  return Date.now() - Date.parse(c.sincronizado_em) > horas * 3_600_000;
}

/** A conta do AnkiWeb ligada (sem a chave de acesso, que só o servidor lê). */
export async function contaAnki(): Promise<ContaAnki | null> {
  const { data } = await supabase().from("anki_conta").select("usuario,sincronizado_em,erro,baralhos,resumo").maybeSingle();
  return (data as ContaAnki | null) ?? null;
}

export async function ankiWeb(acao: "entrar" | "sincronizar" | "sair", extra: Record<string, string> = {}) {
  const r = await fetch("/api/anki", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ acao, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, ...extra }),
  });
  const j = await r.json().catch(() => ({ erro: `Erro ${r.status}` }));
  if (!r.ok || j.erro) throw new Error(j.erro ?? `Erro ${r.status}`);
  return j as { ok: true; dias?: number; semNovidades?: boolean; vazio?: boolean; sincronizado_em?: string; mensagem?: string | null };
}

/** Sincroniza com o AnkiWeb se a última vez foi há mais de `horas` (e se há conta ligada). Devolve true se atualizou. */
export async function sincronizarAnkiSeAntigo(horas: number): Promise<boolean> {
  try {
    const c = await contaAnki();
    if (!c) return false;
    if (!ankiPrecisaAtualizar(c, horas)) return false;
    await ankiWeb("sincronizar");
    return true;
  } catch {
    return false;
  }
}
