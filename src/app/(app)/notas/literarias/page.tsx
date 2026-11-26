"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Atom, ChevronDown, ChevronRight, Download, Folder, FolderOpen, Inbox, Pencil, Plus, Undo2 } from "lucide-react";
import { Empty, Page } from "@/components/page";
import { NotasTabs } from "@/components/notas-tabs";
import { LiteraryModal, type BookLite } from "@/components/literary-modal";
import { HL_COLORS } from "@/components/reader/types";
import { supabase } from "@/lib/supabase/client";
import { baixarArquivo } from "@/lib/baixar";
import { todas } from "@/lib/supabase/todas";
import { bookName, cddCompare, folderLabel } from "@/lib/folders";
import { locationLabel, setStatus } from "@/lib/zettel";
import type { Folder as F, Note } from "@/lib/types";

/** Ordem de leitura: página do leitor, depois "p. 42" escrito à mão, depois data. */
function locKey(n: Note): number {
  const loc = n.location ?? "";
  const r = loc.match(/^p:(\d+)$/);
  if (r) return Number(r[1]) + 1;
  const m = loc.match(/(\d+)/);
  return m ? Number(m[1]) : 1e9;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
/** "000 Generalidades": o código e o nome, sem o travessão (como na árvore). */
const rotuloPasta = (f: F) => (f.code ? `${f.code} ${f.name}` : f.name);

/**
 * Notas literárias por livro. As pastas são as MESMAS da Biblioteca (mesma tabela),
 * então toda pasta criada lá aparece aqui. Cada livro reúne todas as suas anotações concluídas.
 */
export default function Literarias() {
  const [folders, setFolders] = useState<F[]>([]);
  const [books, setBooks] = useState<BookLite[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [atomics, setAtomics] = useState<Pick<Note, "id" | "title" | "source_id" | "zid">[]>([]);
  const [sel, setSel] = useState<string | "todos" | "sem-pasta">("todos");
  const [bookId, setBookId] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Note | "nova" | null>(null);
  const [pronto, setPronto] = useState(false);
  // no celular a árvore fica recolhida atrás do seletor "Pasta:" (a lista aparece na primeira tela)
  const [indiceNoCelular, setIndiceNoCelular] = useState(false);
  // os livros ainda sem anotação ficam num grupo recolhido, abaixo dos anotados
  const [verSemAnotacao, setVerSemAnotacao] = useState(false);
  // a lista vem sem o texto (campo pesado); o texto de cada livro é baixado quando o livro é aberto
  const [comConteudo, setComConteudo] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const sb = supabase();
    const [f, b, n, a] = await Promise.all([
      sb.from("folders").select("*"),
      todas<BookLite>((de, ate) => sb.from("books").select("id,title,author,format,folder_id").order("author").order("title").order("id").range(de, ate)),
      todas<Note>((de, ate) => sb.from("notes").select("id,kind,title,status,book_id,location,quote,created_at,concluded_at,source_id,zid").eq("kind", "literaria").order("id").range(de, ate)),
      todas<(typeof atomics)[number]>((de, ate) => sb.from("notes").select("id,title,source_id,zid").eq("kind", "atomica").not("source_id", "is", null).order("id").range(de, ate)),
    ]);
    setFolders(((f.data as F[]) ?? []).sort(cddCompare));
    setBooks(b);
    setNotes(n.map((x) => ({ ...x, content: "" })));
    setComConteudo(new Set());
    setAtomics(a);
    setPronto(true);
  }, []);
  useEffect(() => {
    void load();
    const l = new URLSearchParams(window.location.search).get("livro");
    if (l) setBookId(l);
  }, [load]);

  useEffect(() => {
    const url = bookId ? `?livro=${bookId}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [bookId]);

  // ao abrir um livro, baixa o texto só das anotações dele e junta na lista (para exibir, editar e exportar)
  useEffect(() => {
    if (!bookId || comConteudo.has(bookId)) return;
    let vivo = true;
    void supabase().from("notes").select("id,content").eq("kind", "literaria").eq("book_id", bookId).then(({ data }) => {
      if (!vivo || !data) return;
      const texto = new Map((data as { id: string; content: string }[]).map((x) => [x.id, x.content ?? ""]));
      setNotes((all) => all.map((n) => (texto.has(n.id) ? { ...n, content: texto.get(n.id)! } : n)));
      setComConteudo((s) => new Set(s).add(bookId));
    });
    return () => { vivo = false; };
  }, [bookId, comConteudo]);

  const children = useMemo(() => {
    const m = new Map<string | null, F[]>();
    for (const f of folders) m.set(f.parent_id, [...(m.get(f.parent_id) ?? []), f]);
    for (const list of m.values()) list.sort(cddCompare);
    return m;
  }, [folders]);

  const descendants = useCallback((id: string) => {
    const out = new Set([id]);
    const walk = (x: string) => (children.get(x) ?? []).forEach((c) => { out.add(c.id); walk(c.id); });
    walk(id);
    return out;
  }, [children]);

  const done = useMemo(() => notes.filter((n) => n.status === "concluida"), [notes]);
  const doneByBook = useMemo(() => {
    const m = new Map<string, Note[]>();
    for (const n of done) if (n.book_id) m.set(n.book_id, [...(m.get(n.book_id) ?? []), n]);
    for (const list of m.values()) list.sort((a, b) => locKey(a) - locKey(b) || a.created_at.localeCompare(b.created_at));
    return m;
  }, [done]);
  const pendingByBook = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) if (n.status !== "concluida" && n.book_id) m.set(n.book_id, (m.get(n.book_id) ?? 0) + 1);
    return m;
  }, [notes]);

  const countIn = useCallback((fid: string) => {
    const ids = descendants(fid);
    return books.filter((b) => b.folder_id && ids.has(b.folder_id)).reduce((a, b) => a + (doneByBook.get(b.id)?.length ?? 0), 0);
  }, [books, descendants, doneByBook]);

  const shelf = useMemo(() => {
    const list = sel === "todos" ? books : sel === "sem-pasta" ? books.filter((b) => !b.folder_id)
      : books.filter((b) => b.folder_id && descendants(sel).has(b.folder_id));
    return [...list].sort((a, b) => (doneByBook.get(b.id)?.length ?? 0) - (doneByBook.get(a.id)?.length ?? 0) || bookName(a).localeCompare(bookName(b), "pt-BR"));
  }, [books, sel, descendants, doneByBook]);
  // primeiro os livros com anotações; os outros vão para o grupo recolhido
  const anotados = shelf.filter((b) => doneByBook.has(b.id));
  const semAnotacao = shelf.filter((b) => !doneByBook.has(b.id));
  const pendentes = useMemo(() => [...pendingByBook.values()].reduce((a, b) => a + b, 0), [pendingByBook]);

  const book = bookId ? books.find((b) => b.id === bookId) : undefined;
  const bookNotes = bookId ? doneByBook.get(bookId) ?? [] : [];
  const folderOf = (fid: string | null) => (fid ? folders.find((f) => f.id === fid) : undefined);
  const pastaSel = sel !== "todos" && sel !== "sem-pasta" ? folderOf(sel) : undefined;
  // quantas anotações concluídas há onde se está (o mesmo número da árvore)
  const contaSel = sel === "todos" ? done.length : pastaSel ? countIn(pastaSel.id) : 0;

  // escolher uma pasta também recolhe a árvore no celular
  function escolher(k: string) {
    setSel(k);
    setBookId(null);
    setIndiceNoCelular(false);
  }

  function exportMd() {
    if (!book) return;
    const f = folderOf(book.folder_id);
    const md = [
      `# ${bookName(book)}`, "", f ? `Pasta: ${folderLabel(f)}` : "", "",
      ...bookNotes.flatMap((n) => [
        `## ${locationLabel(n.location) || "Anotação"}`, "",
        n.quote ? `> ${n.quote.replace(/\n/g, "\n> ")}` : "", "",
        n.content, "",
      ]),
    ].join("\n");
    const nome = `${bookName(book).replace(/[\\/:*?"<>|]/g, "-")} - notas.md`;
    baixarArquivo(new File([md], nome, { type: "text/markdown" }), nome);
  }

  function Tree({ parent, depth }: { parent: string | null; depth: number }) {
    return (
      <>
        {(children.get(parent) ?? []).map((f) => {
          const kids = children.get(f.id)?.length ?? 0;
          const n = countIn(f.id);
          return (
            <div key={f.id}>
              <div onClick={() => { escolher(f.id); if (kids) setOpen((o) => new Set(o).add(f.id)); }}
                className={`flex items-center gap-1 rounded-md pr-1 text-sm cursor-pointer ${sel === f.id && !bookId ? "bg-accent-soft font-medium" : "hover:bg-surface-2"}`}
                style={{ paddingLeft: 4 + depth * 14 }}>
                <button className={`p-0.5 text-faint ${kids ? "" : "invisible"}`} aria-label={open.has(f.id) ? "Recolher" : "Expandir"}
                  onClick={(e) => { e.stopPropagation(); setOpen((o) => { const x = new Set(o); if (x.has(f.id)) x.delete(f.id); else x.add(f.id); return x; }); }}>
                  {open.has(f.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {sel === f.id ? <FolderOpen size={15} className="text-icon" /> : <Folder size={15} className="text-muted" />}
                <span className="truncate flex-1 py-2.5 lg:py-1.5" title={folderLabel(f)}>
                  {f.code && <span className={`font-mono text-xs mr-1.5 ${depth === 0 ? "font-medium text-ink" : "text-muted"}`}>{f.code}</span>}
                  <span className={depth === 0 ? "font-medium" : ""}>{f.name}</span>
                </span>
                {n > 0 && <span className="text-xs text-faint tabular-nums" title="anotações concluídas">{n}</span>}
              </div>
              {open.has(f.id) && <Tree parent={f.id} depth={depth + 1} />}
            </div>
          );
        })}
      </>
    );
  }

  /** A linha do livro: título em cima; autor e pasta embaixo (sempre duas linhas, na ordem da LivroLinha). */
  function linha(b: BookLite) {
    const n = doneByBook.get(b.id)?.length ?? 0;
    const p = pendingByBook.get(b.id) ?? 0;
    const f = folderOf(b.folder_id);
    return (
      <button key={b.id} onClick={() => setBookId(b.id)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-sel/50 transition-colors ${n ? "" : "opacity-60"}`}>
        <span className="min-w-0 flex-1">
          <span className="font-medium leading-snug line-clamp-2 sm:line-clamp-1 break-words" title={b.title}>{b.title}</span>
          <span className="mt-1 flex items-center gap-x-1.5 text-xs text-muted min-w-0">
            {/* o autor vem antes e corta por último (até 55% da linha); a pasta ocupa o resto */}
            {b.author && <><span className="truncate shrink-0 max-w-[min(14rem,55%)]" title={b.author}>{b.author}</span><span className="text-faint shrink-0">·</span></>}
            {f ? (
              <span className="truncate min-w-0" title={folderLabel(f)}>{f.code && <span className="font-mono text-[11px] text-faint">{f.code}</span>} {f.name}</span>
            ) : <span className="truncate">Sem pasta</span>}
          </span>
        </span>
        {p > 0 && <span className="inline-flex items-center gap-1 text-[11px] text-muted shrink-0" title={`${p} na Inbox`}><Inbox size={12} /> {p}</span>}
        {n > 0 && <span className="text-xs text-muted shrink-0 text-right"><b className="tabular-nums font-medium text-ink">{n}</b> {n === 1 ? "anotação" : "anotações"}</span>}
      </button>
    );
  }

  return (
    <Page tabs={<NotasTabs />} title="Notas"
      subtitle={pronto ? `${plural(done.length, "anotação", "anotações")} em ${doneByBook.size} de ${plural(books.length, "livro", "livros")}${pendentes ? ` · ${pendentes} na Inbox` : ""}` : undefined}
      ajuda="Notas literárias organizadas nas mesmas pastas da Biblioteca: cada livro reúne todas as suas anotações concluídas. Para criar pastas, use a Biblioteca; elas aparecem aqui sozinhas.">
      {/* índice à esquerda a partir de lg; antes disso a árvore abre pelo seletor "Pasta:", como na Estante */}
      <div className="grade-indice">
        <button type="button" className="lg:hidden card flex items-center gap-2 px-3 py-2.5 text-sm text-left" aria-expanded={indiceNoCelular} onClick={() => setIndiceNoCelular((v) => !v)}>
          <Folder size={16} className="text-muted shrink-0" />
          <span className="text-muted shrink-0">Pasta:</span>
          <span className="font-medium truncate flex-1">
            {sel === "todos" ? "Todos os livros" : sel === "sem-pasta" ? "Sem pasta" : pastaSel ? <>{pastaSel.code && <span className="font-mono text-xs mr-1.5">{pastaSel.code}</span>}{pastaSel.name}</> : "—"}
          </span>
          {contaSel > 0 && <span className="text-xs text-faint tabular-nums shrink-0" title="anotações concluídas">{contaSel}</span>}
          <ChevronDown size={16} className={`text-faint shrink-0 transition-transform ${indiceNoCelular ? "rotate-180" : ""}`} />
        </button>
        <aside className={`card p-2 h-fit lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto ${indiceNoCelular ? "" : "hidden lg:block"}`}>
          {(["todos", "sem-pasta"] as const).map((k) => (
            <div key={k} onClick={() => escolher(k)}
              className={`flex items-center justify-between rounded-md px-2 py-2.5 lg:py-1.5 text-sm cursor-pointer ${sel === k && !bookId ? "bg-accent-soft font-medium" : "hover:bg-surface-2"}`}>
              <span>{k === "todos" ? "Todos os livros" : "Sem pasta"}</span>
              {/* a mesma regra das pastas: o contador só aparece quando há o que contar */}
              {k === "todos" && done.length > 0 && <span className="text-xs text-faint tabular-nums" title="anotações concluídas">{done.length}</span>}
            </div>
          ))}
          <div className="border-t border-line my-2" />
          <Tree parent={null} depth={0} />
          {pronto && folders.length === 0 && <p className="text-xs text-muted px-2 py-2">Para criar pastas, use a Biblioteca: elas aparecem aqui sozinhas.</p>}
        </aside>

        <div className="min-w-0">
          {!book ? (
            !pronto ? null : shelf.length === 0 ? (
              <Empty>Nenhum livro nesta pasta.</Empty>
            ) : (
              <>
                {anotados.length > 0 ? (
                  <div className="card divide-y divide-line">{anotados.map(linha)}</div>
                ) : (
                  <Empty>
                    {sel === "todos" ? "Nenhuma anotação concluída ainda." : "Nenhuma anotação concluída nesta pasta."} Conclua notas na Inbox e elas aparecem aqui, no livro.
                  </Empty>
                )}
                {/* os livros sem anotação continuam a um toque: dali se abre o livro para usar + Anotação */}
                {semAnotacao.length > 0 && (
                  <div className="mt-3">
                    <button type="button" className="btn btn-ghost text-sm text-muted" aria-expanded={verSemAnotacao} onClick={() => setVerSemAnotacao((v) => !v)}>
                      <ChevronRight size={15} className={`transition-transform ${verSemAnotacao ? "rotate-90" : ""}`} />
                      {plural(semAnotacao.length, "livro", "livros")} ainda sem anotações
                    </button>
                    {verSemAnotacao && <div className="card divide-y divide-line mt-2">{semAnotacao.map(linha)}</div>}
                  </div>
                )}
              </>
            )
          ) : (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <button className="text-sm text-muted hover:text-ink mb-1" onClick={() => setBookId(null)}>← voltar</button>
                  <h2 className="text-xl">
                    {book.author && <span className="font-medium">{book.author} — </span>}
                    <span>{book.title}</span>
                  </h2>
                  <p className="text-sm text-muted">
                    {folderOf(book.folder_id) ? rotuloPasta(folderOf(book.folder_id)!) : "Sem pasta"} · {bookNotes.length} {bookNotes.length === 1 ? "anotação" : "anotações"}
                    {pendingByBook.get(book.id) ? ` · ${pendingByBook.get(book.id)} ainda na Inbox` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="btn" onClick={() => setEditing("nova")}><Plus size={15} /> Anotação</button>
                  <button className="btn" onClick={exportMd} disabled={!bookNotes.length}><Download size={15} /> Exportar .md</button>
                </div>
              </div>
              {bookNotes.length === 0 ? (
                <Empty>Nenhuma anotação concluída deste livro. Trate as notas na Inbox e conclua — elas aparecem aqui.</Empty>
              ) : (
                <div className="space-y-3">
                  {bookNotes.map((n) => {
                    const derived = atomics.filter((a) => a.source_id === n.id);
                    return (
                      <article key={n.id} className="card p-4 group">
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-xs text-faint">{locationLabel(n.location)}</span>
                          <span className="flex gap-1 opacity-60 group-hover:opacity-100">
                            <button className="btn btn-ghost px-1.5 py-1" title="Editar" onClick={() => setEditing(n)}><Pencil size={13} /></button>
                            <button className="btn btn-ghost px-1.5 py-1" title="Voltar para a Inbox"
                              onClick={async () => { await setStatus(n, "em_tratamento"); void load(); }}><Undo2 size={13} /></button>
                            <Link className="btn btn-ghost px-1.5 py-1" title="Criar nota atômica a partir desta" href={`/notas/atomicas?de=${n.id}`}><Atom size={13} /></Link>
                          </span>
                        </div>
                        {n.quote && <blockquote className="font-serif text-[1.02rem] leading-relaxed border-l-[3px] pl-3 my-2" style={{ borderColor: HL_COLORS.amarelo }}>“{n.quote}”</blockquote>}
                        {n.content && <p className="text-sm leading-relaxed whitespace-pre-wrap">{n.content}</p>}
                        {derived.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {derived.map((a) => (
                              <Link key={a.id} href={`/notas/atomicas?id=${a.id}`}
                                className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-xs hover:underline">
                                <Atom size={11} /> {a.title}
                              </Link>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {editing && (
        <LiteraryModal note={editing === "nova" ? null : editing} books={books} fixedBookId={editing === "nova" ? book?.id : undefined}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
      )}
    </Page>
  );
}
