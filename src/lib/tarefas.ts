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
import { porOrdem } from "./estudos";

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
  /** a aula de onde veio a tarefa */
  aula_id: string | null;
  /** a aula que pede esta tarefa feita antes (avisa ao abrir; não bloqueia) */
  antes_de: string | null;
}

/** Aula resumida, para escolher e para achar a próxima. */
export interface AulaLite { id: string; title: string; pasta_id: string | null; ordem: number | null }

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

const COLUNAS = "id,texto,tipo,pasta_id,book_id,link,prazo,aparece_em,posicao,destacada,feita_em,created_at,aula_id,antes_de";

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

/** Todas as aulas, só o necessário para escolher uma e achar a seguinte. */
export async function carregarAulasLite(): Promise<AulaLite[]> {
  return todas<AulaLite>((de, ate) =>
    supabase().from("notes").select("id,title,pasta_id,ordem").eq("kind", "estudo").order("id").range(de, ate));
}

/** A aula seguinte na mesma pasta, pela ordem da pasta (a que você escolheu, ou a do título). */
export function proximaAula(aulaId: string, aulas: AulaLite[]): AulaLite | null {
  const a = aulas.find((x) => x.id === aulaId);
  if (!a) return null;
  const mesma = aulas.filter((x) => (x.pasta_id ?? null) === (a.pasta_id ?? null)).sort(porOrdem);
  return mesma[mesma.findIndex((x) => x.id === aulaId) + 1] ?? null;
}

/** Tarefas ligadas a uma aula: as que vieram dela e as que ela pede feitas antes. */
export async function tarefasDaAula(aulaId: string): Promise<Tarefa[]> {
  const { data } = await supabase().from("estudo_tarefas").select(COLUNAS)
    .or(`aula_id.eq.${aulaId},antes_de.eq.${aulaId}`).order("posicao");
  return (data as Tarefa[] | null) ?? [];
}

/** As aulas de uma pasta (para achar a próxima sem carregar todas). */
export async function aulasDaPasta(pastaId: string | null): Promise<AulaLite[]> {
  const q = supabase().from("notes").select("id,title,pasta_id,ordem").eq("kind", "estudo");
  const { data } = await (pastaId ? q.eq("pasta_id", pastaId) : q.is("pasta_id", null));
  return (data as AulaLite[] | null) ?? [];
}

/** Cria a tarefa no fim da lista, de qualquer tela (ex.: de dentro da aula). */
export async function criarTarefaNoFim(dados: Partial<Tarefa> & { texto: string }) {
  const sb = supabase();
  const { data: ult } = await sb.from("estudo_tarefas").select("posicao").order("posicao", { ascending: false }).limit(1);
  const posicao = ((ult as { posicao: number }[] | null)?.[0]?.posicao ?? 0) + 1;
  const { data, error } = await sb.from("estudo_tarefas").insert({ ...dados, posicao }).select(COLUNAS).single();
  if (error) throw new Error(error.message);
  return data as Tarefa;
}

/**
 * "Fazer agora": liga o Timer na tarefa (o tempo fica somado nela). Devolve para onde ir:
 * o livro no leitor, se a tarefa é de leitura de um livro digital; ou o link (vídeo), se houver.
 */
export function iniciarTarefa(
  t: Tarefa,
  timer: { set: (p: Record<string, unknown>) => void; start: () => void },
  livro?: { id: string; title: string; format: string } | null,
): { rota?: string; link?: string } {
  timer.set({
    category: livro ? "Leitura" : "Estudos", label: t.texto, tarefaId: t.id, tarefaTexto: t.texto,
    ...(livro ? { bookId: livro.id, bookTitle: livro.title, bookPhysical: livro.format === "fisico" } : { noteId: "", noteTitle: "" }),
  });
  timer.start();
  if (livro && livro.format !== "fisico") return { rota: `/ler/${livro.id}` };
  if (t.link) return { link: t.link };
  return {};
}
