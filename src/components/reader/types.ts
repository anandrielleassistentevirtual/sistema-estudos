import type { Annotation } from "@/lib/types";

export type ReaderTheme = "claro" | "sepia" | "escuro";

export interface ReaderPrefs {
  theme: ReaderTheme;
  fontSize: number; // %
  serif: boolean;
}

export const THEMES: Record<ReaderTheme, { bg: string; fg: string; label: string }> = {
  claro: { bg: "#fcfcfb", fg: "#1d1c1a", label: "Claro" },
  sepia: { bg: "#f4ecd8", fg: "#4a3b2a", label: "Sépia" },
  escuro: { bg: "#1a1a19", fg: "#e8e6e1", label: "Escuro" },
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
}
