"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronRight, Download, Eye, FileText, Folder, Link as LinkIcon, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { countWords, slug, wikilinks } from "@/lib/text";
import { nf } from "@/lib/dates";
import type { Note } from "@/lib/types";

type Kind = Note["kind"];
type View = "editar" | "ler" | "dividir";

/**
 * Notas em Markdown com [[wikilinks]], backlinks, pastas e exportação para um vault do Obsidian.
 * Em "estudo" (transcrições), agrupa por professor → curso.
 */
export function NotesWorkspace({ kind }: { kind: Kind }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [current, setCurrent] = useState<Note | null>(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("dividir");
  const [saving, setSaving] = useState<"salvo" | "salvando" | "pendente">("salvo");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStudy = kind === "estudo";

  const load = useCallback(async () => {
    const { data } = await supabase().from("notes").select("*").eq("kind", kind).order("title");
    const list = (data as Note[]) ?? [];
    setNotes(list);
    const want = new URLSearchParams(window.location.search).get("id");
    setCurrent((c) => list.find((n) => n.id === (c?.id ?? want)) ?? c ?? list[0] ?? null);
  }, [kind]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (current) window.history.replaceState(null, "", `?id=${current.id}`);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const byTitle = useMemo(() => new Map(notes.map((n) => [n.title.toLowerCase(), n])), [notes]);

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t ? notes.filter((n) => n.title.toLowerCase().includes(t) || n.content.toLowerCase().includes(t)) : notes;
    const g = new Map<string, Note[]>();
    for (const n of list) {
      const key = isStudy ? [n.professor || "Sem professor", n.course].filter(Boolean).join(" › ") : n.folder || "";
      g.set(key, [...(g.get(key) ?? []), n]);
    }
    return [...g.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [notes, q, isStudy]);

  const backlinks = useMemo(() => {
    if (!current) return [];
    const t = current.title.toLowerCase();
    return notes.filter((n) => n.id !== current.id && wikilinks(n.content).some((l) => l.toLowerCase() === t));
  }, [notes, current]);

  function patch(p: Partial<Note>) {
    if (!current) return;
    const next = { ...current, ...p };
    setCurrent(next);
    setNotes((all) => all.map((n) => (n.id === next.id ? next : n)));
    setSaving("pendente");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving("salvando");
      const { title, folder, content, professor, course } = next;
      await supabase().from("notes").update({ title, folder, content, professor, course }).eq("id", next.id);
      setSaving("salvo");
    }, 700);
  }

  async function create(title?: string, extra: Partial<Note> = {}) {
    const base = title ?? (isStudy ? "Nova aula" : "Nova nota");
    let t = base;
    for (let i = 2; byTitle.has(t.toLowerCase()); i++) t = `${base} ${i}`;
    const defaults = current
      ? isStudy ? { professor: current.professor, course: current.course } : { folder: current.folder }
      : {};
    const { data } = await supabase()
      .from("notes")
      .insert({ kind, title: t, content: title ? "" : isStudy ? "# Aula\n\n" : "", ...defaults, ...extra })
      .select()
      .single();
    if (data) {
      setNotes((all) => [...all, data as Note].sort((a, b) => a.title.localeCompare(b.title, "pt-BR")));
      setCurrent(data as Note);
      setView(title ? "dividir" : "editar");
    }
  }

  async function remove(n: Note) {
    if (!confirm(`Apagar “${n.title}”?`)) return;
    await supabase().from("notes").delete().eq("id", n.id);
    setNotes((all) => all.filter((x) => x.id !== n.id));
    setCurrent(notes.find((x) => x.id !== n.id) ?? null);
  }

  function openLink(title: string) {
    const n = byTitle.get(title.toLowerCase());
    if (n) setCurrent(n);
    else if (confirm(`A nota “${title}” não existe. Criar agora?`)) void create(title);
  }

  async function importFiles(files: FileList) {
    const rows = [];
    for (const f of Array.from(files)) {
      const content = await f.text();
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || "";
      const folder = rel.split("/").slice(1, -1).join("/");
      rows.push({ kind, title: f.name.replace(/\.(md|markdown|txt)$/i, ""), content, folder });
    }
    if (rows.length) await supabase().from("notes").insert(rows);
    void load();
  }

  async function exportVault() {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const n of notes) {
      const dir = isStudy ? [n.professor, n.course].filter(Boolean).map(safe).join("/") : n.folder.split("/").filter(Boolean).map(safe).join("/");
      const front = isStudy ? `---\nprofessor: ${n.professor}\ncurso: ${n.course}\n---\n\n` : "";
      zip.file(`${dir ? dir + "/" : ""}${safe(n.title)}.md`, front + n.content);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${isStudy ? "estudos" : "notas"}-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
  }

  // transforma [[Link]] em links clicáveis no preview
  const rendered = useMemo(
    () => (current?.content ?? "").replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, t: string, alias?: string) =>
      `[${(alias || t).trim()}](#wiki:${encodeURIComponent(t.trim())})`),
    [current?.content],
  );

  return (
    <div className="grid md:grid-cols-[280px_1fr] h-[calc(100vh-3rem)] md:h-screen">
      <aside className="border-r border-line flex flex-col min-h-0 bg-bg">
        <div className="p-3 space-y-2 border-b border-line">
          <div className="flex items-center justify-between">
            <h1 className="font-semibold">{isStudy ? "Estudos" : "Notas"}</h1>
            <div className="flex gap-0.5">
              <button className="btn btn-ghost px-2" title="Importar .md (ou uma pasta do Obsidian)" onClick={() => fileRef.current?.click()}><Upload size={15} /></button>
              <button className="btn btn-ghost px-2" title="Exportar como vault (.zip)" onClick={exportVault}><Download size={15} /></button>
              <button className="btn btn-primary px-2" title={isStudy ? "Nova transcrição" : "Nova nota"} onClick={() => create()}><Plus size={15} /></button>
            </div>
            <input ref={fileRef} type="file" multiple accept=".md,.markdown,.txt" hidden onChange={(e) => e.target.files && importFiles(e.target.files)} />
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input className="input pl-8 py-1.5 text-sm" placeholder="Buscar em títulos e textos" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-2">
          {notes.length === 0 && (
            <p className="text-sm text-muted p-2">
              {isStudy
                ? "Cole aqui as transcrições das aulas dos seus professores favoritos. Organize por professor e curso."
                : "Crie sua primeira nota. Use [[Título]] para ligar notas entre si, como no Obsidian."}
            </p>
          )}
          {groups.map(([g, list]) => (
            <div key={g || "_"} className="mb-1">
              {g && (
                <button className="flex items-center gap-1 w-full text-left text-xs font-semibold text-muted px-1 py-1.5 uppercase tracking-wide"
                  onClick={() => setCollapsed((c) => { const x = new Set(c); if (x.has(g)) x.delete(g); else x.add(g); return x; })}>
                  {collapsed.has(g) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  <Folder size={13} /> <span className="truncate">{g}</span>
                </button>
              )}
              {!collapsed.has(g) &&
                list.map((n) => (
                  <button key={n.id} onClick={() => setCurrent(n)}
                    className={`flex items-center gap-2 w-full text-left rounded-md px-2 py-1.5 text-sm ${g ? "pl-5" : ""} ${current?.id === n.id ? "bg-accent-soft font-medium" : "hover:bg-surface-2"}`}>
                    <FileText size={14} className="text-faint shrink-0" />
                    <span className="truncate">{n.title}</span>
                  </button>
                ))}
            </div>
          ))}
        </div>
      </aside>

      <section className="flex flex-col min-h-0 min-w-0">
        {!current ? (
          <div className="p-10 text-sm text-muted">Nada selecionado.</div>
        ) : (
          <>
            <div className="border-b border-line px-4 md:px-6 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <input className="flex-1 bg-transparent text-xl font-semibold outline-none min-w-0" value={current.title}
                  onChange={(e) => patch({ title: e.target.value })} />
                <span className="text-xs text-faint hidden sm:inline">{saving === "salvo" ? "salvo" : "salvando…"}</span>
                <div className="inline-flex rounded-lg bg-surface-2 p-0.5">
                  {([["editar", Pencil], ["dividir", LinkIcon], ["ler", Eye]] as const).map(([v, Icon]) => (
                    <button key={v} title={v === "dividir" ? "Editor + visualização" : v === "editar" ? "Só editor" : "Só leitura"}
                      onClick={() => setView(v)} className={`px-2 py-1 rounded-md ${view === v ? "bg-surface shadow-sm" : "text-muted"}`}>
                      <Icon size={14} />
                    </button>
                  ))}
                </div>
                <button className="btn btn-ghost px-2 hover:text-critical" onClick={() => remove(current)} title="Apagar"><Trash2 size={15} /></button>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                {isStudy ? (
                  <>
                    <input className="input py-1 w-auto flex-1 min-w-[140px]" placeholder="Professor" value={current.professor} onChange={(e) => patch({ professor: e.target.value })} />
                    <input className="input py-1 w-auto flex-1 min-w-[140px]" placeholder="Curso / disciplina" value={current.course} onChange={(e) => patch({ course: e.target.value })} />
                  </>
                ) : (
                  <input className="input py-1 w-auto flex-1" placeholder="Pasta (ex.: Filosofia/Platão)" value={current.folder} onChange={(e) => patch({ folder: e.target.value })} />
                )}
                <span className="text-xs text-faint self-center">{nf.format(countWords(current.content))} palavras</span>
              </div>
            </div>
            <div className={`flex-1 min-h-0 grid ${view === "dividir" ? "lg:grid-cols-2" : ""}`}>
              {view !== "ler" && (
                <textarea
                  className="w-full h-full resize-none bg-surface p-4 md:p-6 font-mono text-sm leading-relaxed outline-none border-r border-line"
                  value={current.content}
                  onChange={(e) => patch({ content: e.target.value })}
                  placeholder={"# Título\n\nEscreva em Markdown. Ligue ideias com [[Outra nota]]."}
                  spellCheck
                />
              )}
              {view !== "editar" && (
                <div className="overflow-y-auto p-4 md:p-8">
                  <article className="prose-notes max-w-[72ch] font-serif text-[1.02rem]">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      urlTransform={(u) => u}
                      components={{
                        a: ({ href, children }) =>
                          href?.startsWith("#wiki:") ? (
                            <a href="#" className={byTitle.has(decodeURIComponent(href.slice(6)).toLowerCase()) ? "" : "opacity-60"}
                              onClick={(e) => { e.preventDefault(); openLink(decodeURIComponent(href.slice(6))); }}>{children}</a>
                          ) : (
                            <a href={href} target="_blank" rel="noreferrer">{children}</a>
                          ),
                      }}
                    >
                      {rendered}
                    </ReactMarkdown>
                  </article>
                  <div className="mt-10 pt-4 border-t border-line max-w-[72ch]">
                    <div className="label mb-2">Backlinks ({backlinks.length})</div>
                    {backlinks.length === 0 ? (
                      <p className="text-sm text-faint">Nenhuma nota aponta para esta ainda. Escreva [[{current.title}]] em outra nota.</p>
                    ) : (
                      <ul className="space-y-1">
                        {backlinks.map((b) => (
                          <li key={b.id}><button className="text-sm text-accent" onClick={() => setCurrent(b)}>{b.title}</button></li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function safe(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, "-").trim() || slug(s) || "sem-titulo";
}
