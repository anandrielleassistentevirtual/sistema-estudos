/**
 * Notas do próprio livro reconhecidas sozinhas, em qualquer livro (Markdown ou TXT), sem preparo à mão.
 *
 * As transcrições trazem as notas de jeitos muito diferentes:
 *   chamada colada na palavra ……… “a forma do bem perfeito1. A Sapiência…”      nota: “1 Trata-se…” / “1\. Ibid., p. 20”
 *   entre parênteses ……………………… “debaixo desse rótulo (1).”                    nota: “- **Página 20:** ( 1) VII Physic.”
 *   asterisco ……………………………………… “difíceis de dominar.\*”                        nota: “\* Na Parte 2 dou mais detalhes…”
 *   sobrescrito ………………………………… “a poesia² é…”, “a poesia<sup>2</sup> é…”      nota: “² …”
 * e o texto das notas fica no pé da página (logo depois do parágrafo), no fim do capítulo ou no fim do livro.
 *
 * Aqui se acha cada chamada candidata e cada nota candidata, e uma chamada só vira chamada de verdade quando tem
 * a sua nota (mesmo número, mesmo tipo, na ordem do livro) — assim números soltos (datas, páginas, fórmulas) ficam
 * como estão. O texto que aparece na tela não muda: a chamada continua mostrando o mesmo “1” ou “*”, só que agora
 * com o balão. Por isso a paginação, as posições salvas e os destaques continuam iguais.
 *
 * A ligação é feita por parágrafo (os mesmos parágrafos da paginação): cada parágrafo guarda, para cada chamada
 * candidata, o id da nota (ou nada). Na hora de desenhar a página, as chamadas ligadas viram [1](#nota-id).
 */

type Tipo = "num" | "par" | "ast";
type Chamada = { ini: number; fim: number; rotulo: string; tipo: Tipo };
/** forma do rótulo da nota: "lista" (1. sem barra — o mesmo de uma lista numerada) e "par" ((1)) são ambíguas */
type Forma = "firme" | "lista" | "par";
type Def = { pos: number; rotulo: string; tipo: Tipo; texto: string; emSecao: boolean; forma: Forma };

export type Ligacoes = {
  /** parágrafo (como sai da paginação) → id da nota de cada chamada candidata dele, na ordem (null = não é chamada) */
  porParagrafo: Map<string, (string | null)[]>;
  notas: Map<string, string>;
};

const SOBRESCRITOS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const deSobrescrito = (s: string) => [...s].map((c) => String(SOBRESCRITOS.indexOf(c))).join("");
const numero = (s: string) => String(Number(s));
/** abreviaturas de citação: “p.147”, “vol.15”, “art.3” não são chamadas */
const ABREV = /(?:^|[^\p{L}])(?:p|pp|pág|págs|v|vol|vols|n|nº|no|cap|caps|art|arts|q|lib|fl|fls|t|ed|c|cf|a|s|ss|fig|cit|op|l|liv|tom|sec|séc|cód|lei|nr|tab|ex|par|inc|al|loc|pt|vv|cc|n\.º)$/iu;
/** cabeçalho que abre uma seção de notas */
const SECAO_DE_NOTAS = /^#{1,6}\s+[*_]*(?:notas?|notes?|refer[êe]ncias|endnotes|footnotes)\b/iu;

