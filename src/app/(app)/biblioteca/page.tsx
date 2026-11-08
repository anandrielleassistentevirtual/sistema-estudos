"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, ChevronDown, ChevronRight, Folder, FolderOpen, ListOrdered, Pencil, Plus, Search, Timer, Trash2, Upload, X,
} from "lucide-react";
import { Empty, Page } from "@/components/page";
import { ACCEPT, addPhysicalBook, deleteBook, enqueue, uploadBook } from "@/lib/books";
import { useTimer } from "@/components/timer-context";
import { fmtDuration, nf } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";
import { Book, BookStatus, Folder as F, STATUS_LABEL } from "@/lib/types";

type Sel = "todos" | "sem-pasta" | string;
const STATUS: BookStatus[] = ["aguardando", "lendo", "pausado", "lido"];
const DEFAULT_WPM = 220;

export default function Biblioteca() {
  const [folders, setFolders] = useState<F[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [sel, setSel] = useState<Sel>("todos");
  const [status, setStatus] = useState<BookStatus | "todos">("todos");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [wpm, setWpm] = useState(DEFAULT_WPM);
  const fileRef = useRef<HTMLInputElement>(null);
  const timer = useTimer();
  const [physical, setPhysical] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (toast) { const x = setTimeout(() => setToast(null), 3000); return () => clearTimeout(x); } }, [toast]);

  function readPhysical(b: Book) {
    timer.set({ category: "Leitura", bookId: b.id, bookTitle: b.title, bookPhysical: true });
    if (!timer.running) timer.start();
    setToast(`Timer ligado para “${b.title}”. Ao encerrar, informe a página onde parou.`);
  }

  const load = useCallback(async () => {
    const sb = supabase();
    const [f, b, r] = await Promise.all([
      sb.from("folders").select("*").order("position").order("name"),
      sb.from("books").select("*").order("title"),
      sb.from("reading_sessions").select("seconds,words").order("started_at", { ascending: false }).limit(200),
    ]);
    setFolders((f.data as F[]) ?? []);
    setBooks((b.data as Book[]) ?? []);
    const secs = (r.data ?? []).reduce((a, x) => a + x.seconds, 0);
    const words = (r.data ?? []).reduce((a, x) => a + x.words, 0);
    if (secs > 300) setWpm(Math.round(words / (secs / 60)));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const children = useMemo(() => {
    const m = new Map<string | null, F[]>();
    for (const f of folders) m.set(f.parent_id, [...(m.get(f.parent_id) ?? []), f]);
    return m;
  }, [folders]);

  const descendants = useCallback((id: string): Set<string> => {
    const out = new Set([id]);
    const walk = (x: string) => (children.get(x) ?? []).forEach((c) => { out.add(c.id); walk(c.id); });
    walk(id);
    return out;
  }, [children]);

  const inFolder = useCallback((id: string) => {
    const ids = descendants(id);
    return books.filter((b) => b.folder_id && ids.has(b.folder_id));
  }, [books, descendants]);

  const path = useMemo(() => {
    if (sel === "todos" || sel === "sem-pasta") return [];
    const byId = new Map(folders.map((f) => [f.id, f]));
    const out: F[] = [];
    let cur = byId.get(sel);
    while (cur) { out.unshift(cur); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
    return out;
  }, [sel, folders]);

  const visible = useMemo(() => {
    let list = sel === "todos" ? books : sel === "sem-pasta" ? books.filter((b) => !b.folder_id) : inFolder(sel);
    if (status !== "todos") list = list.filter((b) => b.status === status);
    if (q.trim()) {
      const t = q.toLowerCase();
      list = list.filter((b) => b.title.toLowerCase().includes(t) || (b.author ?? "").toLowerCase().includes(t));
    }
    return list;
  }, [books, sel, status, q, inFolder]);

  const tiles = sel === "todos" ? children.get(null) ?? [] : sel === "sem-pasta" ? [] : children.get(sel) ?? [];
  const currentFolderId = sel === "todos" || sel === "sem-pasta" ? null : sel;

  async function onFiles(files: FileList | File[]) {
    setError(null);
    for (const f of Array.from(files)) {
      setUploading(f.name);
      try { await uploadBook(f, currentFolderId); } catch (e) { setError((e as Error).message); }
    }
    setUploading(null);
    void load();
  }

  async function newFolder() {
    const name = prompt(currentFolderId ? "Nome da subpasta:" : "Nome da pasta:");
    if (!name?.trim()) return;
    await supabase().from("folders").insert({ name: name.trim(), parent_id: currentFolderId });
    if (currentFolderId) setOpen((o) => new Set(o).add(currentFolderId));
    void load();
  }

  async function renameFolder(f: F) {
    const name = prompt("Novo nome:", f.name);
    if (!name?.trim()) return;
    await supabase().from("folders").update({ name: name.trim() }).eq("id", f.id);
    void load();
  }

  async function removeFolder(f: F) {
    if (!confirm(`Apagar a pasta "${f.name}" e suas subpastas? Os livros continuam na biblioteca, sem pasta.`)) return;
    await supabase().from("folders").delete().eq("id", f.id);
    setSel(f.parent_id ?? "todos");
    void load();
  }

  async function update(b: Book, patch: Partial<Book>) {
    if (patch.status === "lido") patch.finished_at = new Date().toISOString();
    if (patch.status === "lendo" && !b.started_at) patch.started_at = new Date().toISOString();
    setBooks((all) => all.map((x) => (x.id === b.id ? { ...x, ...patch } : x)));
    await supabase().from("books").update(patch).eq("id", b.id);
  }

  const stats = (list: Book[]) => {
    const total = list.reduce((a, b) => a + (b.word_count ?? 0), 0);
    const left = list.filter((b) => b.status !== "lido").reduce((a, b) => a + (b.word_count ?? 0) * (1 - b.progress), 0);
    const done = list.filter((b) => b.status === "lido").length;
    return { total, left, done, waiting: list.filter((b) => b.status === "aguardando").length, n: list.length };
  };

  function Tree({ parent, depth }: { parent: string | null; depth: number }) {
    return (
      <>
        {(children.get(parent) ?? []).map((f) => {
          const kids = children.get(f.id)?.length ?? 0;
          const isOpen = open.has(f.id);
          const n = inFolder(f.id).filter((b) => b.status !== "lido").length;
          return (
            <div key={f.id}>
              <div
                className={`group flex items-center gap-1 rounded-md pr-1 text-sm cursor-pointer ${sel === f.id ? "bg-accent-soft font-medium" : "hover:bg-surface-2"}`}
                style={{ paddingLeft: 4 + depth * 14 }}
                onClick={() => setSel(f.id)}
              >
                <button
                  className={`p-0.5 text-faint ${kids ? "" : "invisible"}`}
                  onClick={(e) => { e.stopPropagation(); setOpen((o) => { const x = new Set(o); if (x.has(f.id)) x.delete(f.id); else x.add(f.id); return x; }); }}
                >
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {sel === f.id ? <FolderOpen size={15} className="text-accent" /> : <Folder size={15} className="text-muted" />}
                <span className="truncate flex-1 py-1.5">{f.name}</span>
                {n > 0 && <span className="text-xs text-faint tabular-nums">{n}</span>}
              </div>
              {isOpen && <Tree parent={f.id} depth={depth + 1} />}
            </div>
          );
        })}
      </>
    );
  }

  const cur = currentFolderId ? folders.find((f) => f.id === currentFolderId) : null;
  const all = stats(books);

  return (
    <Page
      wide
      title="Mapa da Ignorância"
      subtitle={`${all.waiting} livros aguardando · ≈ ${fmtDuration((all.left / wpm) * 60)} de leitura pela frente a ${wpm} ppm`}
      actions={
        <>
          <button className="btn" onClick={newFolder}><Plus size={15} /> {currentFolderId ? "Subpasta" : "Pasta"}</button>
          <button className="btn" onClick={() => setPhysical(true)}><Plus size={15} /> Livro físico</button>
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={!!uploading}>
            <Upload size={15} /> {uploading ? "Enviando…" : "Enviar livros"}
          </button>
          <input ref={fileRef} type="file" multiple accept={ACCEPT} hidden onChange={(e) => e.target.files && onFiles(e.target.files)} />
        </>
      }
    >
      <div className="grid md:grid-cols-[240px_1fr] gap-4">
        <aside className="card p-2 h-fit md:sticky md:top-4">
          {(["todos", "sem-pasta"] as const).map((k) => (
            <div key={k} onClick={() => setSel(k)}
              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm cursor-pointer ${sel === k ? "bg-accent-soft font-medium" : "hover:bg-surface-2"}`}>
              <span>{k === "todos" ? "Toda a biblioteca" : "Sem pasta"}</span>
              <span className="text-xs text-faint">{k === "todos" ? books.length : books.filter((b) => !b.folder_id).length}</span>
            </div>
          ))}
          <div className="border-t border-line my-2" />
          <Tree parent={null} depth={0} />
          {folders.length === 0 && <p className="text-xs text-muted px-2 py-2">Crie pastas por área: Filosofia, Literatura, Idiomas…</p>}
        </aside>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void onFiles(e.dataTransfer.files); }}
          className={drag ? "outline-2 outline-dashed outline-accent rounded-xl" : ""}
        >
          <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
            <button className="text-muted hover:text-ink" onClick={() => setSel("todos")}>Biblioteca</button>
            {path.map((f) => (
              <span key={f.id} className="flex items-center gap-2">
                <ChevronRight size={13} className="text-faint" />
                <button className="hover:text-accent" onClick={() => setSel(f.id)}>{f.name}</button>
              </span>
            ))}
            {cur && (
              <span className="ml-1 flex gap-1">
                <button className="text-faint hover:text-ink" title="Renomear" onClick={() => renameFolder(cur)}><Pencil size={13} /></button>
                <button className="text-faint hover:text-critical" title="Apagar pasta" onClick={() => removeFolder(cur)}><Trash2 size={13} /></button>
              </span>
            )}
          </div>

          {tiles.length > 0 && (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-5">
              {tiles.map((f) => {
                const s = stats(inFolder(f.id));
                const pct = s.n ? s.done / s.n : 0;
                return (
                  <button key={f.id} onClick={() => { setSel(f.id); setOpen((o) => new Set(o).add(f.id)); }}
                    className="card p-4 text-left hover:border-accent transition-colors">
                    <div className="flex items-center gap-2">
                      <Folder size={16} className="text-accent" />
                      <span className="font-medium truncate">{f.name}</span>
                    </div>
                    <div className="mt-3 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                      <div className="h-full bg-accent" style={{ width: `${pct * 100}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-muted">
                      <span>{s.done}/{s.n} lidos · {s.waiting} aguardando</span>
                      <span>{s.left ? `≈ ${fmtDuration((s.left / wpm) * 60)}` : ""}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap gap-2 items-center mb-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <input className="input pl-8" placeholder="Buscar título ou autor" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="inline-flex rounded-lg bg-surface-2 p-1 text-xs">
              {(["todos", ...STATUS] as const).map((s) => (
                <button key={s} onClick={() => setStatus(s)}
                  className={`px-2.5 py-1 rounded-md ${status === s ? "bg-surface shadow-sm font-medium" : "text-muted"}`}>
                  {s === "todos" ? "Todos" : STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-critical mb-3">{error}</p>}
          {uploading && <p className="text-sm text-muted mb-3">Enviando {uploading}…</p>}

          {visible.length === 0 ? (
            <Empty>
              Nenhum livro aqui. Arraste arquivos <b>EPUB</b>, <b>TXT</b> ou <b>MD</b> para esta área ou use “Enviar livros”.
            </Empty>
          ) : (
            <div className="card divide-y divide-line">
              {visible.map((b) => (
                <div key={b.id} className="p-3 flex flex-wrap items-center gap-3">
                  <Link href={b.format === "fisico" ? "#" : `/ler/${b.id}`} onClick={(e) => { if (b.format === "fisico") { e.preventDefault(); readPhysical(b); } }}
                    className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="grid place-items-center w-9 h-11 rounded bg-surface-2 text-[10px] font-semibold uppercase text-muted shrink-0">{b.format === "fisico" ? "📖" : b.format}</span>
                    <span className="min-w-0">
                      <span className="block font-medium truncate">{b.title}</span>
                      <span className="block text-xs text-muted truncate">
                        {b.author ?? "Autor desconhecido"}
                        {b.word_count ? ` · ${nf.format(b.word_count)} palavras · ≈ ${fmtDuration((b.word_count / wpm) * 60)}` : ""}
                        {b.format === "fisico" ? ` · físico${b.total_pages ? ` · p. ${b.current_page ?? 0}/${b.total_pages}` : ""}` : ""}
                        {b.progress > 0 ? ` · ${Math.round(b.progress * 100)}%` : ""}
                      </span>
                    </span>
                  </Link>
                  <select className="input w-auto text-xs py-1" value={b.status} onChange={(e) => update(b, { status: e.target.value as BookStatus })}>
                    {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                  <select className="input w-auto text-xs py-1 max-w-[150px]" value={b.folder_id ?? ""} onChange={(e) => update(b, { folder_id: e.target.value || null })}>
                    <option value="">Sem pasta</option>
                    {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <div className="flex gap-1">
                    {b.format === "fisico" ? (
                      <button className="btn btn-ghost px-2" title="Ler (liga o timer)" onClick={() => readPhysical(b)}><Timer size={15} /></button>
                    ) : (
                      <Link className="btn btn-ghost px-2" href={`/ler/${b.id}`} title="Ler"><BookOpen size={15} /></Link>
                    )}
                    <button className="btn btn-ghost px-2" title={b.queue_position ? "Já está na fila" : "Adicionar à fila"} disabled={!!b.queue_position}
                      onClick={async () => { const p = await enqueue(b); setBooks((all) => all.map((x) => (x.id === b.id ? { ...x, queue_position: p } : x))); }}>
                      <ListOrdered size={15} />
                    </button>
                    <button className="btn btn-ghost px-2 hover:text-critical" title="Apagar"
                      onClick={async () => { if (confirm(`Apagar "${b.title}" e suas anotações?`)) { await deleteBook(b); void load(); } }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {physical && (
        <PhysicalModal folders={folders} folderId={currentFolderId} onClose={() => setPhysical(false)}
          onSaved={(b) => { setPhysical(false); setBooks((all) => [...all, b].sort((x, y) => x.title.localeCompare(y.title, "pt-BR"))); }} />
      )}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 top-4 z-50 rounded-lg px-4 py-2 text-sm shadow-lg" style={{ background: "var(--text)", color: "var(--bg)" }}>{toast}</div>
      )}
    </Page>
  );
}

function PhysicalModal({ folders, folderId, onClose, onSaved }: { folders: F[]; folderId: string | null; onClose: () => void; onSaved: (b: Book) => void }) {
  const [f, setF] = useState({ title: "", author: "", total_pages: "", current_page: "", words_per_page: "300", folder_id: folderId ?? "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      onSaved(await addPhysicalBook({
        title: f.title.trim(), author: f.author.trim(), total_pages: Number(f.total_pages) || 0,
        current_page: Number(f.current_page) || 0, words_per_page: Number(f.words_per_page) || 300, folder_id: f.folder_id || null,
      }));
    } catch (x) { setErr((x as Error).message); setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="card w-full max-w-md p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold">Livro físico</h2>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <label className="block space-y-1"><span className="label">Título</span>
          <input className="input" required autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </label>
        <label className="block space-y-1"><span className="label">Autor</span>
          <input className="input" value={f.author} onChange={(e) => setF({ ...f, author: e.target.value })} />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="space-y-1"><span className="label">Páginas</span>
            <input className="input" type="number" min={1} required value={f.total_pages} onChange={(e) => setF({ ...f, total_pages: e.target.value })} />
          </label>
          <label className="space-y-1"><span className="label">Estou na p.</span>
            <input className="input" type="number" min={0} value={f.current_page} placeholder="0" onChange={(e) => setF({ ...f, current_page: e.target.value })} />
          </label>
          <label className="space-y-1"><span className="label">Palavras/pág.</span>
            <input className="input" type="number" min={50} max={1000} value={f.words_per_page} onChange={(e) => setF({ ...f, words_per_page: e.target.value })} />
          </label>
        </div>
        <p className="text-xs text-muted">
          Palavras por página: ~250 em livros de bolso, ~300 no padrão, ~400 em páginas densas. Para afinar, conte as palavras de
          3 linhas, divida por 3 e multiplique pelo número de linhas da página.
        </p>
        <label className="block space-y-1"><span className="label">Pasta</span>
          <select className="input" value={f.folder_id} onChange={(e) => setF({ ...f, folder_id: e.target.value })}>
            <option value="">Sem pasta</option>
            {folders.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        {err && <p className="text-sm text-critical">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy}>Salvar</button>
        </div>
      </form>
    </div>
  );
}
