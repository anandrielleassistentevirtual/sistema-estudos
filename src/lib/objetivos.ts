/** Mapa da Ignorância: mesas de objetivos (grupos de livros com nome, numa ordem definida). */
import type { Book } from "./types";

export interface Objetivo {
  id: string;
  titulo: string;
  descricao: string;
  posicao: number;
  created_at: string;
}

export interface ItemObjetivo {
  id: string;
  objetivo_id: string;
  secao: string;
  posicao: number;
  cdd: string;
  autor: string;
  titulo: string;
  feito: boolean;
  feito_em: string | null;
  book_id: string | null;
}

export interface MesaLida { titulo: string; solta?: boolean; itens: { secao: string; cdd: string; autor: string; titulo: string; feito: boolean }[] }

/** "700.92 CURREY, Mason – Os segredos dos grandes artistas" → { cdd, autor, titulo } */
export function lerLinhaDeLivro(linha: string): { cdd: string; autor: string; titulo: string } | null {
  const t = linha.trim().replace(/^[-*]\s*(\[[ xX]\]\s*)?/, "").trim();
  if (!t) return null;
  const m = t.match(/^(\d{3}(?:\.\d+)?)\s+(.+)$/);
  const cdd = m ? m[1] : "";
  const resto = m ? m[2] : t;
  const p = resto.split(/\s+[–—-]\s+/);
  if (p.length >= 2) return { cdd, autor: p[0].trim(), titulo: p.slice(1).join(" – ").trim() };
  return { cdd, autor: "", titulo: resto.trim() };
}

/**
 * Lê uma lista colada (como no Obsidian/Notion):
 *   Bloco 0 — Aprender a estudar          → uma mesa
 *   1.1. História da arte…                 → seção dentro da mesa
 *   - [ ] 709 GOMBRICH, Ernst – A história da arte   → livro ([x] = já lido)
 */
export function lerLista(texto: string): MesaLida[] {
  const mesas: MesaLida[] = [];
  let atual: MesaLida | null = null;
  let secao = "";
  for (const bruta of texto.split(/\r?\n/)) {
    const l = bruta.trim();
    if (!l || l.startsWith("```")) continue;
    // "Bloco 0 — Aprender a estudar": o nome fica inteiro, do jeito que você escreveu (a numeração é sua)
    const bloco = l.match(/^(?:#+\s*)?(bloco\s+\S+\s*[—–:.-]\s*.+)$/i);
    if (bloco) { atual = { titulo: bloco[1].trim(), itens: [] }; mesas.push(atual); secao = ""; continue; }
    const item = l.match(/^[-*]\s*\[([ xX])\]\s*(.+)$/) ?? l.match(/^[-*]\s+(.+)$/);
    if (item) {
      if (!atual) { atual = { titulo: "Sem nome", itens: [] }; mesas.push(atual); }
      const feito = item.length === 3 && /x/i.test(item[1]);
      const livro = lerLinhaDeLivro(item.length === 3 ? item[2] : item[1]);
      if (livro) atual.itens.push({ secao, feito, ...livro });
      continue;
    }
    const sec = l.match(/^(?:#+\s*)?(\d+(?:\.\d+)+\.?\s+.+)$/);
    if (sec && atual) { secao = sec[1].trim(); continue; }
    // qualquer outra linha solta vira o nome de uma mesa nova
    const nome = l.replace(/^#+\s*/, "");
    atual = { titulo: nome, solta: true, itens: [] };
    mesas.push(atual);
    secao = "";
  }
  // "Bloco N — X" vale mesmo vazio; frase solta sem nenhum livro embaixo é descartada
  return mesas.filter((m) => m.itens.length || !m.solta);
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Procura na biblioteca o livro de um item (pelo título e pelo sobrenome do autor). */
export function acharLivro(item: { autor: string; titulo: string }, livros: Pick<Book, "id" | "title" | "author">[]) {
  const t = norm(item.titulo);
  if (t.length < 4) return null;
  const sob = norm(item.autor.split(/[,;]/)[0] ?? "");
  const candidatos = livros.filter((b) => {
    const bt = norm(b.title);
    const mesmoTitulo = bt === t || (t.length >= 8 && (bt.startsWith(t) || t.startsWith(bt))) || (t.length >= 12 && bt.includes(t));
    return mesmoTitulo;
  });
  if (!candidatos.length) return null;
  if (!sob) return candidatos[0];
  return candidatos.find((b) => norm(`${b.author ?? ""} ${b.title}`).includes(sob)) ?? null;
}

/** Nome para exibir: "AUTOR – Título" */
export const nomeDoItem = (i: Pick<ItemObjetivo, "autor" | "titulo">) => (i.autor ? `${i.autor} – ${i.titulo}` : i.titulo);

/**
 * Progresso da mesa medido em palavras: livros lidos contam inteiros, os que estão em leitura contam
 * o quanto já foi lido. Livro sem contagem de palavras entra com a média dos outros da mesa.
 */
export function progressoDaMesa(
  itens: Pick<ItemObjetivo, "feito" | "book_id">[],
  porLivro: Map<string, Pick<Book, "status" | "word_count" | "progress">>,
) {
  const conhecidos = itens.map((i) => (i.book_id ? porLivro.get(i.book_id)?.word_count : null)).filter((w): w is number => !!w && w > 0);
  const media = conhecidos.length ? conhecidos.reduce((a, w) => a + w, 0) / conhecidos.length : 60000;
  let total = 0, lidas = 0, livrosLidos = 0;
  for (const i of itens) {
    const b = i.book_id ? porLivro.get(i.book_id) : undefined;
    const w = b?.word_count && b.word_count > 0 ? b.word_count : media;
    const feito = i.feito || b?.status === "lido";
    total += w;
    if (feito) { lidas += w; livrosLidos++; }
    else if (b) lidas += w * Math.min(1, Math.max(0, b.progress || 0));
  }
  return { total, lidas, faltam: total - lidas, pct: total ? lidas / total : 0, livrosLidos, livros: itens.length };
}

/** 118000 → "118 mil"; 1250000 → "1,25 mi" */
export function palavrasCurto(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString("pt-BR")} mil`;
  return String(Math.round(n));
}

/** 0.034 → "3,4%"; 0.42 → "42%" (com uma casa enquanto é pequeno, para o avanço aparecer) */
export const pctTexto = (p: number) =>
  `${(p * 100).toLocaleString("pt-BR", { maximumFractionDigits: p > 0 && p < 0.1 ? 1 : 0 })}%`;
