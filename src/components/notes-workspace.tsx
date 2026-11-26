"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Atom, ChevronLeft, Download, Eye, FileText, Link as LinkIcon, Pencil, Plus, Search, Trash2, Upload, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { baixarArquivo } from "@/lib/baixar";
import { todas } from "@/lib/supabase/todas";
import { countWords, slug, wikilinks } from "@/lib/text";
import { nf } from "@/lib/dates";
import type { Note } from "@/lib/types";
import { atomicTemplate, locationLabel, newZid } from "@/lib/zettel";
import { bookName } from "@/lib/folders";
import { syncHeading, caminhoRelativo } from "@/lib/estudos";
import { CONTEINER, Empty } from "@/components/page";

// a pré-visualização em Markdown (react-markdown + GFM) só é baixada quando aparece na tela
const Markdown = dynamic(() => import("@/components/markdown"), { ssr: false, loading: () => <p className="text-sm text-faint">…</p> });

type Kind = Note["kind"];
type View = "editar" | "ler" | "dividir";

/**
 * Notas atômicas (Zettelkasten) em Markdown: uma ideia por nota, com [[wikilinks]],
 * backlinks e exportação para um vault do Obsidian.
 */
export function NotesWorkspace({ kind, tabs }: { kind: Kind; tabs?: React.ReactNode }) {
  const [notes, setNotes] = useState<Note[]>([]);
  // só depois da 1ª leitura: sem isso, o convite de "lista vazia" pisca antes das notas chegarem
  const [pronto, setPronto] = useState(false);
  const [current, setCurrent] = useState<Note | null>(null);
  // celular: uma tela de cada vez — a lista ou a nota aberta (com botão de voltar)
  const [naNota, setNaNota] = useState(false);
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("dividir");
  const [saving, setSaving] = useState<"salvo" | "salvando" | "pendente">("salvo");
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [source, setSource] = useState<{ id: string; label: string; bookId: string | null } | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  // lista recolhível (também pelo modo foco: Ctrl + \)
  const [listHidden, setListHidden] = useState(false);
  useEffect(() => { try { setListHidden(localStorage.getItem("lista-oculta") === "1"); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("lista-oculta", listHidden ? "1" : "0"); } catch {} }, [listHidden]);
  useEffect(() => {
    const f = (e: Event) => setListHidden((e as CustomEvent<{ oculto: boolean }>).detail.oculto);
    window.addEventListener("modo-foco", f);
    return () => window.removeEventListener("modo-foco", f);
  }, []);

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
    const data = await todas<Note>((de, ate) => supabase().from("notes").select("*").eq("kind", kind).order("title").order("id").range(de, ate));
    const list = data.sort((a, b) => (b.zid ?? "").localeCompare(a.zid ?? ""));
    setNotes(list);
    setPronto(true);
    const want = new URLSearchParams(window.location.search).get("id");
    if (want) setNaNota(true);
    setCurrent((c) => list.find((n) => n.id === (c?.id ?? want)) ?? c ?? list[0] ?? null);
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);

  // nota atômica a partir de uma nota literária (?de=<id>)
  useEffect(() => {
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
      if (data) { await load(); setCurrent(data as Note); setNaNota(true); setView("editar"); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // fonte (nota literária) da nota atômica aberta
  useEffect(() => {
    if (!current?.source_id) { setSource(null); return; }
    void (async () => {
      const sb = supabase();
      const { data: lit } = await sb.from("notes").select("id,book_id,location").eq("id", current.source_id!).single();
      if (!lit) return setSource(null);
      const { data: book } = lit.book_id ? await sb.from("books").select("title,author").eq("id", lit.book_id).single() : { data: null };
      setSource({ id: lit.id, bookId: lit.book_id, label: `${book ? bookName(book) : "Nota literária"}${lit.location ? ` · ${locationLabel(lit.location)}` : ""}` });
    })();
  }, [current?.source_id]);

  useEffect(() => {
    if (current) window.history.replaceState(null, "", `?id=${current.id}`);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const byTitle = useMemo(() => new Map(notes.map((n) => [n.title.toLowerCase(), n])), [notes]);

  const visiveis = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? notes.filter((n) => n.title.toLowerCase().includes(t) || n.content.toLowerCase().includes(t)) : notes;
  }, [notes, q]);

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
    const zid = newZid();
    const base = title ?? `${zid} Nova ideia`;
    let t = base;
    for (let i = 2; byTitle.has(t.toLowerCase()); i++) t = `${base} ${i}`;
    const { data } = await supabase()
      .from("notes")
      .insert({ kind, title: t, zid, content: atomicTemplate({ zid }), ...extra })
      .select()
      .single();
    if (data) {
      setNotes((all) => [...all, data as Note].sort((a, b) => a.title.localeCompare(b.title, "pt-BR")));
      setCurrent(data as Note);
      setNaNota(true);
      setView(title ? "dividir" : "editar");
    }
  }

  async function remove(n: Note) {
    if (!confirm(`Apagar “${n.title}”?`)) return;
    await supabase().from("notes").delete().eq("id", n.id);
    setNotes((all) => all.filter((x) => x.id !== n.id));
    setCurrent(notes.find((x) => x.id !== n.id) ?? null);
    setNaNota(false);
  }

  function openLink(title: string) {
    const n = byTitle.get(title.toLowerCase());
    if (n) { setCurrent(n); setNaNota(true); }
    else if (confirm(`A nota “${title}” não existe. Criar agora?`)) void create(title);
  }

  function chooseFiles(list: FileList) {
    const files = Array.from(list).filter((f) => /\.(md|markdown|txt)$/i.test(f.name));
    if (files.length) void importFiles(files);
  }

  async function importFiles(files: File[]) {
    const sb = supabase();
    const existing = new Map(notes.map((n) => [`${n.course}|${n.folder}|${n.title}`.toLowerCase(), n.id]));
    const rows: Record<string, unknown>[] = [];
    let updated = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setImporting(`Lendo ${i + 1} de ${files.length}…`);
      const content = await f.text();
      const folder = caminhoRelativo(f).split("/").slice(1, -1).join("/");
      const title = f.name.replace(/\.(md|markdown|txt)$/i, "");
      const key = `|${folder}|${title}`.toLowerCase();
      if (existing.has(key)) {
        await sb.from("notes").update({ content }).eq("id", existing.get(key)!);
        updated++;
      } else {
        rows.push({ kind, title, content, folder });
      }
    }
    for (let i = 0; i < rows.length; i += 100) {
      setImporting(`Salvando ${Math.min(rows.length, i + 100)} de ${rows.length}…`);
      await sb.from("notes").insert(rows.slice(i, i + 100));
    }
    setImporting(`${rows.length} notas importadas${updated ? `, ${updated} atualizadas` : ""}.`);
    setTimeout(() => setImporting(null), 4000);
    void load();
  }

  async function exportVault() {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const textos = new Map(notes.map((n) => [n.id, n.content]));
    for (const n of notes) zip.file(`${safe(n.title)}.md`, textos.get(n.id) ?? "");
    const blob = await zip.generateAsync({ type: "blob" });
    baixarArquivo(blob, `notas-atomicas-${new Date().toISOString().slice(0, 10)}.zip`);
  }

  // transforma [[Link]] em links clicáveis no preview
  const rendered = useMemo(
    () => (current?.content ?? "").replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, t: string, alias?: string) =>
      `[${(alias || t).trim()}](#wiki:${encodeURIComponent(t.trim())})`),
    [current?.content],
  );

  // a lista vazia: a ideia explicada e o botão para a primeira nota (no centro do painel; no celular, no lugar da lista)
  const convite = (
    <Empty icone={Atom}>
      Uma ideia por nota, com as suas palavras. Ligue cada nota a outras com [[título]] e diga por que a ligação importa. Crie a partir de uma nota literária (botão ⚛) ou do zero (+).
      <div className="mt-4">
        <button className="btn btn-primary" onClick={() => create()}><Plus size={15} /> Nova nota atômica</button>
      </div>
    </Empty>
  );

  return (
    <div className="flex flex-col h-[calc(100dvh-3rem-env(safe-area-inset-top))] md:h-screen">
    {/* a moldura das outras telas: as abas ficam no mesmo pixel nas cinco abas de Notas */}
    {tabs && <div className={`${CONTEINER} pt-5 md:pt-6 shrink-0`}>{tabs}</div>}
    {/* a lista começa na mesma borda das abas (o recuo é o da moldura: 16px no celular, 32px no computador) */}
    <div className={`grid grid-cols-1 flex-1 min-h-0 ${listHidden ? "" : "md:grid-cols-[320px_1fr]"}`}>
      <aside className={`md:border-r border-line flex-col min-h-0 bg-bg ${naNota ? "hidden" : "flex"} ${listHidden ? "md:hidden" : "md:flex"}`}>
        <div className="py-3 px-4 md:pr-3 md:pl-8 space-y-2 border-b border-line">
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-medium flex items-center gap-1 min-w-0 whitespace-nowrap">
              <button className="hidden md:block p-1 -ml-1 text-faint hover:text-ink rounded-md hover:bg-surface-2" title="Recolher a lista (Ctrl + \)" onClick={() => setListHidden(true)}>
                <PanelLeftClose size={16} />
              </button>
              Notas atômicas
              {pronto && <span className="ml-1 text-xs text-faint tabular-nums">{notes.length}</span>}
            </h1>
            <div className="flex gap-0.5 shrink-0">
              <button className="btn btn-ghost px-2" title="Importar arquivos .md" onClick={() => fileRef.current?.click()}><Upload size={15} /></button>
              <button className="btn btn-ghost px-2" title="Exportar como vault (.zip)" onClick={exportVault}><Download size={15} /></button>
              <button className="btn btn-primary px-2" title="Nova nota" onClick={() => create()}><Plus size={15} /></button>
            </div>
            <input ref={fileRef} type="file" multiple accept=".md,.markdown,.txt" hidden onChange={(e) => { if (e.target.files) chooseFiles(e.target.files); e.target.value = ""; }} />
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input className="input pl-8 py-1.5 text-sm" placeholder="Buscar em títulos e textos" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 py-2 pr-2 pl-2 md:pl-6">
          {importing && <p className="text-xs text-accent px-2 py-1">{importing}</p>}
          {/* no celular o painel da nota fica escondido até abrir uma: o convite aparece aqui */}
          {pronto && notes.length === 0 && <div className="md:hidden px-2 py-1">{convite}</div>}
          {visiveis.map((n) =>
            renaming?.id === n.id ? (
              <form key={n.id} className="flex items-center gap-1 px-1 py-0.5"
                onSubmit={(e) => { e.preventDefault(); void rename(n, renaming.value); }}>
                <input className="input py-1 text-sm" autoFocus value={renaming.value}
                  onChange={(e) => setRenaming({ id: n.id, value: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Escape") setRenaming(null); }}
                  onBlur={() => void rename(n, renaming.value)} />
              </form>
            ) : (
              <div key={n.id} className={`group/item flex items-center rounded-md ${current?.id === n.id ? "bg-accent-soft font-medium" : "hover:bg-surface-2"}`}>
                <button onClick={() => { setCurrent(n); setNaNota(true); }} onDoubleClick={() => setRenaming({ id: n.id, value: n.title })}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left px-2 py-2.5 md:py-1.5 text-[15px] md:text-sm" title="Dois cliques para renomear">
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
      </aside>

      <section className={`${naNota ? "flex" : "hidden"} md:flex flex-col min-h-0 min-w-0`}>
        {!current ? (
          pronto && (
            <div className="relative flex-1 grid place-items-center p-6">
              {/* com a lista recolhida, o botão de mostrá-la continua à mão */}
              {listHidden && (
                <button className="absolute top-3 left-3 hidden md:inline-flex btn btn-ghost px-2" title="Mostrar a lista (Ctrl + \)" onClick={() => setListHidden(false)}>
                  <PanelLeftOpen size={16} />
                </button>
              )}
              {notes.length === 0 ? convite : <Empty>Escolha uma nota na lista.</Empty>}
            </div>
          )
        ) : (
          <>
            <div className="border-b border-line px-4 md:px-6 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <button className="md:hidden btn btn-ghost px-1.5 -ml-1.5 shrink-0" aria-label="Voltar para a lista" onClick={() => setNaNota(false)}>
                  <ChevronLeft size={20} />
                </button>
                {listHidden && (
                  <button className="hidden md:inline-flex btn btn-ghost px-2 shrink-0" title="Mostrar a lista (Ctrl + \)" onClick={() => setListHidden(false)}>
                    <PanelLeftOpen size={16} />
                  </button>
                )}
                <label className="group/titulo flex-1 min-w-0 flex items-center gap-1.5 rounded-md border border-line/60 hover:border-line focus-within:border-accent px-1.5 -mx-1.5 cursor-text"
                  title="Clique para renomear">
                  <input className="flex-1 bg-transparent text-xl font-medium outline-none min-w-0 py-0.5" value={current.title}
                    placeholder="Título" onChange={(e) => patch({ title: e.target.value })} />
                  <Pencil size={16} className="text-muted group-hover/titulo:text-accent shrink-0" />
                </label>
                <span className="text-xs text-faint hidden sm:inline">{saving === "salvo" ? "salvo" : "salvando…"}</span>
                <div className="seg">
                  {([["editar", Pencil], ["dividir", LinkIcon], ["ler", Eye]] as const).map(([v, Icon]) => (
                    <button key={v} title={v === "dividir" ? "Editor + visualização" : v === "editar" ? "Só editor" : "Só leitura"}
                      onClick={() => setView(v)} aria-pressed={view === v} className="px-2">
                      <Icon size={14} />
                    </button>
                  ))}
                </div>
                <button className="btn btn-ghost px-2 hover:text-critical" onClick={() => remove(current)} title="Apagar"><Trash2 size={15} /></button>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="inline-flex items-center rounded-md border border-line px-2 py-0.5 font-mono text-xs text-muted" title="ID único da nota (Zettelkasten)">ID {current.zid ?? "—"}</span>
                {source && (
                  <a href={source.bookId ? `/notas/literarias?livro=${source.bookId}` : "/notas/literarias"} className="text-xs text-accent hover:underline self-center">
                    Fonte: {source.label}
                  </a>
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
                    <Markdown
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
                    </Markdown>
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
    </div>
  );
}

function safe(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, "-").trim() || slug(s) || "sem-titulo";
}
