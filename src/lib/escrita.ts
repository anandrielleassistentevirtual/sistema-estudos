/** Escrita: tipos, contagem de palavras, destaque de diálogo, escaleta e importação de .xlsx. */

export type TipoProjeto = "conto" | "novela" | "romance" | "ensaio";

export interface Projeto {
  id: string;
  titulo: string;
  autor: string;
  tipo: TipoProjeto;
  meta_palavras: number;
  meta_diaria: number;
  created_at: string;
  updated_at: string;
}

export type Secao = "manuscrito" | "rascunhos" | "enredo" | "personagens" | "lugares" | "pesquisa";

export interface Doc {
  id: string;
  projeto_id: string;
  parent_id: string | null;
  tipo: "capitulo" | "cena" | "pasta" | "nota";
  secao: Secao;
  titulo: string;
  conteudo: string;
  posicao: number;
  status: string;
  resumo: string;
  pov: string;
  personagens: string;
  personagens_indiretos: string;
  espaco: string;
  tempo: string;
  pagina: string;
  palavras: number;
  updated_at: string;
}

export interface Sessao {
  id: string;
  projeto_id: string;
  dia: string;
  inicio: string;
  segundos: number;
  ocioso: number;
  palavras: number;
}

export const SECOES: { id: Secao; label: string }[] = [
  { id: "manuscrito", label: "Manuscrito" },
  { id: "rascunhos", label: "Rascunhos" },
  { id: "enredo", label: "Enredo" },
  { id: "personagens", label: "Personagens" },
  { id: "lugares", label: "Lugares" },
  { id: "pesquisa", label: "Pesquisa" },
];

/**
 * Como cada tipo de projeto se organiza.
 * - Romance e novela: capítulos → cenas, com escaleta.
 * - Conto: só cenas (sem capítulos), com escaleta.
 * - Ensaio: só partes (sem capítulos nem cenas), sem escaleta; tem referências bibliográficas.
 * Sem capítulos, as cenas/partes ficam num capítulo "invisível" (o primeiro), que a tela não mostra.
 */
export const TIPOS: Record<TipoProjeto, {
  label: string; descricao: string; capitulos: boolean; unidade: string; unidades: string; escaleta: boolean; referencias: boolean;
  secoes: { id: Secao; label: string }[]; apoio: { secao: Secao; titulo: string }[];
}> = {
  conto: {
    label: "Conto", descricao: "Cenas, sem capítulos", capitulos: false, unidade: "cena", unidades: "cenas", escaleta: true, referencias: false,
    secoes: [{ id: "rascunhos", label: "Rascunhos" }, { id: "enredo", label: "Enredo" }, { id: "personagens", label: "Personagens" }, { id: "lugares", label: "Lugares" }, { id: "pesquisa", label: "Pesquisa" }],
    apoio: [{ secao: "enredo", titulo: "Enredo" }, { secao: "personagens", titulo: "Protagonista" }],
  },
  novela: {
    label: "Novela", descricao: "Capítulos e cenas", capitulos: true, unidade: "cena", unidades: "cenas", escaleta: true, referencias: false,
    secoes: [{ id: "rascunhos", label: "Rascunhos" }, { id: "enredo", label: "Enredo" }, { id: "personagens", label: "Personagens" }, { id: "lugares", label: "Lugares" }, { id: "pesquisa", label: "Pesquisa" }],
    apoio: [{ secao: "enredo", titulo: "Enredo principal" }, { secao: "personagens", titulo: "Protagonista" }, { secao: "lugares", titulo: "Lugar principal" }],
  },
  romance: {
    label: "Romance", descricao: "Capítulos e cenas", capitulos: true, unidade: "cena", unidades: "cenas", escaleta: true, referencias: false,
    secoes: [{ id: "rascunhos", label: "Rascunhos" }, { id: "enredo", label: "Enredo" }, { id: "personagens", label: "Personagens" }, { id: "lugares", label: "Lugares" }, { id: "pesquisa", label: "Pesquisa" }],
    apoio: [{ secao: "enredo", titulo: "Enredo principal" }, { secao: "personagens", titulo: "Protagonista" }, { secao: "lugares", titulo: "Lugar principal" }, { secao: "pesquisa", titulo: "Pesquisa" }],
  },
  ensaio: {
    label: "Ensaio", descricao: "Texto corrido em partes, com referências", capitulos: false, unidade: "parte", unidades: "partes", escaleta: false, referencias: true,
    secoes: [{ id: "rascunhos", label: "Rascunhos" }, { id: "enredo", label: "Estrutura do argumento" }, { id: "pesquisa", label: "Fichamentos" }],
    apoio: [{ secao: "enredo", titulo: "Tese e estrutura" }, { secao: "pesquisa", titulo: "Fichamento" }],
  },
};
export const tipoDe = (t: string) => TIPOS[(t in TIPOS ? t : "romance") as TipoProjeto];

