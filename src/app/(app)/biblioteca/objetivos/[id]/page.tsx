"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, Check, Link2, Pencil, Plus, Search, Trash2, Unlink, X } from "lucide-react";
import { Page } from "@/components/page";
import { BibliotecaTabs } from "@/components/biblioteca-tabs";
import { RowMenu } from "@/components/row-menu";
import { OPCOES_LIVRO, StatusPill } from "@/components/status-pill";
import { supabase } from "@/lib/supabase/client";
import { fmtDuration } from "@/lib/dates";
import { acharLivro, lerLinhaDeLivro, type ItemObjetivo, type Objetivo } from "@/lib/objetivos";
import type { Book, BookStatus } from "@/lib/types";

type LivroLite = Pick<Book, "id" | "title" | "author" | "status" | "word_count" | "progress" | "format">;

export default function Mesa() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [mesa, setMesa] = useState<Objetivo | null>(null);
  const [posicaoMesa, setPosicaoMesa] = useState(0);
  const [itens, setItens] = useState<ItemObjetivo[]>([]);
  const [livros, setLivros] = useState<LivroLite[]>([]);
  const [ppm, setPpm] = useState(220);
  const [ligando, setLigando] = useState<ItemObjetivo | null>(null);
  const [editando, setEditando] = useState<ItemObjetivo | "mesa" | null>(null);
  const [novo, setNovo] = useState("");
  const [secaoNova, setSecaoNova] = useState("");
  const [naoAchada, setNaoAchada] = useState(false);

  async function load() {
    const sb = supabase();
    const [m, todas, i, b, r] = await Promise.all([
      sb.from("objetivos").select("*").eq("id", id).maybeSingle(),
      sb.from("objetivos").select("id").order("posicao"),
      sb.from("objetivo_itens").select("*").eq("objetivo_id", id).order("posicao"),
      sb.from("books").select("id,title,author,status,word_count,progress,format"),
      sb.from("reading_sessions").select("seconds,words").order("started_at", { ascending: false }).limit(200),
    ]);
    if (!m.data) { setNaoAchada(true); return; }
    setMesa(m.data as Objetivo);
    setPosicaoMesa(Math.max(0, ((todas.data as { id: string }[]) ?? []).findIndex((x) => x.id === id)));
    const lista = (i.data as ItemObjetivo[]) ?? [];
    setItens(lista);
    setLivros((b.data as LivroLite[]) ?? []);
    setSecaoNova((s) => s || lista[lista.length - 1]?.secao || "");
    const rs = (r.data as { seconds: number; words: number }[]) ?? [];
    const secs = rs.reduce((a, x) => a + x.seconds, 0);
    if (secs > 300) setPpm(Math.round(rs.reduce((a, x) => a + x.words, 0) / (secs / 60)));
  }
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const porLivro = useMemo(() => new Map(livros.map((b) => [b.id, b])), [livros]);
  const livroDe = (i: ItemObjetivo) => (i.book_id ? porLivro.get(i.book_id) : undefined);
  const lido = (i: ItemObjetivo) => i.feito || livroDe(i)?.status === "lido";

  const secoes = useMemo(() => {
    const g: [string, ItemObjetivo[]][] = [];
    for (const i of itens) {
      const ult = g[g.length - 1];
      if (ult && ult[0] === i.secao) ult[1].push(i);
      else g.push([i.secao, [i]]);
    }
    return g;
  }, [itens]);
  const nomesDeSecao = useMemo(() => [...new Set(itens.map((i) => i.secao).filter(Boolean))], [itens]);

  const lidos = itens.filter(lido).length;
  const faltamPalavras = itens.reduce((n, i) => {
    const b = livroDe(i);
    return n + (b && b.status !== "lido" && b.word_count ? b.word_count * (1 - b.progress) : 0);
  }, 0);
  const proximo = itens.find((i) => !lido(i));

  function trocar(i: ItemObjetivo, campos: Partial<ItemObjetivo>) {
    setItens((l) => l.map((x) => (x.id === i.id ? { ...x, ...campos } : x)));
    void supabase().from("objetivo_itens").update(campos).eq("id", i.id).then();
  }
  function statusDoLivro(b: LivroLite, st: BookStatus) {
    setLivros((l) => l.map((x) => (x.id === b.id ? { ...x, status: st } : x)));
    const campos: Record<string, unknown> = { status: st };
    if (st === "lido") campos.finished_at = new Date().toISOString();
    if (st === "lendo") campos.queue_position = null;
    void supabase().from("books").update(campos).eq("id", b.id).then();
    for (const i of itens.filter((x) => x.book_id === b.id)) {
      if ((st === "lido") !== i.feito) trocar(i, { feito: st === "lido", feito_em: st === "lido" ? new Date().toISOString() : null });
    }
  }
  function marcar(i: ItemObjetivo) {
    const agora = !lido(i);
    const b = livroDe(i);
    if (b) statusDoLivro(b, agora ? "lido" : "aguardando");
    else trocar(i, { feito: agora, feito_em: agora ? new Date().toISOString() : null });
  }

  async function mover(i: ItemObjetivo, dir: -1 | 1) {
    const k = itens.findIndex((x) => x.id === i.id);
    const j = k + dir;
    if (j < 0 || j >= itens.length || itens[j].secao !== i.secao) return;
    const nova = [...itens];
    [nova[k], nova[j]] = [nova[j], nova[k]];
    const renum = nova.map((x, p) => ({ ...x, posicao: p }));
    setItens(renum);
    const sb = supabase();
    await Promise.all([renum[k], renum[j]].map((x) => sb.from("objetivo_itens").update({ posicao: x.posicao }).eq("id", x.id)));
  }

  async function remover(i: ItemObjetivo) {
    if (!confirm(`Tirar “${i.titulo}” desta mesa? O livro continua na biblioteca.`)) return;
    setItens((l) => l.filter((x) => x.id !== i.id));
    await supabase().from("objetivo_itens").delete().eq("id", i.id);
  }

  async function adicionar() {
    const l = lerLinhaDeLivro(novo);
    if (!l || !l.titulo) return;
    // entra no fim da seção escolhida (ou no fim da mesa)
    const ultimoDaSecao = [...itens].reverse().find((x) => x.secao === secaoNova.trim());
    const pos = ultimoDaSecao ? ultimoDaSecao.posicao + 1 : itens.length;
    const sb = supabase();
    const depois = itens.filter((x) => x.posicao >= pos);
    await Promise.all(depois.map((x) => sb.from("objetivo_itens").update({ posicao: x.posicao + 1 }).eq("id", x.id)));
    await sb.from("objetivo_itens").insert({
      objetivo_id: id, posicao: pos, secao: secaoNova.trim(), ...l, book_id: acharLivro(l, livros)?.id ?? null,
    });
    setNovo("");
    void load();
  }

  function abrir(b: LivroLite) {
    if (b.format === "fisico") router.push("/biblioteca");
    else router.push(`/ler/${b.id}`);
  }

  if (naoAchada) {
    return (
      <Page tabs={<BibliotecaTabs />} title="Mesa não encontrada">
        <Link href="/biblioteca/objetivos" className="btn"><ArrowLeft size={15} /> Voltar às mesas</Link>
      </Page>
    );
  }
  if (!mesa) return <Page tabs={<BibliotecaTabs />} title="…">{null}</Page>;

  const pct = itens.length ? lidos / itens.length : 0;
  return (
    <Page tabs={<BibliotecaTabs />} title={mesa.titulo}
      subtitle={mesa.descricao || undefined}
      actions={
        <>
          <Link href="/biblioteca/objetivos" className="btn btn-ghost"><ArrowLeft size={15} /> Mesas</Link>
          <button className="btn" onClick={() => setEditando("mesa")}><Pencil size={15} /> Renomear</button>
        </>
      }>
      <div className="card p-5 mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm">
          <span className="text-xs text-faint font-mono">Bloco {posicaoMesa}</span>
          <span className="tabular-nums">{lidos} de {itens.length} <span className="text-muted">lidos · {Math.round(pct * 100)}%</span></span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-surface-2 overflow-hidden">
          <div className="h-full rounded-full bg-chart" style={{ width: `${pct * 100}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted">
          <span>{proximo ? <>Próximo: <span className="text-ink">{proximo.titulo}</span></> : itens.length ? "Mesa concluída." : "Nenhum livro ainda."}</span>
          {faltamPalavras > 0 && <span>≈ {fmtDuration((faltamPalavras / ppm) * 60)} de leitura nos livros da biblioteca · {ppm} ppm</span>}
        </div>
      </div>

      <div className="space-y-8">
        {secoes.map(([secao, lista], si) => (
          <section key={`${secao}-${si}`}>
            {secao && <h2 className="text-sm text-muted mb-2">{secao}</h2>}
            <ol className="card divide-y divide-line">
              {lista.map((i) => {
                const b = livroDe(i);
                const k = itens.indexOf(i);
                const feito = lido(i);
                return (
                  <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                    <button onClick={() => marcar(i)} aria-label={feito ? "Desmarcar como lido" : "Marcar como lido"}
                      className={`w-5 h-5 rounded-md border grid place-items-center shrink-0 transition-colors ${feito ? "bg-chart border-chart text-bg" : "border-faint hover:border-muted"}`}>
                      {feito && <Check size={13} strokeWidth={3} />}
                    </button>
                    <span className="w-6 text-right text-xs text-faint tabular-nums shrink-0">{k + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className={`truncate ${feito ? "text-muted line-through decoration-faint" : ""}`}>
                        {b && b.format !== "fisico"
                          ? <Link href={`/ler/${b.id}`} className="hover:underline">{i.titulo}</Link>
                          : i.titulo}
                      </div>
                      <div className="text-xs text-muted truncate flex items-center gap-2">
                        {i.cdd && <span className="font-mono text-faint">{i.cdd}</span>}
                        {i.autor && <span className="truncate">{i.autor}</span>}
                        {!b && <span className="text-faint shrink-0 hidden sm:inline">· fora da biblioteca</span>}
                        {b && b.status === "lendo" && b.progress > 0 && <span>· {Math.round(b.progress * 100)}%</span>}
                      </div>
                    </div>
                    {b && <StatusPill label="Status do livro" value={b.status} options={OPCOES_LIVRO} onChange={(st) => statusDoLivro(b, st)} />}
                    <RowMenu items={[
                      ...(b ? [{ label: b.format === "fisico" ? "Ver na biblioteca" : "Abrir no leitor", icon: BookOpen, onClick: () => abrir(b) }] : []),
                      { label: b ? "Trocar o livro ligado" : "Ligar a um livro da biblioteca", icon: Link2, onClick: () => setLigando(i) },
                      ...(b ? [{ label: "Desligar do livro", icon: Unlink, onClick: () => trocar(i, { book_id: null }) }] : []),
                      { label: "Editar", icon: Pencil, onClick: () => setEditando(i) },
                      { label: "Subir", icon: ArrowUp, separar: true, disabled: k === 0 || itens[k - 1]?.secao !== i.secao, onClick: () => mover(i, -1) },
                      { label: "Descer", icon: ArrowDown, disabled: k === itens.length - 1 || itens[k + 1]?.secao !== i.secao, onClick: () => mover(i, 1) },
                      { label: "Tirar da mesa", icon: Trash2, danger: true, separar: true, onClick: () => remover(i) },
                    ]} />
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>

      <div className="card p-4 mt-8 space-y-2">
        <div className="label">Adicionar um livro</div>
        <div className="flex flex-wrap gap-2">
          <input className="input flex-1 min-w-[240px]" value={novo} onChange={(e) => setNovo(e.target.value)}
            placeholder="709 GOMBRICH, Ernst – A história da arte" onKeyDown={(e) => e.key === "Enter" && adicionar()} />
          <input className="input w-full sm:w-64" list="secoes-mesa" value={secaoNova} onChange={(e) => setSecaoNova(e.target.value)} placeholder="Seção (opcional)" />
          <datalist id="secoes-mesa">{nomesDeSecao.map((s) => <option key={s} value={s} />)}</datalist>
          <button className="btn btn-primary" disabled={!novo.trim()} onClick={adicionar}><Plus size={15} /> Adicionar</button>
        </div>
        <p className="text-xs text-faint">Entra no fim da seção. Se o livro já estiver na biblioteca, ele é ligado sozinho.</p>
      </div>

      {ligando && <Ligar item={ligando} livros={livros} onClose={() => setLigando(null)}
        onEscolher={(b) => { trocar(ligando, { book_id: b.id }); setLigando(null); }} />}
      {editando === "mesa" && <EditarMesa mesa={mesa} onClose={() => setEditando(null)}
        onSalvar={async (titulo, descricao) => {
          setMesa({ ...mesa, titulo, descricao });
          setEditando(null);
          await supabase().from("objetivos").update({ titulo, descricao }).eq("id", mesa.id);
        }} />}
      {editando && editando !== "mesa" && <EditarItem item={editando} secoes={nomesDeSecao} onClose={() => setEditando(null)}
        onSalvar={async (campos) => {
          setEditando(null);
          await supabase().from("objetivo_itens").update(campos).eq("id", editando.id);
          void load();
        }} />}
    </Page>
  );
}

function Janela({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50" onClick={onClose}>
      <div className="card w-full max-w-md p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg">{titulo}</h2>
          <button className="text-muted hover:text-ink" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Ligar({ item, livros, onClose, onEscolher }: { item: ItemObjetivo; livros: LivroLite[]; onClose: () => void; onEscolher: (b: LivroLite) => void }) {
  const [q, setQ] = useState(item.titulo.split(/[:—–]/)[0].trim());
  const dobra = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const achados = livros.filter((b) => dobra(q).split(/\s+/).filter(Boolean).every((w) => dobra(`${b.title} ${b.author ?? ""}`).includes(w)));
  return (
    <Janela titulo="Ligar a um livro" onClose={onClose}>
      <p className="text-sm text-muted">{item.autor ? `${item.autor} – ` : ""}{item.titulo}</p>
      <label className="input flex items-center gap-2 py-1.5">
        <Search size={15} className="text-faint shrink-0" />
        <input autoFocus className="bg-transparent outline-none flex-1 min-w-0" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar na biblioteca" />
      </label>
      <div className="max-h-72 overflow-y-auto -mx-2">
        {achados.slice(0, 40).map((b) => (
          <button key={b.id} onClick={() => onEscolher(b)} className="w-full text-left px-2 py-2 rounded-lg hover:bg-surface-2">
            <div className="truncate">{b.title}</div>
            <div className="text-xs text-muted truncate">{b.author}</div>
          </button>
        ))}
        {!achados.length && <p className="px-2 text-sm text-muted">Nenhum livro com esse nome. Envie o livro na Biblioteca e volte aqui.</p>}
      </div>
    </Janela>
  );
}

function EditarMesa({ mesa, onClose, onSalvar }: { mesa: Objetivo; onClose: () => void; onSalvar: (t: string, d: string) => void }) {
  const [t, setT] = useState(mesa.titulo);
  const [d, setD] = useState(mesa.descricao);
  return (
    <Janela titulo="Renomear mesa" onClose={onClose}>
      <label className="block"><span className="label">Nome da mesa</span>
        <input autoFocus className="input mt-1" value={t} onChange={(e) => setT(e.target.value)} /></label>
      <label className="block"><span className="label">Objetivo (opcional)</span>
        <textarea className="input mt-1 min-h-[70px]" value={d} onChange={(e) => setD(e.target.value)} /></label>
      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!t.trim()} onClick={() => onSalvar(t.trim(), d.trim())}>Salvar</button>
      </div>
    </Janela>
  );
}

function EditarItem({ item, secoes, onClose, onSalvar }: {
  item: ItemObjetivo; secoes: string[]; onClose: () => void; onSalvar: (c: Pick<ItemObjetivo, "cdd" | "autor" | "titulo" | "secao">) => void;
}) {
  const [c, setC] = useState({ cdd: item.cdd, autor: item.autor, titulo: item.titulo, secao: item.secao });
  const campo = (k: keyof typeof c, rotulo: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="block"><span className="label">{rotulo}</span>
      <input className="input mt-1" value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} {...extra} /></label>
  );
  return (
    <Janela titulo="Editar livro da mesa" onClose={onClose}>
      {campo("titulo", "Título", { autoFocus: true })}
      {campo("autor", "Autor")}
      {campo("cdd", "CDD")}
      {campo("secao", "Seção", { list: "secoes-editar" })}
      <datalist id="secoes-editar">{secoes.map((s) => <option key={s} value={s} />)}</datalist>
      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!c.titulo.trim()}
          onClick={() => onSalvar({ cdd: c.cdd.trim(), autor: c.autor.trim(), titulo: c.titulo.trim(), secao: c.secao.trim() })}>Salvar</button>
      </div>
    </Janela>
  );
}
