"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, BookText, Feather, PenTool, Pencil, Plus, Trash2, X } from "lucide-react";
import { Empty, Page } from "@/components/page";
import { supabase } from "@/lib/supabase/client";
import { addDays, dayKey, nf, parseDay } from "@/lib/dates";
import { MiniBarras } from "@/components/mini-barras";
import { TIPOS, tipoDe, type Projeto, type TipoProjeto } from "@/lib/escrita";

interface Resumo { palavras: number; hoje: number; dias: Map<string, number> }
/** os últimos 14 dias (do mais antigo a hoje), para o mini-gráfico de cada projeto */
const QUINZENA = () => Array.from({ length: 14 }, (_, i) => dayKey(addDays(new Date(), i - 13)));
/** "hoje", "ontem", "há 5 dias", "em 12/10"; sem data válida, null (o cartão omite o "editado") */
function quando(iso: string) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const d = Math.round((parseDay(dayKey()).getTime() - parseDay(dayKey(t)).getTime()) / 864e5);
  return d <= 0 ? "hoje" : d === 1 ? "ontem" : d < 30 ? `há ${d} dias` : `em ${t.toLocaleDateString("pt-BR", { day: "numeric", month: "numeric" })}`;
}
const SOBRE = "Contos, novelas, romances e ensaios em produção.";

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
      sb.from("escrita_sessoes").select("projeto_id,palavras,dia").gte("dia", QUINZENA()[0]),
    ]);
    setProjetos((p.data as Projeto[]) ?? []);
    const r: Record<string, Resumo> = {};
    const novo = (): Resumo => ({ palavras: 0, hoje: 0, dias: new Map() });
    for (const x of (d.data as { projeto_id: string; palavras: number; secao: string }[]) ?? []) {
      if (x.secao !== "manuscrito") continue;
      (r[x.projeto_id] ??= novo()).palavras += x.palavras;
    }
    const hoje = dayKey();
    for (const x of (s.data as { projeto_id: string; palavras: number; dia: string }[]) ?? []) {
      const p = (r[x.projeto_id] ??= novo());
      p.dias.set(x.dia, (p.dias.get(x.dia) ?? 0) + x.palavras);
      if (x.dia === hoje) p.hoje += x.palavras;
    }
    setResumo(r);
  }
  useEffect(() => { void load(); }, []);

  async function apagar(p: Projeto) {
    if (!confirm(`Apagar o projeto “${p.titulo}” com todo o texto, rascunhos e notas? Isso não pode ser desfeito.`)) return;
    await supabase().from("escrita_projetos").delete().eq("id", p.id);
    void load();
  }

  const quinzena = QUINZENA();
  const vazio = { palavras: 0, hoje: 0, dias: new Map<string, number>() };
  // a manchete soma o que os cartões mostram: as palavras de cada dia (sem negativos) e o hoje de cada projeto
  const escritas = (projetos ?? []).reduce((n, p) => n + quinzena.reduce((m, k) => m + Math.max(0, (resumo[p.id] ?? vazio).dias.get(k) ?? 0), 0), 0);
  const hojeTodos = (projetos ?? []).reduce((n, p) => n + Math.max(0, (resumo[p.id] ?? vazio).hoje), 0);
  const manchete = !projetos ? "\u00a0" : !projetos.length ? SOBRE
    : `${projetos.length} ${projetos.length === 1 ? "projeto" : "projetos"} · ${nf.format(escritas)} palavras nas últimas 2 semanas · hoje +${nf.format(hojeTodos)}`;
  return (
    <Page title="Escrita" subtitle={manchete} ajuda={projetos?.length ? SOBRE : undefined}
      actions={<button className="btn btn-primary" onClick={() => setNovo(true)}><Plus size={15} /> Novo projeto</button>}>
      {projetos && projetos.length === 0 && (
        <Empty icone={Feather}>Nenhum projeto ainda. Crie um conto, novela, romance ou ensaio para começar a escrever.</Empty>
      )}
      {/* 3 colunas só com 3 projetos ou mais: com 2, eles ocupam a largura em vez de deixar um terço vazio */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${(projetos?.length ?? 0) >= 3 ? "xl:grid-cols-3" : ""}`}>
        {projetos?.map((p) => {
          const r = resumo[p.id] ?? vazio;
          const serie = quinzena.map((k) => Math.max(0, r.dias.get(k) ?? 0));
          const pct = p.meta_palavras ? Math.min(1, r.palavras / p.meta_palavras) : 0;
          const tipo = tipoDe(p.tipo);
          const Icone = ICONE[p.tipo] ?? BookOpen;
          const editado = quando(p.updated_at);
          const hoje = Math.max(0, r.hoje);
          return (
            // todo cartão tem as mesmas linhas, e os dados ficam no pé (mt-auto): os números se alinham entre cartões
            <div key={p.id} className="card card-hover p-5 group relative flex flex-col">
              {/* o link cobre o cartão: é ele que mostra o título inteiro ao passar o mouse (o h2 corta em 2 linhas) */}
              <Link href={`/escrita/${p.id}`} className="absolute inset-0" aria-label={`Abrir ${p.titulo}`} title={p.titulo} />
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-faint text-xs"><Icone size={16} strokeWidth={1.6} /> {tipo.label}</div>
                {/* com mouse, as ações aparecem ao passar por cima; no toque (sem hover), ficam sempre à vista */}
                <span className="relative z-10 -my-1 -mr-1.5 flex gap-0.5 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-within:opacity-100">
                  <button className="p-1.5 text-faint hover:text-ink" title="Editar nome, autor e tipo" onClick={() => setEditando(p)}><Pencil size={14} /></button>
                  <button className="p-1.5 text-faint hover:text-critical" title="Apagar projeto" onClick={() => apagar(p)}><Trash2 size={14} /></button>
                </span>
              </div>
              {/* o título da obra em serifa, como nas capas da Biblioteca */}
              <h2 className="mt-4 text-[1.2rem] leading-snug font-serif line-clamp-2">{p.titulo}</h2>
              {p.autor && <p className="text-sm text-muted truncate">{p.autor}</p>}
              <div className="mt-auto pt-5">
                {/* o total no texto, com as palavras de cada dia das últimas duas semanas ao lado */}
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[1.35rem] font-medium tracking-[-0.02em] tabular-nums leading-none">{nf.format(r.palavras)}</div>
                    <div className="text-xs text-muted mt-1 truncate">palavras no texto</div>
                  </div>
                  <MiniBarras valores={serie} cor="var(--area-escrita)" largura={84} altura={26} titulo="Palavras escritas por dia nas últimas duas semanas" />
                </div>
                {/* a meta do texto: com ou sem meta, a linha tem a mesma altura */}
                <div className="mt-3 h-4 flex items-center gap-3 text-[11px] text-faint tabular-nums">
                  {p.meta_palavras > 0 ? (
                    <>
                      <span className="flex-1 h-1 rounded-full bg-surface-2 overflow-hidden">
                        <span className="block h-full rounded-full" style={{ width: `${pct * 100}%`, background: "var(--area-escrita)" }} />
                      </span>
                      <span className="shrink-0">{Math.round(pct * 100)}% de {nf.format(p.meta_palavras)}</span>
                    </>
                  ) : "sem meta de palavras"}
                </div>
                <div className="mt-1.5 min-h-4 flex items-baseline justify-between gap-2 text-[11px] text-faint tabular-nums">
                  <span>{editado && `editado ${editado}`}</span>
                  {(p.meta_diaria > 0 || hoje > 0) && (
                    <span className={p.meta_diaria > 0 && hoje >= p.meta_diaria ? "text-good" : "text-muted"}>
                      hoje +{nf.format(hoje)}{p.meta_diaria > 0 && ` / ${nf.format(p.meta_diaria)}`}
                    </span>
                  )}
                </div>
              </div>
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
          <h2 className="modal-title">{titulo}</h2>
          <button onClick={onClose} className="modal-close" aria-label="Fechar"><X size={18} /></button>
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
