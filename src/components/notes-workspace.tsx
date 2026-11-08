"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronRight, Download, Eye, FileText, Folder, FolderUp, Link as LinkIcon, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { countWords, slug, wikilinks } from "@/lib/text";
import { nf } from "@/lib/dates";
import type { Note } from "@/lib/types";
import { atomicTemplate, locationLabel, newZid } from "@/lib/zettel";
import { bookName } from "@/lib/folders";

type Kind = Note["kind"];
type View = "editar" | "ler" | "dividir";

/**
 * Notas em Markdown com [[wikilinks]], backlinks, pastas e exportação para um vault do Obsidian.
 * Em "estudo" (transcrições), agrupa por professor → curso.
 */
export function NotesWorkspace({ kind, tabs }: { kind: Kind; tabs?: React.ReactNode }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [current, setCurrent] = useState<Note | null>(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("dividir");
  const [saving, setSaving] = useState<"salvo" | "salvando" | "pendente">("salvo");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStudy = kind === "estudo";
  const isAtomic = kind === "atomica";
  const [source, setSource] = useState<{ id: string; label: string; bookId: string | null } | null>(null);
  const [preview, setPreview] = useState<null | { files: File[]; level: 0 | 1 }>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);

  async function rename(n: Note, value: string) {
    setRenaming(null);
    const title = value.trim();
    if (!title || title === n.title) return;
    const content = syncHeading(n.content, n.title, title);
    setNotes((all) => all.map((x) => (x.id === n.id ? { ...x, title, content } : x)));
    setCurrent((c) => (c?.id === n.id ? { ...c, title, content } : c));
    await supabase().from("notes").update({ title, content }).eq("id", n.id);
  }

  const load = useCallback(async () => {
    const { data } = await supabase().from("notes").select("*").eq("kind", kind).order("title");
    const list = ((data as Note[]) ?? []).sort((a, b) =>
      isAtomic ? (b.zid ?? "").localeCompare(a.zid ?? "") : a.title.localeCompare(b.title, "pt-BR", { numeric: true }));
    setNotes(list);
    const want = new URLSearchParams(window.location.search).get("id");
    setCurrent((c) => list.find((n) => n.id === (c?.id ?? want)) ?? c ?? list[0] ?? null);
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);

  // nota atômica a partir de uma nota literária (?de=<id>)
  useEffect(() => {
    if (!isAtomic) return;
    const de = new URLSearchParams(window.location.search).get("de");
    if (!de) return;
    (async () => {
      const sb = supabase();
      const { data: lit } = await sb.from("notes").select("*").eq("id", de).single();
      if (!lit) return;
      const { data: book } = lit.book_id ? await sb.from("books").select("title,author").eq("id", lit.book_id).single() : { data: null };
      const where = locationLabel(lit.location);
      const reference = `${book ? bookName(book) : "Fonte"}${where ? `, ${where}` : ""}`;
      const zid = newZid();
      const { data } = await sb.from("notes").insert({
        kind: "atomica", zid, source_id: lit.id, title: `${zid} Nova ideia`,
        content: atomicTemplate({ zid, reference, quote: lit.quote || undefined }),
      }).select().single();
      window.history.replaceState(null, "", window.location.pathname);
      if (data) { await load(); setCurrent(data as Note); setView("editar"); }
    })();
  }, [isAtomic]); // eslint-disable-line react-hooks/exhaustive-deps

  // fonte (nota literária) da nota atômica aberta
  useEffect(() => {
    if (!isAtomic || !current?.source_id) { setSource(null); return; }
    void (async () => {
      const sb = supabase();
      const { data: lit } = await sb.from("notes").select("id,book_id,location").eq("id", current.source_id!).single();
      if (!lit) return setSource(null);
      const { data: book } = lit.book_id ? await sb.from("books").select("title,author").eq("id", lit.book_id).single() : { data: null };
      setSource({ id: lit.id, bookId: lit.book_id, label: `${book ? bookName(book) : "Nota literária"}${lit.location ? ` · ${locationLabel(lit.location)}` : ""}` });
    })();
  }, [isAtomic, current?.source_id]);

  useEffect(() => {
    if (current) window.history.replaceState(null, "", `?id=${current.id}`);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const byTitle = useMemo(() => new Map(notes.map((n) => [n.title.toLowerCase(), n])), [notes]);

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t ? notes.filter((n) => n.title.toLowerCase().includes(t) || n.content.toLowerCase().includes(t)) : notes;
    const g = new Map<string, Note[]>();
    for (const n of list) {
      const key = isStudy ? [n.course || "Sem curso", n.folder].filter(Boolean).join(" › ") : isAtomic ? "" : n.folder || "";
      g.set(key, [...(g.get(key) ?? []), n]);
    }
    return [...g.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [notes, q, isStudy, isAtomic]);

  const backlinks = useMemo(() => {
    if (!current) return [];
    const t = current.title.toLowerCase();
    return notes.filter((n) => n.id !== current.id && wikilinks(n.content).some((l) => l.toLowerCase() === t));
  }, [notes, current]);

  function patch(p: Partial<Note>) {
    if (!current) return;
    if (p.title !== undefined && p.content === undefined) p = { ...p, content: syncHeading(current.content, current.title, p.title) };
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
    const zid = isAtomic ? newZid() : null;
    const base = title ?? (isStudy ? "Nova aula" : isAtomic ? `${zid} Nova ideia` : "Nova nota");
    let t = base;
    for (let i = 2; byTitle.has(t.toLowerCase()); i++) t = `${base} ${i}`;
    const defaults = current
      ? isStudy ? { professor: current.professor, course: current.course, folder: current.folder } : isAtomic ? {} : { folder: current.folder }
      : {};
    const { data } = await supabase()
      .from("notes")
      .insert({
        kind, title: t, zid,
        content: isAtomic ? atomicTemplate({ zid: zid! }) : title ? "" : isStudy ? "# Aula\n\n" : "",
        ...defaults, ...extra,
      })
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

  const relOf = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;

  /** Onde cada arquivo vai parar: curso e módulo (a partir das pastas). */
  function placeOf(f: File, level: 0 | 1) {
    const parts = relOf(f).split("/");
    const dirs = parts.slice(0, -1);
    const course = dirs[level] ?? dirs[0] ?? "";
    const module = dirs.slice(level + 1).join(" › ");
    return { course, module };
  }

  function chooseFiles(list: FileList) {
    const files = Array.from(list).filter((f) => /\.(md|markdown|txt)$/i.test(f.name));
    if (!files.length) return;
    if (!isStudy) { void importFiles(files, 0); return; }
    // pasta-mãe com vários cursos ("1. Estudos/EFESC/…") ou a pasta de um curso só ("EFESC/…")?
    const tops = new Set(files.map((f) => relOf(f).split("/")[1]).filter(Boolean));
    const deep = files.filter((f) => relOf(f).split("/").length >= 3).length;
    const level: 0 | 1 = deep > files.length / 2 && tops.size > 1 && /estudo|curso/i.test(relOf(files[0]).split("/")[0]) ? 1 : 0;
    setPreview({ files, level });
  }

  async function importFiles(files: File[], level: 0 | 1) {
    setPreview(null);
    const sb = supabase();
    const existing = new Map(notes.map((n) => [`${n.course}|${n.folder}|${n.title}`.toLowerCase(), n.id]));
    const rows: Record<string, unknown>[] = [];
    let updated = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setImporting(`Lendo ${i + 1} de ${files.length}…`);
      let content = await f.text();
      let professor = "";
      let course = "";
      let folder = "";
      if (isStudy) {
        ({ course, module: folder } = placeOf(f, level));
        const fm = content.match(/^---\n([\s\S]*?)\n---\n?/);
        if (fm) {
          for (const l of fm[1].split("\n")) {
            const [k, ...v] = l.split(":");
            if (k.trim() === "professor") professor = v.join(":").trim();
            if (k.trim() === "curso" && v.join(":").trim()) course = v.join(":").trim();
          }
          content = content.slice(fm[0].length);
        }
      } else {
        folder = relOf(f).split("/").slice(1, -1).join("/");
      }
      const title = (isStudy ? content.match(/^#\s+(.+)$/m)?.[1]?.trim() : null) || f.name.replace(/\.(md|markdown|txt)$/i, "");
      const key = `${course}|${folder}|${title}`.toLowerCase();
      if (existing.has(key)) {
        await sb.from("notes").update({ content, professor: professor || undefined }).eq("id", existing.get(key)!);
        updated++;
      } else {
        rows.push({ kind, title, content, folder, course, professor });
      }
    }
    for (let i = 0; i < rows.length; i += 100) {
      setImporting(`Salvando ${Math.min(rows.length, i + 100)} de ${rows.length}…`);
      await sb.from("notes").insert(rows.slice(i, i + 100));
    }
    setImporting(`${rows.length} aulas importadas${updated ? `, ${updated} atualizadas` : ""}.`);
    setTimeout(() => setImporting(null), 4000);
    void load();
  }

  async function exportVault() {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const n of notes) {
      const dir = isStudy ? [n.course, ...n.folder.split(" › ")].filter(Boolean).map(safe).join("/") : isAtomic ? "" : n.folder.split("/").filter(Boolean).map(safe).join("/");
      const front = isStudy ? `---\nprofessor: ${n.professor}\ncurso: ${n.course}\n---\n\n` : "";
      zip.file(`${dir ? dir + "/" : ""}${safe(n.title)}.md`, front + n.content);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${isStudy ? "estudos" : isAtomic ? "notas-atomicas" : "notas"}-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
  }

  // transforma [[Link]] em links clicáveis no preview
  const rendered = useMemo(
    () => (current?.content ?? "").replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, t: string, alias?: string) =>
      `[${(alias || t).trim()}](#wiki:${encodeURIComponent(t.trim())})`),
    [current?.content],
  );

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] md:h-screen">
    {tabs && <div className="px-4 md:px-6 pt-3 shrink-0">{tabs}</div>}
    <div className="grid md:grid-cols-[280px_1fr] flex-1 min-h-0">
      <aside className="border-r border-line flex flex-col min-h-0 bg-bg">
        <div className="p-3 space-y-2 border-b border-line">
          <div className="flex items-center justify-between">
            <h1 className="font-semibold">{isStudy ? "Estudos" : isAtomic ? "Notas atômicas" : "Notas"}</h1>
            <div className="flex gap-0.5">
              {isStudy && (
                <button className="btn btn-ghost px-2" title="Importar a pasta de um curso (ou a pasta com todos os cursos)" onClick={() => folderRef.current?.click()}><FolderUp size={15} /></button>
              )}
              <button className="btn btn-ghost px-2" title="Importar arquivos .md" onClick={() => fileRef.current?.click()}><Upload size={15} /></button>
              <button className="btn btn-ghost px-2" title="Exportar como vault (.zip)" onClick={exportVault}><Download size={15} /></button>
              <button className="btn btn-primary px-2" title={isStudy ? "Nova transcrição" : "Nova nota"} onClick={() => create()}><Plus size={15} /></button>
            </div>
            <input ref={fileRef} type="file" multiple accept=".md,.markdown,.txt" hidden onChange={(e) => { if (e.target.files) chooseFiles(e.target.files); e.target.value = ""; }} />
            <input ref={folderRef} type="file" multiple hidden onChange={(e) => { if (e.target.files) chooseFiles(e.target.files); e.target.value = ""; }}
              {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} />
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input className="input pl-8 py-1.5 text-sm" placeholder="Buscar em títulos e textos" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-2">
          {importing && <p className="text-xs text-accent px-2 py-1">{importing}</p>}
          {notes.length === 0 && (
            <p className="text-sm text-muted p-2">
              {isStudy
                ? "Importe as transcrições das aulas: use o botão de pasta (📁↑) e escolha a pasta do curso — ou a pasta com todos os cursos. Cada pasta vira um curso, as subpastas viram módulos."
                : isAtomic
                  ? "Uma ideia por nota, com as suas palavras. Ligue cada nota a outras com [[título]] e diga por que a ligação importa. Crie a partir de uma nota literária (botão ⚛) ou do zero (+)."
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
                list.map((n) =>
                  renaming?.id === n.id ? (
                    <form key={n.id} className={`flex items-center gap-1 px-1 py-0.5 ${g ? "pl-4" : ""}`}
                      onSubmit={(e) => { e.preventDefault(); void rename(n, renaming.value); }}>
                      <input className="input py-1 text-sm" autoFocus value={renaming.value}
                        onChange={(e) => setRenaming({ id: n.id, value: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Escape") setRenaming(null); }}
                        onBlur={() => void rename(n, renaming.value)} />
                    </form>
                  ) : (
                    <div key={n.id} className={`group/item flex items-center rounded-md ${current?.id === n.id ? "bg-accent-soft font-medium" : "hover:bg-surface-2"}`}>
                      <button onClick={() => setCurrent(n)} onDoubleClick={() => setRenaming({ id: n.id, value: n.title })}
                        className={`flex items-center gap-2 flex-1 min-w-0 text-left px-2 py-1.5 text-sm ${g ? "pl-5" : ""}`} title="Dois cliques para renomear">
                        <FileText size={14} className="text-faint shrink-0" />
                        <span className="truncate">{n.title}</span>
                      </button>
                      <button className="p-1.5 mr-1 text-faint hover:text-accent opacity-60 group-hover/item:opacity-100" title="Renomear"
                        onClick={() => setRenaming({ id: n.id, value: n.title })}>
                        <Pencil size={13} />
                      </button>
                    </div>
                  ),
                )}
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
                <label className="group/titulo flex-1 min-w-0 flex items-center gap-1.5 rounded-md border border-line/60 hover:border-line focus-within:border-accent px-1.5 -mx-1.5 cursor-text"
                  title={isStudy ? "Clique para renomear a aula" : "Clique para renomear"}>
                  <input className="flex-1 bg-transparent text-xl font-semibold outline-none min-w-0 py-0.5" value={current.title}
                    placeholder={isStudy ? "Nome da aula" : "Título"} onChange={(e) => patch({ title: e.target.value })} />
                  <Pencil size={16} className="text-muted group-hover/titulo:text-accent shrink-0" />
                </label>
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
                    <input className="input py-1 w-auto flex-1 min-w-[140px]" placeholder="Curso (ex.: EFESC)" value={current.course} onChange={(e) => patch({ course: e.target.value })} />
                    <input className="input py-1 w-auto flex-1 min-w-[140px]" placeholder="Módulo" value={current.folder} onChange={(e) => patch({ folder: e.target.value })} />
                    <input className="input py-1 w-auto flex-1 min-w-[120px]" placeholder="Professor" value={current.professor} onChange={(e) => patch({ professor: e.target.value })} />
                  </>
                ) : isAtomic ? (
                  <>
                    <span className="inline-flex items-center rounded-md border border-line px-2 py-0.5 font-mono text-xs text-muted" title="ID único da nota (Zettelkasten)">ID {current.zid ?? "—"}</span>
                    {source && (
                      <a href={source.bookId ? `/notas/literarias?livro=${source.bookId}` : "/notas/literarias"} className="text-xs text-accent hover:underline self-center">
                        Fonte: {source.label}
                      </a>
                    )}
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
    {preview && (
      <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40" onClick={() => setPreview(null)}>
        <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">Importar {preview.files.length} aulas</h2>
            <button onClick={() => setPreview(null)}><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button className={`btn justify-center text-xs ${preview.level === 1 ? "border-accent ring-2 ring-accent-soft" : ""}`} onClick={() => setPreview({ ...preview, level: 1 })}>
              Escolhi a pasta com todos os cursos
            </button>
            <button className={`btn justify-center text-xs ${preview.level === 0 ? "border-accent ring-2 ring-accent-soft" : ""}`} onClick={() => setPreview({ ...preview, level: 0 })}>
              Escolhi a pasta de um curso
            </button>
          </div>
          <div className="rounded-lg bg-surface-2 p-3 text-sm space-y-1">
            {(() => {
              const m = new Map<string, Map<string, number>>();
              for (const f of preview.files) {
                const { course, module } = placeOf(f, preview.level);
                const mm = m.get(course) ?? new Map<string, number>();
                mm.set(module, (mm.get(module) ?? 0) + 1);
                m.set(course, mm);
              }
              return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true })).map(([c, mods]) => (
                <div key={c}>
                  <div className="font-semibold">{c || "Sem curso"} <span className="text-muted font-normal">· {(() => { const t = [...mods.values()].reduce((a, b) => a + b, 0); return `${t} ${t === 1 ? "aula" : "aulas"}`; })()}</span></div>
                  {[...mods.entries()].filter(([mod]) => mod).sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true })).slice(0, 8).map(([mod, n]) => (
                    <div key={mod} className="text-xs text-muted pl-3">{mod} · {n}</div>
                  ))}
                  {[...mods.keys()].filter(Boolean).length > 8 && <div className="text-xs text-faint pl-3">… e mais {[...mods.keys()].filter(Boolean).length - 8} módulos</div>}
                </div>
              ));
            })()}
          </div>
          <p className="text-xs text-muted">O título de cada aula vem do primeiro “# título” do arquivo (ou do nome do arquivo). Importar de novo atualiza as aulas que já existem, sem duplicar.</p>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={() => setPreview(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={() => importFiles(preview.files, preview.level)}>Importar</button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}

/** Se o texto começa com "# <nome antigo>", troca pelo nome novo. */
function syncHeading(content: string, oldTitle: string, newTitle: string) {
  const m = content.match(/^([ \t]*#[ \t]+)(.+?)[ \t]*$/m);
  if (!m || m.index === undefined || content.slice(0, m.index).trim() !== "" || m[2].trim() !== oldTitle.trim()) return content;
  return content.slice(0, m.index) + m[1] + newTitle + content.slice(m.index + m[0].length);
}

function safe(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, "-").trim() || slug(s) || "sem-titulo";
}