export const STATUS: { id: string; label: string; cor: string }[] = [
  { id: "rascunho", label: "Rascunho", cor: "var(--faint)" },
  { id: "escrevendo", label: "Escrevendo", cor: "#d0a24a" },
  { id: "revisao", label: "Em revisão", cor: "#7a9cc6" },
  { id: "pronto", label: "Pronto", cor: "var(--good)" },
];
export const corStatus = (s: string) => STATUS.find((x) => x.id === s)?.cor ?? "var(--faint)";

/** Colunas da escaleta (mesma ordem da planilha). */
export const ESCALETA: { campo: keyof Doc; label: string; largura: string }[] = [
  { campo: "resumo", label: "Resumo", largura: "minmax(260px, 3fr)" },
  { campo: "pov", label: "Ponto de vista", largura: "minmax(110px, 1fr)" },
  { campo: "personagens", label: "Personagens diretos", largura: "minmax(150px, 1.4fr)" },
  { campo: "personagens_indiretos", label: "Personagens indiretos", largura: "minmax(150px, 1.4fr)" },
  { campo: "espaco", label: "Espaço", largura: "minmax(110px, 1fr)" },
  { campo: "tempo", label: "Tempo", largura: "minmax(100px, 1fr)" },
  { campo: "pagina", label: "Página", largura: "minmax(64px, 0.5fr)" },
];

/** Palavras do texto: ignora marcas de formatação e linhas de comentário (que começam com %). */
export function contarPalavras(texto: string): number {
  const limpo = texto
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("%"))
    .join("\n")
    .replace(/[*_#>`~—–-]+/g, " ");
  const m = limpo.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu);
  return m ? m.length : 0;
}

export type Classe = "" | "fala" | "marca" | "comentario";
export interface Trecho { t: string; c: Classe }

/**
 * Divide um parágrafo em trechos coloridos:
 * - fala com travessão ("— Fala — disse ele. — Mais fala.") e entre aspas (“...”, "...");
 * - marcas de formatação (**, _, *) em tom apagado;
 * - linhas de comentário (% ...) inteiras apagadas.
 * Só cores: o texto continua com a mesma largura do campo de edição.
 */
export function destacar(par: string): Trecho[] {
  if (par.trimStart().startsWith("%")) return [{ t: par, c: "comentario" }];
  const out: Trecho[] = [];
  const push = (t: string, c: Classe) => {
    if (!t) return;
    // marcas de formatação dentro do trecho
    const partes = t.split(/(\*\*|__|(?<![\p{L}\p{N}])[*_]|[*_](?![\p{L}\p{N}]))/u);
    for (const p of partes) {
      if (!p) continue;
      const marca = /^(\*\*|__|\*|_)$/.test(p);
      const ult = out[out.length - 1];
      const cls: Classe = marca ? "marca" : c;
      if (ult && ult.c === cls) ult.t += p;
      else out.push({ t: p, c: cls });
    }
  };
  const corpo = par;
  const ini = corpo.match(/^\s*[—–]\s?/);
  if (ini) {
    // travessão: alterna fala / narração a cada " — "
    const resto = corpo.slice(ini[0].length);
    const pedacos = resto.split(/(\s[—–]\s?)/);
    push(ini[0], "fala");
    let fala = true;
    for (const p of pedacos) {
      if (/^\s[—–]\s?$/.test(p)) {
        push(p, "fala");
        fala = !fala;
        continue;
      }
      if (fala) push(p, "fala");
      else aspas(p);
    }
    return out;
  }
  aspas(corpo);
  return out;

  function aspas(t: string) {
    const re = /“[^”]*”?|"[^"\n]*"?|«[^»]*»?/g;
    let i = 0;
    for (const m of t.matchAll(re)) {
      push(t.slice(i, m.index), "");
      push(m[0], "fala");
      i = (m.index ?? 0) + m[0].length;
    }
    push(t.slice(i), "");
  }
}

/** Ordem do manuscrito: capítulos por posição, cenas por posição dentro de cada capítulo. */
export function manuscrito(docs: Doc[]) {
  const caps = docs.filter((d) => d.secao === "manuscrito" && d.tipo === "capitulo").sort((a, b) => a.posicao - b.posicao);
  return caps.map((cap, i) => ({
    cap,
    n: i + 1,
    cenas: docs.filter((d) => d.parent_id === cap.id).sort((a, b) => a.posicao - b.posicao),
  }));
}