/** Os parágrafos exatamente como a paginação os separa. */
export function paragrafos(texto: string): string[] {
  return texto.replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

/**
 * Trechos que não podem ter chamadas: títulos, links e imagens do Markdown, endereços, etiquetas HTML e o rótulo
 * no começo das linhas de nota. Viram espaços (mesmo comprimento) numa cópia usada só para procurar.
 */
function mascarar(par: string): string {
  if (/^#{1,6}\s/.test(par)) return " ".repeat(par.length);
  const tapa = (s: string) => " ".repeat(s.length);
  return par
    .replace(/!?\[[^\]\n]*\]\([^)\n]*\)/g, tapa)
    .replace(/<(?!sup>|\/sup>)[^>\n]*>/g, tapa)
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/g, tapa)
    .replace(/`[^`\n]*`/g, tapa)
    .replace(/^[ \t]*(?:[-+][ \t]+)?(?:\*\*[^*\n]{0,40}\*\*[ \t]*)?(?:\(\s?\d{1,3}\)|\\?\[\d{1,3}\\?\]|\d{1,3}(?:\\?\.|\))?|(?:\\\*){1,4}|[⁰-⁹¹²³]+|<sup>[^<]{1,4}<\/sup>)(?=[ \t])/gm, tapa);
}

/** As chamadas candidatas de um parágrafo, na ordem. A mesma função serve para ligar e para desenhar. */
export function chamadasCandidatas(par: string): Chamada[] {
  const m = mascarar(par);
  const out: Chamada[] = [];
  const RE = /<sup>\s*(\d{1,3}|\*{1,4})\s*<\/sup>|([⁰¹²³⁴⁵⁶⁷⁸⁹]{1,3})|((?:\\\*){1,4})|\(\s?(\d{1,2})\)|(\d{1,3})/gu;
  for (const x of m.matchAll(RE)) {
    const ini = x.index!, fim = ini + x[0].length;
    const antes = m.slice(Math.max(0, ini - 40), ini);
    const depois = m.slice(fim, fim + 2);
    const ultimo = antes.slice(-1);
    if (x[1] !== undefined) {
      out.push({ ini, fim, rotulo: /\*/.test(x[1]) ? x[1] : numero(x[1]), tipo: /\*/.test(x[1]) ? "ast" : "num" });
    } else if (x[2] !== undefined) {
      // “x²”, “m²”, “r¹” das fórmulas: só depois de palavra de duas letras ou de pontuação
      if (!/(\p{L}{2}|\p{L}{2}[.,;:!?»”"’)\]])$/u.test(antes)) continue;
      out.push({ ini, fim, rotulo: numero(deSobrescrito(x[2])), tipo: "num" });
    } else if (x[3] !== undefined) {
      // “\*” colado ao fim de palavra/pontuação (não o “*” de ênfase)
      if (!/[\p{L}\p{N}.,;:!?»”"’)\]*_]$/u.test(antes)) continue;
      out.push({ ini, fim, rotulo: "*".repeat(x[3].length / 2), tipo: "ast" });
    } else if (x[4] !== undefined) {
      // “rótulo (1).”, “or(1);” — depois de palavra (com ou sem espaço) ou pontuação
      if (!/(\p{L}|[.,;:»”"’])\s?$/u.test(antes)) continue;
      out.push({ ini, fim, rotulo: numero(x[4]), tipo: "par" });
    } else if (x[5] !== undefined) {
      // número colado: “perfeito1.”, “inaceitável”2.”, “Stalags.03”, “soneca22 apoia”
      if (!/[\s.,;:!?)\]»”"’—–\\*_-]|^$/u.test(depois.slice(0, 1))) continue;
      if (/^[.,]\d/.test(depois)) continue; // 1.15, 2,5
      if (/[\p{L}\p{N}]*\d[\p{L}\p{N}]*\p{L}$|\p{Ll}\p{Lu}\p{L}*$/u.test(antes)) continue; // “ent1"e”, “prsSOCl5”: lixo de leitura
      if (/^[.,;:!?»”"’)]/.test(depois) && /[\p{L}\p{N}]/u.test(depois.slice(1, 2))) continue;
      const palavra = /(\p{L}{2,})$/u.exec(antes);
      const pont = /(\p{L}{2,}|\p{L}[*_]{1,2})([.,;:!?»”"’)\]]{1,3}|[*_]{1,2})$/u.exec(antes);
      if (palavra) {
        if (ABREV.test(antes)) continue;
      } else if (pont) {
        if (ABREV.test(antes.slice(0, antes.length - pont[2].length))) continue;
      } else if (!/\S[)\]]$/.test(antes)) continue; // “(11 \[234\])1.”: logo depois de parênteses/colchetes
      out.push({ ini, fim, rotulo: numero(x[5]), tipo: "num" });
    }
  }
  return out;
}

const LINHA_DEF = /^[ \t]*(?:[-+][ \t]+)?(?:\*\*[^*\n]{0,40}\*\*[ \t]*)?(?:\(\s?(\d{1,3})\)|\\?\[(\d{1,3})\\?\]|(\d{1,3})(?:\\?\.|\))?|((?:\\\*){1,4})|([⁰¹²³⁴⁵⁶⁷⁸⁹]{1,3})|<sup>\s*(\d{1,3}|\*{1,4})\s*<\/sup>)[ \t]+(\S.*)$/u;
/** outra nota na mesma linha: “6\. Ibid., p. 238\.     7\. Ibid., p. 241\.” */
const OUTRA_NA_LINHA = /[ \t]{3,}(?=\d{1,3}\\?\.[ \t]+\S)/;

function defsDaLinha(linha: string): { rotulo: string; tipo: Tipo; texto: string; forma: Forma }[] {
  const out: { rotulo: string; tipo: Tipo; texto: string; forma: Forma }[] = [];
  for (const pedaco of linha.split(OUTRA_NA_LINHA)) {
    const x = LINHA_DEF.exec(pedaco);
    if (!x) continue;
    let texto = x[7].trim();
    if (texto.replace(/[^\p{L}\p{N}]/gu, "").length < 2 || pareceLixo(texto)) continue;
    // “1 O. Não discorde…”: é o item 10 de uma lista lido errado (o zero virou “O”)
    if (x[3] && /^\d$/.test(x[3]) && /^O\.\s/.test(texto)) { out.push({ rotulo: x[3] + "0", tipo: "num", texto: texto.slice(3), forma: "lista" }); continue; }
    if (x[1]) out.push({ rotulo: numero(x[1]), tipo: "par", texto, forma: "par" });
    else if (x[2]) out.push({ rotulo: numero(x[2]), tipo: "num", texto, forma: "firme" });
    else if (x[3]) out.push({ rotulo: numero(x[3]), tipo: "num", texto, forma: /^[ \t]*(?:[-+][ \t]+)?\d{1,3}[.)][ \t]/.test(pedaco) ? "lista" : "firme" });
    else if (x[4]) out.push({ rotulo: "*".repeat(x[4].length / 2), tipo: "ast", texto, forma: "firme" });
    else if (x[5]) out.push({ rotulo: numero(deSobrescrito(x[5])), tipo: "num", texto, forma: "firme" });
    else if (x[6]) out.push({ rotulo: /\*/.test(x[6]) ? x[6] : numero(x[6]), tipo: /\*/.test(x[6]) ? "ast" : "num", texto, forma: "firme" });
  }
  return out;
}

/** texto estragado pela leitura automática do PDF (“A bist6ri11 .ws pn~s lfid”): não serve de nota */
function pareceLixo(t: string): boolean {
  const ps = t.replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1").split(/\s+/).filter((w) => w.length >= 2).slice(0, 24);
  if (!ps.length) return true;
  const ruins = ps.filter((w) => /[~|{}<>^\\]|\p{L}\d+\p{L}|\d\p{L}{2,}\d|\d\p{Lu}|\p{Ll}\p{Lu}\p{Ll}|\p{L}[^\p{L}\s'’\-]+\p{L}/u.test(w) && !/^\d+(?:[ºª°]|st|nd|rd|th|s|a|o)?[.,;:)]?$/u.test(w)).length;
  return ruins / ps.length > 0.08;
}

/** jeito de nota (referência, tradução, data): o que separa a nota “1. Ibid., p. 20” do item “1. Classifique o livro” */
const JEITO_DE_NOTA = /\b(?:p|pp|pág|cf|ibid|ibidem|id|op|cit|vol|ed|trad|org|cap|apud|ver|vide)\.|\bN\.\s?[TAE]\.|\b1[5-9]\d\d\b|\b20\d\d\b|https?:\/\/|\b(?:tradução|tradutor|editora|edição|original|citado|referência)\b/iu;

const limpar = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1").replace(/\*\*|__/g, "")
  .replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|[.,;:)]|$)/g, "$1$2").replace(/\s+/g, " ").trim();

/** Distância máxima (em caracteres) entre a chamada e a nota de pé de página — umas três páginas impressas. */
const PE_DE_PAGINA = 9000;

export function ligarNotas(texto: string): Ligacoes {
  const porParagrafo = new Map<string, (string | null)[]>();
  const notas = new Map<string, string>();
  // livro já marcado com a sintaxe do Markdown ([^1]): essas notas já funcionam, nada a adivinhar
  if (/^\[\^[^\]\s]+\]:/m.test(texto)) return { porParagrafo, notas };

  const pars = paragrafos(texto);
  const chamadas: (Chamada & { pos: number; par: number; k: number; id: string | null })[] = [];
  const defs: Def[] = [];
  let pos = 0;
  let emSecao = false;
  pars.forEach((p, i) => {
    if (/^#{1,6}\s/.test(p)) emSecao = SECAO_DE_NOTAS.test(p.split("\n")[0]);
    chamadasCandidatas(p).forEach((c, k) => chamadas.push({ ...c, pos: pos + c.ini, par: i, k, id: null }));
    let off = 0;
    for (const linha of p.split("\n")) {
      for (const d of defsDaLinha(linha)) defs.push({ ...d, pos: pos + off, emSecao });
      off += linha.length + 1;
    }
    pos += p.length + 2;
  });
  if (!defs.length || !chamadas.length) return { porParagrafo, notas };

  // por tipo e rótulo: as chamadas candidatas, na ordem do livro
  const fila = new Map<string, typeof chamadas>();
  for (const c of chamadas) {
    const ch = `${c.tipo}|${c.rotulo}`;
    if (!fila.has(ch)) fila.set(ch, []);
    fila.get(ch)!.push(c);
  }
  // nota em forma ambígua fora de uma seção de notas: "(1)" nunca; "1." (o mesmo de uma lista numerada) só quando
  // é nota de verdade — texto de nota (não um item curto) e toda a série 1., 2., 3. seguida tem as suas chamadas logo antes
  const perto = (d: Def, max: number) => (fila.get(`${d.tipo}|${d.rotulo}`) ?? []).some((c) => c.pos < d.pos && d.pos - c.pos <= max);
  const recusada = new Set<Def>();
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    if (d.emSecao || d.forma === "firme") continue;
    if (d.forma === "par") { recusada.add(d); continue; }
    if (recusada.has(d)) continue;
    const serie = [d];
    for (let j = i + 1; j < defs.length; j++) {
      const e = defs[j], ant = serie[serie.length - 1];
      if (e.forma !== "lista" || e.emSecao || e.pos - ant.pos > 1500) break;
      if (Number(e.rotulo) !== Number(ant.rotulo) + 1) break;
      serie.push(e);
    }
    const boa = serie.every((e) => e.texto.length >= 12 && JEITO_DE_NOTA.test(e.texto) && perto(e, 3000));
    if (!boa) serie.forEach((e) => recusada.add(e));
    i += serie.length - 1;
  }

  let ultima = -1; // posição da chamada ligada à nota anterior (as notas seguem a ordem das chamadas)
  let n = 0;
  for (const d of defs) {
    if (recusada.has(d)) continue;
    const lista = fila.get(`${d.tipo}|${d.rotulo}`);
    if (!lista) continue;
    let escolhida: (typeof chamadas)[number] | undefined;
    if (d.emSecao) {
      // seção de notas (fim do capítulo/livro): a primeira chamada livre depois da última ligada
      escolhida = lista.find((c) => !c.id && c.pos > ultima && c.pos < d.pos) ?? lista.find((c) => !c.id && c.pos < d.pos);
    } else {
      // pé de página: a chamada livre mais próxima antes da nota
      for (let j = lista.length - 1; j >= 0; j--) {
        const c = lista[j];
        if (c.pos >= d.pos || c.id) continue;
        if (d.pos - c.pos <= (d.forma === "lista" ? 3000 : PE_DE_PAGINA)) escolhida = c;
        break;
      }
    }
    if (!escolhida) continue;
    escolhida.id = `a${++n}`;
    notas.set(escolhida.id, limpar(d.texto));
    ultima = escolhida.pos;
  }

  for (const c of chamadas) {
    if (!c.id) continue;
    const p = pars[c.par];
    if (!porParagrafo.has(p)) porParagrafo.set(p, chamadasCandidatas(p).map(() => null));
    porParagrafo.get(p)![c.k] = c.id;
  }
  return { porParagrafo, notas };
}

/**
 * O texto de uma página com as chamadas ligadas como links #nota-id (o leitor desenha como chamada com balão).
 * O que aparece continua igual: “1”, “*”, “(1)”, “²”.
 */
export function aplicarLigacoes(pagina: string, lig: Ligacoes): string {
  if (!lig.porParagrafo.size) return pagina;
  return pagina.split("\n\n").map((p) => {
    const ids = lig.porParagrafo.get(p.trim());
    if (!ids) return p;
    const cs = chamadasCandidatas(p.trim());
    const base = p.length - p.trimStart().length;
    let out = p;
    for (let k = cs.length - 1; k >= 0; k--) {
      const id = ids[k];
      if (!id) continue;
      const c = cs[k];
      const visto = p.trim().slice(c.ini, c.fim).replace(/<\/?sup>/g, "").replace(/\\\*/g, "\\*").trim();
      out = out.slice(0, base + c.ini) + `[${visto}](#nota-${id})` + out.slice(base + c.fim);
    }
    return out;
  }).join("\n\n");
}
