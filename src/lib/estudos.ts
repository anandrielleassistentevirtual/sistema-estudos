"use client";
import { supabase } from "./supabase/client";
import { todas } from "./supabase/todas";
import type { Note } from "./types";
import type { SituacaoAula } from "@/components/status-pill";

/** Aula na lista (sem a transcrição, que é baixada só ao abrir a aula). */
export type Aula = Pick<Note, "id" | "title" | "folder" | "professor" | "course" | "created_at" | "updated_at" | "location" | "completed_at"> & {
  anotacoes: string;
  /** palavras da transcrição (contadas pelo banco quando o texto muda) */
  palavras: number;
  /** quanto já foi lido (0 a 1) */
  progresso: number;
  situacao: SituacaoAula;
  /** pasta da aula (autor › curso › módulo…); o caminho em texto fica em `course`, mantido pelo banco */
  pasta_id: string | null;
  /** posição escolhida por você dentro da pasta (sem posição, vale a ordem do título) */
  ordem: number | null;
};

/** Pasta dos Estudos: subpastas sem limite, na ordem escolhida. */
export interface PastaEstudo { id: string; parent_id: string | null; nome: string; posicao: number }

/** Árvore na ordem de exibição (pai antes dos filhos, irmãos pela posição). */
export function arvoreDePastas(pastas: PastaEstudo[]) {
  const filhos = new Map<string | null, PastaEstudo[]>();
  for (const p of pastas) filhos.set(p.parent_id, [...(filhos.get(p.parent_id) ?? []), p]);
  for (const l of filhos.values()) l.sort((a, b) => a.posicao - b.posicao || a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  const ordem: { pasta: PastaEstudo; nivel: number }[] = [];
  const visitar = (pai: string | null, nivel: number) => {
    for (const p of filhos.get(pai) ?? []) { ordem.push({ pasta: p, nivel }); visitar(p.id, nivel + 1); }
  };
  visitar(null, 0);
  return { ordem, filhos };
}

/** A pasta e todas as que estão dentro dela. */
export function subarvore(id: string, filhos: Map<string | null, PastaEstudo[]>) {
  const s = new Set<string>([id]);
  const pilha = [id];
  while (pilha.length) for (const f of filhos.get(pilha.pop()!) ?? []) { s.add(f.id); pilha.push(f.id); }
  return s;
}

/** "Paulo Cantarelli › EFESC" */
export function caminhoDaPasta(id: string | null, porId: Map<string, PastaEstudo>) {
  const nomes: string[] = [];
  for (let p = id ? porId.get(id) : undefined, n = 0; p && n < 50; p = p.parent_id ? porId.get(p.parent_id) : undefined, n++) nomes.unshift(p.nome);
  return nomes.join(" › ");
}

export const COLUNAS_AULA = "id,title,folder,professor,course,created_at,updated_at,location,completed_at,anotacoes,palavras,progresso,situacao,pasta_id,ordem";

/** Palavras que faltam ler numa aula. */
export const faltam = (a: Pick<Aula, "palavras" | "progresso" | "situacao">) =>
  a.situacao === "concluida" ? 0 : Math.max(0, (a.palavras ?? 0) * (1 - (a.situacao === "lendo" ? a.progresso ?? 0 : 0)));

/** Campos que acompanham cada status (a data de conclusão e os 100%). */
export function camposDaSituacao(s: SituacaoAula, antes: Pick<Aula, "completed_at">) {
  return s === "concluida"
    ? { situacao: s, completed_at: antes.completed_at ?? new Date().toISOString(), progresso: 1 }
    : { situacao: s, completed_at: null };
}

const PPM_PADRAO = 220;

/**
 * Seu ritmo de leitura (palavras por minuto), pelas últimas sessões medidas no leitor.
 * Usa as sessões das aulas se houver o bastante; senão, todas as leituras; senão, 220.
 */
export async function ppmMedio(): Promise<{ ppm: number; origem: "aulas" | "leituras" | "padrão" }> {
  const { data } = await supabase().from("reading_sessions").select("seconds,words,note_id").order("started_at", { ascending: false }).limit(300);
  const linhas = (data as { seconds: number; words: number; note_id: string | null }[]) ?? [];
  const calc = (xs: typeof linhas) => {
    const s = xs.reduce((a, x) => a + x.seconds, 0);
    return s > 300 ? Math.round(xs.reduce((a, x) => a + x.words, 0) / (s / 60)) : 0;
  };
  const aulas = calc(linhas.filter((x) => x.note_id));
  if (aulas) return { ppm: aulas, origem: "aulas" };
  const todas = calc(linhas);
  if (todas) return { ppm: todas, origem: "leituras" };
  return { ppm: PPM_PADRAO, origem: "padrão" };
}

export const porTitulo = (a: { title: string }, b: { title: string }) =>
  a.title.localeCompare(b.title, "pt-BR", { numeric: true, sensitivity: "base" });

/** Ordem das aulas numa pasta: a posição que você escolheu; sem posição (aulas novas), pela ordem do título, no fim. */
export const porOrdem = (a: { title: string; ordem?: number | null }, b: { title: string; ordem?: number | null }) =>
  (a.ordem ?? Number.MAX_SAFE_INTEGER) - (b.ordem ?? Number.MAX_SAFE_INTEGER) || porTitulo(a, b);

/** Grava a ordem de uma pasta inteira de uma vez (a lista de ids, já na ordem nova). */
export async function reordenarAulas(ids: string[]) {
  const { error } = await supabase().rpc("reordenar_aulas", { ids });
  if (error) throw new Error(error.message);
}

/** "07 - Ética" → "07"; "Aula 12: …" → "12". */
export function numeroDaAula(titulo: string): string | null {
  const m = titulo.match(/^\s*(?:aula\s*)?(\d{1,3})\b/i);
  return m ? m[1].padStart(2, "0") : null;
}

/** Se a transcrição começa com "# Título antigo", troca pelo novo título. */
export function syncHeading(content: string, oldTitle: string, newTitle: string) {
  const m = content.match(/^([ \t]*#[ \t]+)(.+?)[ \t]*$/m);
  if (!m || m.index === undefined || content.slice(0, m.index).trim() !== "" || m[2].trim() !== oldTitle.trim()) return content;
  return content.slice(0, m.index) + m[1] + newTitle + content.slice(m.index + m[0].length);
}

export const caminhoRelativo = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;

/** As pastas do computador onde o arquivo estava (a partir do nível escolhido): viram subpastas. */
export function pastasDoArquivo(f: File, nivel: 0 | 1) {
  return caminhoRelativo(f).split("/").slice(0, -1).slice(nivel).filter(Boolean);
}

/** Pasta com vários cursos ("1. Estudos/EFESC/…") ou a pasta de um curso só ("EFESC/…")? */
export function nivelProvavel(files: File[]): 0 | 1 {
  const tops = new Set(files.map((f) => caminhoRelativo(f).split("/")[1]).filter(Boolean));
  const fundos = files.filter((f) => caminhoRelativo(f).split("/").length >= 3).length;
  return fundos > files.length / 2 && tops.size > 1 && /estudo|curso/i.test(caminhoRelativo(files[0]).split("/")[0]) ? 1 : 0;
}

/**
 * Importa transcrições (.md/.txt) para dentro da pasta `destino` (ou da raiz). As pastas do computador viram
 * subpastas (criadas se ainda não existirem). Importar de novo atualiza as aulas que já existem
 * (mesma pasta e título), sem duplicar.
 */
export async function importarAulas(
  files: File[], nivel: 0 | 1, existentes: Aula[], destino: string | null, pastas: PastaEstudo[], progresso: (msg: string) => void,
) {
  const sb = supabase();
  const todas = [...pastas];
  const doMesmoNome = (pai: string | null, nome: string) =>
    todas.find((p) => p.parent_id === pai && p.nome.trim().toLowerCase() === nome.trim().toLowerCase());
  async function garantir(pai: string | null, nome: string) {
    const ja = doMesmoNome(pai, nome);
    if (ja) return ja.id;
    const posicao = todas.filter((p) => p.parent_id === pai).length;
    const { data, error } = await sb.from("estudo_pastas").insert({ parent_id: pai, nome: nome.trim(), posicao }).select("id,parent_id,nome,posicao").single();
    if (error) throw new Error(error.message);
    todas.push(data as PastaEstudo);
    return (data as PastaEstudo).id;
  }
  const chave = (p: string | null, t: string) => `${p ?? ""}|${t}`.toLowerCase();
  const ja = new Map(existentes.map((n) => [chave(n.pasta_id, n.title), n.id]));
  const novas: Record<string, unknown>[] = [];
  let atualizadas = 0;
  // na ordem natural dos caminhos (Módulo 1, Módulo 2, … Módulo 10): as pastas novas nascem nessa ordem
  files = [...files].sort((a, b) => caminhoRelativo(a).localeCompare(caminhoRelativo(b), "pt-BR", { numeric: true }));
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    progresso(`Lendo ${i + 1} de ${files.length}…`);
    let content = await f.text();
    let pasta = destino;
    for (const nome of pastasDoArquivo(f, nivel)) pasta = await garantir(pasta, nome);
    let professor = "";
    const fm = content.match(/^---\n([\s\S]*?)\n---\n?/);
    if (fm) {
      for (const l of fm[1].split("\n")) {
        const [k, ...v] = l.split(":");
        if (k.trim() === "professor") professor = v.join(":").trim();
      }
      content = content.slice(fm[0].length);
    }
    const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || f.name.replace(/\.(md|markdown|txt)$/i, "");
    const id = ja.get(chave(pasta, title));
    if (id) {
      await sb.from("notes").update({ content, ...(professor ? { professor } : {}) }).eq("id", id);
      atualizadas++;
    } else {
      novas.push({ kind: "estudo", title, content, folder: "", course: "", professor, pasta_id: pasta });
    }
  }
  for (let i = 0; i < novas.length; i += 100) {
    progresso(`Salvando ${Math.min(novas.length, i + 100)} de ${novas.length}…`);
    const { error } = await sb.from("notes").insert(novas.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
  return { novas: novas.length, atualizadas };
}

const seguro = (s: string) => s.replace(/[\\/:*?"<>|]/g, "-").trim() || "sem-titulo";

/** Baixa a transcrição de uma aula como .md. */
export async function baixarAula(a: Pick<Aula, "id" | "title" | "course" | "professor">) {
  const { data } = await supabase().from("notes").select("content").eq("id", a.id).single();
  const front = `---\nprofessor: ${a.professor ?? ""}\ncurso: ${a.course ?? ""}\n---\n\n`;
  baixar(new Blob([front + ((data as { content: string } | null)?.content ?? "")], { type: "text/markdown;charset=utf-8" }), `${seguro(a.title)}.md`);
}

/** Todas as aulas num .zip (pastas curso/módulo), com as anotações junto. */
export async function baixarTodas(aulas: Aula[]) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  // as transcrições são grandes: de 100 em 100
  const data = await todas<{ id: string; content: string }>((de, ate) => supabase().from("notes").select("id,content").eq("kind", "estudo").order("id").range(de, ate), 100);
  const textos = new Map(data.map((x) => [x.id, x.content]));
  for (const a of aulas) {
    const dir = [...a.course.split(" › "), ...a.folder.split(" › ")].filter(Boolean).map(seguro).join("/");
    const front = `---\nprofessor: ${a.professor}\ncurso: ${a.course}\n---\n\n`;
    zip.file(`${dir ? dir + "/" : ""}${seguro(a.title)}.md`, front + (textos.get(a.id) ?? ""));
    if ((a.anotacoes ?? "").trim()) zip.file(`${dir ? dir + "/" : ""}${seguro(a.title)} (anotações).md`, a.anotacoes);
  }
  baixar(await zip.generateAsync({ type: "blob" }), `estudos-${new Date().toISOString().slice(0, 10)}.zip`);
}

function baixar(blob: Blob, nome: string) {
  const el = document.createElement("a");
  el.href = URL.createObjectURL(blob);
  el.download = nome;
  document.body.appendChild(el);
  el.click();
  setTimeout(() => { el.remove(); URL.revokeObjectURL(el.href); }, 10000);
}
