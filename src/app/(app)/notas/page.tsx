"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Atom, Plus } from "lucide-react";
import { LiteraryModal } from "@/components/literary-modal";
import { Page } from "@/components/page";
import { NotasTabs } from "@/components/notas-tabs";
import { HL_COLORS } from "@/components/reader/types";
import { supabase } from "@/lib/supabase/client";
import { todas } from "@/lib/supabase/todas";
import { COLUNAS, locationLabel, setStatus } from "@/lib/zettel";
import type { Note, NoteStatus } from "@/lib/types";

import type { BookLite } from "@/components/literary-modal";

/** Inbox do Zettelkasten: notas literárias em kanban (A tratar → Em tratamento → Concluída). */
export default function Inbox() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [books, setBooks] = useState<BookLite[]>([]);
  const [pronto, setPronto] = useState(false);
  const [editing, setEditing] = useState<Note | "nova" | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<NoteStatus | null>(null);
  // no celular aparece uma etapa por vez, escolhida no seletor
  const [colunaCel, setColunaCel] = useState<NoteStatus>("a_tratar");

  const load = useCallback(async () => {
    const sb = supabase();
    const week = new Date(Date.now() - 7 * 864e5).toISOString();
    const [n, b] = await Promise.all([
      todas<Note>((de, ate) => sb.from("notes").select("*").eq("kind", "literaria")
        .or(`status.in.(a_tratar,em_tratamento),and(status.eq.concluida,concluded_at.gte.${week})`)
        .order("created_at", { ascending: true }).order("id").range(de, ate)),
      todas<BookLite>((de, ate) => sb.from("books").select("id,title,author,format,folder_id").order("author").order("title").order("id").range(de, ate)),
    ]);
    setNotes(n);
    setBooks(b);
    setPronto(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const bookById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  // a consulta já traz só o recorte da Inbox (concluídas: últimos 7 dias)
  const porColuna = useMemo(() => new Map(COLUNAS.map((c) => [c.id, notes.filter((n) => n.status === c.id)])), [notes]);

  async function move(n: Note, status: NoteStatus) {
    if (n.status === status) return;
    setNotes((all) => all.map((x) => (x.id === n.id ? { ...x, status, concluded_at: status === "concluida" ? new Date().toISOString() : null } : x)));
    await setStatus(n, status);
  }

  const order: NoteStatus[] = ["a_tratar", "em_tratamento", "concluida"];

  return (
    <Page
      tabs={<NotasTabs />}
      title="Notas"
      // os números moram no cabeçalho de cada coluna (no celular, no seletor): a manchete só fala quando não há nada
      subtitle={pronto && notes.length === 0 ? "Nada a tratar. Os destaques do leitor caem aqui sozinhos." : undefined}
      ajuda="Notas literárias para tratar. Os destaques do leitor caem aqui sozinhos; ao concluir, a nota vai para as anotações do livro. Arraste os cartões entre as colunas ou use as setas."
      actions={<button className="btn btn-primary" onClick={() => setEditing("nova")}><Plus size={15} /> Nova nota literária</button>}
    >
      <div className="seg seg-md w-full md:hidden mb-3" role="group" aria-label="Etapa">
        {COLUNAS.map((col) => (
          <button key={col.id} type="button" className="flex-1" aria-pressed={colunaCel === col.id} onClick={() => setColunaCel(col.id)}>
            {col.label} <span className="tabular-nums">{porColuna.get(col.id)?.length ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 md:items-stretch">
        {COLUNAS.map((col) => {
          const list = porColuna.get(col.id) ?? [];
          const i = order.indexOf(col.id);
          return (
            <section key={col.id} aria-label={col.label}
              onDragOver={(e) => { e.preventDefault(); setOver(col.id); }}
              onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOver(null); const n = notes.find((x) => x.id === dragId); if (n) void move(n, col.id); }}
              className={`${col.id === colunaCel ? "flex" : "hidden md:flex"} flex-col rounded-xl border p-3 md:min-h-[200px] transition-colors ${over === col.id ? "border-accent bg-accent-soft/40" : "border-line bg-surface-2/50"}`}>
              {/* no celular o nome e o número já estão no seletor acima */}
              <header className="hidden md:flex items-baseline justify-between gap-3 px-1">
                <h2 className="card-title">{col.label}</h2>
                <span className="ind-valor">{list.length}</span>
              </header>
              <p className="text-xs text-faint px-1 mt-1 mb-3">{col.id === "concluida" ? "últimos 7 dias · " : ""}{col.hint}</p>
              {list.length === 0 ? (
                // a zona tracejada ocupa a coluna inteira: é ali que se solta o cartão
                <div className="flex-1 min-h-[120px] rounded-lg border border-dashed border-line grid place-items-center px-4 text-center text-xs text-faint">
                  {col.id === "a_tratar" ? "Destaque trechos no leitor ou crie uma nota literária." : "Arraste cartões para cá."}
                </div>
              ) : (
                <div className="space-y-2">
                  {list.map((n) => {
                    const b = n.book_id ? bookById.get(n.book_id) : undefined;
                    return (
                      <article key={n.id} draggable onDragStart={() => setDragId(n.id)} onDragEnd={() => setDragId(null)}
                        onClick={() => setEditing(n)}
                        className={`card p-3 cursor-pointer hover:border-faint transition-colors ${dragId === n.id ? "opacity-50" : ""}`}>
                        {b && <div className="text-[11px] text-muted truncate mb-1"><span className="font-medium">{b.author ?? ""}</span>{b.author ? " — " : ""}{b.title}</div>}
                        {n.quote ? (
                          <p className="text-sm font-serif leading-snug line-clamp-4 border-l-[3px] pl-2" style={{ borderColor: HL_COLORS.amarelo }}>“{n.quote}”</p>
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
                </div>
              )}
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
