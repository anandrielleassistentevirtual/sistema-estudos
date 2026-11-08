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

export interface Note {
  id: string;
  kind: "nota" | "estudo";
  title: string;
  folder: string;
  content: string;
  professor: string;
  course: string;
  created_at: string;
  updated_at: string;
}

export interface Lesson {
  id: string;
  language: string;
  collection: string;
  title: string;
  level: string;
  position: number;
  audio_path: string | null;
  read_goal: number;
  listen_count: number;
  created_at: string;
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
