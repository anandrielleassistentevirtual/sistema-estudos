"use client";
import { supabase, userId } from "./supabase/client";
import { countWords } from "./text";
import type { Book } from "./types";

export const ACCEPT = ".epub,.txt,.md,.markdown";

function extOf(name: string): Book["format"] | null {
  const e = name.toLowerCase().split(".").pop();
  if (e === "epub") return "epub";
  if (e === "txt") return "txt";
  if (e === "md" || e === "markdown") return "md";
  return null;
}

async function epubMeta(file: File): Promise<{ title?: string; author?: string }> {
  try {
    const ePub = (await import("epubjs")).default;
    const book = ePub(await file.arrayBuffer());
    const meta = await book.loaded.metadata;
    book.destroy();
    return { title: meta.title || undefined, author: meta.creator || undefined };
  } catch {
    return {};
  }
}

export async function uploadBook(file: File, folderId: string | null): Promise<Book> {
  const format = extOf(file.name);
  if (!format) throw new Error(`Formato não suportado: ${file.name}. Use EPUB, TXT ou MD.`);
  const uid = await userId();
  const id = crypto.randomUUID();
  const path = `${uid}/${id}.${format}`;
  const base = file.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();

  let title = base;
  let author: string | null = null;
  let word_count: number | null = null;
  if (format === "epub") {
    const m = await epubMeta(file);
    title = m.title || base;
    author = m.author || null;
  } else {
    const text = await file.text();
    word_count = countWords(text);
    const h1 = text.match(/^#\s+(.+)$/m);
    if (format === "md" && h1) title = h1[1].trim();
  }

  const sb = supabase();
  const up = await sb.storage.from("livros").upload(path, file, {
    contentType: format === "epub" ? "application/epub+zip" : "text/plain; charset=utf-8",
    upsert: false,
  });
  if (up.error) throw new Error(up.error.message);
  const { data, error } = await sb
    .from("books")
    .insert({ id, folder_id: folderId, title, author, format, file_path: path, word_count })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Book;
}

export async function downloadBook(book: Book): Promise<Blob> {
  const { data, error } = await supabase().storage.from("livros").download(book.file_path);
  if (error || !data) throw new Error(error?.message ?? "Arquivo não encontrado");
  return data;
}

export async function deleteBook(book: Book) {
  const sb = supabase();
  await sb.storage.from("livros").remove([book.file_path]);
  await sb.from("books").delete().eq("id", book.id);
}

export async function enqueue(book: Book) {
  const sb = supabase();
  const { data } = await sb.from("books").select("queue_position").not("queue_position", "is", null)
    .order("queue_position", { ascending: false }).limit(1);
  const next = ((data?.[0]?.queue_position as number | undefined) ?? 0) + 1;
  await sb.from("books").update({ queue_position: next }).eq("id", book.id);
  return next;
}
