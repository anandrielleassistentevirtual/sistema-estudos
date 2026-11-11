"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, BookOpen, ChevronDown, ChevronUp, Download, ChevronRight, Folder, FolderOpen, FolderPlus, ListOrdered, Pencil, Plus, Search, Timer, Trash2, Upload, X,
} from "lucide-react";
import { Empty, Page } from "@/components/page";
import { ACCEPT, addPhysicalBook, deleteBook, enqueue, limparCacheDeLivros, saveBookFile, uploadBook } from "@/lib/books";
import { useTimerEstado } from "@/components/timer-context";
import { Cover } from "@/components/cover";
import { RowMenu } from "@/components/row-menu";
import { BibliotecaTabs } from "@/components/biblioteca-tabs";
import { OPCOES_LIVRO, StatusPill } from "@/components/status-pill";
import { useRouter } from "next/navigation";
import { coverUrls, epubCover, removeCover, setCover, setCoverFromLink } from "@/lib/covers";
import { downloadBook } from "@/lib/books";
import { cddCompare, flatTree, folderLabel, shelfOrder } from "@/lib/folders";
import { FolderSelect } from "@/components/folder-select";
import { fmtDuration, nf } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";
import { todas } from "@/lib/supabase/todas";
import { Book, BookStatus, Folder as F, STATUS_LABEL, progressoDoLivro } from "@/lib/types";

type Sel = "todos" | "sem-pasta" | string;
const STATUS: BookStatus[] = ["aguardando", "lendo", "pausado", "lido"];
const DEFAULT_WPM = 220;

