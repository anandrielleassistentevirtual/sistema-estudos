"use client";
/** As janelas da Biblioteca, num só molde: editar livro, livro físico, pasta, mesa, colar lista e escolher livro. */
import { useMemo, useRef, useState } from "react";
import { Search, Trash2, Upload, X } from "lucide-react";
import { Cover } from "@/components/cover";
import { FolderSelect } from "@/components/folder-select";
import { addPhysicalBook, downloadBook } from "@/lib/books";
import { epubCover, removeCover, setCover, setCoverFromLink } from "@/lib/covers";
import { acharLivro, lerLista, type Objetivo } from "@/lib/objetivos";
import { supabase } from "@/lib/supabase/client";
import type { Book, Folder } from "@/lib/types";
import { useBiblioteca } from "./dados";
import { Ficha } from "./ficha";
import { Recordacao } from "./recordar";
import { Triagem } from "./triagem";
import { TemaJanela } from "./tema";

/** O molde de todas as janelas. */
export function Janela({ titulo, onClose, children, largura = "max-w-md", sub }: {
  titulo: React.ReactNode; onClose: () => void; children: React.ReactNode; largura?: string; sub?: React.ReactNode;
}) {
  return (
    <div className="modal fixed inset-0 z-[62] grid place-items-center p-4 bg-black/45" onClick={onClose}>
      <div className={`card w-full ${largura} p-5 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="modal-title">{titulo}</h2>
            {sub && <p className="text-sm text-muted mt-1">{sub}</p>}
          </div>
          <button onClick={onClose} className="modal-close shrink-0" aria-label="Fechar"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Botoes({ onClose, ok = "Salvar", desligado }: { onClose: () => void; ok?: string; desligado?: boolean }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" disabled={desligado}>{ok}</button>
    </div>
  );
}

/** Todas as janelas abertas pela Biblioteca (uma de cada vez). */
export function JanelasDaBiblioteca() {
  const d = useBiblioteca();
  const j = d.janela;
  const fechar = () => d.abrir(null);
  if (!j) return d.aviso ? <Aviso texto={d.aviso} /> : null;
  const livro = "id" in j && j.id ? d.porId.get(j.id) : undefined;
  return (
    <>
      {j.tipo === "ficha" && livro && <Ficha livro={livro} />}
      {j.tipo === "editar" && livro && <EditarLivro livro={livro} onClose={fechar} />}
      {j.tipo === "fisico" && <LivroFisico pasta={j.pasta} onClose={fechar} />}
      {j.tipo === "pasta" && <PastaJanela edit={j.edit} pai={j.pai} onClose={fechar} />}
      {j.tipo === "mesa" && <MesaJanela edit={j.edit} onClose={fechar} />}
      {j.tipo === "colar" && <ColarLista onClose={fechar} />}
      {j.tipo === "adicionar" && <AdicionarNaMesa mesa={j.mesa} onClose={fechar} />}
      {j.tipo === "na-mesa" && livro && <EscolherMesa livro={livro} onClose={fechar} />}
      {j.tipo === "triagem" && <Triagem onClose={fechar} />}
      {j.tipo === "recordar" && <Recordacao inicial={j.id} onClose={fechar} />}
      {j.tipo === "tema" && <TemaJanela tema={j.tema} ids={j.ids} onClose={fechar} />}
      {d.aviso && <Aviso texto={d.aviso} />}
    </>
  );
}

function Aviso({ texto }: { texto: string }) {
  return <div role="status" className="toast fixed left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top)+1rem)] z-[70] max-w-[calc(100vw-2rem)]">{texto}</div>;
}

/* ───────────── livro ───────────── */

/** "Título - Sobrenome, Nome" → { título, "Sobrenome, Nome" } (padrão de catálogo) */
function separar(title: string): { title: string; author: string } | null {
  const m = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  return m ? { title: m[1].trim(), author: m[2].trim() } : null;
}

function EditarLivro({ livro: book, onClose }: { livro: Book; onClose: () => void }) {
  const { pastas, capas, setCapas, setLivros } = useBiblioteca();
  const [coverPath, setCoverPath] = useState(book.cover_path ?? null);
  const [preview, setPreview] = useState<string | undefined>(capas[book.id]);
  const [coverBusy, setCoverBusy] = useState<string | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState("");
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author ?? "");
  const [folderId, setFolderId] = useState(book.folder_id ?? "");
  const [pages, setPages] = useState(book.total_pages ? String(book.total_pages) : "");
  const [current, setCurrent] = useState(book.current_page ? String(book.current_page) : "");
  const [wpp, setWpp] = useState(String(book.words_per_page ?? 300));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sugestao = separar(title);
  const fisico = book.format === "fisico";
  const novaCapa = (url: string | null) => setCapas((c) => { const n = { ...c }; if (url) n[book.id] = url; else delete n[book.id]; return n; });

  async function porLink(value: string) {
    setCoverBusy("Buscando a imagem…"); setErr(null);
    try {
      const r = await setCoverFromLink({ id: book.id, cover_path: coverPath }, value);
      setCoverPath(r.path); setPreview(r.url); novaCapa(r.url); setLink("");
    } catch (e) { setErr((e as Error).message); } finally { setCoverBusy(null); }
  }
  async function porImagem(img: Blob | null, como: string) {
    if (!img) { setErr(como === "epub" ? "Este EPUB não tem capa embutida." : "Imagem inválida."); return; }
    setCoverBusy("Salvando a capa…"); setErr(null);
    try {
      const path = await setCover({ id: book.id, cover_path: coverPath }, img);
      const url = URL.createObjectURL(img);
      setCoverPath(path); setPreview(url); novaCapa(url);
    } catch (e) { setErr((e as Error).message); } finally { setCoverBusy(null); }
  }
  function colar(e: React.ClipboardEvent) {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
    if (item) { e.preventDefault(); void porImagem(item.getAsFile(), "colar"); return; }
    const text = e.clipboardData.getData("text").trim();
    const noCampo = (e.target as HTMLElement).closest("input[name=titulo],input[name=autor]");
    if (!noCampo && /^https?:\/\/\S+$/.test(text)) { e.preventDefault(); setLink(text); void porLink(text); }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const patch: Partial<Book> = { title: title.trim(), author: author.trim() || null, folder_id: folderId || null };
    if (fisico) {
      const total = Number(pages) || null, cur = Number(current) || null, w = Number(wpp) || 300;
      Object.assign(patch, { total_pages: total, current_page: cur, words_per_page: w, word_count: total ? total * w : null, progress: total && cur ? Math.min(1, cur / total) : 0 });
    }
    const { error } = await supabase().from("books").update(patch).eq("id", book.id);
    if (error) { setErr(error.message); setBusy(false); return; }
    setLivros((all) => all.map((x) => (x.id === book.id ? { ...x, ...patch, cover_path: coverPath } : x)));
    onClose();
  }

  return (
    <Janela titulo="Editar livro" onClose={onClose}>
      <form onSubmit={salvar} onPaste={colar} className="space-y-3">
        <div className="flex gap-4 items-start">
          <Cover book={book} url={preview} className="w-24 h-36" />
          <div className="flex flex-col gap-1.5 text-sm min-w-0">
            <span className="label">Capa</span>
            <button type="button" className="btn text-xs py-1" onClick={() => coverInput.current?.click()} disabled={!!coverBusy}><Upload size={13} /> Enviar imagem</button>
            {book.format === "epub" && (
              <button type="button" className="btn text-xs py-1" disabled={!!coverBusy}
                onClick={async () => { setCoverBusy("Lendo o EPUB…"); try { await porImagem(await epubCover(await downloadBook(book)), "epub"); } finally { setCoverBusy(null); } }}>
                Usar a capa do EPUB
              </button>
            )}
            {coverPath && (
              <button type="button" className="btn btn-ghost text-xs py-1 hover:text-critical" disabled={!!coverBusy}
                onClick={async () => { await removeCover({ id: book.id, cover_path: coverPath }); setCoverPath(null); setPreview(undefined); novaCapa(null); }}>
                <Trash2 size={13} /> Remover capa
              </button>
            )}
            <div className="flex gap-1 mt-1">
              <input className="input text-xs py-1" placeholder="ou cole o link da imagem" value={link} onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (link.trim()) void porLink(link); } }} />
              <button type="button" className="btn text-xs py-1 whitespace-nowrap" disabled={!link.trim() || !!coverBusy} onClick={() => porLink(link)}>Usar</button>
            </div>
            <span className="text-xs text-muted">{coverBusy ?? "também dá para colar uma imagem (Ctrl+V)"}</span>
            <input ref={coverInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void porImagem(f, "arquivo"); e.target.value = ""; }} />
          </div>
        </div>
        <label className="block space-y-1"><span className="label">Título</span>
          <input className="input" name="titulo" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        {sugestao && (
          <button type="button" className="text-xs link text-left" onClick={() => { setTitle(sugestao.title); if (!author.trim()) setAuthor(sugestao.author); }}>
            Separar: título “{sugestao.title}” · autor “{sugestao.author}”
          </button>
        )}
        <label className="block space-y-1"><span className="label">Autor</span>
          <input className="input" name="autor" value={author} placeholder="Sobrenome, Nome" onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <label className="block space-y-1"><span className="label">Pasta (CDD)</span>
          <FolderSelect folders={pastas} value={folderId} onChange={setFolderId} />
        </label>
        {fisico && <Paginas pages={pages} setPages={setPages} current={current} setCurrent={setCurrent} wpp={wpp} setWpp={setWpp} />}
        {err && <p className="text-sm text-critical">{err}</p>}
        <Botoes onClose={onClose} desligado={busy} />
      </form>
    </Janela>
  );
}

function Paginas({ pages, setPages, current, setCurrent, wpp, setWpp, obrigatorio }: {
  pages: string; setPages: (v: string) => void; current: string; setCurrent: (v: string) => void; wpp: string; setWpp: (v: string) => void; obrigatorio?: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <label className="space-y-1"><span className="label">Páginas</span>
          <input className="input" type="number" min={1} required={obrigatorio} value={pages} onChange={(e) => setPages(e.target.value)} /></label>
        <label className="space-y-1"><span className="label">Estou na p.</span>
          <input className="input" type="number" min={0} value={current} placeholder="0" onChange={(e) => setCurrent(e.target.value)} /></label>
        <label className="space-y-1"><span className="label">Palavras/pág.</span>
          <input className="input" type="number" min={50} max={1000} value={wpp} onChange={(e) => setWpp(e.target.value)} /></label>
      </div>
      <p className="text-xs text-muted">Palavras por página: ~250 num livro de bolso, ~300 no padrão, ~400 em páginas densas.</p>
    </>
  );
}

function LivroFisico({ pasta, onClose }: { pasta: string | null; onClose: () => void }) {
  const { pastas, setLivros } = useBiblioteca();
  const [f, setF] = useState({ title: "", author: "", folder_id: pasta ?? "" });
  const [pages, setPages] = useState(""), [current, setCurrent] = useState(""), [wpp, setWpp] = useState("300");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const b = await addPhysicalBook({ title: f.title.trim(), author: f.author.trim(), total_pages: Number(pages) || 0, current_page: Number(current) || 0, words_per_page: Number(wpp) || 300, folder_id: f.folder_id || null });
      setLivros((all) => [...all, b]);
      onClose();
    } catch (x) { setErr((x as Error).message); setBusy(false); }
  }
  return (
    <Janela titulo="Livro físico" onClose={onClose} sub="A leitura é registrada pelo Timer; ao encerrar, você diz a página.">
      <form onSubmit={salvar} className="space-y-3">
        <label className="block space-y-1"><span className="label">Título</span>
          <input className="input" required autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="block space-y-1"><span className="label">Autor</span>
          <input className="input" value={f.author} placeholder="Sobrenome, Nome" onChange={(e) => setF({ ...f, author: e.target.value })} /></label>
        <Paginas pages={pages} setPages={setPages} current={current} setCurrent={setCurrent} wpp={wpp} setWpp={setWpp} obrigatorio />
        <label className="block space-y-1"><span className="label">Pasta (CDD)</span>
          <FolderSelect folders={pastas} value={f.folder_id} onChange={(id) => setF({ ...f, folder_id: id })} /></label>
        {err && <p className="text-sm text-critical">{err}</p>}
        <Botoes onClose={onClose} desligado={busy} />
      </form>
    </Janela>
  );
}

/* ───────────── pasta ───────────── */

function PastaJanela({ edit, pai, onClose }: { edit?: Folder; pai: string | null; onClose: () => void }) {
  const { pastas, recarregar } = useBiblioteca();
  const [code, setCode] = useState(edit?.code ?? "");
  const [name, setName] = useState(edit?.name ?? "");
  const [parent, setParent] = useState<string>(edit ? edit.parent_id ?? "" : pai ?? "");
  const [err, setErr] = useState<string | null>(null);
  // não pode mover a pasta para dentro dela mesma
  const bloqueadas = useMemo(() => {
    const out = new Set<string>(edit ? [edit.id] : []);
    let cresceu = !!edit;
    while (cresceu) {
      cresceu = false;
      for (const f of pastas) if (f.parent_id && out.has(f.parent_id) && !out.has(f.id)) { out.add(f.id); cresceu = true; }
    }
    return out;
  }, [pastas, edit]);
  const paiAtual = pastas.find((f) => f.id === parent);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const row = { code: code.trim() || null, name: name.trim(), parent_id: parent || null };
    if (!row.name) return;
    const sb = supabase();
    const { error } = edit
      ? await sb.from("folders").update(row).eq("id", edit.id)
      : await sb.from("folders").insert({ ...row, position: pastas.filter((f) => f.parent_id === row.parent_id).length });
    if (error) return setErr(error.message);
    onClose();
    void recarregar();
  }

  return (
    <Janela titulo={edit ? "Editar pasta" : paiAtual ? "Nova subpasta" : "Nova pasta"} onClose={onClose}
      sub="O código ordena as pastas como numa biblioteca (109 vem antes de 111.85).">
      <form onSubmit={salvar} className="space-y-3">
        <label className="block space-y-1"><span className="label">Dentro de</span>
          <FolderSelect folders={pastas} value={parent} onChange={setParent} exclude={bloqueadas} emptyLabel="— pasta principal (nova classe) —" /></label>
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <label className="space-y-1"><span className="label">Código CDD</span>
            <input className="input font-mono" value={code} autoFocus placeholder={paiAtual?.code ? `${paiAtual.code}…` : "ex.: 869.1"} onChange={(e) => setCode(e.target.value)} /></label>
          <label className="space-y-1"><span className="label">Nome</span>
            <input className="input" required value={name} placeholder="ex.: Poesia brasileira" onChange={(e) => setName(e.target.value)} /></label>
        </div>
        {err && <p className="text-sm text-critical">{err}</p>}
        <Botoes onClose={onClose} />
      </form>
    </Janela>
  );
}

/* ───────────── mesas ───────────── */

function MesaJanela({ edit, onClose }: { edit?: Objetivo; onClose: () => void }) {
  const { mesas, setMesas, recarregar } = useBiblioteca();
  const [t, setT] = useState(edit?.titulo ?? "");
  const [d, setD] = useState(edit?.descricao ?? "");
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!t.trim()) return;
    const sb = supabase();
    if (edit) {
      setMesas((l) => l.map((x) => (x.id === edit.id ? { ...x, titulo: t.trim(), descricao: d.trim() } : x)));
      await sb.from("objetivos").update({ titulo: t.trim(), descricao: d.trim() }).eq("id", edit.id);
    } else {
      await sb.from("objetivos").insert({ titulo: t.trim(), descricao: d.trim(), posicao: mesas.length });
      void recarregar();
    }
    onClose();
  }
  return (
    <Janela titulo={edit ? "Renomear mesa" : "Nova mesa"} onClose={onClose}
      sub={edit ? undefined : "Uma mesa é um grupo de livros com um propósito, na ordem em que você quer ler. A ordem das mesas é a sua fila."}>
      <form onSubmit={salvar} className="space-y-3">
        <label className="block space-y-1"><span className="label">Nome da mesa</span>
          <input autoFocus className="input" value={t} placeholder="ex.: Aprender a estudar" onChange={(e) => setT(e.target.value)} /></label>
        <label className="block space-y-1"><span className="label">Objetivo (opcional)</span>
          <textarea className="input min-h-[70px]" value={d} placeholder="Para que serve esta mesa? O que você quer saber ao terminar?" onChange={(e) => setD(e.target.value)} /></label>
        <Botoes onClose={onClose} desligado={!t.trim()} />
      </form>
    </Janela>
  );
}

function ColarLista({ onClose }: { onClose: () => void }) {
  const { livros, mesas, recarregar } = useBiblioteca();
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  // só entram livros que já estão na biblioteca; mesa sem nenhum deles não é criada
  const lidas = useMemo(() => lerLista(texto).map((m) => ({
    ...m, total: m.itens.length, itens: m.itens.flatMap((i) => { const b = acharLivro(i, livros); return b ? [{ ...i, book: b }] : []; }),
  })), [texto, livros]);
  const validas = lidas.filter((m) => m.itens.length);
  const total = lidas.reduce((n, m) => n + m.total, 0);
  const achados = validas.reduce((n, m) => n + m.itens.length, 0);

  async function importar() {
    setSalvando(true);
    const sb = supabase();
    for (const [k, m] of validas.entries()) {
      const { data } = await sb.from("objetivos").insert({ titulo: m.titulo, posicao: mesas.length + k }).select("id").single();
      const oid = (data as { id: string } | null)?.id;
      if (!oid) continue;
      await sb.from("objetivo_itens").insert(m.itens.map((i, p) => ({
        objetivo_id: oid, posicao: p, secao: i.secao, cdd: i.cdd, autor: i.autor, titulo: i.titulo,
        feito: i.feito, feito_em: i.feito ? new Date().toISOString() : null, book_id: i.book.id,
      })));
    }
    onClose();
    void recarregar();
  }

  return (
    <Janela titulo="Colar uma lista" onClose={onClose} largura="max-w-2xl"
      sub={<>Cada “<b className="text-ink">Bloco 1 — Nome</b>” vira uma mesa; “<b className="text-ink">1.1. Nome</b>”, uma seção; cada “<b className="text-ink">- [ ] 709 AUTOR – Título</b>” é procurado na sua biblioteca.</>}>
      <textarea className="input min-h-[240px] font-mono text-xs leading-relaxed" value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus
        placeholder={"Bloco 0 — Aprender a estudar\n- [ ] 700.92 CURREY, Mason – Os segredos dos grandes artistas\n- [ ] 650.1 NEWPORT, Cal – Trabalho focado\n\nBloco 1 — Os fundamentos estéticos\n1.1. História da arte e educação do olhar\n- [ ] 709 GOMBRICH, Ernst – A história da arte"} />
      {total > 0 && (
        <div className="rounded-lg bg-surface-2 p-3 text-sm space-y-1">
          {validas.map((m, k) => (
            <div key={k} className="flex justify-between gap-3"><span className="truncate">{m.titulo}</span><span className="text-muted tabular-nums shrink-0">{m.itens.length} de {m.total}</span></div>
          ))}
          <div className="text-xs text-muted pt-1">{achados} de {total} livros da lista estão na biblioteca (os outros ficam de fora).</div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!validas.length || salvando} onClick={importar}>{salvando ? "Criando…" : `Criar ${validas.length || ""} ${validas.length === 1 ? "mesa" : "mesas"}`}</button>
      </div>
    </Janela>
  );
}

/** Põe um livro no fim de uma mesa (renumerando nada: é sempre o último). */
export async function porNaMesa(mesa: Objetivo, b: Book, posicao: number, cdd = "") {
  await supabase().from("objetivo_itens").insert({ objetivo_id: mesa.id, posicao, secao: "", book_id: b.id, titulo: b.title, autor: b.author ?? "", cdd });
}

function AdicionarNaMesa({ mesa, onClose }: { mesa: Objetivo; onClose: () => void }) {
  const { livros, itens, lugar, recarregar, pastaDe } = useBiblioteca();
  const naMesa = new Set(itens.filter((i) => i.objetivo_id === mesa.id).map((i) => i.book_id));
  const fim = Math.max(-1, ...itens.filter((i) => i.objetivo_id === mesa.id).map((i) => i.posicao)) + 1;
  return (
    <EscolherLivro titulo={`Adicionar a “${mesa.titulo}”`} onClose={onClose}
      livros={livros.filter((b) => !naMesa.has(b.id))}
      dica={(b) => { const l = lugar.get(b.id); return l ? `já em ${l.mesa.titulo}` : "fora do plano"; }}
      onEscolher={async (b) => { onClose(); await porNaMesa(mesa, b, fim, pastaDe(b)?.code ?? ""); void recarregar(); }} />
  );
}

function EscolherMesa({ livro, onClose }: { livro: Book; onClose: () => void }) {
  const { mesas, itens, recarregar, pastaDe, abrir } = useBiblioteca();
  return (
    <Janela titulo="Pôr numa mesa" onClose={onClose} sub={<>“{livro.title}” entra no fim da mesa escolhida.</>}>
      <div className="-mx-2 max-h-80 overflow-y-auto">
        {mesas.map((m, k) => (
          <button key={m.id} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-2 text-left"
            onClick={async () => {
              onClose();
              const fim = Math.max(-1, ...itens.filter((i) => i.objetivo_id === m.id).map((i) => i.posicao)) + 1;
              await porNaMesa(m, livro, fim, pastaDe(livro)?.code ?? "");
              void recarregar();
            }}>
            <span className="w-6 h-6 rounded-md bg-surface-2 grid place-items-center text-xs tabular-nums shrink-0">{k + 1}</span>
            <span className="truncate">{m.titulo}</span>
          </button>
        ))}
      </div>
      <button className="btn w-full justify-center" onClick={() => abrir({ tipo: "mesa" })}>Criar uma mesa nova</button>
    </Janela>
  );
}

export function EscolherLivro({ titulo, livros, onClose, onEscolher, dica }: {
  titulo: string; livros: Book[]; onClose: () => void; onEscolher: (b: Book) => void; dica?: (b: Book) => string;
}) {
  const [q, setQ] = useState("");
  const dobra = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const achados = livros
    .filter((b) => dobra(q).split(/\s+/).filter(Boolean).every((w) => dobra(`${b.title} ${b.author ?? ""}`).includes(w)))
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  return (
    <Janela titulo={titulo} onClose={onClose}>
      <label className="input flex items-center gap-2 py-1.5">
        <Search size={15} className="text-faint shrink-0" />
        <input autoFocus className="bg-transparent outline-none flex-1 min-w-0" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título ou autor" />
      </label>
      <div className="max-h-80 overflow-y-auto -mx-2">
        {achados.slice(0, 80).map((b) => (
          <button key={b.id} onClick={() => onEscolher(b)} className="w-full text-left px-2 py-2 rounded-lg hover:bg-surface-2 flex items-baseline justify-between gap-3">
            <span className="min-w-0"><span className="block truncate">{b.title}</span><span className="block text-xs text-muted truncate">{b.author}</span></span>
            {dica && <span className="text-[11px] text-faint shrink-0">{dica(b)}</span>}
          </button>
        ))}
        {!achados.length && <p className="px-2 text-sm text-muted">Nenhum livro com esse nome. Para um livro novo, envie-o primeiro.</p>}
      </div>
    </Janela>
  );
}
