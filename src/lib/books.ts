"use client";
import { supabase, userId } from "./supabase/client";
import { countWords } from "./text";
import type { Book } from "./types";
import { epubCover, setCover } from "./covers";

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
  if (format === "epub") {
    const img = await epubCover(file);
    if (img) {
      try { (data as Book).cover_path = await setCover(data as Book, img); } catch {}
    }
  }
  return data as Book;
}

export async function downloadBook(book: Book): Promise<Blob> {
  if (!book.file_path) throw new Error("Este é um livro físico: use o Timer (categoria Leitura) para registrar a leitura.");
  const { data, error } = await supabase().storage.from("livros").download(book.file_path);
  if (error || !data) throw new Error(error?.message ?? "Arquivo não encontrado");
  return data;
}

/** Baixa o arquivo original do livro para o computador ("Autor - Título.epub"). */
export async function saveBookFile(book: Book) {
  const blob = await downloadBook(book);
  const base = [book.author, book.title].filter(Boolean).join(" - ").replace(/[\\/:*?"<>|]/g, "-").trim() || "livro";
  const file = new File([blob], `${base}.${book.format}`, { type: blob.type || "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 10000);
}

export async function deleteBook(book: Book) {
  const sb = supabase();
  const files = [book.file_path, book.cover_path].filter(Boolean) as string[];
  if (files.length) await sb.storage.from("livros").remove(files);
  await sb.from("books").delete().eq("id", book.id);
}

export async function addPhysicalBook(input: {
  title: string; author: string; total_pages: number; current_page: number; words_per_page: number; folder_id: string | null;
}): Promise<Book> {
  const { data, error } = await supabase()
    .from("books")
    .insert({
      title: input.title, author: input.author || null, format: "fisico", file_path: null, folder_id: input.folder_id,
      total_pages: input.total_pages || null, current_page: input.current_page || null, words_per_page: input.words_per_page || 300,
      word_count: input.total_pages ? input.total_pages * (input.words_per_page || 300) : null,
      progress: input.total_pages && input.current_page ? Math.min(1, input.current_page / input.total_pages) : 0,
      status: input.current_page ? "lendo" : "aguardando",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Book;
}

export async function enqueue(book: Book) {
  const sb = supabase();
  const { data } = await sb.from("books").select("queue_position").not("queue_position", "is", null)
    .order("queue_position", { ascending: false }).limit(1);
  const next = ((data?.[0]?.queue_position as number | undefined) ?? 0) + 1;
  await sb.from("books").update({ queue_position: next }).eq("id", book.id);
  return next;
}
