/**
 * Foco no trecho: o texto fica nublado (desfocado) e o trecho sob o mouse fica nítido, em relevo.
 *   "paragrafo" — o parágrafo (ou item, citação, título) sob o mouse fica nítido, sobe um pouco, com fundo de papel e sombra;
 *   "frase"     — todo o texto nublado (o parágrafo também, sem relevo); só a frase sob o mouse fica nítida.
 * Só com mouse (em tela de toque não há "passar por cima": lá o texto fica normal).
 *
 * A frase usa o CSS Custom Highlight API (::highlight): nada é inserido no texto, então destaques, notas,
 * seleção e a contagem de palavras continuam iguais. Navegador sem esse recurso: a frase cai para o parágrafo.
 */

export type ModoFoco = "off" | "paragrafo" | "frase";
export const MODOS_FOCO: { id: ModoFoco; nome: string }[] = [
  { id: "off", nome: "Desligado" },
  { id: "paragrafo", nome: "Parágrafo" },
  { id: "frase", nome: "Frase" },
];

const NOME = "foco-frase";

/** O navegador sabe realçar trechos (CSS.highlights)? */
export function suportaFrase(win: Window | null | undefined = typeof window !== "undefined" ? window : null): boolean {
  const w = win as (Window & { Highlight?: unknown; CSS?: { highlights?: unknown } }) | null;
  return !!w && typeof w.Highlight === "function" && !!w.CSS?.highlights;
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
  };
}

const BLOCO = "p, li, blockquote, h1, h2, h3, h4, h5, h6, td, th, dd, dt, figcaption, pre";
const ABREVIATURA = /(?:^|[\s(“"'])(?:p|pp|cap|caps|art|arts|vol|vols|n|nº|sr|sra|srs|dr|dra|prof|profa|sto|sta|s|ed|eds|trad|org|cf|ib|ibid|id|op|cit|séc|sec|v|vv|fl|fls|etc|ex|obs|av|tel|pág|págs|mr|mrs|ms|st|vs|al)$/i;
const INICIAL = /(?:^|[\s(“"'])\p{Lu}$/u; // "J. N. Findlay": iniciais não terminam a frase

/** Começo e fim (índices no texto do bloco) da frase que contém a posição `i`. */
export function limitesDaFrase(texto: string, i: number): [number, number] {
  const fins: number[] = [];
  const re = /[.!?…]+["'”’»)\]]*(?=\s|$)/g;
  for (const m of texto.matchAll(re)) {
    const antes = texto.slice(Math.max(0, m.index! - 12), m.index!);
    if (m[0].startsWith(".") && m[0].length === 1 && (ABREVIATURA.test(antes) || INICIAL.test(antes))) continue;
    fins.push(m.index! + m[0].length);
  }
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

/**
 * Liga o realce da frase sob o mouse em `doc` (a página, ou o iframe de um capítulo do EPUB), dentro de `raiz`.
 * Devolve a função que desliga.
 */
export function ligarFocoFrase(doc: Document, raiz: () => Element | null): () => void {
  const win = doc.defaultView as (Window & { Highlight: new (...r: Range[]) => unknown; CSS: { highlights: Map<string, unknown> } }) | null;
  if (!win || !suportaFrase(win)) return () => {};
  let quadro = 0;
  let atual: { bloco: Element; ini: number; fim: number } | null = null;
  const limpar = () => { atual = null; win.CSS.highlights.delete(NOME); };

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
      atual = { bloco, ini, fim };
      win.CSS.highlights.set(NOME, new win.Highlight(range));
    });
  };
  const sair = (e: MouseEvent) => {
    const r = raiz();
    if (r && e.relatedTarget instanceof Node && r.contains(e.relatedTarget)) return;
    limpar();
  };
  const alvo = raiz();
  doc.addEventListener("mousemove", mover);
  alvo?.addEventListener("mouseleave", sair as EventListener);
  return () => {
    doc.removeEventListener("mousemove", mover);
    alvo?.removeEventListener("mouseleave", sair as EventListener);
    if (quadro) win.cancelAnimationFrame(quadro);
    limpar();
  };
}

/**
 * O CSS do foco, para um documento cujo elemento `raiz` (seletor) leva data-foco="paragrafo|frase".
 *   parágrafo — o texto nublado (desfocado e um pouco apagado); o parágrafo sob o mouse fica nítido e em relevo;
 *   frase     — todo o texto nublado, inclusive o parágrafo sob o mouse (sem relevo); só a frase sob o mouse fica
 *               nítida. O desfoque aqui é o do próprio texto (letra transparente + sombra borrada), porque um filtro
 *               valeria para o parágrafo inteiro — e o realce da frase devolve a letra nítida só a ela.
 * `blocos` = os filhos da raiz que sobem no modo parágrafo (ex.: ":scope > :not(.leitor-nav)").
 */
export function cssDoFoco(raiz: string, cores: { fg: string; relevo: string; sombra: string; realce: string }, blocos = ":scope > *", importante = false): string {
  const imp = importante ? " !important" : "";
  const P = `${raiz}[data-foco="paragrafo"]`, F = `${raiz}[data-foco="frase"]`;
  const filhos = blocos.split(",").map((b) => b.replace(":scope", "").trim() || "> *");
  const sel = (base: string, suf = "") => filhos.map((b) => `${base} ${b}${suf}`).join(", ");
  const nublado = `0 0 .34em color-mix(in srgb, ${cores.fg} 62%, transparent)`;
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
  ${F}, ${F} * { color: transparent !important; text-shadow: ${nublado} !important; }
  ${F} ::selection { color: ${cores.fg} !important; text-shadow: none !important; }
  ::highlight(${NOME}) { color: ${cores.fg}; text-shadow: none; background-color: ${cores.realce}; }
}`;
}
