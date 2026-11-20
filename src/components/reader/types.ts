import type { Annotation } from "@/lib/types";

/** "auto" acompanha o tema do sistema (claro/escuro). */
export type ReaderTheme = "auto" | "claro" | "sepia" | "escuro";
export type ConcreteTheme = Exclude<ReaderTheme, "auto">;

export type ReaderFont = "times" | "literata" | "inter";

export interface ReaderPrefs {
  theme: ReaderTheme;
  font: ReaderFont;
  sizePt: number; // tamanho em pontos (12 = padrão de documento)
  justify: boolean;
  lineHeight: number; // 1, 1.15, 1.5, 2
}

export const DEFAULT_PREFS: ReaderPrefs = { theme: "auto", font: "times", sizePt: 12, justify: true, lineHeight: 1.5 };

export const FONTS: Record<ReaderFont, { label: string; css: string }> = {
  times: { label: "Times New Roman", css: '"Times New Roman", var(--font-tinos), Tinos, Times, "Liberation Serif", serif' },
  literata: { label: "Literata", css: "var(--font-literata), Literata, Georgia, serif" },
  inter: { label: "Inter", css: "var(--font-inter), Inter, system-ui, sans-serif" },
};

export const THEMES: Record<ConcreteTheme, { bg: string; fg: string; label: string }> = {
  claro: { bg: "#ffffff", fg: "#1c1c1c", label: "Claro" },
  sepia: { bg: "#f4ecd8", fg: "#4a3b2a", label: "Sépia" },
  escuro: { bg: "#1c1c1e", fg: "#f2f2f7", label: "Escuro" },
};

export const HL_COLORS: Record<string, string> = {
  amarelo: "#eda100",
  azul: "#3987e5",
  verde: "#1baf7a",
  rosa: "#e87ba4",
};

export interface TocItem {
  label: string;
  location: string; // "p:N" (TXT/MD) ou href (EPUB)
  level: number; // 1, 2, 3
  /** posição para saber "onde você está": página (TXT/MD) ou capítulo do EPUB (ordem de leitura) */
  ordem?: number;
}

export interface ReaderHandle {
  goTo: (location: string) => void;
  next: () => void;
  prev: () => void;
}

export interface ReaderProps {
  data: Blob;
  format: "epub" | "txt" | "md";
  startAt: string | null;
  prefs: ReaderPrefs;
  annotations: Annotation[];
  knownWords: number | null;
  onTurn: (words: number, forward: boolean) => void;
  onLocation: (location: string, progress: number, label: string) => void;
  /** trecho selecionado (abre a barra de anotação); null quando a seleção é desfeita */
  onSelect: (sel: { location: string; quote: string } | null) => void;
  onWordCount: (total: number) => void;
  onAnnotationClick: (id: string) => void;
  onToc?: (items: TocItem[]) => void;
  /** EPUB: o capítulo (na ordem de leitura do livro) que está na tela */
  onSecao?: (ordem: number) => void;
  /** página na tela: palavras e se é a última */
  onView?: (words: number, last: boolean) => void;
  /** páginas que ainda faltam no capítulo depois desta (0 = última página do capítulo); null = o livro não tem capítulos */
  onCapitulo?: (faltam: number | null) => void;
}

/** "3 páginas restantes no capítulo" (como no Livros da Apple) */
export function textoFaltamNoCapitulo(faltam: number | null, nome = "capítulo"): string {
  if (faltam === null || faltam < 0) return "";
  if (faltam === 0) return `última página do ${nome}`;
  return `${faltam} ${faltam === 1 ? "página restante" : "páginas restantes"} no ${nome}`;
}

/** Cores do tema (o leitor recebe o tema já resolvido; "auto" cai no claro por segurança). */
export function themeColors(t: ReaderTheme) {
  return THEMES[t === "auto" ? "claro" : t];
}

/** Pilha de fontes sem var(): dentro do iframe do EPUB as variáveis da página não existem. */
export const semVariaveis = (css: string) => css.replace(/var\([^)]*\),\s*/g, "");

/**
 * Atributo da barra que aparece com a seleção (anotar, levar para as anotações). Mexer nela (digitar a nota,
 * escolher a cor) desfaz a seleção do texto, mas não deve fechá-la; qualquer outro clique que desfaz a seleção fecha.
 */
export const BARRA_SELECAO = "data-barra-selecao";
const naBarra = (n: EventTarget | Element | null | undefined) => !!(n as Element | null)?.closest?.(`[${BARRA_SELECAO}]`);

/**
 * Fecha a barra de anotação quando a seleção some (clique ou toque fora do trecho, tecla), num documento —
 * a página ou o iframe do EPUB. Devolve a função que desliga.
 */
export function aoDesfazerSelecao(doc: Document, fechar: () => void): () => void {
  let ultimoToqueNaBarra = false;
  const toque = (e: Event) => { ultimoToqueNaBarra = naBarra(e.target); };
  const mudou = () => {
    // usando a barra (digitando a nota): a seleção do texto some, mas a barra fica
    if (ultimoToqueNaBarra || naBarra(document.activeElement)) return;
    const s = doc.getSelection();
    if (!s || s.isCollapsed || !s.toString().trim()) fechar();
  };
  doc.addEventListener("pointerdown", toque, true);
  doc.addEventListener("selectionchange", mudou);
  return () => {
    doc.removeEventListener("pointerdown", toque, true);
    doc.removeEventListener("selectionchange", mudou);
  };
}
