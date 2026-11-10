"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ClipboardPaste, Pencil, Plus, Trash2, X } from "lucide-react";
import { Empty, Page } from "@/components/page";
import { BibliotecaTabs } from "@/components/biblioteca-tabs";
import { RowMenu } from "@/components/row-menu";
import { supabase } from "@/lib/supabase/client";
import { fmtDuration } from "@/lib/dates";
import { acharLivro, lerLista, type ItemObjetivo, type Objetivo } from "@/lib/objetivos";
import type { Book } from "@/lib/types";

type LivroLite = Pick<Book, "id" | "title" | "author" | "status" | "word_count" | "progress">;

export default function Mesas() {
  const [mesas, setMesas] = useState<Objetivo[] | null>(null);
  const [itens, setItens] = useState<Pick<ItemObjetivo, "objetivo_id" | "feito" | "book_id">[]>([]);
  const [livros, setLivros] = useState<LivroLite[]>([]);
  const [ppm, setPpm] = useState(220);
  const [modal, setModal] = useState<null | "nova" | "importar" | { renomear: Objetivo }>(null);

  async function load() {
    const sb = supabase();
    const [m, i, b, r] = await Promise.all([
      sb.from("objetivos").select("*").order("posicao"),
      sb.from("objetivo_itens").select("objetivo_id,feito,book_id"),
      sb.from("books").select("id,title,author,status,word_count,progress"),
      sb.from("reading_sessions").select("seconds,words").order("started_at", { ascending: false }).limit(200),
    ]);
    setMesas((m.data as Objetivo[]) ?? []);
    setItens((i.data as typeof itens) ?? []);
    setLivros((b.data as LivroLite[]) ?? []);
    const secs = ((r.data as { seconds: number }[]) ?? []).reduce((a, x) => a + x.seconds, 0);
    const pal = ((r.data as { words: number }[]) ?? []).reduce((a, x) => a + x.words, 0);
    if (secs > 300) setPpm(Math.round(pal / (secs / 60)));
  }
  useEffect(() => { void load(); }, []);

  const porLivro = useMemo(() => new Map(livros.map((b) => [b.id, b])), [livros]);
  const resumo = (m: Objetivo) => {
    const lista = itens.filter((i) => i.objetivo_id === m.id);
    const lidos = lista.filter((i) => i.feito || (i.book_id && porLivro.get(i.book_id)?.status === "lido")).length;
    const naBiblioteca = lista.filter((i) => i.book_id && porLivro.has(i.book_id)).length;
    const faltam = lista.reduce((n, i) => {
      const b = i.book_id ? porLivro.get(i.book_id) : undefined;
      return n + (b && b.status !== "lido" && b.word_count ? b.word_count * (1 - b.progress) : 0);
    }, 0);
    return { total: lista.length, lidos, naBiblioteca, faltam };
  };

  async function mover(m: Objetivo, dir: -1 | 1) {
    if (!mesas) return;
    const i = mesas.findIndex((x) => x.id === m.id);
    const j = i + dir;
    if (j < 0 || j >= mesas.length) return;
    const nova = [...mesas];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setMesas(nova.map((x, k) => ({ ...x, posicao: k })));
    const sb = supabase();
    await Promise.all(nova.map((x, k) => sb.from("objetivos").update({ posicao: k }).eq("id", x.id)));
  }

  async function apagar(m: Objetivo) {
    if (!confirm(`Apagar a mesa “${m.titulo}”? Os livros continuam na biblioteca; só a lista da mesa é apagada.`)) return;
    await supabase().from("objetivos").delete().eq("id", m.id);
    void load();
  }

  return (
    <Page wide tabs={<BibliotecaTabs />} title="Mesas de objetivos"
      subtitle="Grupos de livros com um propósito, na ordem em que você quer ler."
      actions={
        <>
          <button className="btn" onClick={() => setModal("importar")}><ClipboardPaste size={15} /> Colar uma lista</button>
          <button className="btn btn-primary" onClick={() => setModal("nova")}><Plus size={15} /> Nova mesa</button>
        </>
      }>
      {mesas && mesas.length === 0 && (
        <Empty>
          Nenhuma mesa ainda. Crie uma (por exemplo “Aprender a estudar”) ou cole uma lista com os seus blocos e livros.
        </Empty>
      )}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {mesas?.map((m, k) => {
          const r = resumo(m);
          const pct = r.total ? r.lidos / r.total : 0;
          return (
            <div key={m.id} className="card p-5 relative group hover:border-faint transition-colors">
              <Link href={`/biblioteca/objetivos/${m.id}`} className="absolute inset-0" aria-label={`Abrir ${m.titulo}`} />
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs text-faint font-mono">Bloco {k}</span>
                <span className="relative z-10">
                  <RowMenu items={[
                    { label: "Renomear", icon: Pencil, onClick: () => setModal({ renomear: m }) },
                    { label: "Mover para antes", icon: ArrowUp, disabled: k === 0, onClick: () => mover(m, -1) },
                    { label: "Mover para depois", icon: ArrowDown, disabled: k === mesas.length - 1, onClick: () => mover(m, 1) },
                    { label: "Apagar mesa", icon: Trash2, danger: true, separar: true, onClick: () => apagar(m) },
                  ]} />
                </span>
              </div>
              <h2 className="text-lg leading-snug mt-1">{m.titulo}</h2>
              {m.descricao && <p className="text-sm text-muted mt-1 line-clamp-2">{m.descricao}</p>}
              <div className="mt-4 flex items-baseline justify-between text-sm tabular-nums">
                <span>{r.lidos} de {r.total} <span className="text-muted">{r.total === 1 ? "livro lido" : "livros lidos"}</span></span>
                <span className="text-xs text-muted">{Math.round(pct * 100)}%</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full bg-chart" style={{ width: `${pct * 100}%` }} />
              </div>
              <div className="mt-2 text-xs text-faint">
                {r.naBiblioteca} na biblioteca{r.faltam ? ` · ≈ ${fmtDuration((r.faltam / ppm) * 60)} de leitura` : ""}
              </div>
            </div>
          );
        })}
      </div>

      {modal === "nova" && <NomeMesa titulo="Nova mesa" onClose={() => setModal(null)}
        onSalvar={async (titulo, descricao) => {
          await supabase().from("objetivos").insert({ titulo, descricao, posicao: mesas?.length ?? 0 });
          setModal(null); void load();
        }} />}
      {modal && typeof modal === "object" && <NomeMesa titulo="Renomear mesa" inicial={modal.renomear} onClose={() => setModal(null)}
        onSalvar={async (titulo, descricao) => {
          await supabase().from("objetivos").update({ titulo, descricao }).eq("id", modal.renomear.id);
          setModal(null); void load();
        }} />}
      {modal === "importar" && <ColarLista livros={livros} inicio={mesas?.length ?? 0} onClose={() => setModal(null)} onFeito={() => { setModal(null); void load(); }} />}
    </Page>
  );
}

