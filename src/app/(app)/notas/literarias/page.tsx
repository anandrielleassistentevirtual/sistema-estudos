"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Atom, ChevronDown, ChevronRight, Download, Folder, FolderOpen, Inbox, Pencil, Plus, Undo2 } from "lucide-react";
import { Empty, Page } from "@/components/page";
import { NotasTabs } from "@/components/notas-tabs";
import { LiteraryModal, type BookLite } from "@/components/literary-modal";
import { supabase } from "@/lib/supabase/client";
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

/**
 * Notas literárias por livro. As pastas são as MESMAS do Mapa da Ignorância (mesma tabela),
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

  const load = useCallback(async () => {
    const sb = supabase();
    const [f, b, n, a] = await Promise.all([
      sb.from("folders").select("*"),
      todas<BookLite>((de, ate) => sb.from("books").select("id,title,author,format,folder_id").order("author").order("title").order("id").range(de, ate)),
      todas<Note>((de, ate) => sb.from("notes").select("*").eq("kind", "literaria").order("id").range(de, ate)),
      todas<(typeof atomics)[number]>((de, ate) => sb.from("notes").select("id,title,source_id,zid").eq("kind", "atomica").not("source_id", "is", null).order("id").range(de, ate)),
    ]);
    setFolders(((f.data as F[]) ?? []).sort(cddCompare));
    setBooks(b);
    setNotes(n);
    setAtomics(a);
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

  const book = bookId ? books.find((b) => b.id === bookId) : undefined;
  const bookNotes = bookId ? doneByBook.get(bookId) ?? [] : [];
  const folderOf = (fid: string | null) => (fid ? folders.find((f) => f.id === fid) : undefined);

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
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new File([md], `${bookName(book).replace(/[\\/:*?"<>|]/g, "-")} - notas.md`, { type: "text/markdown" }));
    a.download = `${bookName(book).replace(/[\\/:*?"<>|]/g, "-")} - notas.md`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 5000);
  }

  function Tree({ parent, depth }: { parent: string | null; depth: number }) {
    return (
      <>
        {(children.get(parent) ?? []).map((f) => {
          const kids = children.get(f.id)?.length ?? 0;
          const n = countIn(f.id);
          return (
            <div key={f.id}>
              <div onClick={() => { setSel(f.id); setBookId(null); if (kids) setOpen((o) => new Set(o).add(f.id)); }}
                className={`flex items-center gap-1 rounded-md pr-1 text-sm cursor-pointer ${sel === f.id && !bookId ? "bg-accent-soft font-medium" : "hover:bg-surface-2"}`}
                style={{ paddingLeft: 4 + depth * 14 }}>
                <button className={`p-0.5 text-faint ${kids ? "" : "invisible"}`}
                  onClick={(e) => { e.stopPropagation(); setOpen((o) => { const x = new Set(o); if (x.has(f.id)) x.delete(f.id); else x.add(f.id); return x; }); }}>
                  {open.has(f.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {sel === f.id ? <FolderOpen size={15} className="text-icon" /> : <Folder size={15} className="text-muted" />}
                <span className="truncate flex-1 py-1.5" title={folderLabel(f)}>
                  {f.code && <span className={`font-mono text-xs mr-1 ${depth === 0 ? "font-medium text-ink" : "text-muted"}`}>{f.code} –</span>}
                  <span className={depth === 0 ? "font-medium" : ""}>{f.name}</span>
                </span>
                {n > 0 && <span className="text-xs text-faint tabular-nums">{n}</span>}
              </div>
              {open.has(f.id) && <Tree parent={f.id} depth={depth + 1} />}
            </div>
          );
        })}
      </>
    );
  }

  return (
    <Page wide tabs={<NotasTabs />} title="Notas literárias"
      subtitle="Organizadas nas mesmas pastas do Mapa da Ignorância. Cada livro reúne todas as suas anotações concluídas.">
      <div className="grid md:grid-cols-[300px_1fr] gap-4">
        <aside className="card p-2 h-fit md:sticky md:top-4">
          {(["todos", "sem-pasta"] as const).map((k) => (
            <div key={k} onClick={() => { setSel(k); setBookId(null); }}
              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm cursor-pointer ${sel === k && !bookId ? "bg-accent-soft font-medium" : "hover:bg-surface-2"}`}>
              <span>{k === "todos" ? "Todos os livros" : "Sem pasta"}</span>
              <span className="text-xs text-faint">{k === "todos" ? done.length : ""}</span>
            </div>
          ))}
          <div className="border-t border-line my-2" />
          <Tree parent={null} depth={0} />
          <p className="text-[11px] text-faint px-2 pt-2">Para criar pastas, use o Mapa da Ignorância — elas aparecem aqui automaticamente.</p>
        </aside>

        <div className="min-w-0">
          {!book ? (
            shelf.length === 0 ? (
              <Empty>Nenhum livro nesta pasta.</Empty>
            ) : (
              <div className="card divide-y divide-line">
                {shelf.map((b) => {
                  const n = doneByBook.get(b.id)?.length ?? 0;
                  const p = pendingByBook.get(b.id) ?? 0;
                  const f = folderOf(b.folder_id);
                  return (
                    <button key={b.id} onClick={() => setBookId(b.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2 ${n ? "" : "opacity-60"}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          {b.author && <><span className="font-medium">{b.author}</span><span className="text-faint"> — </span></>}
                          <span className="font-medium">{b.title}</span>
                        </span>
                        {f && <span className="text-xs text-muted"><span className="font-mono">{f.code}</span> {f.name}</span>}
                      </span>
                      {p > 0 && <span className="inline-flex items-center gap-1 text-[11px] text-muted"><Inbox size={12} /> {p}</span>}
                      <span className={`text-xs tabular-nums ${n ? "font-medium text-accent" : "text-faint"}`}>{n ? `${n} ${n === 1 ? "anotação" : "anotações"}` : "sem anotações"}</span>
                    </button>
                  );
                })}
              </div>
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
                    {folderOf(book.folder_id) ? folderLabel(folderOf(book.folder_id)!) : "Sem pasta"} · {bookNotes.length} {bookNotes.length === 1 ? "anotação" : "anotações"}
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
                        {n.quote && <blockquote className="font-serif text-[1.02rem] leading-relaxed border-l-[3px] border-[#eda100] pl-3 my-2">“{n.quote}”</blockquote>}
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
