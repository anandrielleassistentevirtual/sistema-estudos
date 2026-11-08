"use client";
import { supabase, userId } from "./supabase/client";
import type { Book } from "./types";

/** Reduz a imagem para no máximo 600px de altura e converte para JPEG. */
async function shrink(img: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(img);
  const scale = Math.min(1, 600 / bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Imagem inválida"))), "image/jpeg", 0.85));
}

export async function setCover(book: Pick<Book, "id" | "cover_path">, image: Blob): Promise<string> {
  const uid = await userId();
  const jpg = await shrink(image);
  const path = `${uid}/capas/${book.id}-${Date.now()}.jpg`;
  const sb = supabase();
  const up = await sb.storage.from("livros").upload(path, jpg, { contentType: "image/jpeg" });
  if (up.error) throw new Error(up.error.message);
  if (book.cover_path && !isLink(book.cover_path)) await sb.storage.from("livros").remove([book.cover_path]);
  await sb.from("books").update({ cover_path: path }).eq("id", book.id);
  return path;
}

const isLink = (p: string) => /^https?:\/\//.test(p);

/**
 * Capa a partir do link de uma imagem (como no Notion). Tenta guardar uma cópia;
 * se o site não deixar baixar, guarda o próprio link.
 */
export async function setCoverFromLink(book: Pick<Book, "id" | "cover_path">, link: string): Promise<{ path: string; url: string }> {
  const url = link.trim();
  if (!isLink(url)) throw new Error("Cole um link que comece com http:// ou https://");
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    if (res.ok && blob.type.startsWith("image/")) {
      const path = await setCover(book, blob);
      return { path, url: URL.createObjectURL(blob) };
    }
  } catch {
    /* o site bloqueou a cópia: usa o link direto */
  }
  await new Promise<void>((ok, fail) => {
    const img = new Image();
    img.onload = () => ok();
    img.onerror = () => fail(new Error("Não consegui abrir essa imagem. Confira se o link termina numa imagem (.jpg, .png…)."));
    img.src = url;
  });
  const sb = supabase();
  if (book.cover_path && !isLink(book.cover_path)) await sb.storage.from("livros").remove([book.cover_path]);
  await sb.from("books").update({ cover_path: url }).eq("id", book.id);
  return { path: url, url };
}

export async function removeCover(book: Pick<Book, "id" | "cover_path">) {
  const sb = supabase();
  if (book.cover_path && !isLink(book.cover_path)) await sb.storage.from("livros").remove([book.cover_path]);
  await sb.from("books").update({ cover_path: null }).eq("id", book.id);
}

/** A capa que vem dentro do EPUB (se houver). Desiste depois de 20 s. */
export async function epubCover(data: Blob | ArrayBuffer): Promise<Blob | null> {
  return Promise.race([readEpubCover(data), new Promise<null>((r) => setTimeout(() => r(null), 20000))]);
}

async function readEpubCover(data: Blob | ArrayBuffer): Promise<Blob | null> {
  try {
    const ePub = (await import("epubjs")).default;
    const book = ePub(data instanceof Blob ? await data.arrayBuffer() : data);
    await book.ready;
    const url = await book.coverUrl();
    if (!url) { book.destroy(); return null; }
    const blob = await (await fetch(url)).blob();
    book.destroy();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

/** URLs assinadas das capas (id do livro → url). */
export async function coverUrls(books: Pick<Book, "id" | "cover_path">[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const b of books) if (b.cover_path && isLink(b.cover_path)) out[b.id] = b.cover_path;
  const withCover = books.filter((b) => b.cover_path && !isLink(b.cover_path));
  if (!withCover.length) return out;
  const { data } = await supabase().storage.from("livros").createSignedUrls(withCover.map((b) => b.cover_path!), 60 * 60 * 12);
  (Array.isArray(data) ? data : []).forEach((d, i) => { if (d.signedUrl) out[withCover[i].id] = d.signedUrl; });
  return out;
}
