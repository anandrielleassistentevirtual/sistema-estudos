"use client";
/**
 * AnkiConnect: o navegador conversa com o Anki aberto no seu computador
 * (add-on 2055492159). As revisões continuam acontecendo no Anki.
 */
const DEFAULT_URL = "http://127.0.0.1:8765";

export function ankiUrl(): string {
  try {
    return localStorage.getItem("anki-url") || DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}

export async function anki<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(ankiUrl(), {
    method: "POST",
    body: JSON.stringify({ action, version: 6, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result as T;
}

export async function ankiOnline(): Promise<boolean> {
  try {
    await anki<number>("version");
    return true;
  } catch {
    return false;
  }
}

export async function addBasicNote(deck: string, front: string, back: string, tags: string[] = []) {
  return anki<number>("addNote", {
    note: {
      deckName: deck,
      modelName: "Basic",
      fields: { Front: front, Back: back },
      options: { allowDuplicate: false, duplicateScope: "deck" },
      tags: ["sistema-estudos", ...tags],
    },
  });
}
