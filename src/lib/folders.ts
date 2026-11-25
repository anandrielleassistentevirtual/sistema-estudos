import type { Book, Folder } from "./types";

/** Ordem da CDD: pelo número (109 < 111.85 < 700.92 < 701); pastas sem código no fim. */
export function cddCompare(a: Pick<Folder, "code" | "name" | "position">, b: Pick<Folder, "code" | "name" | "position">) {
  const na = a.code ? parseFloat(a.code) : Infinity;
  const nb = b.code ? parseFloat(b.code) : Infinity;
  if (na !== nb) return na - nb;
  if ((a.code ?? "") !== (b.code ?? "")) return (a.code ?? "").localeCompare(b.code ?? "");
  return a.position - b.position || a.name.localeCompare(b.name, "pt-BR");
}

export function folderLabel(f: Pick<Folder, "code" | "name">) {
  return f.code ? `${f.code} – ${f.name}` : f.name;
}

/** Árvore achatada na ordem CDD, com a profundidade de cada pasta. */
export function flatTree(folders: Folder[]): { folder: Folder; depth: number }[] {
  const kids = new Map<string | null, Folder[]>();
  for (const f of folders) kids.set(f.parent_id, [...(kids.get(f.parent_id) ?? []), f]);
  for (const list of kids.values()) list.sort(cddCompare);
  const out: { folder: Folder; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of kids.get(parent) ?? []) {
      out.push({ folder: f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** "Autor — Título" (autor antes do título). */
export function bookName(b: Pick<Book, "author" | "title">) {
  return b.author ? `${b.author} — ${b.title}` : b.title;
}
