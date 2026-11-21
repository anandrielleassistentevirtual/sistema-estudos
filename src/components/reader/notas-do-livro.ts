/**
 * Notas do próprio livro (rodapé / fim do livro) nos livros em Markdown e TXT.
 * Sintaxe aceita (a das notas de rodapé do Markdown):
 *   no texto:      …a poesia[^2] é…
 *   a nota:        [^2]: Ποίησις (poiesis), genericamente criação… (p. 39)
 * Também entende o formato antigo das transcrições: <a id="nota-2"></a>**2.** texto <small>(p. 39)</small>
 * e chamadas como links: [2](#nota-2).
 */

const DEF = /^\[\^([^\]\s]+)\]:[ \t]*(.*(?:\n(?:[ \t]{2,}|\t).*)*)/gm;
const ANTIGA = /<a id="nota-([^"]+)"><\/a>\s*\*\*[^*]*\*\*\s*(.*)/g;

const limpar = (s: string) =>
  s.replace(/<small>(.*?)<\/small>/g, "$1").replace(/<[^>]+>/g, "").replace(/\*\*|__/g, "").replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|[.,;:)]|$)/g, "$1$2")
    .replace(/\s*\n\s*/g, " ").trim();

/** Todas as notas do livro: id → texto. */
export function extrairNotas(texto: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of texto.matchAll(DEF)) m.set(x[1], limpar(x[2]));
  for (const x of texto.matchAll(ANTIGA)) if (!m.has(x[1])) m.set(x[1], limpar(x[2]));
  return m;
}

/** Markdown de uma página: as chamadas viram links #nota-N (desenhados como chamada) e as notas ficam visíveis como "N. texto". */
export function prepararMd(md: string): string {
  return md
    .replace(/^\[\^([^\]\s]+)\]:[ \t]*/gm, "**$1.** ")
    .replace(/\[\^([^\]\s]+)\](?!:)/g, "[$1](#nota-$1)")
    .replace(/<a id="nota-[^"]+"><\/a>\s*/g, "")
    .replace(/<small>(.*?)<\/small>/g, "*$1*");
}

/** TXT (já escapado em HTML): as chamadas viram <sup> com o id da nota. */
export function chamadasTxt(html: string): string {
  return html
    .replace(/^\[\^([^\]\s]+)\]:[ \t]*/gm, "<b>$1.</b> ")
    .replace(/\[\^([^\]\s]+)\](?!:)/g, '<sup class="nota-ref" data-nota="$1">$1</sup>');
}
