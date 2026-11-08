"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookHeart, Check, Pencil, Search, Trash2, X } from "lucide-react";
import { Empty, Page } from "@/components/page";
import { NotasTabs } from "@/components/notas-tabs";
import { supabase } from "@/lib/supabase/client";
import { fmtDuration, parseDay } from "@/lib/dates";
import { nomeLivro, ordemLivro, parseRef } from "@/lib/evangelho";
import { FONTS } from "@/components/reader/types";

interface Registro {
  id: string; dia: string; referencia: string; palavra: string; oracao: string; proposito: string; segundos: number; created_at: string;
}

const serif = { fontFamily: FONTS.times.css };

/** Diário de oração, organizado por Evangelho → capítulo → passagem (a liturgia repete os Evangelhos). */
export default function Diario() {
  const [regs, setRegs] = useState<Registro[] | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Registro | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase().from("lectio_registros").select("*").order("dia", { ascending: false }).order("created_at", { ascending: false });
    setRegs((data as Registro[]) ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  /** Evangelho → capítulo → passagem → orações (da mais recente para a mais antiga). */
  const livros = useMemo(() => {
    const t = q.trim().toLowerCase();
    const lista = (regs ?? []).filter((r) => !t || [r.referencia, r.palavra, r.oracao, r.proposito].some((x) => x?.toLowerCase().includes(t)));
    type Passagem = { ref: string; v1: number; regs: Registro[] };
    const porLivro = new Map<string, Map<number, Map<string, Passagem>>>();
    for (const r of lista) {
      const p = parseRef(r.referencia);
      const livro = p?.livro ?? "Outros";
      const cap = p?.cap ?? 0;
      const chave = r.referencia.replace(/\s+/g, "");
      const caps = porLivro.get(livro) ?? new Map();
      porLivro.set(livro, caps);
      const pass = caps.get(cap) ?? new Map();
      caps.set(cap, pass);
      const item = pass.get(chave) ?? { ref: r.referencia, v1: p?.v1 ?? 0, regs: [] };
      item.regs.push(r);
      pass.set(chave, item);
    }
    return [...porLivro.entries()]
      .sort((a, b) => ordemLivro(a[0]) - ordemLivro(b[0]))
      .map(([livro, caps]) => ({
        livro,
        total: [...caps.values()].reduce((n, ps) => n + [...ps.values()].reduce((m, x) => m + x.regs.length, 0), 0),
        caps: [...caps.entries()].sort((a, b) => a[0] - b[0]).map(([cap, ps]) => ({
          cap,
          passagens: [...ps.values()].sort((a, b) => a.v1 - b.v1),
        })),
      }));
  }, [regs, q]);

  async function salvar() {
    if (!editing) return;
    const { id, palavra, oracao, proposito } = editing;
    await supabase().from("lectio_registros").update({ palavra, oracao, proposito }).eq("id", id);
    setRegs((rs) => rs?.map((r) => (r.id === id ? { ...r, palavra, oracao, proposito } : r)) ?? null);
    setEditing(null);
  }

  async function apagar(r: Registro) {
    if (!confirm(`Apagar a anotação de ${parseDay(r.dia).toLocaleDateString("pt-BR")} (${r.referencia})?`)) return;
    await supabase().from("lectio_registros").delete().eq("id", r.id);
    setRegs((rs) => rs?.filter((x) => x.id !== r.id) ?? null);
  }

  const total = regs?.length ?? 0;
  const minutos = (regs ?? []).reduce((s, r) => s + r.segundos, 0);

  return (
    <Page
      tabs={<NotasTabs />}
      title="Diário"
      subtitle={total ? `${total} ${total === 1 ? "oração" : "orações"} · ${fmtDuration(minutos)} de Lectio Divina` : "O que você escreve na Lectio Divina fica guardado aqui."}
      actions={<Link href="/lectio" className="btn"><BookHeart size={15} /> Rezar a Lectio</Link>}
    >
      {total > 0 && (
        <label className="input flex items-center gap-2 mb-6 max-w-md">
          <Search size={15} className="text-faint shrink-0" />
          <input className="bg-transparent outline-none flex-1" placeholder="Buscar palavra, oração ou passagem (ex.: Lc 17)…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      )}

      {regs && total === 0 && (
        <Empty>
          Ainda não há nada no diário. Ao terminar a <Link href="/lectio" className="underline">Lectio Divina</Link>, clique em
          “Guardar no diário” e a sua palavra, oração e propósito aparecem aqui.
        </Empty>
      )}
      {regs && total > 0 && livros.length === 0 && <p className="text-sm text-muted">Nada encontrado para “{q}”.</p>}

      {livros.length > 1 && (
        <nav className="flex flex-wrap gap-2 mb-8 text-sm">
          {livros.map((l) => (
            <a key={l.livro} href={`#ev-${l.livro}`} className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink hover:bg-surface-2">
              {nomeLivro(l.livro)} <span className="text-faint">{l.total}</span>
            </a>
          ))}
        </nav>
      )}

      <div className="space-y-10">
        {livros.map((l) => (
          <section key={l.livro} id={`ev-${l.livro}`} className="scroll-mt-6">
            <h2 className="text-xl font-normal mb-4 flex items-baseline gap-2">
              {nomeLivro(l.livro)} <span className="text-sm text-faint">{l.total} {l.total === 1 ? "oração" : "orações"}</span>
            </h2>
            <div className="space-y-6">
              {l.caps.map(({ cap, passagens }) => (
                <div key={cap} className="pl-4 border-l border-line">
                  {cap > 0 && <h3 className="text-sm text-muted mb-3">Capítulo {cap}</h3>}
                  <div className="space-y-4">
                    {passagens.map((ps) => (
                      <div key={ps.ref}>
                        <div className="flex items-baseline gap-2 mb-2">
                          <span className="font-medium">{ps.ref}</span>
                          {ps.regs.length > 1 && <span className="text-xs text-faint">rezada {ps.regs.length} vezes</span>}
                        </div>
                        <ul className="space-y-3">
                          {ps.regs.map((r) => {
                            const ed = editing?.id === r.id ? editing : null;
                            return (
                              <li key={r.id} className="card p-5">
                                <div className="flex items-baseline justify-between gap-3 text-sm">
                                  <span className="first-letter:uppercase inline-block text-muted">
                                    {parseDay(r.dia).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                                  </span>
                                  <div className="flex items-center gap-1 shrink-0 text-faint">
                                    <span className="text-xs mr-1">{fmtDuration(r.segundos)}</span>
                                    {ed ? (
                                      <>
                                        <button className="p-1 hover:text-ink" title="Salvar" onClick={salvar}><Check size={15} /></button>
                                        <button className="p-1 hover:text-ink" title="Cancelar" onClick={() => setEditing(null)}><X size={15} /></button>
                                      </>
                                    ) : (
                                      <>
                                        <button className="p-1 hover:text-ink" title="Editar" onClick={() => setEditing(r)}><Pencil size={14} /></button>
                                        <button className="p-1 hover:text-critical" title="Apagar" onClick={() => apagar(r)}><Trash2 size={14} /></button>
                                      </>
                                    )}
                                  </div>
                                </div>
                                {ed ? (
                                  <div className="mt-4 space-y-3">
                                    <label className="block"><span className="label">Palavra que tocou</span>
                                      <input className="input mt-1" style={serif} value={ed.palavra} onChange={(e) => setEditing({ ...ed, palavra: e.target.value })} /></label>
                                    <label className="block"><span className="label">Oração</span>
                                      <textarea className="input mt-1 min-h-[140px] leading-relaxed" style={serif} value={ed.oracao} onChange={(e) => setEditing({ ...ed, oracao: e.target.value })} /></label>
                                    <label className="block"><span className="label">Propósito</span>
                                      <input className="input mt-1" value={ed.proposito} onChange={(e) => setEditing({ ...ed, proposito: e.target.value })} /></label>
                                  </div>
                                ) : (
                                  <div className="mt-3 space-y-2">
                                    {r.palavra && <p className="text-[1.15rem] italic" style={serif}>“{r.palavra}”</p>}
                                    {r.oracao && <p className="whitespace-pre-wrap leading-relaxed text-[1.02rem]" style={serif}>{r.oracao}</p>}
                                    {r.proposito && <p className="text-sm"><span className="text-muted">Propósito:</span> {r.proposito}</p>}
                                    {!r.palavra && !r.oracao && !r.proposito && <p className="text-sm text-faint">Oração em silêncio.</p>}
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}
