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
  times: { label: "Times New Roman", css: '"Times New Roman", Tinos, Times, "Liberation Serif", serif' },
  literata: { label: "Literata", css: "Literata, Georgia, serif" },
  inter: { label: "Inter", css: "Inter, system-ui, sans-serif" },
};

export const THEMES: Record<ConcreteTheme, { bg: string; fg: string; label: string }> = {
  claro: { bg: "#ffffff", fg: "#1c1c1c", label: "Claro" },
  sepia: { bg: "#f4ecd8", fg: "#4a3b2a", label: "Sépia" },
  escuro: { bg: "#1c1c1c", fg: "#e6e6e6", label: "Escuro" },
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
  onSelect: (sel: { location: string; quote: string } | null) => void;
  onWordCount: (total: number) => void;
  onAnnotationClick: (id: string) => void;
  onToc?: (items: TocItem[]) => void;
  /** página na tela: palavras e se é a última */
  onView?: (words: number, last: boolean) => void;
}

/** Cores do tema (o leitor recebe o tema já resolvido; "auto" cai no claro por segurança). */
export function themeColors(t: ReaderTheme) {
  return THEMES[t === "auto" ? "claro" : t];
}