/** "C1, c3": capítulo 1, cena 3 (como na escaleta). */
export const rotuloCena = (cap: number, cena: number, comCapitulo = true, unidade = "cena") =>
  comCapitulo ? `C${cap}, c${cena}` : unidade === "parte" ? `Parte ${cena}` : `c${cena}`;

/* ---------- importação da escaleta (.xlsx) ---------- */

export interface LinhaEscaleta {
  cap: number;
  cena: number;
  resumo: string;
  pov: string;
  personagens: string;
  personagens_indiretos: string;
  espaco: string;
  tempo: string;
  pagina: string;
}

function colIndex(ref: string): number {
  const letras = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function textoXml(el: Element): string {
  // <si><t>..</t></si> ou rich text <si><r><t>..</t></r>...</si>
  return [...el.getElementsByTagName("t")].map((t) => t.textContent ?? "").join("");
}

/** Lê a primeira planilha de um .xlsx (sem bibliotecas extras: o .xlsx é um zip de XMLs). */
export async function lerXlsx(file: File): Promise<string[][]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const parse = (s: string) => new DOMParser().parseFromString(s, "application/xml");
  const sst = zip.file("xl/sharedStrings.xml");
  const shared = sst ? [...parse(await sst.async("string")).getElementsByTagName("si")].map(textoXml) : [];
  const nomes = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort();
  if (!nomes.length) throw new Error("Planilha vazia");
  const sheet = parse(await zip.file(nomes[0])!.async("string"));
  const linhas: string[][] = [];
  for (const row of [...sheet.getElementsByTagName("row")]) {
    const r: string[] = [];
    for (const c of [...row.getElementsByTagName("c")]) {
      const idx = colIndex(c.getAttribute("r") ?? "A");
      const tipo = c.getAttribute("t");
      const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      r[idx] = tipo === "s" ? shared[Number(v)] ?? "" : tipo === "inlineStr" ? textoXml(c) : v;
    }
    linhas.push(Array.from(r, (x) => (x ?? "").trim()));
  }
  return linhas.filter((l) => l.some(Boolean));
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[:\s]+/g, " ").trim();

/** Converte as linhas da planilha em cenas: acha as colunas pelo nome do cabeçalho. */
export function escaletaDeLinhas(linhas: string[][]): LinhaEscaleta[] {
  const hi = linhas.findIndex((l) => l.some((c) => norm(c).startsWith("resumo")));
  if (hi < 0) throw new Error("Não achei a coluna “Resumo” na planilha.");
  const cab = linhas[hi].map(norm);
  const col = (...nomes: string[]) => cab.findIndex((c) => nomes.some((n) => c.startsWith(n)));
  const C = {
    cena: col("capitulo", "cena"),
    resumo: col("resumo"),
    pov: col("ponto de vista", "pov"),
    diretos: col("personagens diretos", "personagens"),
    indiretos: col("personagens indiretos"),
    espaco: col("espaco", "lugar"),
    tempo: col("tempo"),
    pagina: col("pagina"),
  };
  const out: LinhaEscaleta[] = [];
  let capAtual = 1;
  let cenaAtual = 0;
  for (const l of linhas.slice(hi + 1)) {
    const g = (i: number) => (i >= 0 ? l[i] ?? "" : "");
    if (!g(C.resumo) && !g(C.cena)) continue;
    const m = g(C.cena).match(/c\s*(\d+)\s*[,;.\s]\s*c\s*(\d+)/i);
    if (m) {
      capAtual = Number(m[1]);
      cenaAtual = Number(m[2]);
    } else cenaAtual++;
    out.push({
      cap: capAtual,
      cena: cenaAtual,
      resumo: g(C.resumo),
      pov: g(C.pov),
      personagens: g(C.diretos),
      personagens_indiretos: C.indiretos >= 0 ? g(C.indiretos) : "",
      espaco: g(C.espaco),
      tempo: g(C.tempo),
      pagina: g(C.pagina),
    });
  }
  return out;
}

/* ---------- exportação ---------- */

