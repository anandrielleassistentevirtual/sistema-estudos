"use client";
/** O livro numa lista: sempre o mesmo desenho, no Plano, na Estante e nos Temas. */
import { BookOpen, FileText, Pencil, Play, Rows3, Trash2 } from "lucide-react";
import { Cover } from "@/components/cover";
import { RowMenu, type MenuItem } from "@/components/row-menu";
import { OPCOES_LIVRO, StatusPill } from "@/components/status-pill";
import { deleteBook } from "@/lib/books";
import { fmtDuration } from "@/lib/dates";
import { PERFIS, dominioDe, perfilDe } from "@/lib/leitura";
import { progressoDoLivro, type Book } from "@/lib/types";
import { faltaDe, useBiblioteca } from "./dados";
import { Anel, EtiquetaPerfil, Selos } from "./visual";

export function LivroLinha({ livro: b, numero, menu = [], mostrarMesa = true, mostrarPasta = true }: {
  livro: Book;
  /** posição na mesa */
  numero?: number;
  /** ações a mais no ••• (as da mesa) */
  menu?: MenuItem[];
  mostrarMesa?: boolean;
  /** na Estante a pasta já está no título da prateleira */
  mostrarPasta?: boolean;
}) {
  const { abrir, ler, atualizar, pastaDe, lugar, proximo, capas, marcas, ppm, recarregar } = useBiblioteca();
  const pasta = pastaDe(b);
  const onde = lugar.get(b.id);
  const perfil = perfilDe(b);
  const p = progressoDoLivro(b);
  const falta = faltaDe(b);
  const dom = perfil === "conhecimento" && b.status !== "aguardando" ? dominioDe(b, marcas.get(b.id) ?? 0).total : null;
  const cor = perfil ? PERFIS[perfil].cor : "var(--area-leitura)";
  const feito = b.status === "lido";

  return (
    <div className={`group flex items-center gap-2 sm:gap-3 px-3 py-2.5 hover:bg-sel/50 transition-colors ${feito ? "opacity-70" : ""}`}>
      {numero !== undefined && <span className="w-5 text-right text-xs text-faint tabular-nums shrink-0">{numero}</span>}
      <button onClick={() => abrir({ tipo: "ficha", id: b.id })} className="flex items-center gap-3 min-w-0 flex-1 text-left" title="Abrir a ficha do livro">
        <Cover book={b} url={capas[b.id]} className="w-9 h-[52px] shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 min-w-0">
            <span className={`font-medium leading-snug line-clamp-2 sm:line-clamp-1 break-words ${feito ? "line-through decoration-faint" : ""}`}>{b.title}</span>
            {proximo?.id === b.id && <span className="chip shrink-0 font-medium !text-ink border border-line bg-surface">a seguir</span>}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
            <span className="truncate max-w-[14rem]">{b.author ?? "Autor desconhecido"}</span>
            {mostrarPasta && pasta?.code && <span className="font-mono text-[11px] text-faint" title={pasta.name}>{pasta.code}</span>}
            <EtiquetaPerfil livro={b} curta />
            <Selos livro={b} />
            {mostrarMesa && onde && <span className="chip hidden sm:inline-flex" title={`Mesa ${onde.mesaN}: ${onde.mesa.titulo}`}>{onde.mesa.titulo} · {onde.n}</span>}
            {b.format === "fisico" && <span className="chip">físico</span>}
          </span>
        </span>
      </button>

      {/* à direita: o número que importa para este livro */}
      <span className="hidden sm:flex items-center gap-2 shrink-0 text-right">
        {feito ? null : b.status === "aguardando" ? (
          <span className="text-xs text-muted tabular-nums w-16" title="Tempo de leitura no seu ritmo">{b.word_count ? `≈ ${fmtDuration((b.word_count / ppm) * 60)}` : ""}</span>
        ) : (
          <>
            {dom !== null && <span className="text-[11px] text-muted tabular-nums leading-tight" title="Domínio: roteiro de Adler, marcas e recordações">domínio<br /><b className="text-ink font-medium text-xs">{Math.round(dom * 100)}%</b></span>}
            <Anel valor={p} cor={cor} tamanho={38} titulo={falta ? `faltam ≈ ${fmtDuration((falta / ppm) * 60)}` : undefined}>
              <span className="text-[10.5px] font-medium tabular-nums">{Math.round(p * 100)}%</span>
            </Anel>
          </>
        )}
      </span>
      <span className="hidden md:block"><StatusPill label="Status do livro" value={b.status} options={OPCOES_LIVRO} onChange={(st) => void atualizar(b, { status: st })} /></span>
      <button onClick={() => ler(b)} className="btn btn-ghost px-2 py-1.5 shrink-0" title={b.format === "fisico" ? "Ler (liga o Timer)" : b.status === "lendo" ? "Continuar no leitor" : "Abrir no leitor"} aria-label="Ler">
        {b.status === "lendo" ? <Play size={15} /> : <BookOpen size={15} />}
      </button>
      <RowMenu items={[
        { label: "Ficha do livro", icon: FileText, onClick: () => abrir({ tipo: "ficha", id: b.id }) },
        { label: "Editar título, autor, pasta e capa", icon: Pencil, onClick: () => abrir({ tipo: "editar", id: b.id }) },
        ...(!onde ? [{ label: "Pôr numa mesa do plano", icon: Rows3, onClick: () => abrir({ tipo: "na-mesa", id: b.id }) }] : []),
        ...menu,
        { label: "Apagar livro", icon: Trash2, danger: true, separar: true,
          onClick: async () => { if (confirm(`Apagar “${b.title}” e as anotações dele?`)) { await deleteBook(b); void recarregar(); } } },
      ]} />
    </div>
  );
}
