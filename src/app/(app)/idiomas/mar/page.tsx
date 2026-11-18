"use client";
/**
 * Lista do MAR (método Vergara): filmes, séries, canais e podcasts em inglês de verdade, com a sua curadoria.
 * Três colunas — assistindo, quero ver (do mais fácil ao mais difícil) e vistos —, onde assistir,
 * o nível e se é "com boia" (legenda em inglês) ou "sem boia" (sem legenda).
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Check, Clapperboard, Mic, Play, Plus, RotateCcw, SquarePlay, Trash2, Tv } from "lucide-react";
import { Page } from "@/components/page";
import { RowMenu } from "@/components/row-menu";
import { supabase } from "@/lib/supabase/client";

type Tipo = "filme" | "serie" | "youtube" | "podcast" | "livro";
type Situacao = "quero" | "assistindo" | "visto";
interface Titulo {
  id: string; titulo: string; tipo: Tipo; situacao: Situacao; onde: string; legenda: "en" | "sem";
  nivel: 1 | 2 | 3; progresso: string; nota: string; posicao: number; visto_em: string | null; created_at: string;
}

const TIPOS: { id: Tipo; nome: string; icone: typeof Tv }[] = [
  { id: "serie", nome: "Série", icone: Tv },
  { id: "filme", nome: "Filme", icone: Clapperboard },
  { id: "youtube", nome: "YouTube", icone: SquarePlay },
  { id: "podcast", nome: "Podcast", icone: Mic },
  { id: "livro", nome: "Livro", icone: BookOpen },
];
const NIVEIS = { 1: "fácil", 2: "médio", 3: "difícil" } as const;
const COR_NIVEL = { 1: "var(--good)", 2: "#c98a1a", 3: "var(--critical)" } as const;
const COLUNAS: { id: Situacao; nome: string; vazio: string }[] = [
  { id: "assistindo", nome: "Assistindo", vazio: "Nada em andamento. Escolha algo em “Quero ver” e aperte ▶." },
  { id: "quero", nome: "Quero ver", vazio: "Adicione acima o que quer assistir ou ouvir." },
  { id: "visto", nome: "Vistos", vazio: "O que terminar vem para cá." },
];

export default function ListaDoMar() {
  const [lista, setLista] = useState<Titulo[] | null>(null);
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<Tipo>("serie");
  const [onde, setOnde] = useState("");
  const [nivel, setNivel] = useState<1 | 2 | 3>(2);

  useEffect(() => {
    void supabase().from("mar_titulos").select("*").order("posicao").order("created_at")
      .then(({ data }) => setLista((data as Titulo[] | null) ?? []));
  }, []);

  const porColuna = useMemo(() => {
    const l = lista ?? [];
    return {
      assistindo: l.filter((t) => t.situacao === "assistindo"),
      // do mais fácil ao mais difícil, como o Mairo recomenda (primeiro com boia, depois sem)
      quero: l.filter((t) => t.situacao === "quero").sort((a, b) => a.nivel - b.nivel || a.posicao - b.posicao),
      visto: l.filter((t) => t.situacao === "visto").sort((a, b) => (b.visto_em ?? "").localeCompare(a.visto_em ?? "")),
    };
  }, [lista]);

  async function adicionar() {
    const t = titulo.trim();
    if (!t) return;
    const posicao = Math.max(0, ...(lista ?? []).map((x) => x.posicao)) + 1;
    const { data } = await supabase().from("mar_titulos").insert({ titulo: t, tipo, onde: onde.trim(), nivel, posicao, situacao: "quero", legenda: "en", progresso: "", nota: "" }).select().single();
    if (data) setLista((l) => [...(l ?? []), data as Titulo]);
    setTitulo("");
    setOnde("");
  }
  function mudar(t: Titulo, campos: Partial<Titulo>) {
    setLista((l) => l?.map((x) => (x.id === t.id ? { ...x, ...campos } : x)) ?? null);
    // o pedido ao banco só sai quando é aguardado (then)
    void supabase().from("mar_titulos").update(campos).eq("id", t.id).then(({ error }) => { if (error) alert(`Não consegui salvar: ${error.message}`); });
  }
  async function apagar(t: Titulo) {
    if (!confirm(`Tirar “${t.titulo}” da lista?`)) return;
    setLista((l) => l?.filter((x) => x.id !== t.id) ?? null);
    await supabase().from("mar_titulos").delete().eq("id", t.id);
  }

  function cartao(t: Titulo) {
    const T = TIPOS.find((x) => x.id === t.tipo) ?? TIPOS[0];
    return (
      <li key={t.id} className="rounded-lg border border-line bg-surface p-2.5">
        <div className="flex items-start gap-2">
          <T.icone size={15} className="text-icon mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className={`leading-snug ${t.situacao === "visto" ? "text-muted" : ""}`}>{t.titulo}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
              {t.onde && <span>{t.onde}</span>}
              <select aria-label="Nível" value={t.nivel} onChange={(e) => mudar(t, { nivel: Number(e.target.value) as 1 | 2 | 3 })}
                className="bg-transparent outline-none cursor-pointer rounded px-1 py-px" style={{ color: COR_NIVEL[t.nivel], background: "var(--surface-2)" }}>
                {([1, 2, 3] as const).map((n) => <option key={n} value={n}>{NIVEIS[n]}</option>)}
              </select>
              <button type="button" className="rounded px-1.5 py-px hover:text-ink" style={{ background: "var(--surface-2)" }}
                title="Com boia = legenda em inglês · sem boia = sem legenda (clique para trocar)"
                onClick={() => mudar(t, { legenda: t.legenda === "en" ? "sem" : "en" })}>
                {t.legenda === "en" ? "com boia (legenda EN)" : "sem boia"}
              </button>
            </div>
            {t.situacao === "assistindo" && (
              <input className="input mt-1.5 py-0.5 px-2 text-xs" placeholder="onde parou (ex.: T2 E5, 40 min)" defaultValue={t.progresso}
                onBlur={(e) => e.target.value !== t.progresso && mudar(t, { progresso: e.target.value })} />
            )}
          </div>
          <div className="flex items-center shrink-0 -mr-1">
            {t.situacao === "quero" && (
              <button className="btn btn-ghost px-1.5 py-1" title="Começar a assistir" onClick={() => mudar(t, { situacao: "assistindo" })}><Play size={14} /></button>
            )}
            {t.situacao === "assistindo" && (
              <button className="btn btn-ghost px-1.5 py-1" title="Terminei" onClick={() => mudar(t, { situacao: "visto", visto_em: new Date().toISOString() })}><Check size={15} /></button>
            )}
            <RowMenu items={[
              ...(t.situacao !== "quero" ? [{ label: "Voltar para “Quero ver”", icon: RotateCcw, onClick: () => mudar(t, { situacao: "quero", visto_em: null }) }] : []),
              ...(t.situacao === "visto" ? [{ label: "Assistir de novo", icon: Play, onClick: () => mudar(t, { situacao: "assistindo", visto_em: null }) }] : []),
              ...TIPOS.filter((x) => x.id !== t.tipo).map((x, i) => ({ label: `É ${x.nome.toLowerCase()}`, icon: x.icone, onClick: () => mudar(t, { tipo: x.id }), separar: i === 0 })),
              { label: "Tirar da lista", icon: Trash2, danger: true, separar: true, onClick: () => void apagar(t) },
            ]} />
          </div>
        </div>
      </li>
    );
  }

  return (
    <Page
      denso
      title="Lista do MAR"
      subtitle="Inglês de verdade — filmes, séries, canais e podcasts — com a sua curadoria. Comece pelo mais fácil, com boia; depois tire a boia."
      actions={<Link href="/idiomas" className="btn"><ArrowLeft size={15} /> Idiomas</Link>}
    >
      <form className="card p-3 mb-3 md:mb-4 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void adicionar(); }}>
        <input className="input flex-1 min-w-[14rem]" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título (ex.: Friends, um canal do YouTube, um podcast…)" />
        <select aria-label="Tipo" className="input w-auto" value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
          {TIPOS.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
        </select>
        <input className="input w-36" value={onde} onChange={(e) => setOnde(e.target.value)} placeholder="Onde (Netflix…)" />
        <select aria-label="Nível" className="input w-auto" value={nivel} onChange={(e) => setNivel(Number(e.target.value) as 1 | 2 | 3)}>
          {([1, 2, 3] as const).map((n) => <option key={n} value={n}>{NIVEIS[n]}</option>)}
        </select>
        <button className="btn btn-primary" disabled={!titulo.trim()}><Plus size={15} /> Adicionar</button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 items-start">
        {COLUNAS.map((c) => (
          <section key={c.id} className="card p-3 min-w-0">
            <h2 className="font-medium mb-2 flex items-baseline justify-between">
              {c.nome} <span className="text-xs text-muted font-normal tabular-nums">{porColuna[c.id].length}</span>
            </h2>
            {lista === null ? <p className="text-sm text-muted">…</p>
              : porColuna[c.id].length === 0 ? <p className="text-sm text-muted">{c.vazio}</p>
              : <ul className="space-y-2 max-h-[calc(100vh-17rem)] overflow-y-auto">{porColuna[c.id].map(cartao)}</ul>}
          </section>
        ))}
      </div>
    </Page>
  );
}
