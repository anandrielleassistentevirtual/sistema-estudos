/**
 * Glossário dentro do próprio texto (aulas e livros em Markdown).
 *
 * O arquivo traz, no fim, uma seção "## Glossário…" com um verbete por "### Termo". No texto, os termos aparecem
 * como links do Obsidian: [[#Termo|o que aparece]] ou [[#Termo]].
 *
 * Na leitura, a seção do glossário sai das páginas (não conta como página nem como palavras lidas) e cada termo
 * marcado vira um termo com balão: passar o mouse mostra o verbete; tocar/clicar deixa o balão aberto.
 * Etiquetas dos verbetes: [F] = Filosófico, [L] = Literário (e [F/L], [L/F]).
 */

export interface Verbete {
  titulo: string;
  /** "Filosófico", "Literário" */
  tipos: string[];
  /** o corpo do verbete, em Markdown (sem a linha das etiquetas) */
  corpo: string;
}

const INICIO = /^##[ \t]+Gloss[áa]rio\b.*$/m;
const NOMES: Record<string, string> = { F: "Filosófico", L: "Literário" };

export const chaveTermo = (s: string) => s.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");

/** O texto sem a seção do glossário e os verbetes dela. Sem glossário, devolve o texto como está. */
export function separarGlossario(md: string): { texto: string; verbetes: Map<string, Verbete> } {
  const verbetes = new Map<string, Verbete>();
  const m = INICIO.exec(md);
  if (!m) return { texto: md, verbetes };
  // o texto termina antes do glossário (e do "---" que o separa)
  const texto = md.slice(0, m.index).replace(/(?:\s*\n(?:-{3,}|\*{3,}|_{3,})[ \t]*)*\s*$/, "\n");
  const resto = md.slice(m.index + m[0].length).replace(/\r/g, "");
  const partes = resto.split(/^###[ \t]+/m).slice(1);
  for (const p of partes) {
    const quebra = p.indexOf("\n");
    const titulo = (quebra < 0 ? p : p.slice(0, quebra)).trim().replace(/[*_`]/g, "");
    let corpo = quebra < 0 ? "" : p.slice(quebra + 1);
    // um "## outra seção" depois do glossário encerra o último verbete
    corpo = corpo.split(/^##[ \t]/m)[0];
    const tipos: string[] = [];
    // primeira linha: "**[F/L]** · *Nesta aula:* “…”" — vira as etiquetas (o trecho "nesta aula" sobra: o termo já está à vista)
    corpo = corpo.replace(/^\s*\*\*\[([FL/ ]+)\]\*\*[^\n]*\n?/, (_, t: string) => {
      for (const x of t.split("/")) { const n = NOMES[x.trim()]; if (n && !tipos.includes(n)) tipos.push(n); }
      return "";
    }).trim();
    if (titulo) verbetes.set(chaveTermo(titulo), { titulo, tipos, corpo });
  }
  return { texto, verbetes };
}

const WIKI = /\[\[([^\]|#\n]*)(?:#([^\]|\n]+))?(?:\|([^\]\n]+))?\]\]/g;

/**
 * [[#Termo|texto]] → [texto](<#termo-Termo>) quando o termo tem verbete; senão, só o texto.
 * Links para outras notas ([[Outra nota#Termo|texto]]) ficam como texto (o termo vale se estiver neste glossário).
 */
export function prepararTermos(md: string, verbetes: Map<string, Verbete>): string {
  if (!md.includes("[[")) return md;
  return md.replace(WIKI, (_, nota: string, ancora: string | undefined, rotulo: string | undefined) => {
    const visto = (rotulo ?? ancora ?? nota).trim();
    const v = ancora ? verbetes.get(chaveTermo(ancora)) : undefined;
    if (!v) return visto;
    return `[${visto.replace(/([[\]])/g, "\\$1")}](<#termo-${v.titulo.replace(/[<>]/g, "")}>)`;
  });
}

/** O id do termo no link desenhado (href "#termo-…", já codificado pelo Markdown). */
export function termoDoHref(href: string): string | null {
  if (!href.startsWith("#termo-")) return null;
  try { return decodeURIComponent(href.slice(7)); } catch { return href.slice(7); }
}
