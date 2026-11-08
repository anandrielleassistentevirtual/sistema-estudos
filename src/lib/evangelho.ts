/** Referências do Evangelho ("Mt 25,1-13", "Lc 9,51–10,12", "Mt 5,1-12a"). */

export const EVANGELHOS = [
  { abbr: "Mt", nome: "Mateus" },
  { abbr: "Mc", nome: "Marcos" },
  { abbr: "Lc", nome: "Lucas" },
  { abbr: "Jo", nome: "João" },
] as const;

export interface Ref {
  livro: string; // "Mt", "Mc", "Lc", "Jo" (ou o que vier, se for outro livro)
  cap: number;
  v1: number;
  /** capítulo e versículo finais (a passagem pode atravessar capítulos) */
  cap2: number;
  v2: number;
}

export function parseRef(ref: string): Ref | null {
  const m = ref.trim().match(/^(\d?\s?[A-Za-zÀ-ú]+)\s*(\d+)\s*,\s*(\d+)[a-z]?(?:\s*[-–]\s*(?:(\d+)\s*,\s*)?(\d+)[a-z]?)?/);
  if (!m) return null;
  const cap = Number(m[2]);
  const v1 = Number(m[3]);
  const cap2 = m[4] ? Number(m[4]) : cap;
  const v2 = m[5] ? Number(m[5]) : v1;
  return { livro: m[1].replace(/\s/g, ""), cap, v1, cap2, v2 };
}

/** As duas passagens têm versículos em comum? */
export function sobrepoe(a: Ref, b: Ref): boolean {
  if (a.livro !== b.livro) return false;
  const ini = (r: Ref) => r.cap * 1000 + r.v1;
  const fim = (r: Ref) => r.cap2 * 1000 + r.v2;
  return ini(a) <= fim(b) && ini(b) <= fim(a);
}

export function ordemLivro(livro: string): number {
  const i = EVANGELHOS.findIndex((e) => e.abbr === livro);
  return i < 0 ? 99 : i;
}

export function nomeLivro(livro: string): string {
  return EVANGELHOS.find((e) => e.abbr === livro)?.nome ?? livro;
}
