/**
 * Foco no trecho: o texto fica nublado (desfocado) e o trecho sob o mouse fica nítido, em relevo.
 *   "paragrafo" — o parágrafo (ou item, citação, título) sob o mouse fica nítido, sobe um pouco, com fundo de papel e sombra;
 *   "frase"     — todo o texto nublado (o parágrafo também, sem relevo); só a frase sob o mouse fica nítida.
 * Só com mouse (em tela de toque não há "passar por cima": lá o texto fica normal).
 *
 * A frase usa um véu por cima do texto, que desfoca o que está atrás (backdrop-filter), com um recorte arredondado
 * em cada linha da frase sob o mouse: a frase aparece como está na página, sem efeito nenhuma nas letras. Nada é
 * inserido no texto, então destaques, notas, seleção e a contagem de palavras continuam iguais.
 * Navegador sem esse recurso: a frase cai para o parágrafo.
 */

export type ModoFoco = "off" | "paragrafo" | "frase";
export const MODOS_FOCO: { id: ModoFoco; nome: string }[] = [
  { id: "off", nome: "Desligado" },
  { id: "paragrafo", nome: "Parágrafo" },
  { id: "frase", nome: "Frase" },
];

/** O navegador sabe desfocar o que está atrás de uma camada (backdrop-filter)? */
export function suportaFrase(win: Window | null | undefined = typeof window !== "undefined" ? window : null): boolean {
  const c = (win as (Window & { CSS?: { supports?: (s: string) => boolean } }) | null)?.CSS;
  return !!c?.supports && (c.supports("backdrop-filter: blur(1px)") || c.supports("-webkit-backdrop-filter: blur(1px)"));
}

/** Com mouse (hover de verdade)? */
export const temMouse = () => typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;

/** O modo que vale neste navegador (frase sem suporte → parágrafo; sem mouse → desligado). */
export function modoEfetivo(m: ModoFoco | undefined, win?: Window | null): ModoFoco {
  if (!m || m === "off") return "off";
  if (m === "frase" && !suportaFrase(win)) return "paragrafo";
  return m;
}

/** Cores do relevo para o tema do leitor (papel um pouco mais claro e uma sombra suave). */
export function coresDoFoco(bg: string, escuro: boolean) {
  return {
    relevo: escuro ? `color-mix(in srgb, ${bg} 90%, white)` : `color-mix(in srgb, ${bg} 40%, white)`,
    sombra: escuro ? "rgba(0,0,0,0.55)" : "rgba(60,45,20,0.16)",
    realce: escuro ? "rgba(255,255,255,0.07)" : "rgba(255,214,102,0.22)",
    /** o véu que nubla o texto (desfoque + a cor da página por cima, meio transparente) */
    veu: `color-mix(in srgb, ${bg} 48%, transparent)`,
    /** a pílula em volta da frase: a cor da própria página (sem tinta), só um contorno fino e uma sombra leve de relevo */
    pilula: "transparent",
    contorno: escuro
      ? "0 0 0 1px rgba(255,255,255,0.10), 0 6px 18px -6px rgba(0,0,0,0.65)"
      : "0 0 0 1px rgba(0,0,0,0.07), 0 6px 16px -8px rgba(0,0,0,0.22)",
    mistura: "normal",
  };
}

