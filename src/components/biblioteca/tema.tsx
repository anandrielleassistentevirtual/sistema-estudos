"use client";
/** Um tema da leitura sintópica: o nome do assunto e os livros que conversam sobre ele. */
import { useState } from "react";
import { semAcento } from "@/lib/text";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Book } from "@/lib/types";
import { useBiblioteca } from "./dados";
import { Janela } from "./janelas";

/** `tema` sozinho: editar um tema que existe. Com `ids`: um tema novo já com nome e livros sugeridos. */
export function TemaJanela({ tema, ids, onClose }: { tema?: string; ids?: string[]; onClose: () => void }) {
  const d = useBiblioteca();
  const editando = !!tema && !ids;
  const [nome, setNome] = useState(tema ?? "");
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(ids ?? d.livros.filter((b) => editando && b.tema === tema).map((b) => b.id)));
  const [q, setQ] = useState("");
  const [salvando, setSalvando] = useState(false);
  const lista = d.livros
    .filter((b) => semAcento(`${b.title} ${b.author ?? ""}`).includes(semAcento(q)))
    .sort((a, b) => Number(marcados.has(b.id)) - Number(marcados.has(a.id)) || a.title.localeCompare(b.title, "pt-BR"));

  async function salvar() {
    const n = nome.trim();
    if (!n) return;
    setSalvando(true);
    const sb = supabase();
    const muda: [Book, string | null][] = [];
    for (const b of d.livros) {
      const quer = marcados.has(b.id) ? n : editando && b.tema === tema ? null : b.tema ?? null;
      if ((b.tema ?? null) !== quer) muda.push([b, quer]);
    }
    await Promise.all(muda.map(([b, t]) => sb.from("books").update({ tema: t }).eq("id", b.id)));
    const porId = new Map(muda.map(([b, t]) => [b.id, t]));
    d.setLivros((all) => all.map((x) => (porId.has(x.id) ? { ...x, tema: porId.get(x.id) ?? null } : x)));
    onClose();
  }

  return (
    <Janela titulo={editando ? "Editar tema" : "Novo tema"} onClose={onClose}
      sub="A leitura sintópica põe vários autores para conversar sobre um mesmo assunto. Marque os livros da bibliografia.">
      <label className="block space-y-1"><span className="label">Assunto</span>
        <input autoFocus className="input" value={nome} placeholder="ex.: a felicidade; a imaginação; o método de estudo" onChange={(e) => setNome(e.target.value)} />
      </label>
      <label className="input flex items-center gap-2 py-1.5">
        <Search size={15} className="text-faint shrink-0" />
        <input className="bg-transparent outline-none flex-1 min-w-0" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar livro" />
      </label>
      <div className="max-h-72 overflow-y-auto -mx-2">
        {lista.map((b) => (
          <label key={b.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-2 cursor-pointer">
            <input type="checkbox" checked={marcados.has(b.id)} onChange={(e) => setMarcados((s) => { const x = new Set(s); if (e.target.checked) x.add(b.id); else x.delete(b.id); return x; })} />
            <span className="min-w-0 flex-1"><span className="block text-sm truncate">{b.title}</span><span className="block text-xs text-muted truncate">{b.author}</span></span>
            {b.tema && (!editando || b.tema !== tema) && <span className="chip shrink-0" title="Hoje está neste tema">{b.tema}</span>}
          </label>
        ))}
      </div>
      <div className="flex justify-between items-center gap-2">
        <span className="text-xs text-muted">{marcados.size} {marcados.size === 1 ? "livro" : "livros"} · cada livro fica num tema só</span>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!nome.trim() || salvando} onClick={() => void salvar()}>Salvar</button>
        </div>
      </div>
    </Janela>
  );
}
