"use client";
import { supabase } from "./supabase/client";
import type { Note } from "./types";

/** Aula na lista (sem a transcrição, que é baixada só ao abrir a aula). */
export type Aula = Pick<Note, "id" | "title" | "folder" | "professor" | "course" | "created_at" | "updated_at" | "location" | "completed_at"> & {
  anotacoes: string;
  /** palavras da transcrição (contadas pelo banco quando o texto muda) */
  palavras: number;
  /** quanto já foi lido (0 a 1) */
  progresso: number;
};

export const COLUNAS_AULA = "id,title,folder,professor,course,created_at,updated_at,location,completed_at,anotacoes,palavras,progresso";

/** Palavras que faltam ler numa aula. */
export const faltam = (a: Pick<Aula, "palavras" | "progresso" | "completed_at">) =>
  a.completed_at ? 0 : Math.max(0, (a.palavras ?? 0) * (1 - (a.progresso ?? 0)));

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

/** Onde cada arquivo vai parar: curso e módulo (a partir das pastas). */
export function lugarDoArquivo(f: File, nivel: 0 | 1) {
  const partes = caminhoRelativo(f).split("/");
  const pastas = partes.slice(0, -1);
  return { course: pastas[nivel] ?? pastas[0] ?? "", module: pastas.slice(nivel + 1).join(" › ") };
}

/** Pasta com vários cursos ("1. Estudos/EFESC/…") ou a pasta de um curso só ("EFESC/…")? */
export function nivelProvavel(files: File[]): 0 | 1 {
  const tops = new Set(files.map((f) => caminhoRelativo(f).split("/")[1]).filter(Boolean));
  const fundos = files.filter((f) => caminhoRelativo(f).split("/").length >= 3).length;
  return fundos > files.length / 2 && tops.size > 1 && /estudo|curso/i.test(caminhoRelativo(files[0]).split("/")[0]) ? 1 : 0;
}

/**
 * Importa transcrições (.md/.txt). Curso = pasta, módulo = subpastas.
 * Importar de novo atualiza as aulas que já existem (mesmo curso, módulo e título), sem duplicar.
 */
export async function importarAulas(files: File[], nivel: 0 | 1, existentes: Aula[], progresso: (msg: string) => void) {
  const sb = supabase();
  const chave = (c: string, f: string, t: string) => `${c}|${f}|${t}`.toLowerCase();
  const ja = new Map(existentes.map((n) => [chave(n.course, n.folder, n.title), n.id]));
  const novas: Record<string, unknown>[] = [];
  let atualizadas = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    progresso(`Lendo ${i + 1} de ${files.length}…`);
    let content = await f.text();
    let { course, module: folder } = lugarDoArquivo(f, nivel);
    let professor = "";
    const fm = content.match(/^---\n([\s\S]*?)\n---\n?/);
    if (fm) {
      for (const l of fm[1].split("\n")) {
        const [k, ...v] = l.split(":");
        if (k.trim() === "professor") professor = v.join(":").trim();
        if (k.trim() === "curso" && v.join(":").trim()) course = v.join(":").trim();
      }
      content = content.slice(fm[0].length);
    }
    const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || f.name.replace(/\.(md|markdown|txt)$/i, "");
    const id = ja.get(chave(course, folder, title));
    if (id) {
      await sb.from("notes").update({ content, ...(professor ? { professor } : {}) }).eq("id", id);
      atualizadas++;
    } else {
      novas.push({ kind: "estudo", title, content, folder, course, professor });
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
  const { data } = await supabase().from("notes").select("id,content").eq("kind", "estudo");
  const textos = new Map(((data as { id: string; content: string }[]) ?? []).map((x) => [x.id, x.content]));
  for (const a of aulas) {
    const dir = [a.course, ...a.folder.split(" › ")].filter(Boolean).map(seguro).join("/");
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
