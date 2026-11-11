"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Download, Search, X } from "lucide-react";
import { Empty, Page } from "@/components/page";
import { NotasTabs } from "@/components/notas-tabs";
import { supabase } from "@/lib/supabase/client";
import { todas } from "@/lib/supabase/todas";
import { porTitulo } from "@/lib/estudos";

const Markdown = dynamic(() => import("@/components/markdown"), { ssr: false, loading: () => <p className="text-sm text-faint">…</p> });

interface Anotacao {
  id: string; title: string; course: string; folder: string; professor: string;
  anotacoes: string; anotacoes_em: string | null; situacao?: string;
}
type Vista = "curso" | "recentes";

const dobrar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "");

/** Todas as anotações das aulas (Estudos), num lugar só: por curso › módulo ou pelas mais recentes. */
export default function AnotacoesDasAulas() {
  const [itens, setItens] = useState<Anotacao[] | null>(null);
  const [vista, setVista] = useState<Vista>("curso");
  const [q, setQ] = useState("");
  const [abertas, setAbertas] = useState<Set<string>>(new Set());

  useEffect(() => {
    try { const v = localStorage.getItem("notas-aulas-vista"); if (v === "recentes" || v === "curso") setVista(v); } catch {}
    void todas<Anotacao>((de, ate) => supabase().from("notes").select("id,title,course,folder,professor,anotacoes,anotacoes_em,situacao")
      .eq("kind", "estudo").neq("anotacoes", "").order("id").range(de, ate))
      .then((data) => setItens(data.filter((x) => (x.anotacoes ?? "").trim()))).catch(() => setItens([]));
  }, []);
  useEffect(() => { try { localStorage.setItem("notas-aulas-vista", vista); } catch {} }, [vista]);

  const filtradas = useMemo(() => {
    const termos = dobrar(q).split(/\s+/).filter(Boolean);
    return (itens ?? []).filter((a) => {
      const t = dobrar(`${a.title} ${a.course} ${a.folder} ${a.professor} ${a.anotacoes}`);
      return termos.every((w) => t.includes(w));
    });
  }, [itens, q]);

  const grupos = useMemo(() => {
    if (vista === "recentes") {
      return [["", [...filtradas].sort((a, b) => (b.anotacoes_em ?? "").localeCompare(a.anotacoes_em ?? ""))] as [string, Anotacao[]]];
    }
    const g = new Map<string, Anotacao[]>();
    for (const a of filtradas) {
      const k = [a.course || "Sem curso", a.folder].filter(Boolean).join(" › ");
      g.set(k, [...(g.get(k) ?? []), a]);
    }
    return [...g.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true })).map(([k, l]) => [k, l.sort(porTitulo)] as [string, Anotacao[]]);
  }, [filtradas, vista]);

  function baixarTudo() {
    const linhas: string[] = ["# Anotações das aulas", ""];
    for (const [g, lista] of grupos) {
      if (g) linhas.push(`## ${g}`, "");
      for (const a of lista) {
        linhas.push(`### ${a.title}`, `*${[vista === "recentes" ? [a.course, a.folder].filter(Boolean).join(" › ") : "", a.professor, quando(a.anotacoes_em)].filter(Boolean).join(" · ")}*`, "", a.anotacoes.trim(), "");
      }
    }
    const el = document.createElement("a");
    el.href = URL.createObjectURL(new Blob([linhas.join("\n")], { type: "text/markdown;charset=utf-8" }));
    el.download = `anotacoes-das-aulas-${new Date().toISOString().slice(0, 10)}.md`;
    el.click();
    setTimeout(() => URL.revokeObjectURL(el.href), 5000);
  }

  const total = itens?.length ?? 0;
  return (
    <Page tabs={<NotasTabs />} title="Anotações das aulas"
      subtitle={total ? `${total} ${total === 1 ? "aula anotada" : "aulas anotadas"}. Você escreve as anotações ao lado da aula, em Estudos.` : "As anotações que você faz ao lado das aulas, em Estudos, aparecem aqui."}
      actions={total ? <button className="btn" onClick={baixarTudo}><Download size={15} /> Baixar (.md)</button> : undefined}>
      {total > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <label className="input flex items-center gap-2 py-1.5 flex-1 min-w-[220px]">
            <Search size={15} className="text-faint shrink-0" />
            <input className="bg-transparent outline-none flex-1 min-w-0" placeholder="Buscar nas anotações, aulas e cursos" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button onClick={() => setQ("")} className="text-faint hover:text-ink"><X size={14} /></button>}
          </label>
          <div className="inline-flex rounded-lg bg-surface-2 p-1 text-sm">
            {([["curso", "Por curso"], ["recentes", "Mais recentes"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setVista(k)} className={`px-3 py-1 rounded-md ${vista === k ? "bg-seg shadow-sm" : "text-muted"}`}>{l}</button>
            ))}
          </div>
        </div>
      )}

      {itens && total === 0 && (
        <Empty>
          Nenhuma anotação ainda. Abra uma aula em <Link href="/estudos" className="underline">Estudos</Link>, toque no caderno (canto superior direito) e escreva.
          Selecionando um trecho da aula, você pode levá-lo para as anotações como citação.
        </Empty>
      )}
      {total > 0 && !filtradas.length && <p className="text-sm text-muted">Nada encontrado para “{q}”.</p>}

      <div className="space-y-8">
        {grupos.map(([g, lista]) => (
          <section key={g || "recentes"}>
            {g && <h2 className="text-sm text-muted mb-3">{g}</h2>}
            <div className="space-y-3">
              {lista.map((a) => {
                const longa = a.anotacoes.length > 900 && !abertas.has(a.id);
                return (
                  <article key={a.id} className="card p-5">
                    <header className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <Link href={`/estudos/${a.id}?anotacoes=1`} className="font-medium hover:underline">{a.title}</Link>
                        <div className="text-xs text-muted mt-0.5">
                          {[vista === "recentes" ? [a.course, a.folder].filter(Boolean).join(" › ") : "", a.professor, a.anotacoes_em ? `anotado em ${quando(a.anotacoes_em)}` : ""].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <Link href={`/estudos/${a.id}?anotacoes=1`} className="btn btn-ghost text-xs py-1 shrink-0" title="Abrir a aula com as anotações ao lado">
                        <BookOpen size={14} /> Abrir a aula
                      </Link>
                    </header>
                    <div className={`prose-notes text-[15px] relative ${longa ? "max-h-72 overflow-hidden" : ""}`}>
                      <Markdown>{a.anotacoes}</Markdown>
                      {longa && <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface to-transparent" />}
                    </div>
                    {a.anotacoes.length > 900 && (
                      <button className="mt-2 text-xs text-muted hover:text-ink" onClick={() => setAbertas((s) => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })}>
                        {abertas.has(a.id) ? "Mostrar menos" : "Mostrar tudo"}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}
