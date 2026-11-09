"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FileText, BookOpen, Plus, Trash2, X } from "lucide-react";
import { Empty, Page } from "@/components/page";
import { supabase } from "@/lib/supabase/client";
import { dayKey, nf } from "@/lib/dates";
import type { Projeto } from "@/lib/escrita";

interface Resumo { palavras: number; hoje: number }

export default function Escrita() {
  const router = useRouter();
  const [projetos, setProjetos] = useState<Projeto[] | null>(null);
  const [resumo, setResumo] = useState<Record<string, Resumo>>({});
  const [novo, setNovo] = useState(false);

  async function load() {
    const sb = supabase();
    const [p, d, s] = await Promise.all([
      sb.from("escrita_projetos").select("*").order("updated_at", { ascending: false }),
      sb.from("escrita_docs").select("projeto_id,palavras,secao"),
      sb.from("escrita_sessoes").select("projeto_id,palavras").eq("dia", dayKey()),
    ]);
    setProjetos((p.data as Projeto[]) ?? []);
    const r: Record<string, Resumo> = {};
    for (const x of (d.data as { projeto_id: string; palavras: number; secao: string }[]) ?? []) {
      if (x.secao !== "manuscrito") continue;
      (r[x.projeto_id] ??= { palavras: 0, hoje: 0 }).palavras += x.palavras;
    }
    for (const x of (s.data as { projeto_id: string; palavras: number }[]) ?? []) (r[x.projeto_id] ??= { palavras: 0, hoje: 0 }).hoje += x.palavras;
    setResumo(r);
  }
  useEffect(() => { void load(); }, []);

  async function apagar(p: Projeto) {
    if (!confirm(`Apagar o projeto “${p.titulo}” com todos os capítulos, cenas e notas? Isso não pode ser desfeito.`)) return;
    await supabase().from("escrita_projetos").delete().eq("id", p.id);
    void load();
  }

  return (
    <Page title="Escrita" subtitle="Livros e artigos em produção."
      actions={<button className="btn btn-primary" onClick={() => setNovo(true)}><Plus size={15} /> Novo projeto</button>}>
      {projetos && projetos.length === 0 && (
        <Empty>Nenhum projeto ainda. Crie um livro ou artigo para começar a escrever.</Empty>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projetos?.map((p) => {
          const r = resumo[p.id] ?? { palavras: 0, hoje: 0 };
          const pct = p.meta_palavras ? Math.min(1, r.palavras / p.meta_palavras) : 0;
          return (
            <div key={p.id} className="card p-5 group relative hover:border-faint transition-colors">
              <Link href={`/escrita/${p.id}`} className="absolute inset-0" aria-label={`Abrir ${p.titulo}`} />
              <div className="flex items-start justify-between gap-2">
                <div className="text-faint">{p.tipo === "livro" ? <BookOpen size={18} strokeWidth={1.6} /> : <FileText size={18} strokeWidth={1.6} />}</div>
                <button className="relative z-10 p-1 text-faint opacity-0 group-hover:opacity-100 hover:text-critical" title="Apagar projeto" onClick={() => apagar(p)}>
                  <Trash2 size={14} />
                </button>
              </div>
              <h2 className="mt-4 text-lg leading-snug">{p.titulo}</h2>
              <p className="text-sm text-muted">{p.autor || (p.tipo === "livro" ? "Livro" : "Artigo")}</p>
              <div className="mt-5 flex items-baseline justify-between text-sm">
                <span className="tabular-nums">{nf.format(r.palavras)} <span className="text-muted">palavras</span></span>
                {r.hoje !== 0 && <span className="text-xs text-muted">hoje {r.hoje > 0 ? "+" : ""}{nf.format(r.hoje)}</span>}
              </div>
              {p.meta_palavras > 0 && (
                <div className="mt-2 h-1.5 rounded-full bg-surface-2 overflow-hidden" title={`Meta: ${nf.format(p.meta_palavras)} palavras`}>
                  <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: "var(--chart)" }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {novo && <NovoProjeto onClose={() => setNovo(false)} onCriado={(id) => router.push(`/escrita/${id}`)} />}
    </Page>
  );
}

function NovoProjeto({ onClose, onCriado }: { onClose: () => void; onCriado: (id: string) => void }) {
  const [f, setF] = useState({ titulo: "", autor: "", tipo: "livro" as "livro" | "artigo", meta: "", metaDia: "", caps: 3, cenas: 3, apoio: true });
  const [salvando, setSalvando] = useState(false);
  const set = (x: Partial<typeof f>) => setF((o) => ({ ...o, ...x }));

  async function criar() {
    if (!f.titulo.trim()) return;
    setSalvando(true);
    const sb = supabase();
    const { data: p, error } = await sb.from("escrita_projetos").insert({
      titulo: f.titulo.trim(), autor: f.autor.trim(), tipo: f.tipo,
      meta_palavras: Number(f.meta) || 0, meta_diaria: Number(f.metaDia) || 0,
    }).select().single();
    if (error || !p) { setSalvando(false); alert("Não consegui criar o projeto."); return; }
    const pid = (p as Projeto).id;
    const artigo = f.tipo === "artigo";
    const nCaps = artigo ? 1 : Math.max(1, f.caps);
    const { data: caps } = await sb.from("escrita_docs").insert(
      Array.from({ length: nCaps }, (_, i) => ({ projeto_id: pid, tipo: "capitulo", secao: "manuscrito", titulo: artigo ? f.titulo.trim() : `Capítulo ${i + 1}`, posicao: i })),
    ).select("id,posicao");
    const cenas = (caps as { id: string; posicao: number }[] ?? []).flatMap((c) =>
      Array.from({ length: artigo ? 1 : Math.max(1, f.cenas) }, (_, j) => ({
        projeto_id: pid, parent_id: c.id, tipo: "cena", secao: "manuscrito", titulo: artigo ? "Texto" : `Cena ${j + 1}`, posicao: j,
      })));
    if (cenas.length) await sb.from("escrita_docs").insert(cenas);
    if (f.apoio) {
      const notas = artigo
        ? [{ secao: "pesquisa", titulo: "Fontes e referências" }, { secao: "enredo", titulo: "Estrutura do argumento" }]
        : [
            { secao: "enredo", titulo: "Enredo principal" },
            { secao: "personagens", titulo: "Protagonista" },
            { secao: "lugares", titulo: "Lugar principal" },
            { secao: "pesquisa", titulo: "Pesquisa" },
          ];
      await sb.from("escrita_docs").insert(notas.map((n, i) => ({ projeto_id: pid, tipo: "nota", posicao: i, ...n })));
    }
    onCriado(pid);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div className="card p-6 w-full max-w-md space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg">Novo projeto</h2>
          <button className="text-muted hover:text-ink" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="inline-flex rounded-lg bg-surface-2 p-1 text-sm">
          {(["livro", "artigo"] as const).map((t) => (
            <button key={t} onClick={() => set({ tipo: t })}
              className={`px-4 py-1.5 rounded-md ${f.tipo === t ? "bg-surface shadow-sm" : "text-muted"}`}>{t === "livro" ? "Livro" : "Artigo"}</button>
          ))}
        </div>
        <label className="block"><span className="label">Título</span>
          <input autoFocus className="input mt-1" value={f.titulo} onChange={(e) => set({ titulo: e.target.value })} onKeyDown={(e) => e.key === "Enter" && criar()} /></label>
        <label className="block"><span className="label">Autor (opcional)</span>
          <input className="input mt-1" value={f.autor} onChange={(e) => set({ autor: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">Meta de palavras</span>
            <input className="input mt-1" inputMode="numeric" placeholder={f.tipo === "livro" ? "ex.: 80000" : "ex.: 5000"} value={f.meta} onChange={(e) => set({ meta: e.target.value.replace(/\D/g, "") })} /></label>
          <label className="block"><span className="label">Meta por dia</span>
            <input className="input mt-1" inputMode="numeric" placeholder="ex.: 1000" value={f.metaDia} onChange={(e) => set({ metaDia: e.target.value.replace(/\D/g, "") })} /></label>
        </div>
        {f.tipo === "livro" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">Capítulos iniciais</span>
              <input className="input mt-1" type="number" min={1} max={60} value={f.caps} onChange={(e) => set({ caps: Number(e.target.value) || 1 })} /></label>
            <label className="block"><span className="label">Cenas por capítulo</span>
              <input className="input mt-1" type="number" min={1} max={30} value={f.cenas} onChange={(e) => set({ cenas: Number(e.target.value) || 1 })} /></label>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={f.apoio} onChange={(e) => set({ apoio: e.target.checked })} />
          Criar pastas de apoio ({f.tipo === "livro" ? "enredo, personagens, lugares, pesquisa" : "estrutura e fontes"})
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!f.titulo.trim() || salvando} onClick={criar}>{salvando ? "Criando…" : "Criar e abrir"}</button>
        </div>
      </div>
    </div>
  );
}
