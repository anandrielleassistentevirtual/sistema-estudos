"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, ChevronDown, ChevronRight, CircleCheck, Download, FileText, FolderOpen, FolderUp, NotebookPen, Pencil, Plus, Search, Trash2, Upload, X,
} from "lucide-react";
import { Empty, Page } from "@/components/page";
import { RowMenu } from "@/components/row-menu";
import { supabase } from "@/lib/supabase/client";
import {
  baixarAula, baixarTodas, COLUNAS_AULA, faltam, importarAulas, lugarDoArquivo, nivelProvavel, numeroDaAula, porTitulo, ppmMedio, syncHeading, type Aula,
} from "@/lib/estudos";
import { fmtDuration, nf } from "@/lib/dates";

type Filtro = "todas" | "pendentes" | "concluidas";
const SEM_CURSO = "Sem curso";

export default function Estudos() {
  const router = useRouter();
  const [aulas, setAulas] = useState<Aula[] | null>(null);
  const [sel, setSel] = useState<string>("todas"); // "todas" | "c:<curso>" | "m:<curso>|<módulo>"
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [achados, setAchados] = useState<Set<string> | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [preview, setPreview] = useState<{ files: File[]; nivel: 0 | 1 } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editando, setEditando] = useState<Aula | null>(null);
  const [ppm, setPpm] = useState<{ ppm: number; origem: string }>({ ppm: 220, origem: "padrão" });
  const tempo = (palavras: number) => fmtDuration((palavras / ppm.ppm) * 60);
  const pastaRef = useRef<HTMLInputElement>(null);
  const arquivosRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data } = await supabase().from("notes").select(COLUNAS_AULA).eq("kind", "estudo");
    setAulas(((data as unknown as Aula[]) ?? []).sort(porTitulo));
  }
  useEffect(() => {
    // links antigos (/estudos?id=…) abrem direto a aula
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) { router.replace(`/estudos/${id}`); return; }
    void load();
    void ppmMedio().then(setPpm);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // busca dentro das transcrições: feita no banco (sem baixar tudo)
  useEffect(() => {
    const t = q.trim();
    if (t.length < 3) { setAchados(null); return; }
    const h = setTimeout(async () => {
      const termo = t.replace(/[%_\\]/g, (c) => `\\${c}`);
      const sb = supabase();
      const [a, b] = await Promise.all([
        sb.from("notes").select("id").eq("kind", "estudo").ilike("content", `%${termo}%`).limit(1000),
        sb.from("notes").select("id").eq("kind", "estudo").ilike("anotacoes", `%${termo}%`).limit(1000),
      ]);
      setAchados(new Set([...((a.data as { id: string }[]) ?? []), ...((b.data as { id: string }[]) ?? [])].map((x) => x.id)));
    }, 300);
    return () => clearTimeout(h);
  }, [q]);

  // cursos → módulos
  const cursos = useMemo(() => {
    const m = new Map<string, { total: number; feitas: number; modulos: Map<string, number> }>();
    for (const a of aulas ?? []) {
      const c = a.course || SEM_CURSO;
      const x = m.get(c) ?? { total: 0, feitas: 0, modulos: new Map() };
      x.total++;
      if (a.completed_at) x.feitas++;
      if (a.folder) x.modulos.set(a.folder, (x.modulos.get(a.folder) ?? 0) + 1);
      m.set(c, x);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [aulas]);

  const visiveis = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (aulas ?? []).filter((a) => {
      const c = a.course || SEM_CURSO;
      if (sel.startsWith("c:") && c !== sel.slice(2)) return false;
      if (sel.startsWith("m:")) {
        const [sc, sm] = sel.slice(2).split("|");
        if (c !== sc || a.folder !== sm) return false;
      }
      if (filtro === "pendentes" && a.completed_at) return false;
      if (filtro === "concluidas" && !a.completed_at) return false;
      if (t && !a.title.toLowerCase().includes(t) && !(achados?.has(a.id))) return false;
      return true;
    });
  }, [aulas, sel, filtro, q, achados]);

  // agrupado por curso › módulo
  const grupos = useMemo(() => {
    const g = new Map<string, Aula[]>();
    for (const a of visiveis) {
      const k = [a.course || SEM_CURSO, a.folder].filter(Boolean).join(" › ");
      g.set(k, [...(g.get(k) ?? []), a]);
    }
    return [...g.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [visiveis]);

  async function alternarConcluida(a: Aula) {
    const completed_at = a.completed_at ? null : new Date().toISOString();
    const extra = completed_at ? { progresso: 1 } : {};
    setAulas((all) => all?.map((x) => (x.id === a.id ? { ...x, completed_at, ...extra } : x)) ?? null);
    await supabase().from("notes").update({ completed_at, ...extra }).eq("id", a.id);
  }

  async function apagar(a: Aula) {
    if (!confirm(`Apagar a aula “${a.title}” (e as suas anotações dela)?`)) return;
    await supabase().from("notes").delete().eq("id", a.id);
    setAulas((all) => all?.filter((x) => x.id !== a.id) ?? null);
  }

  async function novaAula() {
    const course = sel.startsWith("c:") ? sel.slice(2) : sel.startsWith("m:") ? sel.slice(2).split("|")[0] : "";
    const folder = sel.startsWith("m:") ? sel.slice(2).split("|")[1] : "";
    const { data } = await supabase().from("notes").insert({
      kind: "estudo", title: "Nova aula", content: "# Nova aula\n\n", course: course === SEM_CURSO ? "" : course, folder,
    }).select("id").single();
    if (data) router.push(`/estudos/${(data as { id: string }).id}?editar=1`);
  }

  function escolher(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => /\.(md|markdown|txt)$/i.test(f.name));
    if (files.length) setPreview({ files, nivel: nivelProvavel(files) });
  }

  async function importar() {
    if (!preview || !aulas) return;
    const { files, nivel } = preview;
    setPreview(null);
    try {
      const r = await importarAulas(files, nivel, aulas, setMsg);
      setMsg(`${r.novas} ${r.novas === 1 ? "aula importada" : "aulas importadas"}${r.atualizadas ? `, ${r.atualizadas} atualizadas` : ""}.`);
    } catch (e) {
      setMsg(`Não consegui importar: ${(e as Error).message}`);
    }
    setTimeout(() => setMsg(null), 5000);
    void load();
  }

  const total = aulas?.length ?? 0;
  const feitas = aulas?.filter((a) => a.completed_at).length ?? 0;
  const pelaFrente = (aulas ?? []).reduce((n, a) => n + faltam(a), 0);
  const alterna = (k: string) => setAbertos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <Page wide title="Estudos"
      subtitle={total
        ? `${total - feitas} ${total - feitas === 1 ? "aula pendente" : "aulas pendentes"} · ≈ ${tempo(pelaFrente)} de leitura pela frente a ${ppm.ppm} ppm`
        : "Cursos e transcrições de aulas."}
      actions={
        <>
          <button className="btn" onClick={() => pastaRef.current?.click()}><FolderUp size={15} /> Importar curso</button>
          <button className="btn btn-primary" onClick={novaAula}><Plus size={15} /> Nova aula</button>
          <RowMenu label="Mais opções" items={[
            { label: "Importar arquivos .md soltos", icon: Upload, onClick: () => arquivosRef.current?.click() },
            { label: "Baixar todas as aulas (.zip)", icon: Download, disabled: !total, onClick: () => aulas && void baixarTodas(aulas) },
          ]} />
        </>
      }>
      <input ref={pastaRef} type="file" hidden multiple {...({ webkitdirectory: "" } as Record<string, string>)} onChange={(e) => { escolher(e.target.files); e.target.value = ""; }} />
      <input ref={arquivosRef} type="file" hidden multiple accept=".md,.markdown,.txt" onChange={(e) => { escolher(e.target.files); e.target.value = ""; }} />
      {msg && <div className="mb-4 rounded-lg bg-surface-2 px-4 py-2 text-sm">{msg}</div>}

      <div className="grid lg:grid-cols-[280px_1fr] gap-5 items-start">
        {/* cursos e módulos */}
        <aside className="card p-2 text-sm lg:sticky lg:top-4">
          <button onClick={() => setSel("todas")}
            className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 ${sel === "todas" ? "bg-sel text-ink font-medium" : "text-muted hover:bg-sel/60 hover:text-ink"}`}>
            <span>Todas as aulas</span><span className="text-xs text-faint tabular-nums">{total}</span>
          </button>
          <div className="my-1.5 border-t border-line" />
          {cursos.map(([c, x]) => (
            <div key={c}>
              <div className={`flex items-center rounded-lg ${sel === `c:${c}` ? "bg-sel" : "hover:bg-sel/60"}`}>
                <button className="p-1.5 text-faint hover:text-ink disabled:opacity-0" disabled={!x.modulos.size} onClick={() => alterna(c)}>
                  {abertos.has(c) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
                <button onClick={() => setSel(`c:${c}`)} title={`≈ ${tempo((aulas ?? []).filter((a) => (a.course || SEM_CURSO) === c).reduce((n, a) => n + faltam(a), 0))} de leitura pela frente`} className={`flex-1 min-w-0 flex items-center gap-2 py-1.5 pr-2.5 text-left ${sel === `c:${c}` ? "text-ink font-medium" : "text-ink/90"}`}>
                  <FolderOpen size={14} className="text-icon shrink-0" />
                  <span className="truncate flex-1">{c}</span>
                  <span className="text-xs text-faint tabular-nums">{x.feitas}/{x.total}</span>
                </button>
              </div>
              {abertos.has(c) && [...x.modulos.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true })).map(([m, n]) => (
                <button key={m} onClick={() => setSel(`m:${c}|${m}`)}
                  className={`w-full flex items-center justify-between rounded-lg pl-9 pr-2.5 py-1 text-[13px] ${sel === `m:${c}|${m}` ? "bg-sel text-ink font-medium" : "text-muted hover:bg-sel/60 hover:text-ink"}`}>
                  <span className="truncate">{m}</span><span className="text-xs text-faint tabular-nums">{n}</span>
                </button>
              ))}
            </div>
          ))}
          {aulas && !cursos.length && <p className="px-2.5 py-2 text-xs text-muted">Importe a pasta de um curso para começar.</p>}
        </aside>

        {/* aulas */}
        <section className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <label className="input flex items-center gap-2 py-1.5 flex-1 min-w-[220px]">
              <Search size={15} className="text-faint shrink-0" />
              <input className="bg-transparent outline-none flex-1 min-w-0" placeholder="Buscar no título, no texto das aulas ou nas anotações" value={q} onChange={(e) => setQ(e.target.value)} />
              {q && <button onClick={() => setQ("")} className="text-faint hover:text-ink"><X size={14} /></button>}
            </label>
            <div className="inline-flex rounded-lg bg-surface-2 p-1 text-sm">
              {([["todas", "Todas"], ["pendentes", "Pendentes"], ["concluidas", "Concluídas"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setFiltro(k)} className={`px-3 py-1 rounded-md ${filtro === k ? "bg-seg shadow-sm" : "text-muted"}`}>{l}</button>
              ))}
            </div>
          </div>

          {aulas && total === 0 && (
            <Empty>Nenhuma aula ainda. Use <b>Importar curso</b> e escolha a pasta do curso no seu computador (cada arquivo .md vira uma aula).</Empty>
          )}
          {aulas && total > 0 && !visiveis.length && <p className="text-sm text-muted">Nada encontrado.</p>}

          <div className="space-y-6">
            {grupos.map(([g, lista]) => (
              <div key={g}>
                <div className="flex items-baseline justify-between mb-2 px-1">
                  <h2 className="text-sm text-muted truncate">{g}</h2>
                  <span className="text-xs text-faint tabular-nums">
                    {lista.filter((a) => a.completed_at).length}/{lista.length}
                    {lista.some((a) => !a.completed_at) && ` · ≈ ${tempo(lista.reduce((n, a) => n + faltam(a), 0))} pela frente`}
                  </span>
                </div>
                <div className="card divide-y divide-line">
                  {lista.map((a) => {
                    const n = numeroDaAula(a.title);
                    const comecada = !a.completed_at && (a.progresso ?? 0) > 0.01;
                    return (
                      <div key={a.id} className="group flex items-center gap-2 pr-2 hover:bg-sel/60 transition-colors first:rounded-t-[11px] last:rounded-b-[11px]">
                        <button onClick={() => router.push(`/estudos/${a.id}`)} className="flex items-center gap-3 min-w-0 flex-1 p-3 text-left" title="Abrir a aula">
                          <span className={`w-10 h-10 shrink-0 grid place-items-center rounded-lg text-[13px] font-medium tabular-nums ${a.completed_at ? "bg-good/15 text-good" : "bg-surface-2 text-ink/80"}`}>
                            {a.completed_at ? <CircleCheck size={17} /> : n ?? <FileText size={16} className="text-icon" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{a.title}</span>
                            <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted mt-0.5">
                              {[
                                a.professor || null,
                                a.palavras ? `${nf.format(a.palavras)} palavras · ≈ ${tempo(a.palavras)}` : null,
                                comecada ? `${Math.round((a.progresso ?? 0) * 100)}% lido · faltam ≈ ${tempo(faltam(a))}` : null,
                              ].filter(Boolean).join(" · ")}
                              {(a.anotacoes ?? "").trim() && (
                                <span className="inline-flex items-center gap-1" title="Esta aula tem anotações suas">
                                  · <NotebookPen size={11} /> anotações
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                        <button onClick={() => alternarConcluida(a)} title={a.completed_at ? "Voltar para pendente" : "Marcar como concluída"}
                          className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium flex items-center gap-1.5"
                          style={a.completed_at
                            ? { color: "var(--good)", background: "color-mix(in srgb, var(--good) 14%, transparent)" }
                            : { color: "var(--muted)", background: "color-mix(in srgb, var(--muted) 14%, transparent)" }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: a.completed_at ? "var(--good)" : "var(--muted)" }} />
                          {a.completed_at ? "Concluída" : "Pendente"}
                        </button>
                        <RowMenu items={[
                          { label: "Abrir a aula", icon: BookOpen, onClick: () => router.push(`/estudos/${a.id}`) },
                          { label: "Editar nome, curso e módulo", icon: Pencil, onClick: () => setEditando(a) },
                          { label: "Editar a transcrição", icon: FileText, onClick: () => router.push(`/estudos/${a.id}?editar=1`) },
                          { label: "Baixar a transcrição (.md)", icon: Download, onClick: () => void baixarAula(a) },
                          { label: a.completed_at ? "Voltar para pendente" : "Marcar como concluída", icon: CircleCheck, onClick: () => alternarConcluida(a), separar: true },
                          { label: "Apagar aula", icon: Trash2, danger: true, separar: true, onClick: () => apagar(a) },
                        ]} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={() => setPreview(null)}>
          <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center">
              <h2 className="text-lg">Importar {preview.files.length} {preview.files.length === 1 ? "aula" : "aulas"}</h2>
              <button onClick={() => setPreview(null)} className="text-muted hover:text-ink"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button className={`btn justify-center text-xs ${preview.nivel === 1 ? "border-muted bg-sel" : ""}`} onClick={() => setPreview({ ...preview, nivel: 1 })}>Escolhi a pasta com vários cursos</button>
              <button className={`btn justify-center text-xs ${preview.nivel === 0 ? "border-muted bg-sel" : ""}`} onClick={() => setPreview({ ...preview, nivel: 0 })}>Escolhi a pasta de um curso</button>
            </div>
            <div className="rounded-lg bg-surface-2 p-3 text-sm space-y-1">
              {(() => {
                const m = new Map<string, Map<string, number>>();
                for (const f of preview.files) {
                  const { course, module } = lugarDoArquivo(f, preview.nivel);
                  const mm = m.get(course) ?? new Map<string, number>();
                  mm.set(module, (mm.get(module) ?? 0) + 1);
                  m.set(course, mm);
                }
                return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true })).map(([c, mods]) => {
                  const t = [...mods.values()].reduce((x, y) => x + y, 0);
                  const nomes = [...mods.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
                  return (
                    <div key={c}>
                      <div className="font-medium">{c || SEM_CURSO} <span className="text-muted font-normal">· {t} {t === 1 ? "aula" : "aulas"}</span></div>
                      {nomes.slice(0, 8).map((mod) => <div key={mod} className="text-xs text-muted pl-3">{mod} · {mods.get(mod)}</div>)}
                      {nomes.length > 8 && <div className="text-xs text-faint pl-3">… e mais {nomes.length - 8} módulos</div>}
                    </div>
                  );
                });
              })()}
            </div>
            <p className="text-xs text-muted">O nome de cada aula vem do primeiro “# título” do arquivo (ou do nome do arquivo). Importar de novo atualiza as aulas que já existem, sem duplicar.</p>
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setPreview(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={importar}>Importar</button>
            </div>
          </div>
        </div>
      )}

      {editando && <EditarAula aula={editando} onClose={() => setEditando(null)}
        onSalvo={(a) => { setEditando(null); setAulas((all) => all?.map((x) => (x.id === a.id ? a : x)).sort(porTitulo) ?? null); }} />}
    </Page>
  );
}

function EditarAula({ aula, onClose, onSalvo }: { aula: Aula; onClose: () => void; onSalvo: (a: Aula) => void }) {
  const [f, setF] = useState({ title: aula.title, course: aula.course, folder: aula.folder, professor: aula.professor });
  const [salvando, setSalvando] = useState(false);
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const sb = supabase();
    const title = f.title.trim() || aula.title;
    const patch: Record<string, string> = { title, course: f.course.trim(), folder: f.folder.trim(), professor: f.professor.trim() };
    if (title !== aula.title) {
      // o "# título" do começo da transcrição acompanha o nome novo
      const { data } = await sb.from("notes").select("content").eq("id", aula.id).single();
      const c = (data as { content: string } | null)?.content;
      if (c !== undefined) patch.content = syncHeading(c, aula.title, title);
    }
    await sb.from("notes").update(patch).eq("id", aula.id);
    onSalvo({ ...aula, title, course: patch.course, folder: patch.folder, professor: patch.professor });
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <form onSubmit={salvar} onClick={(e) => e.stopPropagation()} className="card w-full max-w-md p-6 space-y-3 shadow-2xl">
        <div className="flex justify-between items-center">
          <h2 className="text-lg">Editar aula</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink"><X size={18} /></button>
        </div>
        <label className="block"><span className="label">Nome da aula</span>
          <input autoFocus className="input mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="block"><span className="label">Curso</span>
          <input className="input mt-1" value={f.course} placeholder="ex.: EFESC" onChange={(e) => setF({ ...f, course: e.target.value })} /></label>
        <label className="block"><span className="label">Módulo</span>
          <input className="input mt-1" value={f.folder} placeholder="ex.: Módulo 1" onChange={(e) => setF({ ...f, folder: e.target.value })} /></label>
        <label className="block"><span className="label">Professor</span>
          <input className="input mt-1" value={f.professor} onChange={(e) => setF({ ...f, professor: e.target.value })} /></label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
        </div>
      </form>
    </div>
  );
}
