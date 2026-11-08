"use client";
import { supabase } from "./supabase/client";
import type { Note, NoteStatus } from "./types";

export const COLUNAS: { id: NoteStatus; label: string; hint: string }[] = [
  { id: "a_tratar", label: "A tratar", hint: "destaques e ideias recém-capturados" },
  { id: "em_tratamento", label: "Em tratamento", hint: "reescrevendo com suas palavras" },
  { id: "concluida", label: "Concluída", hint: "vai para as anotações do livro" },
];

/** ID único à moda de Luhmann/Zettelkasten: AAAAMMDDHHmmss. */
export function newZid(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** "p. 42" / "p:3" (página do leitor) / cfi do EPUB → rótulo curto. */
export function locationLabel(loc?: string | null) {
  if (!loc) return "";
  const m = loc.match(/^p:(\d+)$/);
  if (m) return `pág. ${Number(m[1]) + 1} do leitor`;
  if (loc.startsWith("epubcfi(")) return "EPUB";
  return loc;
}

/** Cria a nota literária na Inbox a partir de um destaque do leitor. */
export async function literaryFromHighlight(input: { bookId: string; bookTitle: string; annotationId: string; quote: string; note: string; location: string }) {
  const title = input.quote.length > 70 ? input.quote.slice(0, 70).trim() + "…" : input.quote;
  return await supabase().from("notes").insert({
    kind: "literaria", status: "a_tratar", title, book_id: input.bookId, annotation_id: input.annotationId,
    quote: input.quote, content: input.note, location: input.location,
  });
}

export async function setStatus(n: Pick<Note, "id">, status: NoteStatus) {
  return await supabase().from("notes").update({ status, concluded_at: status === "concluida" ? new Date().toISOString() : null }).eq("id", n.id);
}

/** Modelo de nota atômica (anatomia: ID, título, corpo, links com o porquê, referências). */
export function atomicTemplate(opts: { zid: string; reference?: string; quote?: string }) {
  return `> ID: ${opts.zid}

## Ideia
Uma única ideia, com as suas palavras — deve ser compreensível sozinha, sem precisar da fonte.

## Links
- [[ ]] — por que esta ligação importa

## Referências
${opts.reference ? `- ${opts.reference}` : "- "}
${opts.quote ? `\n> ${opts.quote.replace(/\n/g, "\n> ")}\n` : ""}`;
}
