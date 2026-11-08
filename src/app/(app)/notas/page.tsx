"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Atom, Plus } from "lucide-react";
import { LiteraryModal } from "@/components/literary-modal";
import { Page } from "@/components/page";
import { NotasTabs } from "@/components/notas-tabs";
import { supabase } from "@/lib/supabase/client";
import { COLUNAS, locationLabel, setStatus } from "@/lib/zettel";
import { bookName } from "@/lib/folders";
import type { Note, NoteStatus } from "@/lib/types";

import type { BookLite } from "@/components/literary-modal";

/** Inbox do Zettelkasten: notas literárias em kanban (A tratar → Em tratamento → Concluída). */
export default function Inbox() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [books, setBooks] = useState<BookLite[]>([]);
  const [editing, setEditing] = useState<Note | "nova" | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<NoteStatus | null>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const week = new Date(Date.now() - 7 * 864e5).toISOString();
    const [n, b] = await Promise.all([
      sb.from("notes").select("*").eq("kind", "literaria")
        .or(`status.in.(a_tratar,em_tratamento),and(status.eq.concluida,concluded_at.gte.${week})`)
        .order("created_at", { ascending: true }),
      sb.from("books").select("id,title,author,format,folder_id").order("author").order("title"),
    ]);
    setNotes((n.data as Note[]) ?? []);
    setBooks((b.data as BookLite[]) ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const bookById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  async function move(n: Note, status: NoteStatus) {
    if (n.status === status) return;
    setNotes((all) => all.map((x) => (x.id === n.id ? { ...x, status, concluded_at: status === "concluida" ? new Date().toISOString() : null } : x)));
    await setStatus(n, status);
  }

  const order: NoteStatus[] = ["a_tratar", "em_tratamento", "concluida"];

  return (
    <Page
      wide
      tabs={<NotasTabs />}
      title="Inbox"
      subtitle="Notas literárias para tratar. Os destaques do leitor caem aqui sozinhos; ao concluir, a nota vai para as anotações do livro."
      actions={<button className="btn btn-primary" onClick={() => setEditing("nova")}><Plus size={15} /> Nova nota literária</button>}
    >
      <div className="grid md:grid-cols-3 gap-4 items-start">
        {COLUNAS.map((col) => {
          const list = notes.filter((n) => n.status === col.id);
          return (
            <section key={col.id}
              onDragOver={(e) => { e.preventDefault(); setOver(col.id); }}
              onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOver(null); const n = notes.find((x) => x.id === dragId); if (n) void move(n, col.id); }}
              className={`rounded-xl border p-3 min-h-[240px] transition-colors ${over === col.id ? "border-accent bg-accent-soft/40" : "border-line bg-surface-2/50"}`}>
              <header className="flex items-baseline justify-between mb-1 px-1">
                <h2 className="font-medium text-sm">{col.label}</h2>
                <span className="text-xs text-muted tabular-nums">{list.length}</span>
              </header>
              <p className="text-[11px] text-faint px-1 mb-3">{col.id === "concluida" ? "últimos 7 dias · " : ""}{col.hint}</p>
              <div className="space-y-2">
                {list.map((n) => {
                  const b = n.book_id ? bookById.get(n.book_id) : undefined;
                  const i = order.indexOf(col.id);
                  return (
                    <article key={n.id} draggable onDragStart={() => setDragId(n.id)} onDragEnd={() => setDragId(null)}
                      onClick={() => setEditing(n)}
                      className={`card p-3 cursor-pointer hover:border-faint transition-colors ${dragId === n.id ? "opacity-50" : ""}`}>
                      {b && <div className="text-[11px] text-muted truncate mb-1"><span className="font-medium">{b.author ?? ""}</span>{b.author ? " — " : ""}{b.title}</div>}
                      {n.quote ? (
                        <p className="text-sm font-serif leading-snug line-clamp-4 border-l-[3px] border-[#eda100] pl-2">“{n.quote}”</p>
                      ) : (
                        <p className="text-sm font-medium">{n.title}</p>
                      )}
                      {n.content && <p className="text-xs text-muted mt-1.5 line-clamp-2">{n.content}</p>}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[11px] text-faint">{locationLabel(n.location)}</span>
                        <span className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                          {i > 0 && <button className="p-1 text-faint hover:text-ink" title={`Voltar para “${COLUNAS[i - 1].label}”`} onClick={() => move(n, order[i - 1])}><ArrowLeft size={14} /></button>}
                          {i < 2 && <button className="p-1 text-faint hover:text-accent" title={`Mover para “${COLUNAS[i + 1].label}”`} onClick={() => move(n, order[i + 1])}><ArrowRight size={14} /></button>}
                          {col.id === "concluida" && (
                            <Link className="p-1 text-faint hover:text-accent" title="Criar nota atômica a partir desta" href={`/notas/atomicas?de=${n.id}`}><Atom size={14} /></Link>
                          )}
                        </span>
                      </div>
                    </article>
                  );
                })}
                {list.length === 0 && (
                  <p className="text-xs text-faint text-center py-6">
                    {col.id === "a_tratar" ? "Destaque trechos no leitor ou crie uma nota literária." : "Arraste cartões para cá."}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {editing && (
        <LiteraryModal note={editing === "nova" ? null : editing} books={books} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }} />
      )}
    </Page>
  );
}
