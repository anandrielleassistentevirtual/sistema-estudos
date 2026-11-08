"use client";
import Link from "next/link";
import { useState } from "react";
import { Atom, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { COLUNAS, locationLabel } from "@/lib/zettel";
import { bookName } from "@/lib/folders";
import type { Book, Note, NoteStatus } from "@/lib/types";

export type BookLite = Pick<Book, "id" | "title" | "author" | "format" | "folder_id">;

/** Editar/criar nota literária: livro, página, trecho, "com as suas palavras" e status do kanban. */
export function LiteraryModal({ note, books, onClose, onSaved, fixedBookId }: {
  note: Note | null; books: BookLite[]; onClose: () => void; onSaved: () => void; fixedBookId?: string;
}) {
  const [bookId, setBookId] = useState(note?.book_id ?? fixedBookId ?? "");
  const [quote, setQuote] = useState(note?.quote ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [location, setLocation] = useState(note?.location && !note.location.startsWith("p:") && !note.location.startsWith("epubcfi") ? note.location : "");
  const [status, setSt] = useState<NoteStatus>(note?.status ?? "a_tratar");
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!quote.trim() && !content.trim()) return setErr("Escreva o trecho ou a sua anotação.");
    const title = (quote.trim() || content.trim()).slice(0, 70) + ((quote.trim() || content.trim()).length > 70 ? "…" : "");
    const keepLoc = note?.location && (note.location.startsWith("p:") || note.location.startsWith("epubcfi")) ? note.location : location.trim();
    const row = {
      title, quote: quote.trim(), content: content.trim(), book_id: bookId || null, location: keepLoc,
      status, concluded_at: status === "concluida" ? note?.concluded_at ?? new Date().toISOString() : null,
    };
    const sb = supabase();
    const { error } = note
      ? await sb.from("notes").update(row).eq("id", note.id)
      : await sb.from("notes").insert({ ...row, kind: "literaria" });
    if (error) return setErr(error.message);
    onSaved();
  }

  async function remove() {
    if (!note || !confirm("Apagar esta nota literária?")) return;
    await supabase().from("notes").delete().eq("id", note.id);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="card w-full max-w-xl p-5 space-y-3 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold">{note ? "Nota literária" : "Nova nota literária"}</h2>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="grid grid-cols-[1fr_140px] gap-3">
          <label className="space-y-1"><span className="label">Livro</span>
            <select className="input" value={bookId} onChange={(e) => setBookId(e.target.value)} disabled={!!fixedBookId}>
              <option value="">— escolha o livro —</option>
              {books.map((b) => <option key={b.id} value={b.id}>{b.format === "fisico" ? "📖 " : ""}{bookName(b)}</option>)}
            </select>
          </label>
          <label className="space-y-1"><span className="label">Página</span>
            <input className="input" value={note?.location?.startsWith("p:") || note?.location?.startsWith("epubcfi") ? locationLabel(note.location) : location}
              disabled={!!(note?.location?.startsWith("p:") || note?.location?.startsWith("epubcfi"))}
              placeholder="ex.: p. 42" onChange={(e) => setLocation(e.target.value)} />
          </label>
        </div>
        <label className="block space-y-1"><span className="label">Trecho do livro</span>
          <textarea className="input min-h-[90px] font-serif" value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="A passagem que chamou sua atenção" />
        </label>
        <label className="block space-y-1"><span className="label">Com as suas palavras</span>
          <textarea className="input min-h-[120px]" value={content} onChange={(e) => setContent(e.target.value)}
            placeholder="O que o autor diz aqui? Reescreva com as suas palavras — é isso que transforma o destaque em nota literária." />
        </label>
        <div>
          <span className="label">Status</span>
          <div className="grid grid-cols-3 gap-1.5 mt-1">
            {COLUNAS.map((c) => (
              <button type="button" key={c.id} onClick={() => setSt(c.id)}
                className={`btn justify-center text-xs ${status === c.id ? "border-accent ring-2 ring-accent-soft" : ""}`}>{c.label}</button>
            ))}
          </div>
        </div>
        {err && <p className="text-sm text-critical">{err}</p>}
        <div className="flex justify-between gap-2 pt-1">
          {note ? <button type="button" className="btn btn-ghost hover:text-critical" onClick={remove}><Trash2 size={14} /> Apagar</button> : <span />}
          <div className="flex gap-2">
            {note?.status === "concluida" && <Link className="btn" href={`/notas/atomicas?de=${note.id}`}><Atom size={14} /> Nota atômica</Link>}
            <button type="button" className="btn" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary">Salvar</button>
          </div>
        </div>
      </form>
    </div>
  );
}
