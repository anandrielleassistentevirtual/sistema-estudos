"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookHeart, Check, Pencil, Search, Trash2, X } from "lucide-react";
import { Empty, Page } from "@/components/page";
import { NotasTabs } from "@/components/notas-tabs";
import { supabase } from "@/lib/supabase/client";
import { fmtDuration, parseDay } from "@/lib/dates";
import { FONTS } from "@/components/reader/types";

interface Registro {
  id: string; dia: string; referencia: string; palavra: string; oracao: string; proposito: string; segundos: number; created_at: string;
}

const serif = { fontFamily: FONTS.times.css };

/** Diário de oração: tudo o que foi guardado ao fim de cada Lectio Divina. */
export default function Diario() {
  const [regs, setRegs] = useState<Registro[] | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Registro | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase().from("lectio_registros").select("*").order("dia", { ascending: false }).order("created_at", { ascending: false });
    setRegs((data as Registro[]) ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const meses = useMemo(() => {
    const t = q.trim().toLowerCase();
    const lista = (regs ?? []).filter((r) => !t || [r.referencia, r.palavra, r.oracao, r.proposito].some((x) => x?.toLowerCase().includes(t)));
    const g = new Map<string, Registro[]>();
    for (const r of lista) {
      const k = r.dia.slice(0, 7);
      g.set(k, [...(g.get(k) ?? []), r]);
    }
    return [...g.entries()];
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
          <input className="bg-transparent outline-none flex-1" placeholder="Buscar palavra, oração, passagem…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      )}

      {regs && total === 0 && (
        <Empty>
          Ainda não há nada no diário. Ao terminar a <Link href="/lectio" className="underline">Lectio Divina</Link>, clique em
          “Guardar no diário” e a sua palavra, oração e propósito aparecem aqui.
        </Empty>
      )}
      {regs && total > 0 && meses.length === 0 && <p className="text-sm text-muted">Nada encontrado para “{q}”.</p>}

      <div className="space-y-8">
        {meses.map(([mes, lista]) => (
          <section key={mes}>
            <h2 className="text-sm text-muted mb-3 first-letter:uppercase">
              {parseDay(mes + "-01").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </h2>
            <ul className="space-y-3">
              {lista.map((r) => {
                const ed = editing?.id === r.id ? editing : null;
                return (
                  <li key={r.id} className="card p-5 group">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <span className="first-letter:uppercase inline-block">{parseDay(r.dia).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</span>
                        <span className="text-muted"> · {r.referencia}</span>
                      </div>
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
          </section>
        ))}
      </div>
    </Page>
  );
}
