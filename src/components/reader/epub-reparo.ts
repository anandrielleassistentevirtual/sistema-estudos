/**
 * Reparo de EPUB convertido de PDF: cada linha da página impressa virou um parágrafo (ou uma quebra <br>),
 * o texto fica picado, com espaço demais entre as linhas, e sobram cabeçalhos ("A veemência da vida 1")
 * e números de página. Aqui as linhas voltam a formar parágrafos — só quando o capítulo claramente tem
 * esse defeito, para não mexer em livros bem feitos. É determinístico: o mesmo capítulo sempre fica igual,
 * então as posições salvas e os destaques feitos depois do reparo continuam apontando para o mesmo lugar.
 */

const FIM_DE_FRASE = /[.!?…:;»”"')\]]$/;
const COMECA_MINUSCULA = /^[a-zà-öø-ÿ(«“"'—–-]/;
const SO_NUMERO = /^\d{1,4}$/;

const normal = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const texto = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

/** Parágrafo "simples": só texto e formatação em linha (sem imagem, tabela ou bloco dentro). */
function simples(p: Element) {
  return p.tagName.toLowerCase() === "p" && !p.querySelector("img, svg, image, table, div, figure, ul, ol, blockquote, h1, h2, h3, h4, h5, h6");
}

function mediana(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

/**
 * O capítulo tem cara de "uma linha por parágrafo"? Linhas de livro impresso: quase nenhum parágrafo longo,
 * a maioria com o comprimento de uma linha (40–110 caracteres) e sem terminar a frase. Legendas curtas de
 * livros ilustrados (comuns em livros bem feitos) não bastam para disparar o reparo.
 */
export function linhasQuebradas(textos: string[]): boolean {
  const linhas = textos.filter((t) => t.length >= 15);
  if (linhas.length < 12) return false;
  const fracao = (f: (t: string) => boolean) => linhas.filter(f).length / linhas.length;
  return fracao((t) => !FIM_DE_FRASE.test(t)) >= 0.5
    && fracao((t) => t.length > 160) <= 0.05
    && fracao((t) => t.length >= 40 && t.length <= 110) >= 0.6;
}

/** O texto de cada linha de um parágrafo quebrado com <br>. */
function linhasDoBr(p: Element): string[] {
  const out = [""];
  for (const n of [...p.childNodes]) {
    if (n.nodeName.toLowerCase() === "br") out.push("");
    else out[out.length - 1] += n.textContent ?? "";
  }
  return out.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/**
 * Decide se a linha seguinte continua o mesmo parágrafo.
 * `cheia`: a linha anterior tem o comprimento típico (não é o fim curto de um parágrafo).
 */
export function continua(anterior: string, seguinte: string, cheia: boolean): boolean {
  if (!anterior || !seguinte) return false;
  if (!FIM_DE_FRASE.test(anterior)) return true;          // a frase não terminou
  if (COMECA_MINUSCULA.test(seguinte)) return true;        // "séc." + "XI…", "p." + "34"
  return cheia;                                             // terminou a frase mas a linha estava cheia: o parágrafo segue
}

export function repararCapitulo(doc: Document): boolean {
  const body = doc.body;
  if (!body) return false;
  const titulo = normal(texto(body.querySelector("h1, h2, h3") ?? body).slice(0, 200));

  // decide ANTES de mexer em qualquer coisa: capítulos bem feitos (e poemas com <br>) ficam intactos
  const todos = [...body.querySelectorAll("p")].filter(simples);
  const comBr = todos.filter((p) => p.querySelectorAll("br").length >= 3);
  if (!linhasQuebradas(todos.flatMap((p) => (comBr.includes(p) ? linhasDoBr(p) : [texto(p)])))) return false;

  // <br> dentro do parágrafo (outra forma do mesmo defeito): vira quebra de parágrafo, para o mesmo reparo valer
  for (const p of comBr) {
    const partes: Node[][] = [[]];
    for (const n of [...p.childNodes]) {
      if (n.nodeName.toLowerCase() === "br") partes.push([]);
      else partes[partes.length - 1].push(n);
    }
    for (const nodes of partes) {
      if (!nodes.some((n) => (n.textContent ?? "").trim())) continue;
      const novo = doc.createElementNS(p.namespaceURI, "p");
      for (const n of nodes) novo.appendChild(n);
      p.parentNode!.insertBefore(novo, p);
    }
    p.remove();
  }

  const ps = [...body.querySelectorAll("p")].filter(simples);

  // sobras da página impressa: número de página sozinho e o cabeçalho corrido ("A veemência da vida 1")
  for (const p of ps) {
    const t = texto(p);
    const semNumero = normal(t.replace(/\s*\d{1,4}$/, "").replace(/^\d{1,4}\s*/, ""));
    if (SO_NUMERO.test(t) || (semNumero.length >= 4 && /\d/.test(t) && titulo.includes(semNumero) && t.length < 90)) p.remove();
  }

  const vivos = [...body.querySelectorAll("p")].filter(simples);
  const tipica = mediana(vivos.map((p) => texto(p).length).filter((n) => n >= 15));
  let alvo: Element | null = null;
  let ultimaLinha = "";
  for (const p of vivos) {
    const t = texto(p);
    const vizinho = alvo && p.previousElementSibling === alvo;
    if (alvo && vizinho && continua(ultimaLinha, t, ultimaLinha.length >= tipica * 0.85)) {
      // "aque-" + "le" → "aquele"; senão junta com espaço
      const hifen = /[a-zà-ÿ]-$/i.test(ultimaLinha) && /^[a-zà-ÿ]/.test(t);
      if (hifen) {
        const ultimo = alvo.lastChild;
        if (ultimo && ultimo.nodeType === 3) ultimo.textContent = (ultimo.textContent ?? "").replace(/-\s*$/, "");
      } else {
        alvo.appendChild(doc.createTextNode(" "));
      }
      while (p.firstChild) alvo.appendChild(p.firstChild);
      p.remove();
    } else {
      alvo = p;
    }
    ultimaLinha = t;
  }
  body.setAttribute("data-reparado", "1");
  return true;
}
