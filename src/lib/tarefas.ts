"use client";
/**
 * Estudos › Tarefas, no estilo do Sistema de Autofoco (Mark Forster), indicado por Paulo Cantarelli:
 * 1) uma lista única: o que surge entra no fim; 2) passe o olho e escolha o que tem vontade de fazer,
 * não o mais urgente; 3) terminou, risca; não terminou, reescreve no fim; 4) só muda de página quando nada
 * mais chama a atenção; o que sobra depois de algumas passagens ganha marca-texto.
 * Dica de ouro: tarefas mensuráveis ("ler 20 páginas", "escrever por 1 hora").
 */
import { supabase } from "./supabase/client";
import { todas } from "./supabase/todas";
import { addDays, dayKey } from "./dates";

export type TipoTarefa = "ler" | "assistir" | "escrever" | "revisar" | "praticar" | "outro";

export interface Tarefa {
  id: string;
  texto: string;
  tipo: TipoTarefa;
  pasta_id: string | null;
  book_id: string | null;
  link: string;
  prazo: string | null;       // aaaa-mm-dd
  aparece_em: string | null;  // volta à lista nesse dia
  posicao: number;
  destacada: boolean;
  feita_em: string | null;
  created_at: string;
}

export const TIPOS: { id: TipoTarefa; nome: string; exemplo: string }[] = [
  { id: "ler", nome: "Ler", exemplo: "ler 20 páginas da Poética" },
  { id: "assistir", nome: "Assistir", exemplo: "assistir a aula 3 do Clube Crítico" },
  { id: "escrever", nome: "Escrever", exemplo: "escrever 1 página do plano de vida" },
  { id: "revisar", nome: "Revisar", exemplo: "revisar as anotações da aula 12" },
  { id: "praticar", nome: "Praticar", exemplo: "fazer o exercício de descrição (30 min)" },
  { id: "outro", nome: "Outro", exemplo: "o que precisar fazer" },
];

/** Itens por página, como numa página de caderno. */
export const POR_PAGINA = 15;

const COLUNAS = "id,texto,tipo,pasta_id,book_id,link,prazo,aparece_em,posicao,destacada,feita_em,created_at";

/** Tarefas ainda por fazer + as feitas nos últimos 14 dias. As que "voltam hoje" entram no fim da lista. */
export async function carregarTarefas(): Promise<Tarefa[]> {
  const sb = supabase();
  const desde = addDays(new Date(), -14).toISOString();
  const lista = await todas<Tarefa>((de, ate) =>
    sb.from("estudo_tarefas").select(COLUNAS).or(`feita_em.is.null,feita_em.gte.${desde}`).order("posicao").order("id").range(de, ate));
  const hoje = dayKey();
  const chegaram = lista.filter((t) => !t.feita_em && t.aparece_em && t.aparece_em <= hoje);
  if (chegaram.length) {
    // o que volta hoje é escrito no fim da lista (como uma tarefa nova)
    let max = Math.max(0, ...lista.map((t) => t.posicao));
    for (const t of chegaram) {
      t.posicao = ++max;
      t.aparece_em = null;
      await sb.from("estudo_tarefas").update({ posicao: t.posicao, aparece_em: null }).eq("id", t.id);
    }
    lista.sort((a, b) => a.posicao - b.posicao);
  }
  return lista;
}

export const proximaPosicao = (lista: Tarefa[]) => Math.max(0, ...lista.map((t) => t.posicao)) + 1;

export async function criarTarefa(dados: Partial<Tarefa> & { texto: string }, lista: Tarefa[]) {
  const { data, error } = await supabase().from("estudo_tarefas")
    .insert({ ...dados, posicao: proximaPosicao(lista) }).select(COLUNAS).single();
  if (error) throw new Error(error.message);
  return data as Tarefa;
}

export async function mudarTarefa(id: string, campos: Partial<Tarefa>) {
  const { error } = await supabase().from("estudo_tarefas").update(campos).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Feita. Se `voltaEmDias`, uma cópia volta à lista nesse dia (revisão, prática que se repete). */
export async function concluirTarefa(t: Tarefa, voltaEmDias: number | null) {
  await mudarTarefa(t.id, { feita_em: new Date().toISOString(), destacada: false });
  if (voltaEmDias) {
    const { id: _id, feita_em: _f, created_at: _c, ...resto } = t; // eslint-disable-line @typescript-eslint/no-unused-vars
    await supabase().from("estudo_tarefas").insert({
      ...resto, prazo: null, destacada: false, aparece_em: dayKey(addDays(new Date(), voltaEmDias)), posicao: 0,
    });
  }
}

/** Minutos do Timer dedicados a cada tarefa. */
export async function tempoPorTarefa(): Promise<Map<string, number>> {
  const linhas = await todas<{ tarefa_id: string; seconds: number }>((de, ate) =>
    supabase().from("study_sessions").select("tarefa_id,seconds").not("tarefa_id", "is", null).order("id").range(de, ate)).catch(() => []);
  const m = new Map<string, number>();
  for (const l of linhas) m.set(l.tarefa_id, (m.get(l.tarefa_id) ?? 0) + l.seconds);
  return m;
}

/** "até 15/11 · faltam 3 dias" (null quando não há prazo). */
export function textoDoPrazo(prazo: string | null): { texto: string; urgente: boolean; atrasada: boolean } | null {
  if (!prazo) return null;
  const [y, m, d] = prazo.split("-").map(Number);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((new Date(y, m - 1, d).getTime() - hoje.getTime()) / 86_400_000);
  const data = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
  if (dias < 0) return { texto: `até ${data} · atrasada ${-dias} ${dias === -1 ? "dia" : "dias"}`, urgente: true, atrasada: true };
  if (dias === 0) return { texto: `até hoje`, urgente: true, atrasada: false };
  if (dias === 1) return { texto: `até amanhã`, urgente: true, atrasada: false };
  return { texto: `até ${data} · faltam ${dias} dias`, urgente: dias <= 3, atrasada: false };
}
