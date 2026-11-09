"use client";
import type { Book } from "@/lib/types";

/** Tons sóbrios de encadernação (tecido/couro), escolhidos pelo título: cada livro tem sempre a mesma cor. */
const TONS = [
  { bg: "#1f3a5f", fg: "#e9e4d8" }, // azul-marinho
  { bg: "#5b1f2a", fg: "#efe3d6" }, // bordô
  { bg: "#24493d", fg: "#e6e8dc" }, // verde-garrafa
  { bg: "#3d3a5c", fg: "#e7e4ef" }, // ameixa
  { bg: "#6b4a2b", fg: "#f1e6d4" }, // couro
  { bg: "#2f3b45", fg: "#e3e7ea" }, // ardósia
  { bg: "#7a5c1e", fg: "#f6ecd2" }, // ocre
  { bg: "#2b2b2e", fg: "#ece9e1" }, // grafite
];

function tom(chave: string) {
  let h = 0;
  for (const ch of chave) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONS[h % TONS.length];
}

/**
 * Miniatura da capa. Sem imagem, desenha uma capa tipográfica (título e autor sobre uma cor de encadernação),
 * que não ocupa espaço nenhum no armazenamento. Em tamanhos pequenos mostra a inicial do título.
 */
export function Cover({ book, url, className = "w-9 h-12" }: { book: Pick<Book, "format" | "title"> & { author?: string | null }; url?: string; className?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={`Capa de ${book.title}`} className={`${className} rounded object-cover shrink-0 bg-surface-2 shadow-sm`} />;
  }
  const titulo = (book.title || "Sem título").trim();
  const autor = (book.author ?? "").split(",")[0].trim(); // "Sobrenome, Nome" → Sobrenome
  const t = tom(`${titulo}|${book.author ?? ""}`);
  return (
    <span
      role="img"
      aria-label={`Capa de ${titulo}`}
      className={`${className} @container relative shrink-0 overflow-hidden rounded-[3px] shadow-sm select-none`}
      style={{ background: t.bg, color: t.fg, fontFamily: "var(--font-literata), Georgia, serif" }}
    >
      {/* lombada: sombra suave à esquerda, como num livro de verdade */}
      <span className="absolute inset-y-0 left-0 w-[8%] bg-gradient-to-r from-black/35 to-transparent" />
      {/* fios dourados no alto e embaixo */}
      <span className="absolute left-[14%] right-[10%] top-[9%] h-px opacity-50" style={{ background: t.fg }} />
      <span className="absolute left-[14%] right-[10%] bottom-[9%] h-px opacity-50" style={{ background: t.fg }} />
      {/* pequena: só a inicial */}
      <span className="absolute inset-0 grid place-items-center pl-[6%] text-[15px] leading-none @min-[72px]:hidden">
        {titulo.replace(/^(o|a|os|as|um|uma|the|il|la|le)\s+/i, "").charAt(0).toUpperCase()}
      </span>
      {/* maior: título e autor */}
      <span className="absolute inset-0 hidden @min-[72px]:flex flex-col justify-between pl-[18%] pr-[12%] py-[16%]">
        <span className="text-[13px] leading-tight line-clamp-5 break-words">{titulo}</span>
        {autor && <span className="text-[9px] uppercase tracking-[0.12em] opacity-80 truncate font-sans">{autor}</span>}
      </span>
    </span>
  );
}
