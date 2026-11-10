export type BookStatus = "aguardando" | "lendo" | "pausado" | "lido";

export interface Folder {
  id: string;
  parent_id: string | null;
  name: string;
  code: string | null;
  position: number;
}

export interface Book {
  id: string;
  folder_id: string | null;
  title: string;
  author: string | null;
  format: "epub" | "txt" | "md" | "fisico";
  file_path: string | null;
  total_pages: number | null;
  current_page: number | null;
  words_per_page: number;
  cover_path?: string | null;
  position?: number | null;
  status: BookStatus;
  queue_position: number | null;
  word_count: number | null;
  progress: number;
  last_location: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Annotation {
  id: string;
  book_id: string;
  location: string;
  quote: string;
  note: string;
  color: string;
  created_at: string;
}

export type NoteStatus = "a_tratar" | "em_tratamento" | "concluida";

export interface Note {
  id: string;
  kind: "nota" | "estudo" | "literaria" | "atomica";
  title: string;
  folder: string;
  content: string;
  professor: string;
  course: string;
  created_at: string;
  updated_at: string;
  book_id?: string | null;
  annotation_id?: string | null;
  status?: NoteStatus | null;
  quote?: string;
  location?: string;
  zid?: string | null;
  source_id?: string | null;
  concluded_at?: string | null;
  completed_at?: string | null;
}


export interface Sentence {
  id: string;
  lesson_id: string;
  idx: number;
  text: string;
  translation: string;
  start_s: number | null;
  end_s: number | null;
  read_count: number;
  audio_path?: string | null;
}

export const STATUS_LABEL: Record<BookStatus, string> = {
  aguardando: "Aguardando",
  lendo: "Lendo",
  pausado: "Pausado",
  lido: "Lido",
};

/**
 * Quanto do livro conta como lido nos indicadores. Livro "aguardando" conta 0 mesmo que tenha sido
 * aberto para dar uma olhada (o leitor guarda a posição, mas isso não é leitura); "lido" conta inteiro.
 */
export function progressoDoLivro(b: Pick<Book, "status" | "progress">): number {
  if (b.status === "lido") return 1;
  if (b.status === "aguardando") return 0;
  return Math.min(1, Math.max(0, b.progress || 0));
}
