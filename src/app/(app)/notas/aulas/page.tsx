"use client";
import Link from "next/link";
import { semAcento, slug } from "@/lib/text";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Download, GraduationCap, Search, X } from "lucide-react";
import { Empty, Page } from "@/components/page";
import { NotasTabs } from "@/components/notas-tabs";
import { supabase } from "@/lib/supabase/client";
import { baixarArquivo } from "@/lib/baixar";
import { todas } from "@/lib/supabase/todas";
import { porOrdem } from "@/lib/estudos";

const Markdown = dynamic(() => import("@/components/markdown"), { ssr: false, loading: () => <p className="text-sm text-faint">…</p> });

interface Anotacao {
  id: string; title: string; course: string; folder: string; professor: string;
  anotacoes: string; anotacoes_em: string | null; situacao?: string; ordem?: number | null;
}
type Vista = "curso" | "recentes";

// o id de um grupo (curso › módulo) para os saltos do índice
const ancora = (g: string) => `curso-${slug(g)}`;
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "");

/** Todas as anotações das aulas (Estudos), num lugar só: por curso › módulo ou pelas mais recentes. */
export default function AnotacoesDasAulas() {
  const [itens, setItens] = useState<Anotacao[] | null>(null);
  const [vista, setVista] = useState<Vista>("curso");
  const [q, setQ] = useState("");
  const [abertas, setAbertas] = useState<Set<string>>(new Set());

  useEffect(() => {
    try { const v = localStorage.getItem("notas-aulas-vista"); if (v === "recentes" || v === "curso") setVista(v); } catch {}
    void todas<Anotacao>((de, ate) => supabase().from("notes").select("id,title,course,folder,professor,anotacoes,anotacoes_em,situacao,ordem")
      .eq("kind", "estudo").neq("anotacoes", "").order("id").range(de, ate))
      .then((data) => setItens(data.filter((x) => (x.anotacoes ?? "").trim()))).catch(() => setItens([]));
  }, []);
  useEffect(() => { try { localStorage.setItem("notas-aulas-vista", vista); } catch {} }, [vista]);

  const filtradas = useMemo(() => {
    const termos = semAcento(q).split(/\s+/).filter(Boolean);
    return (itens ?? []).filter((a) => {
      const t = semAcento(`${a.title} ${a.course} ${a.folder} ${a.professor} ${a.anotacoes}`);
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
    return [...g.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true })).map(([k, l]) => [k, l.sort(porOrdem)] as [string, Anotacao[]]);
  }, [filtradas, vista]);

  function baixarTudo() {
    const linhas: string[] = ["# Anotações das aulas", ""];
    for (const [g, lista] of grupos) {
      if (g) linhas.push(`## ${g}`, "");
      for (const a of lista) {
        linhas.push(`### ${a.title}`, `*${[vista === "recentes" ? [a.course, a.folder].filter(Boolean).join(" › ") : "", a.professor, quando(a.anotacoes_em)].filter(Boolean).join(" · ")}*`, "", a.anotacoes.trim(), "");
      }
    }
    baixarArquivo(new Blob([linhas.join("\n")], { type: "text/markdown;charset=utf-8" }), `anotacoes-das-aulas-${new Date().toISOString().slice(0, 10)}.md`);
  }

  const total = itens?.length ?? 0;
  const cursos = new Set((itens ?? []).map((a) => a.course || "Sem curso")).size;
  const ultima = (itens ?? []).reduce<string | null>((m, a) => (a.anotacoes_em && (!m || a.anotacoes_em > m) ? a.anotacoes_em : m), null);

  // o índice da vista Por curso: um salto para o 1º grupo de cada curso, com quantas aulas anotadas ele tem
  const indice = useMemo(() => {
    if (vista !== "curso") return [];
    const m = new Map<string, { ancora: string; n: number }>();
    for (const [g, lista] of grupos) {
      const curso = lista[0]?.course || "Sem curso";
      const it = m.get(curso) ?? { ancora: ancora(g), n: 0 };
      it.n += lista.length;
      m.set(curso, it);
    }
    return [...m.entries()].map(([curso, it]) => ({ curso, ...it }));
  }, [grupos, vista]);

  return (
    <Page tabs={<NotasTabs />} title="Notas"
      subtitle={total ? `${total} ${total === 1 ? "aula anotada" : "aulas anotadas"} em ${cursos} ${cursos === 1 ? "curso" : "cursos"}${ultima ? ` · última em ${quando(ultima)}` : ""}` : undefined}
      ajuda="Você escreve as anotações ao lado da aula, em Estudos: abra a aula e toque no caderno (canto superior direito). Todas aparecem aqui, por curso ou pelas mais recentes."
      actions={total ? <button className="btn" onClick={baixarTudo}><Download size={15} /> Baixar (.md)</button> : undefined}>
      {itens && total === 0 && (
        <Empty icone={GraduationCap}>
          As anotações que você faz ao lado das aulas aparecem aqui. Abra uma aula em <Link href="/estudos" className="underline">Estudos</Link>, toque no caderno (canto superior direito) e escreva.
          Selecionando um trecho da aula, você pode levá-lo para as anotações como citação.
        </Empty>
      )}

      {total > 0 && (
        // o mesmo esqueleto do Diário: a busca, a vista e o índice à esquerda, as anotações à direita
        <div className="grade-indice">
          <aside className="lg:sticky lg:top-4 h-fit space-y-2 min-w-0">
            <label className="input flex items-center gap-2">
              <Search size={15} className="text-faint shrink-0" />
              <input className="bg-transparent outline-none flex-1 min-w-0" placeholder="Buscar nas anotações e aulas" value={q} onChange={(e) => setQ(e.target.value)} />
              {q && <button onClick={() => setQ("")} className="text-faint hover:text-ink" title="Limpar a busca"><X size={14} /></button>}
            </label>
            <div className="seg seg-md w-full">
              {([["curso", "Por curso"], ["recentes", "Mais recentes"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setVista(k)} aria-pressed={vista === k} className="flex-1 px-3">{l}</button>
              ))}
            </div>
            {/* no celular, uma faixa de etiquetas que rola para o lado (só quando há mais de um curso) */}
            {indice.length > 0 && (
              <nav aria-label="Cursos"
                className={`${indice.length > 1 ? "flex" : "hidden"} gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 lg:block lg:overflow-visible lg:rounded-xl lg:border lg:border-line lg:bg-surface lg:p-2`}>
                {indice.map((c) => (
                  <a key={c.curso} href={`#${c.ancora}`} title={c.curso}
                    className="shrink-0 flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:text-ink hover:bg-surface-2 lg:rounded-md lg:border-0 lg:px-2 lg:text-ink">
                    <span className="lg:truncate">{c.curso}</span> <span className="text-xs text-faint tabular-nums">{c.n}</span>
                  </a>
                ))}
              </nav>
            )}
          </aside>

          <div className="min-w-0 space-y-6 md:space-y-8">
            {!filtradas.length && <p className="text-sm text-muted">Nada encontrado para “{q}”.</p>}
            {grupos.map(([g, lista]) => (
              <section key={g || "recentes"} id={g ? ancora(g) : undefined} className="scroll-mt-16 lg:scroll-mt-4">
                {g && <h2 className="eyebrow mb-3">{g}</h2>}
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
        </div>
      )}
    </Page>
  );
}
