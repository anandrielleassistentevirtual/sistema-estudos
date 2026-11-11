/**
 * O Supabase devolve no máximo 1000 linhas por pedido (mesmo com .limit maior). Para listas que crescem
 * (livros, notas, aulas, sessões), busca página por página até acabar.
 * A consulta precisa de uma ordem estável (ex.: .order("id")), senão as páginas podem repetir ou pular linhas.
 *
 *   const livros = await todas<Book>((de, ate) => sb.from("books").select("*").order("title").order("id").range(de, ate));
 */
export async function todas<T>(
  pagina: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  tamanho = 1000,
): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += tamanho) {
    const { data, error } = await pagina(de, de + tamanho - 1);
    if (error) throw new Error(error.message);
    const lote = (data as T[] | null) ?? [];
    linhas.push(...lote);
    if (lote.length < tamanho) return linhas;
  }
}
