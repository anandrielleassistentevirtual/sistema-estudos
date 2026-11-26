import { semAcento } from "@/lib/text";
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

// ── todas as vezes que o termo aparece ─────────────────────────────────────────────────────────────────────

const ARTIGOS = /^(?:o|a|os|as|um|uma|do|da|dos|das|de|pelo|pela|pelos|pelas|no|na|nos|nas|ao|à|e)\s+/i;

/** plural e feminino/masculino de uma palavra (tragédia → tragédias; ação → ações; cômico → cômica, cômicos) */
function variantes(p: string): string[] {
  const out = new Set([p]);
  const base = [p];
  if (/o$/i.test(p)) base.push(p.slice(0, -1) + "a");
  if (/a$/i.test(p)) base.push(p.slice(0, -1) + "o");
  for (const b of base) {
    out.add(b);
    if (/ão$/i.test(b)) out.add(b.slice(0, -2) + "ões");
    else if (/[aeiouáéíóúâêô]$/i.test(b)) out.add(b + "s");
    else if (/[rzs]$/i.test(b)) out.add(b + "es");
    else if (/l$/i.test(b)) out.add(b.slice(0, -1) + "is");
    else if (/m$/i.test(b)) out.add(b.slice(0, -1) + "ns");
  }
  return [...out];
}

export interface FormasDosTermos { re: RegExp | null; termoDe: Map<string, string> }

/**
 * As formas de cada termo, para marcar o termo todas as vezes que ele aparece no texto:
 * - as formas de uma palavra que o próprio texto liga ao verbete ([[#Epopeia|épico]] → "épico");
 * - o título do verbete e as partes dele ("Imitação (mímesis)" → imitação, mímesis; "Vício e virtude" → vício, virtude),
 *   com plural e feminino/masculino.
 * Ficam de fora palavras de menos de 4 letras ("fim") e a primeira palavra solta de um termo composto
 * ("unidade", de "unidade orgânica").
 */
export function formasDosTermos(texto: string, verbetes: Map<string, Verbete>): FormasDosTermos {
  const termoDe = new Map<string, string>();
  const por = (forma: string, titulo: string) => {
    const f = forma.normalize("NFC").trim().replace(/\s+/g, " ");
    if (f.length < 4 || /^\d/.test(f)) return;
    const k = f.toLowerCase();
    if (!termoDe.has(k)) termoDe.set(k, titulo);
  };
  const primeirasDeCompostos = new Set<string>();
  const partesDe = (titulo: string) => {
    const inteiro = titulo.replace(/\s*\([^)]*\)\s*/g, " ").trim();
    const dentro = [...titulo.matchAll(/\(([^)]*)\)/g)].flatMap((m) => m[1].split(/[,/]/));
    const partes = [inteiro, ...inteiro.split(/\s*,\s*|\s*\/\s*|\s+e\s+/), ...dentro]
      .map((x) => x.replace(ARTIGOS, "").trim()).filter(Boolean);
    for (const p of partes) if (p.includes(" ")) primeirasDeCompostos.add(semAcento(p.split(" ")[0]));
    return partes;
  };
  const validos = [...verbetes.values()].filter((v) => !/^termos sem verbete/i.test(v.titulo));
  for (const v of validos) partesDe(v.titulo);
  // 1) o que o texto já liga ao verbete (uma palavra só)
  for (const m of texto.matchAll(/\[\[#([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g)) {
    const v = verbetes.get(chaveTermo(m[1]));
    if (!v || /^termos sem verbete/i.test(v.titulo)) continue;
    const visto = (m[2] ?? m[1]).replace(ARTIGOS, "").trim();
    if (visto.includes(" ")) continue;
    if (primeirasDeCompostos.has(semAcento(visto))) continue;
    for (const f of variantes(visto)) por(f, v.titulo);
  }
  // 2) o título e as partes dele
  for (const v of validos) {
    for (const p of partesDe(v.titulo)) {
      if (!p.includes(" ") && primeirasDeCompostos.has(semAcento(p)) && p.toLowerCase() !== v.titulo.toLowerCase()) continue;
      for (const f of p.includes(" ") ? [p] : variantes(p)) por(f, v.titulo);
    }
  }
  if (!termoDe.size) return { re: null, termoDe };
  const alts = [...termoDe.keys()].sort((a, b) => b.length - a.length).map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"));
  return { re: new RegExp(`(?<![\\p{L}\\p{N}])(${alts.join("|")})(?![\\p{L}\\p{N}])`, "giu"), termoDe };
}

/** trechos onde não se marca termo: links já desenhados, código, etiquetas HTML, endereços, títulos, chamadas de nota
 *  e os rótulos das citações ("📖 **Poética, cap. 1**", "📝 **Nota 2 do Bini.**") */
const PROTEGIDO = /[📖📝]\s*\*\*[^*\n]*\*\*|!?\[[^\]\n]*\]\((?:<[^>\n]*>|[^)\n]*)\)|`[^`\n]*`|<[^>\n]+>|https?:\/\/\S+|^#{1,6}[ \t].*$|\[\^[^\]\n]*\]/gm;

/** Marca o termo todas as vezes que ele aparece (depois de prepararTermos, que já desenhou os links do arquivo). */
export function marcarTermos(md: string, formas: FormasDosTermos): string {
  if (!formas.re) return md;
  const re = formas.re;
  const trocar = (s: string) => s.replace(re, (achado: string) => {
    const titulo = formas.termoDe.get(achado.normalize("NFC").toLowerCase().replace(/\s+/g, " "));
    return titulo ? `[${achado}](<#termo-${titulo.replace(/[<>]/g, "")}>)` : achado;
  });
  let out = "", ult = 0;
  for (const m of md.matchAll(PROTEGIDO)) {
    out += trocar(md.slice(ult, m.index)) + m[0];
    ult = m.index! + m[0].length;
  }
  return out + trocar(md.slice(ult));
}
