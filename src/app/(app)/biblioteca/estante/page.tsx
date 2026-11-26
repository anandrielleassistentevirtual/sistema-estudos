"use client";
/** Estante: a biblioteca inteira, organizada nas pastas da CDD (a sistemática de arquivos continua a mesma). */
import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen, FolderPlus, Library, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { Empty } from "@/components/page";
import { ACCEPT } from "@/lib/books";
import { cddCompare, folderLabel } from "@/lib/folders";
import { ORDEM_PERFIS, PERFIS, perfilDe, type Perfil } from "@/lib/leitura";
import { supabase } from "@/lib/supabase/client";
import { STATUS_LABEL, type Book, type BookStatus, type Folder as F } from "@/lib/types";
import { useBiblioteca } from "@/components/biblioteca/dados";
import { LivroLinha } from "@/components/biblioteca/linha";
import { BibliotecaPagina } from "@/components/biblioteca/painel";
import { MarcaMotivo } from "@/components/biblioteca/visual";

const STATUS: BookStatus[] = ["aguardando", "lendo", "pausado", "lido"];

export default function Estante() {
  const d = useBiblioteca();
  const [sel, setSelBruto] = useState<"todos" | "sem-pasta" | string>("todos");
  const [arvoreNoCelular, setArvoreNoCelular] = useState(false);
  const setSel = (v: string) => { setSelBruto(v); setArvoreNoCelular(false); };
  const [status, setStatus] = useState<BookStatus | "todos">("todos");
  const [perfil, setPerfil] = useState<Perfil | "sem" | "todos">("todos");
  const [q, setQ] = useState("");
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [arrastando, setArrastando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filhos = useMemo(() => {
    const m = new Map<string | null, F[]>();
    for (const f of d.pastas) m.set(f.parent_id, [...(m.get(f.parent_id) ?? []), f]);
    for (const l of m.values()) l.sort(cddCompare);
    return m;
  }, [d.pastas]);
  const descendentes = useCallback((id: string) => {
    const out = new Set([id]);
    const desce = (x: string) => (filhos.get(x) ?? []).forEach((c) => { out.add(c.id); desce(c.id); });
    desce(id);
    return out;
  }, [filhos]);
  const naPasta = useCallback((id: string) => { const ids = descendentes(id); return d.livros.filter((b) => b.folder_id && ids.has(b.folder_id)); }, [d.livros, descendentes]);
  const ordemDaPasta = useMemo(() => {
    const out = new Map<string, number>();
    let k = 0;
    const desce = (pai: string | null) => (filhos.get(pai) ?? []).forEach((f) => { out.set(f.id, k++); desce(f.id); });
    desce(null);
    return out;
  }, [filhos]);

  const pastaAtual = sel !== "todos" && sel !== "sem-pasta" ? d.pastas.find((f) => f.id === sel) : undefined;
  const caminho = useMemo(() => {
    const out: F[] = [];
    let cur = pastaAtual;
    while (cur) { out.unshift(cur); cur = cur.parent_id ? d.pastas.find((f) => f.id === cur!.parent_id) : undefined; }
    return out;
  }, [pastaAtual, d.pastas]);

  const visiveis = useMemo(() => {
    let l: Book[] = sel === "todos" ? d.livros : sel === "sem-pasta" ? d.livros.filter((b) => !b.folder_id) : naPasta(sel);
    if (status !== "todos") l = l.filter((b) => b.status === status);
    if (perfil !== "todos") l = l.filter((b) => (perfil === "sem" ? !perfilDe(b) : perfilDe(b) === perfil));
    if (q.trim()) {
      const t = q.toLowerCase();
      l = l.filter((b) => b.title.toLowerCase().includes(t) || (b.author ?? "").toLowerCase().includes(t) || (d.pastaDe(b)?.code ?? "").includes(t));
    }
    // ordem de estante: pela pasta (CDD) e, dentro dela, pelo autor
    return [...l].sort((a, b) => (ordemDaPasta.get(a.folder_id ?? "") ?? 1e6) - (ordemDaPasta.get(b.folder_id ?? "") ?? 1e6)
      || (a.author ?? "").localeCompare(b.author ?? "", "pt-BR") || a.title.localeCompare(b.title, "pt-BR"));
  }, [d.livros, d.pastaDe, sel, status, perfil, q, naPasta, ordemDaPasta]);

  // a prateleira de cada pasta: a classe logo abaixo da seleção (em "Toda a biblioteca", a classe de topo: 000, 100…),
  // para as prateleiras baterem com a árvore. Os livros que estão direto na pasta escolhida ficam numa prateleira dela.
  const prateleiraDe = useMemo(() => {
    const porId = new Map(d.pastas.map((f) => [f.id, f]));
    const topo = pastaAtual?.id ?? null;
    return (fid: string | null) => {
      if (!fid) return "";
      if (fid === topo) return fid;
      let cur = porId.get(fid);
      while (cur && cur.parent_id !== topo) cur = cur.parent_id ? porId.get(cur.parent_id) : undefined;
      return cur?.id ?? fid; // pasta que não está na árvore: fica com a dela
    };
  }, [d.pastas, pastaAtual]);

  // agrupados por classe, para a estante ter "prateleiras" (a ordem CDD já deixa cada classe junta)
  const prateleiras = useMemo(() => {
    const g: [string, Book[]][] = [];
    for (const b of visiveis) {
      const k = prateleiraDe(b.folder_id);
      const ult = g[g.length - 1];
      if (ult && ult[0] === k) ult[1].push(b); else g.push([k, [b]]);
    }
    return g;
  }, [visiveis, prateleiraDe]);

  async function apagarPasta(f: F) {
    if (!confirm(`Apagar a pasta “${folderLabel(f)}” e as subpastas? Os livros continuam na biblioteca, sem pasta.`)) return;
    await supabase().from("folders").delete().eq("id", f.id);
    setSel(f.parent_id ?? "todos");
    void d.recarregar();
  }

  function Arvore({ pai, nivel }: { pai: string | null; nivel: number }) {
    return (
      <>
        {(filhos.get(pai) ?? []).map((f) => {
          const tem = (filhos.get(f.id)?.length ?? 0) > 0;
          const aberta = abertas.has(f.id);
          const n = naPasta(f.id).length;
          return (
            <div key={f.id}>
              <div className={`group flex items-center gap-1 rounded-md pr-1 text-sm cursor-pointer ${sel === f.id ? "bg-accent-soft font-medium" : "hover:bg-surface-2"}`}
                style={{ paddingLeft: 4 + nivel * 14 }}
                onClick={() => { if (tem) { setSelBruto(f.id); setAbertas((o) => new Set(o).add(f.id)); } else setSel(f.id); }}>
                <button className={`p-1.5 -m-1 lg:p-0.5 lg:m-0 text-faint ${tem ? "" : "invisible"}`} aria-label={aberta ? "Recolher" : "Abrir"}
                  onClick={(e) => { e.stopPropagation(); setAbertas((o) => { const x = new Set(o); if (x.has(f.id)) x.delete(f.id); else x.add(f.id); return x; }); }}>
                  {aberta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {sel === f.id ? <FolderOpen size={15} className="text-icon shrink-0" /> : <Folder size={15} className="text-muted shrink-0" />}
                <span className="truncate flex-1 py-2.5 lg:py-1.5" title={folderLabel(f)}>
                  {f.code && <span className={`font-mono text-xs mr-1 ${nivel === 0 ? "font-medium text-ink" : "text-muted"}`}>{f.code}</span>}
                  <span className={nivel === 0 ? "font-medium" : ""}>{f.name}</span>
                </span>
                {n > 0 && <span className="text-xs text-faint tabular-nums group-hover:hidden">{n}</span>}
                <button className="hidden group-hover:block p-0.5 text-faint hover:text-ink" title="Nova subpasta aqui"
                  onClick={(e) => { e.stopPropagation(); setAbertas((o) => new Set(o).add(f.id)); d.abrir({ tipo: "pasta", pai: f.id }); }}>
                  <FolderPlus size={14} />
                </button>
              </div>
              {aberta && <Arvore pai={f.id} nivel={nivel + 1} />}
            </div>
          );
        })}
      </>
    );
  }

  const pastaId = pastaAtual?.id ?? null;
  return (
    <BibliotecaPagina actions={
      <>
        <button className="btn" onClick={() => d.abrir({ tipo: "fisico", pasta: pastaId })}><Plus size={15} /> Livro físico</button>
        <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={!!d.enviando}><Upload size={15} /> {d.enviando ? "Enviando…" : "Enviar livros"}</button>
        <input ref={fileRef} type="file" multiple accept={ACCEPT} hidden onChange={(e) => e.target.files && void d.enviar(e.target.files, pastaId)} />
      </>
    }>
      {/* índice à esquerda a partir de lg; antes disso a árvore abre pelo seletor "Pasta:" */}
      <div className="grade-indice">
        <button type="button" className="lg:hidden card flex items-center gap-2 px-3 py-2.5 text-sm text-left" aria-expanded={arvoreNoCelular} onClick={() => setArvoreNoCelular((v) => !v)}>
          <Folder size={16} className="text-muted shrink-0" />
          <span className="text-muted shrink-0">Pasta:</span>
          <span className="font-medium truncate flex-1">{sel === "todos" ? "Toda a biblioteca" : sel === "sem-pasta" ? "Sem pasta" : pastaAtual ? folderLabel(pastaAtual) : "—"}</span>
          <ChevronDown size={16} className={`text-faint shrink-0 transition-transform ${arvoreNoCelular ? "rotate-180" : ""}`} />
        </button>
        <aside className={`card p-2 h-fit lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto ${arvoreNoCelular ? "" : "hidden lg:block"}`}>
          {(["todos", "sem-pasta"] as const).map((k) => (
            <div key={k} onClick={() => setSel(k)}
              className={`flex items-center justify-between rounded-md px-2 py-2.5 lg:py-1.5 text-sm cursor-pointer ${sel === k ? "bg-accent-soft font-medium" : "hover:bg-surface-2"}`}>
              <span className="flex items-center gap-2">{k === "todos" ? <Library size={15} className="text-icon" /> : <Folder size={15} className="text-muted" />}{k === "todos" ? "Toda a biblioteca" : "Sem pasta"}</span>
              <span className="text-xs text-faint tabular-nums">{k === "todos" ? d.livros.length : d.livros.filter((b) => !b.folder_id).length}</span>
            </div>
          ))}
          <div className="border-t border-line my-2" />
          <Arvore pai={null} nivel={0} />
          {d.pastas.length === 0 && d.carregado && <p className="text-xs text-muted px-2 py-2">Crie pastas por classe da CDD: 100 Filosofia, 800 Literatura…</p>}
          {/* criar pasta mora no fim da árvore (e também no seletor do celular, que é esta mesma lista) */}
          <div className="border-t border-line mt-2 pt-1">
            <button className="btn btn-ghost w-full justify-start text-sm" onClick={() => d.abrir({ tipo: "pasta", pai: pastaId })}>
              <FolderPlus size={15} /> {pastaId ? "Subpasta aqui" : "Nova pasta"}
            </button>
          </div>
        </aside>

        <div onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); void d.enviar(e.dataTransfer.files, pastaId); }}
          className={`min-w-0 ${arrastando ? "outline-2 outline-dashed outline-[var(--focus)] rounded-xl" : ""}`}>
          {/* onde estou: só quando há uma pasta escolhida ("Estante" sozinho não diz nada) */}
          {sel !== "todos" && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3 text-sm min-w-0">
              <button className="text-muted hover:text-ink" onClick={() => setSel("todos")}>Estante</button>
              {sel === "sem-pasta" && <span className="flex items-center gap-1.5"><ChevronRight size={13} className="text-faint" />Sem pasta</span>}
              {caminho.map((f) => (
                <span key={f.id} className="flex items-center gap-1.5"><ChevronRight size={13} className="text-faint" />
                  <button className="hover:underline underline-offset-2" onClick={() => setSel(f.id)}>{folderLabel(f)}</button></span>
              ))}
              {pastaAtual && (
                <span className="ml-1 flex gap-1">
                  <button className="text-faint hover:text-ink p-0.5" title="Editar pasta" onClick={() => d.abrir({ tipo: "pasta", edit: pastaAtual, pai: pastaAtual.parent_id })}><Pencil size={13} /></button>
                  <button className="text-faint hover:text-critical p-0.5" title="Apagar pasta" onClick={() => void apagarPasta(pastaAtual)}><Trash2 size={13} /></button>
                </span>
              )}
            </div>
          )}

          {/* filtros: a busca numa linha; situação e motivo em dois controles segmentados, lado a lado */}
          <label className="input flex items-center gap-2 py-1.5 w-full mb-2">
            <Search size={15} className="text-faint shrink-0" />
            <input className="bg-transparent outline-none flex-1 min-w-0" placeholder="Buscar título, autor ou código" value={q} onChange={(e) => setQ(e.target.value)} />
            {/* quantos livros a pasta, os filtros e a busca deixam à vista */}
            {d.carregado && <span className="text-xs text-muted tabular-nums shrink-0" aria-live="polite">{visiveis.length} {visiveis.length === 1 ? "livro" : "livros"}</span>}
          </label>
          <div className="flex flex-wrap justify-between gap-2 mb-4">
            <div className="seg overflow-x-auto no-scrollbar" role="group" aria-label="Situação">
              {(["todos", ...STATUS] as const).map((s) => (
                <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s} className="shrink-0">{s === "todos" ? "Todos" : STATUS_LABEL[s]}</button>
              ))}
            </div>
            <div className="seg overflow-x-auto no-scrollbar" role="group" aria-label="Motivo de leitura">
              {(["todos", ...ORDEM_PERFIS, "sem"] as const).map((k) => (
                <button key={k} onClick={() => setPerfil(k)} aria-pressed={perfil === k} className="shrink-0 inline-flex items-center gap-1.5"
                  title={k !== "todos" && k !== "sem" ? PERFIS[k].explica : undefined}>
                  {k !== "todos" && k !== "sem" && <MarcaMotivo perfil={k} />}
                  {k === "todos" ? "Todos" : k === "sem" ? "Sem motivo" : PERFIS[k].nome}
                </button>
              ))}
            </div>
          </div>

          {!d.carregado ? <p className="text-sm text-muted">Carregando…</p> : visiveis.length === 0 ? (
            <Empty icone={Library}>Nenhum livro aqui. Arraste arquivos <b>EPUB</b>, <b>TXT</b> ou <b>MD</b> para esta área ou use “Enviar livros”.</Empty>
          ) : (
            <div className="space-y-5">
              {prateleiras.map(([fid, lista]) => {
                const f = fid ? d.pastas.find((x) => x.id === fid) : undefined;
                return (
                  <section key={fid || "sem"}>
                    {/* o título da prateleira tem o desenho da árvore: código, nome e quantos */}
                    <div className="flex items-baseline gap-1.5 mb-1.5 px-0.5 text-[13px]">
                      {f?.code && <span className="font-mono text-xs font-medium">{f.code}</span>}
                      <h3 className="font-medium">{f ? f.name : "Sem pasta"}</h3>
                      <span className="text-faint">·</span>
                      <span className="text-xs text-faint tabular-nums">{lista.length}</span>
                    </div>
                    {/* cada linha mostra o código fino (028, 371.3…), já que a prateleira é a classe */}
                    <div className="card divide-y divide-line overflow-hidden">
                      {lista.map((b) => <LivroLinha key={b.id} livro={b} mostrarPasta={b.folder_id !== fid || !!f?.code} />)}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </BibliotecaPagina>
  );
}
