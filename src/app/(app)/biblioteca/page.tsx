"use client";
/**
 * Plano de leitura: o que ler, em que ordem e como está indo — num lugar só.
 * As mesas SÃO a fila: a ordem das mesas e a ordem dos livros dentro delas dizem o que vem depois.
 * (Antes, fila e mesas guardavam a mesma ordem duas vezes.)
 */
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, ChevronDown, ClipboardPaste, Pencil, Play, Plus, Trash2, Trophy, Upload, X } from "lucide-react";
import { Empty } from "@/components/page";
import { Cover } from "@/components/cover";
import { RowMenu } from "@/components/row-menu";
import { ACCEPT } from "@/lib/books";
import { fmtDuration } from "@/lib/dates";
import { PERFIS, dominioDe, faixaDe, palavrasCurto, pct, perfilDe } from "@/lib/leitura";
import type { ItemObjetivo, Objetivo } from "@/lib/objetivos";
import { supabase } from "@/lib/supabase/client";
import { progressoDoLivro, type Book } from "@/lib/types";
import { faltaDe, useBiblioteca, useMesas } from "@/components/biblioteca/dados";
import { LivroLinha } from "@/components/biblioteca/linha";
import { BibliotecaPagina, Painel } from "@/components/biblioteca/painel";
import { BarraMarcos, EtiquetaPerfil, Selos } from "@/components/biblioteca/visual";

export default function Plano() {
  const d = useBiblioteca();
  const mesas = useMesas();
  const [abertas, setAbertas] = useState<Set<string> | null>(null);

  // abre a mesa do próximo livro (ou a do link /biblioteca#mesa-…)
  useEffect(() => {
    if (!d.carregado || abertas) return;
    const doLink = typeof location !== "undefined" && location.hash.startsWith("#mesa-") ? location.hash.slice(6) : null;
    const atual = mesas.find((m) => m.prog.pct < 1)?.mesa.id;
    setAbertas(new Set([doLink ?? atual].filter((x): x is string => !!x)));
    if (doLink) setTimeout(() => document.getElementById(`mesa-${doLink}`)?.scrollIntoView({ block: "start" }), 50);
  }, [d.carregado, mesas, abertas]);

  const lendo = d.livros.filter((b) => b.status === "lendo").sort((a, b) => progressoDoLivro(b) - progressoDoLivro(a));
  const fora = d.livros.filter((b) => !d.lugar.has(b.id) && b.status !== "lido");
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <BibliotecaPagina actions={
      <>
        <button className="btn" onClick={() => d.abrir({ tipo: "mesa" })}><Plus size={15} /> Nova mesa</button>
        <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={!!d.enviando}><Upload size={15} /> {d.enviando ? "Enviando…" : "Enviar livros"}</button>
        <input ref={fileRef} type="file" multiple accept={ACCEPT} hidden onChange={(e) => e.target.files && void d.enviar(e.target.files, null)} />
      </>
    }>
      {d.enviando && <p className="text-sm text-muted mb-3" aria-live="polite">{d.enviando}</p>}
      {!d.carregado ? <p className="text-sm text-muted">Carregando…</p> : (
        <>
          <Painel />

          {/* ── agora ── */}
          <Secao titulo="Agora" sub="O que está em leitura e o próximo do plano.">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {lendo.map((b) => <CartaoLendo key={b.id} livro={b} />)}
              {d.proximo && <CartaoProximo livro={d.proximo} />}
              {!lendo.length && !d.proximo && (
                <Empty icone={BookOpen}>Nada em leitura. Monte uma mesa com os livros que quer ler e o primeiro dela aparece aqui.</Empty>
              )}
            </div>
          </Secao>

          {/* ── as mesas: a fila ── */}
          <Secao titulo="Mesas" sub="A ordem das mesas, e dos livros dentro delas, é a sua fila de leitura."
            extra={<button className="btn btn-ghost text-sm" onClick={() => d.abrir({ tipo: "colar" })}><ClipboardPaste size={14} /> Colar uma lista</button>}>
            {mesas.length === 0 ? (
              <Empty>Nenhuma mesa ainda. Crie uma (por exemplo, “Aprender a estudar”) ou cole uma lista com os seus blocos e livros.</Empty>
            ) : (
              <div className="space-y-3">
                {mesas.map((m, k) => (
                  <Mesa key={m.mesa.id} k={k} total={mesas.length} mesa={m.mesa} itens={m.itens} prog={m.prog}
                    aberta={!!abertas?.has(m.mesa.id)}
                    alternar={() => setAbertas((s) => { const x = new Set(s); if (x.has(m.mesa.id)) x.delete(m.mesa.id); else x.add(m.mesa.id); return x; })} />
                ))}
              </div>
            )}
          </Secao>

          {fora.length > 0 && (
            <Secao titulo="Fora do plano" sub="Livros que ainda não estão em nenhuma mesa: use ••• → Pôr numa mesa.">
              <div className="card divide-y divide-line overflow-hidden">
                {fora.map((b) => <LivroLinha key={b.id} livro={b} mostrarMesa={false} />)}
              </div>
            </Secao>
          )}
        </>
      )}
    </BibliotecaPagina>
  );
}

