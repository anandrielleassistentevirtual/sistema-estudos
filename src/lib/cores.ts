/**
 * As cores do sistema, num lugar só.
 *
 * A interface é sóbria (grafite/branco). A cor aparece só onde tem significado:
 *  - a ÁREA de um dado: Leitura é sempre azul, Estudos violeta, Idiomas verde, Escrita laranja, Oração rosa…
 *    — no Dashboard, nas Temporadas, nos gráficos, nas barras de progresso. Assim os números de abas
 *    diferentes "conversam": o azul do calendário é o mesmo da Biblioteca e do plano da temporada.
 *  - a SITUAÇÃO: ok (verde), atenção (âmbar), erro (vermelho).
 * As cores são variáveis do CSS (globals.css), com um tom para o tema claro e outro para o escuro.
 */

export type AreaCor = "leitura" | "estudos" | "idiomas" | "escrita" | "oracao" | "pesquisa" | "exercicio" | "outro";

export const COR_AREA: Record<AreaCor, string> = {
  leitura: "var(--area-leitura)",
  estudos: "var(--area-estudos)",
  idiomas: "var(--area-idiomas)",
  escrita: "var(--area-escrita)",
  oracao: "var(--area-oracao)",
  pesquisa: "var(--area-pesquisa)",
  exercicio: "var(--area-exercicio)",
  outro: "var(--area-outro)",
};

/** Categoria do Timer (ou da sessão) → área. "Anki" é de Idiomas; o que não tem área fica cinza. */
export function areaDaCategoria(categoria: string | null | undefined): AreaCor {
  switch (categoria) {
    case "Leitura": return "leitura";
    case "Estudos": return "estudos";
    case "Idiomas":
    case "Anki": return "idiomas";
    case "Escrita": return "escrita";
    case "Oração": return "oracao";
    case "Pesquisa": return "pesquisa";
    case "Exercício": return "exercicio";
    default: return "outro";
  }
}

export const corDaCategoria = (categoria: string | null | undefined) => COR_AREA[areaDaCategoria(categoria)];

/** Situação: as mesmas três cores em todas as etiquetas, metas e avisos. */
export const COR_OK = "var(--good)";
export const COR_ATENCAO = "var(--warn)";
export const COR_ERRO = "var(--critical)";

/** Nota de 0 a 1 (execução da semana, meta…) → verde, âmbar ou vermelho. */
export const corDaNota = (v: number) => (v >= 0.85 ? COR_OK : v >= 0.6 ? COR_ATENCAO : COR_ERRO);