export function compilarMarkdown(p: Projeto, docs: Doc[], refs: Referencia[] = []): string {
  const tipo = tipoDe(p.tipo);
  const grupos = manuscrito(docs);
  const comCap = tipo.capitulos || grupos.length > 1;
  const partes = [`# ${p.titulo}`, p.autor ? `*${p.autor}*` : ""];
  for (const { cap, cenas } of grupos) {
    if (comCap) partes.push(`## ${cap.titulo}`);
    if (cap.conteudo.trim()) partes.push(semComentarios(cap.conteudo));
    if (tipo.unidade === "parte") {
      for (const c of cenas) {
        if (cenas.length > 1 && c.titulo.trim()) partes.push(`### ${c.titulo}`);
        partes.push(semComentarios(c.conteudo));
      }
    } else partes.push(cenas.map((c) => semComentarios(c.conteudo)).filter(Boolean).join("\n\n* * *\n\n"));
  }
  if (refs.length) partes.push("## Referências", ordenarReferencias(refs).map(abnt).join("\n\n"));
  return partes.filter(Boolean).join("\n\n") + "\n";
}

export function semComentarios(t: string) {
  return t.split("\n").filter((l) => !l.trimStart().startsWith("%")).join("\n").trim();
}

/** Parágrafos em HTML seguro (texto escapado; **negrito** e _itálico_ viram tags). Comentários (%) ficam de fora. */
export function paragrafosHtml(t: string): string[] {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fmt = (s: string) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^\p{L}\p{N}])[_*](?=\S)(.+?)(?<=\S)[_*](?![\p{L}\p{N}])/gu, "$1<i>$2</i>");
  return semComentarios(t).split(/\n+/).map((l) => l.trim()).filter(Boolean).map(fmt);
}


/* ---------- referências (ABNT) ---------- */

export interface Referencia {
  id: string;
  projeto_id: string;
  autor: string;
  titulo: string;
  subtitulo: string;
  edicao: string;
  local: string;
  editora: string;
  ano: string;
  url: string;
  notas: string;
  book_id: string | null;
}

/** "Nome Sobrenome" ou "Sobrenome, Nome" → "SOBRENOME, Nome". Vários autores separados por ";". */
export function autorAbnt(autor: string): string {
  return autor.split(";").map((a) => a.trim()).filter(Boolean).map((a) => {
    if (a.includes(",")) {
      const [sob, ...resto] = a.split(",");
      return `${sob.trim().toUpperCase()}, ${resto.join(",").trim()}`;
    }
    const p = a.split(/\s+/);
    if (p.length === 1) return p[0].toUpperCase();
    const sob = p.pop()!;
    return `${sob.toUpperCase()}, ${p.join(" ")}`;
  }).join("; ");
}

/** Sobrenome do primeiro autor, para a citação no texto: (SOBRENOME, ano). */
export function sobrenome(autor: string): string {
  const a = autor.split(";")[0].trim();
  if (!a) return "";
  return (a.includes(",") ? a.split(",")[0] : a.split(/\s+/).pop() ?? a).trim().toUpperCase();
}

/** Referência no padrão ABNT (NBR 6023), em Markdown: título em **negrito**. */
export function abnt(r: Referencia): string {
  const partes: string[] = [];
  if (r.autor.trim()) partes.push(`${autorAbnt(r.autor)}.`);
  const tit = r.titulo.trim() ? `**${r.titulo.trim()}**${r.subtitulo.trim() ? `: ${r.subtitulo.trim()}` : ""}.` : "";
  if (tit) partes.push(tit);
  if (r.edicao.trim()) partes.push(`${r.edicao.trim().replace(/\.?$/, "")}. ed.`);
  const pub = [r.local.trim() && `${r.local.trim()}:`, r.editora.trim()].filter(Boolean).join(" ");
  const imp = [pub, r.ano.trim()].filter(Boolean).join(", ");
  if (imp) partes.push(`${imp}.`);
  if (r.url.trim()) partes.push(`Disponível em: ${r.url.trim()}.`);
  return partes.join(" ").replace(/\.\./g, ".");
}

export const ordenarReferencias = (rs: Referencia[]) => [...rs].sort((a, b) => autorAbnt(a.autor).localeCompare(autorAbnt(b.autor), "pt-BR") || a.titulo.localeCompare(b.titulo, "pt-BR"));

/** O que a tela mostra para este projeto (capítulos visíveis? cena ou parte? escaleta? referências?). */
export function estrutura(p: Projeto, grupos: ReturnType<typeof manuscrito>) {
  const t = tipoDe(p.tipo);
  const comCap = t.capitulos || grupos.length > 1;
  return {
    ...t,
    comCap,
    Unidade: t.unidade[0].toUpperCase() + t.unidade.slice(1),
    rotulo: (cap: number, cena: number) => rotuloCena(cap, cena, comCap, t.unidade),
  };
}
export type Estrutura = ReturnType<typeof estrutura>;