function Secao({ titulo, sub, extra, children }: { titulo: string; sub?: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-3 px-0.5">
        <div>
          <h2 className="text-[1.0625rem] font-semibold tracking-tight">{titulo}</h2>
          {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}

/** Um livro em leitura: capa, avanço com marcos e a medida que importa para ele. */
function CartaoLendo({ livro: b }: { livro: Book }) {
  const d = useBiblioteca();
  const perfil = perfilDe(b);
  const cor = perfil ? PERFIS[perfil].cor : "var(--area-leitura)";
  const p = progressoDoLivro(b);
  const falta = faltaDe(b);
  const uso = d.uso.get(b.id);
  const ritmo = uso && uso.segundos > 120 ? Math.round(uso.palavras / (uso.segundos / 60)) : null;
  const dom = perfil === "conhecimento" ? dominioDe(b, d.marcas.get(b.id) ?? 0).total : null;
  const onde = d.lugar.get(b.id);
  return (
    <article className="card p-4 flex gap-4 min-w-0" style={{ borderTop: `3px solid ${cor}` }}>
      <button onClick={() => d.abrir({ tipo: "ficha", id: b.id })} className="shrink-0 flex self-start" title="Ficha do livro">
        <Cover book={b} url={d.capas[b.id]} className="w-16 h-[92px]" />
      </button>
      <div className="min-w-0 flex-1 flex flex-col">
        <button onClick={() => d.abrir({ tipo: "ficha", id: b.id })} className="text-left">
          <div className="font-semibold leading-snug line-clamp-2">{b.title}</div>
          <div className="text-xs text-muted truncate mt-0.5">{b.author ?? "Autor desconhecido"}</div>
        </button>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5"><EtiquetaPerfil livro={b} /><Selos livro={b} /></div>
        <div className="mt-auto pt-3">
          <div className="flex items-baseline justify-between text-xs mb-1.5 tabular-nums">
            <b className="text-base font-semibold">{Math.round(p * 100)}%</b>
            <span className="text-muted">
              {perfil === "conhecimento" && dom !== null ? <>domínio <b className="text-ink font-medium">{Math.round(dom * 100)}%</b> · {faixaDe(dom).nome}</>
                : perfil === "informacao" && ritmo ? `${ritmo} ppm · faltam ≈ ${fmtDuration((falta / ritmo) * 60)}`
                : falta ? `faltam ≈ ${fmtDuration((falta / d.ppm) * 60)}` : ""}
            </span>
          </div>
          <BarraMarcos valor={p} cor={cor} />
          <div className="flex items-center justify-between gap-2 mt-3">
            <span className="text-[11px] text-faint truncate">{onde ? `Mesa ${onde.mesaN} · ${onde.mesa.titulo}` : "fora do plano"}</span>
            <button className="btn btn-primary py-1 text-xs shrink-0" onClick={() => d.ler(b)}><Play size={13} /> Continuar</button>
          </div>
        </div>
      </div>
    </article>
  );
}

/** O próximo livro do plano (o que vem depois, quando a vez dele chegar). */
function CartaoProximo({ livro: b }: { livro: Book }) {
  const d = useBiblioteca();
  const onde = d.lugar.get(b.id);
  return (
    <article className="rounded-xl border border-dashed border-line p-4 flex gap-4 min-w-0 bg-surface/40">
      <button onClick={() => d.abrir({ tipo: "ficha", id: b.id })} className="shrink-0 flex self-start opacity-90"><Cover book={b} url={d.capas[b.id]} className="w-16 h-[92px]" /></button>
      <div className="min-w-0 flex-1 flex flex-col">
        <div className="eyebrow">A seguir no plano</div>
        <button onClick={() => d.abrir({ tipo: "ficha", id: b.id })} className="text-left mt-1">
          <div className="font-semibold leading-snug line-clamp-2">{b.title}</div>
          <div className="text-xs text-muted truncate mt-0.5">{b.author ?? "Autor desconhecido"}</div>
        </button>
        <div className="mt-1.5"><EtiquetaPerfil livro={b} /></div>
        <div className="mt-auto pt-3 flex items-center justify-between gap-2">
          <span className="text-[11px] text-faint truncate">{onde ? `Mesa ${onde.mesaN} · nº ${onde.n}` : ""}{b.word_count ? ` · ≈ ${fmtDuration((b.word_count / d.ppm) * 60)}` : ""}</span>
          <button className="btn py-1 text-xs shrink-0" onClick={() => d.ler(b)}><BookOpen size={13} /> Começar</button>
        </div>
      </div>
    </article>
  );
}

/** Uma mesa: cabeçalho com o avanço e os marcos; aberta, a lista na ordem de leitura. */
function Mesa({ k, total, mesa, itens, prog, aberta, alternar }: {
  k: number; total: number; mesa: Objetivo; itens: ItemObjetivo[]; prog: ReturnType<typeof useMesas>[number]["prog"]; aberta: boolean; alternar: () => void;
}) {
  const d = useBiblioteca();
  const completa = prog.livros > 0 && prog.pct >= 1;
  const proxNaMesa = itens.map((i) => (i.book_id ? d.porId.get(i.book_id) : undefined)).find((b) => b && b.status !== "lido");

  async function moverMesa(dir: -1 | 1) {
    const lista = [...d.mesas];
    const j = k + dir;
    if (j < 0 || j >= lista.length) return;
    [lista[k], lista[j]] = [lista[j], lista[k]];
    d.setMesas(lista.map((x, p) => ({ ...x, posicao: p })));
    const sb = supabase();
    await Promise.all(lista.map((x, p) => sb.from("objetivos").update({ posicao: p }).eq("id", x.id)));
  }
  async function apagar() {
    if (!confirm(`Apagar a mesa “${mesa.titulo}”? Os livros continuam na biblioteca.`)) return;
    await supabase().from("objetivos").delete().eq("id", mesa.id);
    void d.recarregar();
  }
  async function moverItem(i: ItemObjetivo, dir: -1 | 1) {
    const p = itens.indexOf(i), q = p + dir;
    if (q < 0 || q >= itens.length) return;
    const a = itens[p], b = itens[q];
    // troca as posições (e a seção, para o livro poder passar de uma seção para outra)
    d.setItens((all) => all.map((x) => (x.id === a.id ? { ...x, posicao: b.posicao, secao: b.secao } : x.id === b.id ? { ...x, posicao: a.posicao, secao: a.secao } : x))
      .sort((x, y) => x.posicao - y.posicao));
    const sb = supabase();
    await Promise.all([
      sb.from("objetivo_itens").update({ posicao: b.posicao, secao: b.secao }).eq("id", a.id),
      sb.from("objetivo_itens").update({ posicao: a.posicao, secao: a.secao }).eq("id", b.id),
    ]);
  }
  async function tirar(i: ItemObjetivo) {
    d.setItens((all) => all.filter((x) => x.id !== i.id));
    await supabase().from("objetivo_itens").delete().eq("id", i.id);
  }

  // seções na ordem em que aparecem
  const secoes: [string, ItemObjetivo[]][] = [];
  for (const i of itens) {
    const ult = secoes[secoes.length - 1];
    if (ult && ult[0] === i.secao) ult[1].push(i); else secoes.push([i.secao, [i]]);
  }

  return (
    <article id={`mesa-${mesa.id}`} className="card overflow-hidden scroll-mt-4">
      <div className="flex items-stretch">
        <button onClick={alternar} aria-expanded={aberta} className="flex-1 min-w-0 flex items-center gap-4 p-4 text-left hover:bg-sel/40 transition-colors">
          <span className={`w-10 h-10 rounded-full grid place-items-center shrink-0 text-sm font-semibold tabular-nums ${completa ? "text-[var(--bg)]" : "bg-surface-2"}`}
            style={completa ? { background: "var(--good)" } : undefined} title={completa ? "Mesa concluída" : `Mesa ${k + 1}`}>
            {completa ? <Trophy size={18} /> : k + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-semibold leading-snug truncate">{mesa.titulo}</span>
              <span className="text-lg font-semibold tabular-nums tracking-tight shrink-0">{pct(prog.pct)}</span>
            </span>
            {mesa.descricao && <span className="block text-xs text-muted line-clamp-1 mt-0.5">{mesa.descricao}</span>}
            <span className="block mt-2"><BarraMarcos valor={prog.pct} cor={completa ? "var(--good)" : "var(--accent)"} /></span>
            <span className="flex flex-wrap justify-between gap-x-3 mt-1.5 text-[11.5px] text-muted tabular-nums">
              <span>{prog.livrosLidos} de {prog.livros} livros · {palavrasCurto(prog.lidas)} de {palavrasCurto(prog.total)} palavras</span>
              <span>{completa ? "concluída" : `≈ ${fmtDuration((prog.faltam / d.ppm) * 60)} pela frente${!aberta && proxNaMesa ? ` · próximo: ${proxNaMesa.title}` : ""}`}</span>
            </span>
          </span>
          <ChevronDown size={18} className={`text-faint shrink-0 transition-transform ${aberta ? "rotate-180" : ""}`} />
        </button>
        <span className="pt-4 pr-2">
          <RowMenu items={[
            { label: "Adicionar livro", icon: Plus, onClick: () => d.abrir({ tipo: "adicionar", mesa }) },
            { label: "Renomear", icon: Pencil, onClick: () => d.abrir({ tipo: "mesa", edit: mesa }) },
            { label: "Ler esta mesa antes", icon: ArrowUp, disabled: k === 0, separar: true, onClick: () => void moverMesa(-1) },
            { label: "Ler esta mesa depois", icon: ArrowDown, disabled: k === total - 1, onClick: () => void moverMesa(1) },
            { label: "Apagar mesa", icon: Trash2, danger: true, separar: true, onClick: () => void apagar() },
          ]} />
        </span>
      </div>
      {aberta && (
        <div className="border-t border-line">
          {secoes.map(([secao, lista], si) => (
            <div key={`${secao}-${si}`}>
              {secao && <div className="eyebrow px-4 pt-3 pb-1">{secao}</div>}
              <div className="divide-y divide-line">
                {lista.map((i) => {
                  const b = i.book_id ? d.porId.get(i.book_id) : undefined;
                  const n = itens.indexOf(i) + 1;
                  if (!b) {
                    return (
                      <div key={i.id} className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted">
                        <span className="w-5 text-right text-xs text-faint tabular-nums">{n}</span>
                        <span className="flex-1 truncate">{i.titulo} <span className="text-faint">· saiu da biblioteca</span></span>
                        <button className="btn btn-ghost px-2 py-1" title="Tirar da mesa" onClick={() => void tirar(i)}><X size={14} /></button>
                      </div>
                    );
                  }
                  return (
                    <LivroLinha key={i.id} livro={b} numero={n} mostrarMesa={false} menu={[
                      { label: "Subir na mesa", icon: ArrowUp, separar: true, disabled: n === 1, onClick: () => void moverItem(i, -1) },
                      { label: "Descer na mesa", icon: ArrowDown, disabled: n === itens.length, onClick: () => void moverItem(i, 1) },
                      { label: "Tirar desta mesa", icon: X, onClick: () => void tirar(i) },
                    ]} />
                  );
                })}
              </div>
            </div>
          ))}
          {!itens.length && <p className="px-4 py-3 text-sm text-muted">Mesa vazia.</p>}
          <button className="w-full flex items-center justify-center gap-1.5 text-sm text-muted hover:text-ink py-2.5 border-t border-line hover:bg-sel/40"
            onClick={() => d.abrir({ tipo: "adicionar", mesa })}><Plus size={14} /> Adicionar livro a esta mesa</button>
        </div>
      )}
    </article>
  );
}