export default function Biblioteca() {
  const [folders, setFolders] = useState<F[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Sel>("todos");
  const [status, setStatus] = useState<BookStatus | "todos">("todos");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [wpm, setWpm] = useState(DEFAULT_WPM);
  const fileRef = useRef<HTMLInputElement>(null);
  const timer = useTimerEstado();
  const router = useRouter();
  const [physical, setPhysical] = useState(false);
  const [editing, setEditing] = useState<Book | null>(null);
  const [folderModal, setFolderModal] = useState<null | { edit?: F; parentId: string | null }>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (toast) { const x = setTimeout(() => setToast(null), toast.length > 60 ? 6000 : 3000); return () => clearTimeout(x); } }, [toast]);

  function readPhysical(b: Book) {
    timer.set({ category: "Leitura", bookId: b.id, bookTitle: b.title, bookPhysical: true });
    if (!timer.running) timer.start();
    setToast(`Timer ligado para “${b.title}”. Ao encerrar, informe a página onde parou.`);
  }

  const load = useCallback(async () => {
    const sb = supabase();
    const [f, b, r] = await Promise.all([
      sb.from("folders").select("*").order("position").order("name"),
      todas<Book>((de, ate) => sb.from("books").select("*").order("title").order("id").range(de, ate)),
      sb.from("reading_sessions").select("seconds,words").order("started_at", { ascending: false }).limit(200),
    ]);
    setFolders((f.data as F[]) ?? []);
    setBooks(b);
    void coverUrls(b).then(setCovers);
    void limparCacheDeLivros(b.map((x) => x.file_path));
    const secs = (r.data ?? []).reduce((a, x) => a + x.seconds, 0);
    const words = (r.data ?? []).reduce((a, x) => a + x.words, 0);
    if (secs > 300) setWpm(Math.round(words / (secs / 60)));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const children = useMemo(() => {
    const m = new Map<string | null, F[]>();
    for (const f of folders) m.set(f.parent_id, [...(m.get(f.parent_id) ?? []), f]);
    for (const list of m.values()) list.sort(cddCompare);
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

  const tree = useMemo(() => flatTree(folders), [folders]);
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  /** Nº do livro = posição na fila de leitura (só livros na fila e ainda não lidos). */
  const queueNo = useMemo(() => {
    const q = books.filter((b) => b.queue_position != null && b.status !== "lido")
      .sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0));
    return new Map(q.map((b, i) => [b.id, i + 1]));
  }, [books]);
  const shelfIndex = useMemo(() => new Map(tree.map((t, i) => [t.folder.id, i])), [tree]);

  const visible = useMemo(() => {
    let list = sel === "todos" ? books : sel === "sem-pasta" ? books.filter((b) => !b.folder_id) : inFolder(sel);
    if (status !== "todos") list = list.filter((b) => b.status === status);
    if (q.trim()) {
      const t = q.toLowerCase();
      list = list.filter((b) => b.title.toLowerCase().includes(t) || (b.author ?? "").toLowerCase().includes(t)
        || (b.folder_id ? folderById.get(b.folder_id)?.code ?? "" : "").includes(t));
    }
    // ordem de estante: pela pasta (ordem CDD) e, dentro dela, pela numeração
    return [...list].sort((a, b) => {
      const fa = a.folder_id ? shelfIndex.get(a.folder_id) ?? 1e6 : 1e7;
      const fb = b.folder_id ? shelfIndex.get(b.folder_id) ?? 1e6 : 1e7;
      if (fa !== fb) return fa - fb;
      return (queueNo.get(a.id) ?? 1e6) - (queueNo.get(b.id) ?? 1e6) || (a.author ?? "").localeCompare(b.author ?? "", "pt-BR") || a.title.localeCompare(b.title, "pt-BR");
    });
  }, [books, sel, status, q, inFolder, folderById, queueNo, shelfIndex]);

  const currentFolderId = sel === "todos" || sel === "sem-pasta" ? null : sel;

  async function onFiles(files: FileList | File[]) {
    setError(null);
    for (const f of Array.from(files)) {
      setUploading(`Enviando ${f.name}…`);
      try {
        const novo = await uploadBook(f, currentFolderId, (msg) => setUploading(`${f.name}: ${msg}`));
        // sem pasta escolhida, o livro vai para "Sem pasta" (e não aparece dentro das pastas CDD): avisa
        if (!currentFolderId) setToast(`“${novo.title}” entrou em “Sem pasta”. Use ••• → Editar para escolher a pasta.`);
      } catch (e) { setError((e as Error).message); }
    }
    setUploading(null);
    void load();
  }

  function newFolder(parentId: string | null = currentFolderId) {
    setFolderModal({ parentId });
  }

  async function removeFolder(f: F) {
    if (!confirm(`Apagar a pasta "${folderLabel(f)}" e suas subpastas? Os livros continuam na biblioteca, sem pasta.`)) return;
    await supabase().from("folders").delete().eq("id", f.id);
    setSel(f.parent_id ?? "todos");
    void load();
  }

  async function update(b: Book, patch: Partial<Book>) {
    if (patch.status === "lido") patch.finished_at = new Date().toISOString();
    if (patch.status === "lendo" && !b.started_at) patch.started_at = new Date().toISOString();
    if ("folder_id" in patch && patch.folder_id !== b.folder_id) {
      const target = books.filter((x) => x.folder_id === patch.folder_id && x.id !== b.id);
      patch.position = target.length ? Math.max(...shelfOrder(target).map((x, i) => x.position ?? i + 1)) + 1 : 1;
    }
    setBooks((all) => all.map((x) => (x.id === b.id ? { ...x, ...patch } : x)));
    await supabase().from("books").update(patch).eq("id", b.id);
  }

  const queued = useMemo(() => visible.filter((b) => queueNo.has(b.id)).sort((a, b) => queueNo.get(a.id)! - queueNo.get(b.id)!), [visible, queueNo]);
  // fora da fila: os já lidos continuam aparecendo, mas no fim
  const rest = useMemo(() => visible.filter((b) => !queueNo.has(b.id)).sort((a, b) => Number(a.status === "lido") - Number(b.status === "lido")), [visible, queueNo]);
  const queueLeft = queued.reduce((a, b) => a + (b.word_count ?? 0) * (1 - progressoDoLivro(b)), 0);

  /** Reordena a fila (troca com o vizinho) e renumera 1, 2, 3… */
  async function moveQueue(b: Book, dir: -1 | 1) {
    const q = books.filter((x) => queueNo.has(x.id)).sort((x, y) => queueNo.get(x.id)! - queueNo.get(y.id)!);
    const i = q.findIndex((x) => x.id === b.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= q.length) return;
    [q[i], q[j]] = [q[j], q[i]];
    const pos = new Map(q.map((x, k) => [x.id, k + 1]));
    setBooks((all) => all.map((x) => (pos.has(x.id) ? { ...x, queue_position: pos.get(x.id)! } : x)));
    const sb = supabase();
    await Promise.all(q.map((x, k) => sb.from("books").update({ queue_position: k + 1 }).eq("id", x.id)));
  }

  async function dequeue(b: Book) {
    setBooks((all) => all.map((x) => (x.id === b.id ? { ...x, queue_position: null } : x)));
    await supabase().from("books").update({ queue_position: null }).eq("id", b.id);
  }

  const renderRow = (b: Book) => {
    const naFila = queueNo.has(b.id);
    const pasta = b.folder_id ? folderById.get(b.folder_id) : undefined;
    return (
      <div key={b.id} className="group flex items-center gap-2 pr-2 hover:bg-sel/60 transition-colors first:rounded-t-[11px] last:rounded-b-[11px]">
        <Link href={b.format === "fisico" ? "#" : `/ler/${b.id}`} onClick={(e) => { if (b.format === "fisico") { e.preventDefault(); readPhysical(b); } }}
          title={b.format === "fisico" ? "Ler (liga o timer)" : "Abrir no leitor"}
          className="flex items-center gap-3 min-w-0 flex-1 p-3">
          <Cover book={b} url={covers[b.id]} className="w-10 h-14" />
          <span className="min-w-0">
            <span className="block truncate" title={`${b.author ?? "Autor desconhecido"} — ${b.title}`}>
              {b.author ? <span className="font-medium">{b.author}</span> : <span className="text-faint">Autor desconhecido</span>}
              <span className="text-faint"> — </span>
              <span className="font-medium">{b.title}</span>
            </span>
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted mt-0.5">
              {naFila && (
                <span className="inline-flex items-center rounded-md border border-line px-1.5 py-0.5 text-[11px] font-mono font-medium text-ink"
                  title="Posição na fila de leitura">
                  Nº {String(queueNo.get(b.id)).padStart(2, "0")}
                </span>
              )}
              {pasta ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px]" title={`Pasta: ${folderLabel(pasta)}`}>
                  {pasta.code && <span className="font-mono font-medium">{pasta.code}</span>}
                  <span className="truncate max-w-[180px]">{pasta.name}</span>
                </span>
              ) : (
                <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px]">sem pasta</span>
              )}
              <span className="truncate">
                {b.word_count ? ` · ${nf.format(b.word_count)} palavras · ≈ ${fmtDuration((b.word_count / wpm) * 60)}` : ""}
                {b.format === "fisico" ? ` · físico${b.total_pages ? ` · p. ${b.current_page ?? 0}/${b.total_pages}` : ""}` : ""}
                {b.status === "lendo" && progressoDoLivro(b) > 0 ? ` · ${Math.round(progressoDoLivro(b) * 100)}%` : ""}
              </span>
            </span>
          </span>
        </Link>
        {naFila && (
          <span className="hidden sm:flex flex-col opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button className="p-0.5 text-faint hover:text-ink disabled:opacity-30" title="Subir na fila" disabled={queueNo.get(b.id) === 1} onClick={() => moveQueue(b, -1)}><ChevronUp size={15} /></button>
            <button className="p-0.5 text-faint hover:text-ink disabled:opacity-30" title="Descer na fila" disabled={queueNo.get(b.id) === queueNo.size} onClick={() => moveQueue(b, 1)}><ChevronDown size={15} /></button>
          </span>
        )}
        <StatusPill label="Status do livro" value={b.status} options={OPCOES_LIVRO} onChange={(st) => update(b, { status: st })} />
        <RowMenu items={[
          b.format === "fisico"
            ? { label: "Ler (liga o timer)", icon: Timer, onClick: () => readPhysical(b) }
            : { label: "Abrir no leitor", icon: BookOpen, onClick: () => router.push(`/ler/${b.id}`) },
          ...(b.format !== "fisico" ? [{
            label: `Baixar o arquivo (${b.format.toUpperCase()})`, icon: Download,
            onClick: async () => { setToast("Preparando o download…"); try { await saveBookFile(b); setToast(null); } catch (e) { setToast((e as Error).message); } },
          }] : []),
          { label: "Editar título, autor e pasta", icon: Pencil, onClick: () => setEditing(b) },
          naFila
            ? { label: "Tirar da fila", icon: X, onClick: () => dequeue(b), separar: true }
            : { label: "Adicionar à fila", icon: ListOrdered, disabled: b.status === "lido", separar: true,
                onClick: async () => { const p = await enqueue(b); setBooks((all) => all.map((x) => (x.id === b.id ? { ...x, queue_position: p } : x))); } },
          ...(naFila ? [
            { label: "Subir na fila", icon: ArrowUp, disabled: queueNo.get(b.id) === 1, onClick: () => moveQueue(b, -1) },
            { label: "Descer na fila", icon: ArrowDown, disabled: queueNo.get(b.id) === queueNo.size, onClick: () => moveQueue(b, 1) },
          ] : []),
          { label: "Apagar livro", icon: Trash2, danger: true, separar: true,
            onClick: async () => { if (confirm(`Apagar "${b.title}" e suas anotações?`)) { await deleteBook(b); void load(); } } },
        ]} />
      </div>
    );
  };

  const stats = (list: Book[]) => {
    const total = list.reduce((a, b) => a + (b.word_count ?? 0), 0);
    const left = list.filter((b) => b.status !== "lido").reduce((a, b) => a + (b.word_count ?? 0) * (1 - progressoDoLivro(b)), 0);
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
                onClick={() => { setSel(f.id); if (kids) setOpen((o) => new Set(o).add(f.id)); }}
              >
                <button
                  className={`p-0.5 text-faint ${kids ? "" : "invisible"}`}
                  onClick={(e) => { e.stopPropagation(); setOpen((o) => { const x = new Set(o); if (x.has(f.id)) x.delete(f.id); else x.add(f.id); return x; }); }}
                >
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {sel === f.id ? <FolderOpen size={15} className="text-icon" /> : <Folder size={15} className="text-muted" />}
                <span className="truncate flex-1 py-1.5" title={folderLabel(f)}>
                  {f.code && <span className={`font-mono text-xs mr-1 ${depth === 0 ? "font-medium text-ink" : "text-muted"}`}>{f.code} –</span>}
                  <span className={depth === 0 ? "font-medium" : ""}>{f.name}</span>
                </span>
                {n > 0 && <span className="text-xs text-faint tabular-nums group-hover:hidden">{n}</span>}
                <button className="hidden group-hover:block p-0.5 text-faint hover:text-accent" title="Nova subpasta aqui"
                  onClick={(e) => { e.stopPropagation(); setOpen((o) => new Set(o).add(f.id)); newFolder(f.id); }}>
                  <FolderPlus size={14} />
                </button>
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
      tabs={<BibliotecaTabs />}
      title="Biblioteca"
      subtitle={`${all.waiting} livros aguardando · ≈ ${fmtDuration((all.left / wpm) * 60)} de leitura pela frente a ${wpm} ppm`}
      actions={
        <>
          <button className="btn" onClick={() => newFolder()}><FolderPlus size={15} /> {currentFolderId ? "Subpasta aqui" : "Nova pasta"}</button>
          <button className="btn" onClick={() => setPhysical(true)}><Plus size={15} /> Livro físico</button>
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={!!uploading}>
            <Upload size={15} /> {uploading ? "Enviando…" : "Enviar livros"}
          </button>
          <input ref={fileRef} type="file" multiple accept={ACCEPT} hidden onChange={(e) => e.target.files && onFiles(e.target.files)} />
        </>
      }
    >
      <div className="grid md:grid-cols-[300px_1fr] gap-4">
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
          <button className="w-full flex items-center gap-1.5 text-xs text-muted hover:text-accent px-2 py-2 mt-1" onClick={() => newFolder(null)}>
            <FolderPlus size={13} /> Nova pasta principal
          </button>
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
                <button className="hover:text-accent" onClick={() => setSel(f.id)}>{folderLabel(f)}</button>
              </span>
            ))}
            {cur && (
              <span className="ml-1 flex gap-1">
                <button className="text-faint hover:text-ink" title="Editar pasta" onClick={() => setFolderModal({ edit: cur, parentId: cur.parent_id })}><Pencil size={13} /></button>
                <button className="text-faint hover:text-critical" title="Apagar pasta" onClick={() => removeFolder(cur)}><Trash2 size={13} /></button>
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2 items-center mb-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <input className="input pl-8" placeholder="Buscar título ou autor" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="inline-flex rounded-lg bg-surface-2 p-1 text-xs">
              {(["todos", ...STATUS] as const).map((s) => (
                <button key={s} onClick={() => setStatus(s)}
                  className={`px-2.5 py-1 rounded-md ${status === s ? "bg-seg shadow-sm font-medium" : "text-muted"}`}>
                  {s === "todos" ? "Todos" : STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-critical mb-3">{error}</p>}
          {uploading && <p className="text-sm text-muted mb-3" aria-live="polite">{uploading}</p>}

          {visible.length === 0 ? (
            <Empty>
              Nenhum livro aqui. Arraste arquivos <b>EPUB</b>, <b>TXT</b> ou <b>MD</b> para esta área ou use “Enviar livros”.
            </Empty>
          ) : (
            <>
              {queued.length > 0 && (
                <section className="mb-6">
                  <div className="flex items-baseline justify-between mb-2 px-1">
                    <h2 className="font-medium flex items-center gap-2"><ListOrdered size={16} className="text-icon" /> Fila de leitura</h2>
                    <span className="text-xs text-muted">
                      {queued.length} {queued.length === 1 ? "livro" : "livros"}
                      {queueLeft ? ` · ≈ ${fmtDuration((queueLeft / wpm) * 60)} de leitura` : ""}
                    </span>
                  </div>
                  <div className="card divide-y divide-line border-accent/40">
                    {queued.map((b) => renderRow(b))}
                  </div>
                </section>
              )}
              {rest.length > 0 && (
                <section>
                  <div className="flex items-baseline justify-between mb-2 px-1">
                    <h2 className="font-medium text-muted">{queued.length ? "Fora da fila" : "Livros"}</h2>
                    <span className="text-xs text-muted">{rest.length} {rest.length === 1 ? "livro" : "livros"} · use ☰ para pôr na fila</span>
                  </div>
                  <div className="card divide-y divide-line">
                    {rest.map((b) => renderRow(b))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
      {folderModal && (
        <FolderModal folders={folders} edit={folderModal.edit} parentId={folderModal.parentId} onClose={() => setFolderModal(null)}
          onSaved={(id) => { setFolderModal(null); void load(); if (id) setSel(id); }} />
      )}
      {editing && (
        <EditBookModal book={editing} folders={folders} coverUrl={covers[editing.id]} onClose={() => setEditing(null)}
          onCover={(id, url) => setCovers((c) => { const n = { ...c }; if (url) n[id] = url; else delete n[id]; return n; })}
          onSaved={(b) => { setEditing(null); setBooks((all) => all.map((x) => (x.id === b.id ? b : x)).sort((x, y) => x.title.localeCompare(y.title, "pt-BR"))); }} />
      )}
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
          <h2 className="font-medium">Livro físico</h2>
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
          <FolderSelect folders={folders} value={f.folder_id} onChange={(id) => setF({ ...f, folder_id: id })} />
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

/** "Título - Sobrenome, Nome" → { título, "Sobrenome, Nome" } (padrão de catálogo) */
function splitTitle(title: string): { title: string; author: string } | null {
  const m = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (!m) return null;
  return { title: m[1].trim(), author: m[2].trim() };
}

function EditBookModal({ book, folders, coverUrl, onClose, onSaved, onCover }: {
  book: Book; folders: F[]; coverUrl?: string; onClose: () => void; onSaved: (b: Book) => void; onCover: (id: string, url: string | null) => void;
}) {
  const [coverPath, setCoverPath] = useState(book.cover_path ?? null);
  const [preview, setPreview] = useState<string | undefined>(coverUrl);
  const [coverBusy, setCoverBusy] = useState<string | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState("");

  async function applyLink(value: string) {
    setCoverBusy("Buscando a imagem…");
    setErr(null);
    try {
      const r = await setCoverFromLink({ id: book.id, cover_path: coverPath }, value);
      setCoverPath(r.path);
      setPreview(r.url);
      onCover(book.id, r.url);
      setLink("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setCoverBusy(null);
    }
  }

  async function applyCover(img: Blob | null, how: string) {
    if (!img) { setErr(how === "epub" ? "Este EPUB não tem capa embutida." : "Imagem inválida."); return; }
    setCoverBusy("Salvando capa…");
    setErr(null);
    try {
      const path = await setCover({ id: book.id, cover_path: coverPath }, img);
      setCoverPath(path);
      const url = URL.createObjectURL(img);
      setPreview(url);
      onCover(book.id, url);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setCoverBusy(null);
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
    if (item) { e.preventDefault(); void applyCover(item.getAsFile(), "colar"); return; }
    const text = e.clipboardData.getData("text").trim();
    const inField = (e.target as HTMLElement).closest("input[name=titulo],input[name=autor]");
    if (!inField && /^https?:\/\/\S+$/.test(text)) { e.preventDefault(); setLink(text); void applyLink(text); }
  }

  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author ?? "");
  const [folderId, setFolderId] = useState(book.folder_id ?? "");
  const [pages, setPages] = useState(book.total_pages ? String(book.total_pages) : "");
  const [current, setCurrent] = useState(book.current_page ? String(book.current_page) : "");
  const [wpp, setWpp] = useState(String(book.words_per_page ?? 300));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const suggestion = splitTitle(title);
  const physical = book.format === "fisico";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const patch: Partial<Book> = { title: title.trim(), author: author.trim() || null, folder_id: folderId || null };
    if (physical) {
      const total = Number(pages) || null;
      const cur = Number(current) || null;
      const w = Number(wpp) || 300;
      Object.assign(patch, {
        total_pages: total, current_page: cur, words_per_page: w,
        word_count: total ? total * w : null,
        progress: total && cur ? Math.min(1, cur / total) : 0,
      });
    }
    const { error } = await supabase().from("books").update(patch).eq("id", book.id);
    if (error) { setErr(error.message); setBusy(false); return; }
    onSaved({ ...book, ...patch, cover_path: coverPath });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40" onClick={onClose}>
      <form onSubmit={save} onPaste={onPaste} onClick={(e) => e.stopPropagation()} className="card w-full max-w-md p-5 space-y-3 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <h2 className="font-medium">Editar livro</h2>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="flex gap-4 items-start">
          <Cover book={book} url={preview} className="w-24 h-36" />
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="label">Capa</span>
            <button type="button" className="btn text-xs py-1" onClick={() => coverInput.current?.click()} disabled={!!coverBusy}>
              <Upload size={13} /> Enviar imagem
            </button>
            {book.format === "epub" && (
              <button type="button" className="btn text-xs py-1" disabled={!!coverBusy}
                onClick={async () => { setCoverBusy("Lendo o EPUB…"); try { await applyCover(await epubCover(await downloadBook(book)), "epub"); } finally { setCoverBusy(null); } }}>
                Usar a capa do EPUB
              </button>
            )}
            {coverPath && (
              <button type="button" className="btn btn-ghost text-xs py-1 hover:text-critical" disabled={!!coverBusy}
                onClick={async () => { await removeCover({ id: book.id, cover_path: coverPath }); setCoverPath(null); setPreview(undefined); onCover(book.id, null); }}>
                <Trash2 size={13} /> Remover capa
              </button>
            )}
            <div className="flex gap-1 mt-1">
              <input className="input text-xs py-1" placeholder="ou cole o link da imagem" value={link} onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (link.trim()) void applyLink(link); } }} />
              <button type="button" className="btn text-xs py-1 whitespace-nowrap" disabled={!link.trim() || !!coverBusy} onClick={() => applyLink(link)}>Usar link</button>
            </div>
            <span className="text-xs text-muted">{coverBusy ?? "também dá para colar uma imagem copiada (Ctrl+V)"}</span>
            <input ref={coverInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void applyCover(f, "arquivo"); e.target.value = ""; }} />
          </div>
        </div>
        <label className="block space-y-1"><span className="label">Título</span>
          <input className="input" name="titulo" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        {suggestion && (
          <button type="button" className="text-xs text-accent text-left"
            onClick={() => { setTitle(suggestion.title); if (!author.trim()) setAuthor(suggestion.author); }}>
            Separar: título “{suggestion.title}” · autor “{suggestion.author}”
          </button>
        )}
        <label className="block space-y-1"><span className="label">Autor</span>
          <input className="input" name="autor" value={author} placeholder="Sobrenome, Nome" onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <label className="block space-y-1"><span className="label">Pasta (CDD)</span>
          <FolderSelect folders={folders} value={folderId} className="input" onChange={setFolderId} />
        </label>
        {physical && (
          <div className="grid grid-cols-3 gap-3">
            <label className="space-y-1"><span className="label">Páginas</span>
              <input className="input" type="number" min={1} value={pages} onChange={(e) => setPages(e.target.value)} />
            </label>
            <label className="space-y-1"><span className="label">Estou na p.</span>
              <input className="input" type="number" min={0} value={current} onChange={(e) => setCurrent(e.target.value)} />
            </label>
            <label className="space-y-1"><span className="label">Palavras/pág.</span>
              <input className="input" type="number" min={50} max={1000} value={wpp} onChange={(e) => setWpp(e.target.value)} />
            </label>
          </div>
        )}
        {err && <p className="text-sm text-critical">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy}>Salvar</button>
        </div>
      </form>
    </div>
  );
}

function FolderModal({ folders, edit, parentId, onClose, onSaved }: {
  folders: F[]; edit?: F; parentId: string | null; onClose: () => void; onSaved: (id: string | null) => void;
}) {
  const [code, setCode] = useState(edit?.code ?? "");
  const [name, setName] = useState(edit?.name ?? "");
  const [parent, setParent] = useState<string>(edit ? edit.parent_id ?? "" : parentId ?? "");
  const [err, setErr] = useState<string | null>(null);
  // não pode mover a pasta para dentro dela mesma
  const blocked = useMemo(() => {
    if (!edit) return new Set<string>();
    const out = new Set([edit.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of folders) if (f.parent_id && out.has(f.parent_id) && !out.has(f.id)) { out.add(f.id); grew = true; }
    }
    return out;
  }, [folders, edit]);
  const parentFolder = folders.find((f) => f.id === parent);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const row = { code: code.trim() || null, name: name.trim(), parent_id: parent || null };
    if (!row.name) return;
    const sb = supabase();
    if (edit) {
      const { error } = await sb.from("folders").update(row).eq("id", edit.id);
      if (error) return setErr(error.message);
      onSaved(edit.id);
    } else {
      const siblings = folders.filter((f) => f.parent_id === row.parent_id).length;
      const { data, error } = await sb.from("folders").insert({ ...row, position: siblings }).select("id").single();
      if (error) return setErr(error.message);
      onSaved(data?.id ?? null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="card w-full max-w-md p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-medium">{edit ? "Editar pasta" : parentFolder ? "Nova subpasta" : "Nova pasta"}</h2>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <label className="block space-y-1"><span className="label">Dentro de</span>
          <FolderSelect folders={folders} value={parent} onChange={setParent} exclude={blocked} emptyLabel="— pasta principal (nova classe) —" />
        </label>
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <label className="space-y-1"><span className="label">Código CDD</span>
            <input className="input font-mono" value={code} autoFocus placeholder={parentFolder?.code ? `${parentFolder.code}…` : "ex.: 869.1"} onChange={(e) => setCode(e.target.value)} />
          </label>
          <label className="space-y-1"><span className="label">Nome</span>
            <input className="input" required value={name} placeholder="ex.: Poesia brasileira" onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        <p className="text-xs text-muted">O código ordena as pastas como numa biblioteca (109 vem antes de 111.85) e forma o número de chamada dos livros (ex.: 869.1-03).</p>
        {err && <p className="text-sm text-critical">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary">Salvar</button>
        </div>
      </form>
    </div>
  );
}

