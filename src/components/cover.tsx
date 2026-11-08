"use client";
import type { Book } from "@/lib/types";

/** Miniatura da capa; sem capa, mostra o formato (EPUB, TXT…) ou 📖 para livro físico. */
export function Cover({ book, url, className = "w-9 h-12" }: { book: Pick<Book, "format" | "title">; url?: string; className?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={`Capa de ${book.title}`} className={`${className} rounded object-cover shrink-0 bg-surface-2 shadow-sm`} />;
  }
  return (
    <span className={`${className} grid place-items-center rounded bg-surface-2 text-[10px] font-medium uppercase text-muted shrink-0`}>
      {book.format === "fisico" ? "📖" : book.format}
    </span>
  );
}
