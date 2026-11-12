/** Montagem das páginas do leitor de TXT e Markdown (função pura, testável). */
import { countWords } from "@/lib/text";
import type { TocItem } from "./types";

export const WORDS_PER_PAGE = 320;

const TXT_HEADING = /^(cap[ií]tulo|parte|livro|canto|se[cç][aã]o|pr[oó]logo|ep[ií]logo|introdu[cç][aã]o|pref[aá]cio|chapter|part|book|prologue|epilogue)\b/i;

/** Título de um parágrafo, se ele for um título (# do Markdown ou "Capítulo X" no TXT). */
export function headingOf(par: string, md: boolean): { label: string; level: number } | null {
  const first = par.split("\n")[0].trim();
  const m = first.match(/^(#{1,3})\s+(.+?)\s*#*$/);
  if (m) return { label: m[2].replace(/[*_`]/g, ""), level: m[1].length };
  if (md) return null;
  if (first.length <= 80 && TXT_HEADING.test(first)) return { label: first, level: 1 };
  if (first.length >= 3 && first.length <= 60 && first === first.toUpperCase() && /\p{L}/u.test(first) && !/[.!?,;]$/.test(first) && par.split("\n").length === 1)
    return { label: first, level: 2 };
  return null;
}

/**
 * Parágrafo que não pode terminar uma página: título (#), separador (---, ***) ou linha curta toda em
 * negrito/itálico (nome de capítulo, autor, datas como "(1912–1982)").
 */
export function presoAoSeguinte(par: string, md: boolean): boolean {
  const t = par.trim();
  if (/^([-*_]\s*){3,}$/.test(t)) return true;
  if (headingOf(t, md)) return true;
  const enfatico = /^(\*\*|__|\*|_)[^\n]+(\*\*|__|\*|_)$/.test(t);
  return enfatico && countWords(t) <= 14 && t.split("\n").length <= 2;
}

/** Páginas de ~320 palavras, quebrando entre parágrafos; título e subtítulo nunca ficam soltos no fim. */
export function paginar(text: string, md: boolean): { pages: { text: string; words: number }[]; toc: TocItem[] } {
  const paras = text.replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const out: { text: string; words: number }[] = [];
  let cur: { p: string; w: number }[] = [];
  let n = 0;
  for (const p of paras) {
    const w = countWords(p);
    if (n > 0 && n + w > WORDS_PER_PAGE * 1.15) {
      // título, subtítulo curto e separador não ficam soltos no fim da página: vão com o texto seguinte
      let k = cur.length;
      while (k > 1 && presoAoSeguinte(cur[k - 1].p, md)) k--;
      const levar = cur.slice(k);
      cur = cur.slice(0, k);
      out.push({ text: cur.map((x) => x.p).join("\n\n"), words: cur.reduce((a, x) => a + x.w, 0) });
      cur = levar;
      n = levar.reduce((a, x) => a + x.w, 0);
    }
    cur.push({ p, w });
    n += w;
  }
  if (cur.length) out.push({ text: cur.map((x) => x.p).join("\n\n"), words: n });
  // sumário depois de montar as páginas (cada título aponta para a página onde ficou)
  const toc: TocItem[] = [];
  out.forEach((pg, i) => {
    for (const p of pg.text.split("\n\n")) {
      const h = headingOf(p, md);
      if (h) toc.push({ ...h, location: `p:${i}` });
    }
  });
  return { pages: out, toc };
}
