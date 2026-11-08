"use client";
import { supabase, userId } from "./supabase/client";
import { parseCues, splitSentences } from "./text";
import { dayKey } from "./dates";
import type { Lesson, Sentence } from "./types";

export const LANGUAGES = ["Inglês", "Italiano", "Francês", "Espanhol", "Alemão", "Latim", "Grego", "Russo", "Japonês", "Outro"];

export interface NewLesson {
  language: string;
  collection: string;
  title: string;
  level: string;
  text: string;
  translation: string;
  audio?: File | null;
  cues?: File | null;
  read_goal?: number;
}

export async function createLesson(input: NewLesson): Promise<Lesson> {
  const sb = supabase();
  const uid = await userId();
  const id = crypto.randomUUID();
  let audio_path: string | null = null;
  if (input.audio) {
    const ext = input.audio.name.split(".").pop()?.toLowerCase() || "mp3";
    audio_path = `${uid}/${id}.${ext}`;
    const up = await sb.storage.from("audios").upload(audio_path, input.audio, { contentType: input.audio.type || "audio/mpeg" });
    if (up.error) throw new Error(up.error.message);
  }
  const { count } = await sb.from("lessons").select("id", { count: "exact", head: true })
    .eq("language", input.language).eq("collection", input.collection);
  const { data, error } = await sb
    .from("lessons")
    .insert({ id, language: input.language, collection: input.collection, title: input.title, level: input.level,
      audio_path, position: (count ?? 0) + 1, read_goal: input.read_goal ?? 10 })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const sentences = splitSentences(input.text);
  const translations = input.translation.trim() ? splitSentences(input.translation) : [];
  const cues = input.cues ? parseCues(await input.cues.text()) : [];
  const rows = sentences.map((text, idx) => ({
    lesson_id: id,
    idx,
    text,
    translation: translations[idx] ?? "",
    start_s: cues[idx]?.start ?? null,
    end_s: cues[idx]?.end ?? null,
  }));
  if (rows.length) {
    const r = await sb.from("lesson_sentences").insert(rows);
    if (r.error) throw new Error(r.error.message);
  }
  return data as Lesson;
}

export async function audioUrl(path: string): Promise<string | null> {
  const { data } = await supabase().storage.from("audios").createSignedUrl(path, 60 * 60 * 6);
  return data?.signedUrl ?? null;
}

export async function registerRead(lessonId: string, sentenceId: string | null) {
  await supabase().rpc("registrar_leitura", { p_lesson: lessonId, p_sentence: sentenceId, p_day: dayKey() });
}

export async function undoRead(lessonId: string, sentenceId: string | null) {
  await supabase().rpc("desfazer_leitura", { p_lesson: lessonId, p_sentence: sentenceId, p_day: dayKey() });
}

export async function registerListen(lessonId: string) {
  await supabase().rpc("registrar_escuta", { p_lesson: lessonId, p_day: dayKey() });
}

/** Leituras completas do texto = a menor contagem entre as frases. */
export function fullReads(s: Pick<Sentence, "read_count">[]): number {
  return s.length ? Math.min(...s.map((x) => x.read_count)) : 0;
}