function Janela({ titulo, onClose, children, larga }: { titulo: string; onClose: () => void; children: React.ReactNode; larga?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div className={`card w-full ${larga ? "max-w-2xl" : "max-w-md"} p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg">{titulo}</h2>
          <button className="text-muted hover:text-ink" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NomeMesa({ titulo, inicial, onClose, onSalvar }: {
  titulo: string; inicial?: Objetivo; onClose: () => void; onSalvar: (titulo: string, descricao: string) => void;
}) {
  const [t, setT] = useState(inicial?.titulo ?? "");
  const [d, setD] = useState(inicial?.descricao ?? "");
  return (
    <Janela titulo={titulo} onClose={onClose}>
      <label className="block"><span className="label">Nome da mesa</span>
        <input autoFocus className="input mt-1" value={t} placeholder="ex.: Aprender a estudar" onChange={(e) => setT(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && t.trim() && onSalvar(t.trim(), d.trim())} /></label>
      <label className="block"><span className="label">Objetivo (opcional)</span>
        <textarea className="input mt-1 min-h-[70px]" value={d} placeholder="Para que serve esta mesa?" onChange={(e) => setD(e.target.value)} /></label>
      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!t.trim()} onClick={() => onSalvar(t.trim(), d.trim())}>Salvar</button>
      </div>
    </Janela>
  );
}

function ColarLista({ livros, inicio, onClose, onFeito }: { livros: LivroLite[]; inicio: number; onClose: () => void; onFeito: () => void }) {
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const lidas = useMemo(() => lerLista(texto), [texto]);
  const total = lidas.reduce((n, m) => n + m.itens.length, 0);
  const achados = lidas.reduce((n, m) => n + m.itens.filter((i) => acharLivro(i, livros)).length, 0);

  async function importar() {
    setSalvando(true);
    const sb = supabase();
    for (const [k, m] of lidas.entries()) {
      const { data } = await sb.from("objetivos").insert({ titulo: m.titulo, posicao: inicio + k }).select("id").single();
      const oid = (data as { id: string } | null)?.id;
      if (!oid || !m.itens.length) continue;
      await sb.from("objetivo_itens").insert(m.itens.map((i, p) => ({
        objetivo_id: oid, posicao: p, secao: i.secao, cdd: i.cdd, autor: i.autor, titulo: i.titulo,
        feito: i.feito, feito_em: i.feito ? new Date().toISOString() : null, book_id: acharLivro(i, livros)?.id ?? null,
      })));
    }
    onFeito();
  }

  return (
    <Janela titulo="Colar uma lista" onClose={onClose} larga>
      <p className="text-sm text-muted">
        Cada <b>“Bloco N — Nome”</b> vira uma mesa; linhas como <b>“1.1. Nome”</b> viram seções; e cada
        <b> “- [ ] 709 AUTOR – Título”</b> vira um livro, na ordem da lista. Os livros que já estão na biblioteca são ligados sozinhos.
      </p>
      <textarea className="input min-h-[260px] font-mono text-xs leading-relaxed" value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus
        placeholder={"Bloco 0 — Aprender a estudar\n- [ ] 700.92 CURREY, Mason – Os segredos dos grandes artistas\n- [ ] 650.1 NEWPORT, Cal – Trabalho focado\n\nBloco 1 — Os fundamentos estéticos\n1.1. História da arte e educação do olhar\n- [ ] 709 GOMBRICH, Ernst – A história da arte"} />
      {lidas.length > 0 && (
        <div className="rounded-lg bg-surface-2 p-3 text-sm space-y-1">
          {lidas.map((m, k) => (
            <div key={k} className="flex justify-between gap-3">
              <span className="truncate"><span className="text-faint font-mono text-xs">Bloco {inicio + k}</span> · {m.titulo}</span>
              <span className="text-muted tabular-nums shrink-0">{m.itens.length} livros</span>
            </div>
          ))}
          <div className="text-xs text-muted pt-1">{total} livros no total · {achados} já estão na sua biblioteca</div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!lidas.length || salvando} onClick={importar}>{salvando ? "Criando…" : `Criar ${lidas.length || ""} ${lidas.length === 1 ? "mesa" : "mesas"}`}</button>
      </div>
    </Janela>
  );
}
