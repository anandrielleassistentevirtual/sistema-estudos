/** Conta palavras (letras/números, com apóstrofo e hífen internos). */
export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

/** Divide um texto em frases. Se já vier uma frase por linha, respeita as linhas. */
export function splitSentences(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  return (text.match(/[^.!?…]+[.!?…]+["'”»)]*|[^.!?…]+$/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Lê um .vtt/.srt e devolve [início, fim] em segundos para cada bloco. */
export function parseCues(src: string): { start: number; end: number; text: string }[] {
  const toSec = (t: string) => {
    const p = t.replace(",", ".").split(":").map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  };
  const out: { start: number; end: number; text: string }[] = [];
  const blocks = src.replace(/\r/g, "").split(/\n\n+/);
  for (const b of blocks) {
    const lines = b.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, z] = lines[i].split("-->").map((s) => s.trim().split(" ")[0]);
    out.push({ start: toSec(a), end: toSec(z), text: lines.slice(i + 1).join(" ").trim() });
  }
  return out;
}

export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

/** Extrai [[wikilinks]] de um texto markdown. */
export function wikilinks(md: string): string[] {
  return [...md.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].trim());
}
