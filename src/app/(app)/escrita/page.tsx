"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, BookText, Feather, PenTool, Pencil, Plus, Trash2, X } from "lucide-react";
import { Empty, Page } from "@/components/page";
import { supabase } from "@/lib/supabase/client";
import { dayKey, nf } from "@/lib/dates";
import { TIPOS, tipoDe, type Projeto, type TipoProjeto } from "@/lib/escrita";

interface Resumo { palavras: number; hoje: number }

const ICONE: Record<TipoProjeto, typeof BookOpen> = { conto: Feather, novela: BookText, romance: BookOpen, ensaio: PenTool };

export default function Escrita() {
  const router = useRouter();
  const [projetos, setProjetos] = useState<Projeto[] | null>(null);
  const [resumo, setResumo] = useState<Record<string, Resumo>>({});
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<Projeto | null>(null);

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
    if (!confirm(`Apagar o projeto “${p.titulo}” com todo o texto, rascunhos e notas? Isso não pode ser desfeito.`)) return;
    await supabase().from("escrita_projetos").delete().eq("id", p.id);
    void load();
  }

  return (
    <Page title="Escrita" subtitle="Contos, novelas, romances e ensaios em produção."
      actions={<button className="btn btn-primary" onClick={() => setNovo(true)}><Plus size={15} /> Novo projeto</button>}>
      {projetos && projetos.length === 0 && (
        <Empty>Nenhum projeto ainda. Crie um conto, novela, romance ou ensaio para começar a escrever.</Empty>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projetos?.map((p) => {
          const r = resumo[p.id] ?? { palavras: 0, hoje: 0 };
          const pct = p.meta_palavras ? Math.min(1, r.palavras / p.meta_palavras) : 0;
          const tipo = tipoDe(p.tipo);
          const Icone = ICONE[p.tipo] ?? BookOpen;
          return (
            <div key={p.id} className="card p-5 group relative hover:border-faint transition-colors">
              <Link href={`/escrita/${p.id}`} className="absolute inset-0" aria-label={`Abrir ${p.titulo}`} />
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-faint text-xs"><Icone size={16} strokeWidth={1.6} /> {tipo.label}</div>
                <span className="relative z-10 flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                  <button className="p-1 text-faint hover:text-ink" title="Editar nome, autor e tipo" onClick={() => setEditando(p)}><Pencil size={14} /></button>
                  <button className="p-1 text-faint hover:text-critical" title="Apagar projeto" onClick={() => apagar(p)}><Trash2 size={14} /></button>
                </span>
              </div>
              <h2 className="mt-4 text-lg leading-snug">{p.titulo}</h2>
              <p className="text-sm text-muted">{p.autor || " "}</p>
              <div className="mt-5 flex items-baseline justify-between text-sm">
                <span className="tabular-nums">{nf.format(r.palavras)} <span className="text-muted">palavras</span></span>
                {r.hoje > 0 && <span className="text-xs text-muted">hoje +{nf.format(r.hoje)}</span>}
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
      {editando && <EditarProjeto p={editando} onClose={() => setEditando(null)} onSalvo={() => { setEditando(null); void load(); }} />}
      {novo && <NovoProjeto onClose={() => setNovo(false)} onCriado={(id) => router.push(`/escrita/${id}`)} />}
    </Page>
  );
}

function SeletorTipo({ valor, onChange }: { valor: TipoProjeto; onChange: (t: TipoProjeto) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(Object.keys(TIPOS) as TipoProjeto[]).map((t) => {
        const I = ICONE[t];
        return (
          <button type="button" key={t} onClick={() => onChange(t)}
            className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${valor === t ? "border-muted bg-surface-2" : "border-line hover:bg-surface-2/60"}`}>
            <div className="flex items-center gap-2 text-sm"><I size={15} strokeWidth={1.6} /> {TIPOS[t].label}</div>
            <div className="text-[11px] text-muted mt-0.5">{TIPOS[t].descricao}</div>
          </button>
        );
      })}
    </div>
  );
}

function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal fixed inset-0 z-[62] grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div className="card p-6 w-full max-w-md space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg">{titulo}</h2>
          <button className="text-muted hover:text-ink" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EditarProjeto({ p, onClose, onSalvo }: { p: Projeto; onClose: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({ titulo: p.titulo, autor: p.autor, tipo: (p.tipo in TIPOS ? p.tipo : "romance") as TipoProjeto });
  async function salvar() {
    await supabase().from("escrita_projetos").update({ titulo: f.titulo.trim() || p.titulo, autor: f.autor.trim(), tipo: f.tipo }).eq("id", p.id);
    onSalvo();
  }
  return (
    <Modal titulo="Editar projeto" onClose={onClose}>
      <label className="block"><span className="label">Título</span>
        <input autoFocus className="input mt-1" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} onKeyDown={(e) => e.key === "Enter" && salvar()} /></label>
      <label className="block"><span className="label">Autor</span>
        <input className="input mt-1" value={f.autor} onChange={(e) => setF({ ...f, autor: e.target.value })} /></label>
      <div><span className="label">Tipo</span><div className="mt-1"><SeletorTipo valor={f.tipo} onChange={(tipo) => setF({ ...f, tipo })} /></div></div>
      {f.tipo !== p.tipo && <p className="text-xs text-muted">O texto não muda; só a organização da tela (capítulos, cenas, escaleta, referências).</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={salvar}>Salvar</button>
      </div>
    </Modal>
  );
}

function NovoProjeto({ onClose, onCriado }: { onClose: () => void; onCriado: (id: string) => void }) {
  const [f, setF] = useState({ titulo: "", autor: "", tipo: "conto" as TipoProjeto, meta: "", metaDia: "", caps: 3, cenas: 3, apoio: true });
  const [salvando, setSalvando] = useState(false);
  const set = (x: Partial<typeof f>) => setF((o) => ({ ...o, ...x }));
  const tipo = TIPOS[f.tipo];

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
    // sem capítulos: um capítulo "invisível" guarda as cenas/partes
    const nCaps = tipo.capitulos ? Math.max(1, f.caps) : 1;
    const { data: caps } = await sb.from("escrita_docs").insert(
      Array.from({ length: nCaps }, (_, i) => ({ projeto_id: pid, tipo: "capitulo", secao: "manuscrito", titulo: tipo.capitulos ? `Capítulo ${i + 1}` : "Texto", posicao: i })),
    ).select("id,posicao");
    const nCenas = Math.max(1, f.cenas);
    const unidade = tipo.unidade === "parte" ? "Parte" : "Cena";
    const cenas = ((caps as { id: string; posicao: number }[]) ?? []).flatMap((c) =>
      Array.from({ length: nCenas }, (_, j) => ({ projeto_id: pid, parent_id: c.id, tipo: "cena", secao: "manuscrito", titulo: `${unidade} ${j + 1}`, posicao: j })));
    if (cenas.length) await sb.from("escrita_docs").insert(cenas);
    if (f.apoio) await sb.from("escrita_docs").insert(tipo.apoio.map((n, i) => ({ projeto_id: pid, tipo: "nota", posicao: i, ...n })));
    onCriado(pid);
  }

  return (
    <Modal titulo="Novo projeto" onClose={onClose}>
      <SeletorTipo valor={f.tipo} onChange={(t) => set({ tipo: t, cenas: t === "ensaio" ? 1 : f.cenas })} />
      <label className="block"><span className="label">Título</span>
        <input autoFocus className="input mt-1" value={f.titulo} onChange={(e) => set({ titulo: e.target.value })} onKeyDown={(e) => e.key === "Enter" && criar()} /></label>
      <label className="block"><span className="label">Autor (opcional)</span>
        <input className="input mt-1" value={f.autor} onChange={(e) => set({ autor: e.target.value })} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="label">Meta de palavras</span>
          <input className="input mt-1" inputMode="numeric" placeholder={{ conto: "ex.: 6000", novela: "ex.: 30000", romance: "ex.: 80000", ensaio: "ex.: 5000" }[f.tipo]}
            value={f.meta} onChange={(e) => set({ meta: e.target.value.replace(/\D/g, "") })} /></label>
        <label className="block"><span className="label">Meta por dia</span>
          <input className="input mt-1" inputMode="numeric" placeholder="ex.: 500" value={f.metaDia} onChange={(e) => set({ metaDia: e.target.value.replace(/\D/g, "") })} /></label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {tipo.capitulos && (
          <label className="block"><span className="label">Capítulos iniciais</span>
            <input className="input mt-1" type="number" min={1} max={60} value={f.caps} onChange={(e) => set({ caps: Number(e.target.value) || 1 })} /></label>
        )}
        <label className="block"><span className="label">{tipo.capitulos ? `${tipo.unidades[0].toUpperCase()}${tipo.unidades.slice(1)} por capítulo` : `${tipo.unidades[0].toUpperCase()}${tipo.unidades.slice(1)} iniciais`}</span>
          <input className="input mt-1" type="number" min={1} max={30} value={f.cenas} onChange={(e) => set({ cenas: Number(e.target.value) || 1 })} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={f.apoio} onChange={(e) => set({ apoio: e.target.checked })} />
        Criar notas de apoio ({tipo.apoio.map((a) => a.titulo.toLowerCase()).join(", ")})
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!f.titulo.trim() || salvando} onClick={criar}>{salvando ? "Criando…" : "Criar e abrir"}</button>
      </div>
    </Modal>
  );
}