const BLOCO = "p, li, blockquote, h1, h2, h3, h4, h5, h6, td, th, dd, dt, figcaption, pre";
const ABREVIATURA = /(?:^|[\s(“"'])(?:p|pp|cap|caps|art|arts|vol|vols|n|nº|sr|sra|srs|dr|dra|prof|profa|sto|sta|s|ed|eds|trad|org|cf|ib|ibid|id|op|cit|séc|sec|v|vv|fl|fls|etc|ex|obs|av|tel|pág|págs|mr|mrs|ms|st|vs|al)$/i;
const INICIAL = /(?:^|[\s(“"'])\p{Lu}$/u; // "J. N. Findlay": iniciais não terminam a frase

/** Onde terminam as frases de um texto (índice logo depois do ponto e das aspas/parênteses que o fecham). */
export function finsDeFrase(texto: string): number[] {
  const fins: number[] = [];
  const re = /[.!?…]+["'”’»)\]]*(?=\s|$)/g;
  for (const m of texto.matchAll(re)) {
    const antes = texto.slice(Math.max(0, m.index! - 12), m.index!);
    if (m[0].startsWith(".") && m[0].length === 1 && (ABREVIATURA.test(antes) || INICIAL.test(antes))) continue;
    fins.push(m.index! + m[0].length);
  }
  return fins;
}

/** Começo e fim (índices no texto do bloco) da frase que contém a posição `i`. */
export function limitesDaFrase(texto: string, i: number): [number, number] {
  const fins = finsDeFrase(texto);
  let ini = 0, fim = texto.length;
  for (const f of fins) {
    if (f <= i) ini = f;
    else { fim = f; break; }
  }
  while (ini < fim && /\s/.test(texto[ini])) ini++;
  return [ini, fim];
}

/** Posição (nó de texto + deslocamento) sob o ponto, no documento dado. */
function caretEm(doc: Document, x: number, y: number): { no: Node; off: number } | null {
  const d = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (d.caretPositionFromPoint) { const p = d.caretPositionFromPoint(x, y); return p ? { no: p.offsetNode, off: p.offset } : null; }
  if (d.caretRangeFromPoint) { const r = d.caretRangeFromPoint(x, y); return r ? { no: r.startContainer, off: r.startOffset } : null; }
  return null;
}

// ── frases como trechos (Markdown e TXT): cada frase vira <span class="frase"> só na hora de desenhar ───────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const EM_LINHA = new Set(["a", "em", "strong", "i", "b", "sup", "sub", "code", "span", "mark", "small", "del", "ins", "s", "u", "abbr", "cite", "q", "kbd", "br", "img"]);
const BLOCOS_DE_FRASE = new Set(["p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "td", "th", "dd", "dt", "figcaption"]);
const TERMINA = /[.!?…]+["'”’»)\]]*\s*$/;
const textoDe = (n: any): string => (n.type === "text" ? n.value : (n.children ?? []).map(textoDe).join(""));

function emFrases(filhos: any[]): any[] {
  const out: any[] = [];
  let atual: any[] = [];
  const fecha = () => {
    if (atual.some((n) => textoDe(n).trim())) out.push({ type: "element", tagName: "span", properties: { className: ["frase"] }, children: atual });
    else out.push(...atual);
    atual = [];
  };
  const texto = (v: string) => {
    // o espaço entre uma frase e a seguinte fica fora dos trechos
    if (!atual.length) { const m = /^\s+/.exec(v); if (m) { out.push({ type: "text", value: m[0] }); v = v.slice(m[0].length); } }
    if (v) atual.push({ type: "text", value: v });
  };
  for (const c of filhos) {
    if (c.type === "text") {
      let ult = 0;
      for (const f of finsDeFrase(c.value)) { texto(c.value.slice(ult, f)); fecha(); ult = f; }
      texto(c.value.slice(ult));
    } else {
      atual.push(c);
      if (c.type === "element" && c.tagName !== "a" && TERMINA.test(textoDe(c))) fecha(); // "*…fim.*"
    }
  }
  fecha();
  return out;
}

function visitar(no: any) {
  if (no.type === "element" && BLOCOS_DE_FRASE.has(no.tagName) && !(no.children ?? []).some((c: any) => c.type === "element" && !EM_LINHA.has(c.tagName))) {
    no.children = emFrases(no.children ?? []);
    return;
  }
  for (const c of no.children ?? []) visitar(c);
}

/** Plugin do react-markdown (rehype): cada frase de cada parágrafo, item ou título vira <span class="frase">. */
export function rehypeFrases() {
  return (arvore: any) => { visitar(arvore); };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** O mesmo para um parágrafo de TXT (HTML já escapado, sem etiquetas). */
export function frasesHtml(html: string): string {
  let out = "", ult = 0;
  const trecho = (v: string) => {
    const m = /^\s+/.exec(v);
    const esp = m ? m[0] : "";
    const corpo = v.slice(esp.length);
    return esp + (corpo.trim() ? `<span class="frase">${corpo}</span>` : corpo);
  };
  for (const f of finsDeFrase(html)) { out += trecho(html.slice(ult, f)); ult = f; }
  return out + trecho(html.slice(ult));
}

type Linha = { l: number; r: number; t: number; b: number };
const PX = 5, PY = 1.5, RAIO = 8;
const DESLIZA = "transform .16s cubic-bezier(.2,.7,.2,1),width .16s cubic-bezier(.2,.7,.2,1),height .16s ease,opacity .2s ease";

/** As caixas de um trecho, juntas por linha. */
function linhasDe(range: Range): Linha[] {
  const linhas: Linha[] = [];
  for (const q of Array.from(range.getClientRects())) {
    if (q.width < 1 || q.height < 1) continue;
    const ln = linhas.find((x) => Math.abs((x.t + x.b) / 2 - (q.top + q.bottom) / 2) < q.height * 0.5);
    if (ln) { ln.l = Math.min(ln.l, q.left); ln.r = Math.max(ln.r, q.right); ln.t = Math.min(ln.t, q.top); ln.b = Math.max(ln.b, q.bottom); }
    else linhas.push({ l: q.left, r: q.right, t: q.top, b: q.bottom });
  }
  return linhas;
}

/** retângulo de cantos arredondados, como caminho SVG */
function retArredondado(x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

/**
 * O véu e as pílulas:
 * - o véu cobre a área do texto e desfoca o que está atrás (o texto fica nublado), com um recorte arredondado em cada
 *   linha da frase — ali o texto aparece como está na página;
 * - as pílulas contornam os recortes (contorno fino e sombra leve) e deslizam de uma frase para a outra.
 * Tudo fixo na janela e sem receber cliques: a letra, a seleção e os cliques não mudam.
 */
function camadaDoFoco(doc: Document, cores: { veu: string; contorno?: string }) {
  const veu = doc.createElement("div");
  veu.setAttribute("aria-hidden", "true");
  veu.style.cssText = `position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:65;background:${cores.veu};`
    + "backdrop-filter:blur(2.6px);-webkit-backdrop-filter:blur(2.6px);transition:opacity .2s ease;";
  const aneis = doc.createElement("div");
  aneis.setAttribute("aria-hidden", "true");
  aneis.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:66;transition:opacity .2s ease;";
  doc.body.append(veu, aneis);
  const pilulas: HTMLDivElement[] = [];
  let mostrando = 0;
  const pilula = (i: number) => {
    if (pilulas[i]) return pilulas[i];
    const d = doc.createElement("div");
    d.style.cssText = `position:absolute;left:0;top:0;border-radius:${RAIO}px;box-shadow:${cores.contorno ?? "none"};opacity:0;will-change:transform,width,height;transition:${DESLIZA};`;
    aneis.appendChild(d);
    return (pilulas[i] = d);
  };
  return {
    /** `area`: a parte visível do texto; `linhas`: a frase (ou nada: tudo nublado) */
    desenhar(area: DOMRect | null, linhas: Linha[]) {
      if (!area || area.width <= 0 || area.height <= 0) { veu.style.width = "0"; for (const p of pilulas) p.style.opacity = "0"; mostrando = 0; return; }
      Object.assign(veu.style, { left: `${area.left}px`, top: `${area.top}px`, width: `${area.width}px`, height: `${area.height}px` });
      const furos = linhas.map((ln) => retArredondado(ln.l - PX - area.left, ln.t - PY - area.top, ln.r - ln.l + PX * 2, ln.b - ln.t + PY * 2, RAIO));
      veu.style.clipPath = furos.length ? `path(evenodd, "M0 0H${area.width}V${area.height}H0Z${furos.join("")}")` : "none";
      linhas.forEach((ln, i) => {
        const d = pilula(i);
        const nova = i >= mostrando;
        if (nova) d.style.transition = "opacity .2s ease"; // aparece no lugar, sem vir deslizando do canto
        d.style.transform = `translate(${ln.l - PX}px, ${ln.t - PY}px)`;
        d.style.width = `${ln.r - ln.l + PX * 2}px`;
        d.style.height = `${ln.b - ln.t + PY * 2}px`;
        d.style.opacity = "1";
        if (nova) requestAnimationFrame(() => { d.style.transition = DESLIZA; });
      });
      for (let i = linhas.length; i < pilulas.length; i++) pilulas[i].style.opacity = "0";
      mostrando = linhas.length;
    },
    /** selecionando texto: o véu sai (tudo legível) e volta quando a seleção acaba */
    mostrar(sim: boolean) { veu.style.opacity = aneis.style.opacity = sim ? "1" : "0"; },
    remover() { veu.remove(); aneis.remove(); },
  };
}

/**
 * Liga o foco na frase em `doc` (a página, ou o iframe de um capítulo do EPUB), dentro de `raiz`: o texto nublado
 * e a frase sob o mouse nítida. `excluir`: um pedaço da raiz que não fica nublado (ex.: os botões Anterior/Próxima).
 * Devolve a função que desliga.
 */
export function ligarFocoFrase(doc: Document, raiz: () => Element | null, cores: { veu: string; contorno?: string }, excluir?: string): () => void {
  const win = doc.defaultView;
  if (!win || !doc.body || !suportaFrase(win)) return () => {};
  let quadro = 0;
  let atual: { bloco: Element; ini: number; fim: number; range: Range } | null = null;
  const camada = camadaDoFoco(doc, cores);

  /** a parte visível do texto: a raiz, cortada pela janela e pelo que a contém (e sem o pedaço excluído) */
  const area = (): DOMRect | null => {
    const r = raiz();
    if (!r) return null;
    let { left, top, right, bottom } = r.getBoundingClientRect();
    const pai = r.parentElement?.getBoundingClientRect();
    if (pai) { left = Math.max(left, pai.left); top = Math.max(top, pai.top); right = Math.min(right, pai.right); bottom = Math.min(bottom, pai.bottom); }
    left = Math.max(left, 0); top = Math.max(top, 0); right = Math.min(right, win.innerWidth); bottom = Math.min(bottom, win.innerHeight);
    const fora = excluir ? r.querySelector(excluir)?.getBoundingClientRect() : null;
    if (fora && fora.top < bottom) bottom = Math.max(top, fora.top - 8);
    return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
  };
  const desenhar = () => camada.desenhar(area(), atual ? linhasDe(atual.range) : []);

  const mover = (e: MouseEvent) => {
    if (e.buttons) return; // selecionando texto: não mexe
    if (quadro) return;
    const { clientX: x, clientY: y } = e;
    quadro = win.requestAnimationFrame(() => {
      quadro = 0;
      const r = raiz();
      const c = caretEm(doc, x, y);
      if (!r || !c || !r.contains(c.no)) return;
      const el = c.no.nodeType === 3 ? c.no.parentElement : (c.no as Element);
      const bloco = el?.closest(BLOCO) ?? el;
      if (!bloco || !r.contains(bloco) || bloco === r) return;
      // posição do mouse no texto do bloco
      const andar = doc.createTreeWalker(bloco, NodeFilter.SHOW_TEXT);
      let pos = 0, achou = -1;
      const nos: Text[] = [];
      for (let n = andar.nextNode() as Text | null; n; n = andar.nextNode() as Text | null) {
        if (n === c.no) achou = pos + c.off;
        nos.push(n);
        pos += n.data.length;
      }
      if (achou < 0) return;
      if (atual && atual.bloco === bloco && achou >= atual.ini && achou < atual.fim) return; // a mesma frase
      const texto = nos.map((n) => n.data).join("");
      const [ini, fim] = limitesDaFrase(texto, achou);
      if (fim <= ini) return;
      // de volta para nós de texto
      const range = doc.createRange();
      let acc = 0, comecou = false;
      for (const n of nos) {
        const len = n.data.length;
        if (!comecou && ini <= acc + len) { range.setStart(n, ini - acc); comecou = true; }
        if (comecou && fim <= acc + len) { range.setEnd(n, fim - acc); break; }
        acc += len;
      }
      atual = { bloco, ini, fim, range };
      desenhar();
    });
  };
  const sair = (e: MouseEvent) => {
    const r = raiz();
    if (r && e.relatedTarget instanceof Node && r.contains(e.relatedTarget)) return;
    atual = null;
    desenhar();
  };
  // selecionar texto (para levar às anotações): o véu sai enquanto há seleção
  const apertou = (e: MouseEvent) => { const r = raiz(); if (r && e.target instanceof Node && r.contains(e.target)) camada.mostrar(false); };
  const selecao = () => {
    const sel = doc.getSelection();
    if (!sel || sel.isCollapsed) camada.mostrar(true);
    else camada.mostrar(false);
  };
  const alvo = raiz();
  doc.addEventListener("mousemove", mover);
  doc.addEventListener("mousedown", apertou);
  doc.addEventListener("selectionchange", selecao);
  alvo?.addEventListener("mouseleave", sair as EventListener);
  doc.addEventListener("scroll", desenhar, true);
  win.addEventListener("resize", desenhar);
  // o texto da página pode mudar de tamanho depois (fontes, imagens): o véu acompanha
  const ro = typeof ResizeObserver === "function" && alvo ? new ResizeObserver(desenhar) : null;
  if (ro && alvo) ro.observe(alvo);
  desenhar();
  return () => {
    doc.removeEventListener("mousemove", mover);
    doc.removeEventListener("mousedown", apertou);
    doc.removeEventListener("selectionchange", selecao);
    alvo?.removeEventListener("mouseleave", sair as EventListener);
    doc.removeEventListener("scroll", desenhar, true);
    win.removeEventListener("resize", desenhar);
    ro?.disconnect();
    if (quadro) win.cancelAnimationFrame(quadro);
    camada.remover();
  };
}

/**
 * O CSS do foco, para um documento cujo elemento `raiz` (seletor) leva data-foco="paragrafo|frase".
 *   parágrafo — o texto nublado (desfocado e um pouco apagado); o parágrafo sob o mouse fica nítido e em relevo;
 *   frase     — Markdown/TXT: cada frase é um <span class="frase"> (rehypeFrases/frasesHtml), nublada; a frase sob o
 *               mouse fica nítida, com a pílula (cor da página, contorno fino). EPUB: o véu (ligarFocoFrase).
 * `blocos` = os filhos da raiz que sobem no modo parágrafo (ex.: ":scope > :not(.leitor-nav)").
 */
export function cssDoFoco(raiz: string, cores: { fg: string; relevo: string; sombra: string; realce: string; bg?: string; contorno?: string }, blocos = ":scope > *", importante = false): string {
  const imp = importante ? " !important" : "";
  const P = `${raiz}[data-foco="paragrafo"]`, F = `${raiz}[data-foco="frase"]`;
  // a pílula da frase: fundo na cor da página (cobre o borrão das vizinhas), contorno fino e sombra leve
  const pilula = cores.contorno ?? "none";
  const filhos = blocos.split(",").map((b) => b.replace(":scope", "").trim() || "> *");
  const sel = (base: string, suf = "") => filhos.map((b) => `${base} ${b}${suf}`).join(", ");
  return `
@media (hover: hover) and (pointer: fine) {
  ${sel(P)} {
    filter: blur(2.6px); opacity: .5${imp}; border-radius: 6px; position: relative;
    /* ao sair de um parágrafo, espera um instante antes de nublar (o vão entre parágrafos não pisca) */
    transition: filter .3s ease .12s, opacity .3s ease .12s, transform .25s ease, box-shadow .25s ease, background-color .25s ease;
  }
  ${sel(P, ":hover")} {
    filter: none; opacity: 1${imp}; transition-delay: 0s;
    background-color: ${cores.relevo}${imp};
    box-shadow: 0 0 0 .6em ${cores.relevo}, 0 .8em 1.8em .5em ${cores.sombra};
    transform: translateY(-2px); z-index: 1;
  }
  ${F} .frase {
    filter: blur(2.6px); opacity: .5; border-radius: 8px;
    /* folga: em cima e embaixo preenche o vão entre as linhas (o mouse ali continua na frase; a altura das linhas
       não muda); nos lados, um respiro que a margem negativa devolve no começo e no fim da frase */
    padding: .26em .25em; margin: 0 -.25em;
    -webkit-box-decoration-break: clone; box-decoration-break: clone;
    transition: filter .28s ease .1s, opacity .28s ease .1s, box-shadow .2s ease, background-color .2s ease;
  }
  ${F} .frase:hover {
    filter: none; opacity: 1; transition-delay: 0s; position: relative; z-index: 1;
    background-color: ${cores.bg ?? "transparent"}; box-shadow: ${pilula};
  }
  ${F}[data-selecao="1"] .frase { filter: none; opacity: 1; }
}`;
}
