"use client";
/**
 * MAR (método Vergara) dentro de Idiomas: a sua lista de inglês de verdade — filmes, séries, canais e
 * podcasts —, com indicadores do período e as três colunas (assistindo, quero ver, vistos).
 * "Quero ver" vai do mais fácil ao mais difícil; cada título diz onde assistir e se é com boia
 * (legenda em inglês) ou sem boia (sem legenda).
 */
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, Clapperboard, Mic, Play, Plus, RotateCcw, SquarePlay, Trash2, Tv, Waves, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { nf } from "@/lib/dates";
import type { Periodo } from "@/lib/periodo";
import { RowMenu } from "./row-menu";
import { Variacao } from "./variacao";
import { PLATAFORMAS, PlataformaIcone, plataformaDe } from "./plataforma";

type Tipo = "filme" | "serie" | "youtube" | "podcast" | "livro";
type Situacao = "quero" | "assistindo" | "visto";
interface Titulo {
  id: string; idioma: string; titulo: string; tipo: Tipo; situacao: Situacao; onde: string; legenda: "en" | "sem";
  nivel: 1 | 2 | 3; progresso: string; nota: string; posicao: number; visto_em: string | null; created_at: string;
}

const TIPOS: { id: Tipo; nome: string; icone: typeof Tv }[] = [
  { id: "serie", nome: "Série", icone: Tv },
  { id: "filme", nome: "Filme", icone: Clapperboard },
  { id: "youtube", nome: "Vídeo", icone: SquarePlay },
  { id: "podcast", nome: "Podcast", icone: Mic },
  { id: "livro", nome: "Livro", icone: BookOpen },
];
const NIVEIS = { 1: "fácil", 2: "médio", 3: "difícil" } as const;
const COR_NIVEL = { 1: "var(--good)", 2: "#c98a1a", 3: "var(--critical)" } as const;
const COLUNAS: { id: Situacao; nome: string; vazio: string }[] = [
  { id: "assistindo", nome: "Assistindo", vazio: "Nada em andamento. Escolha algo da fila e aperte ▶." },
  { id: "quero", nome: "Quero ver", vazio: "A fila está vazia. Use “Adicionar”." },
  { id: "visto", nome: "Vistos", vazio: "O que terminar vem para cá." },
];

export function MarPainel({ idioma, periodo, compacto, className = "mt-3 md:mt-4" }: {
  idioma: string; periodo: Periodo;
  /** numa coluna da página: as três colunas viram abas */
  compacto?: boolean; className?: string;
}) {
  const [lista, setLista] = useState<Titulo[] | null>(null);
  const [aba, setAba] = useState<Situacao | null>(null);
  const [form, setForm] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<Tipo>("serie");
  const [onde, setOnde] = useState("");
  const [nivel, setNivel] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    void supabase().from("mar_titulos").select("*").eq("idioma", idioma).order("posicao").order("created_at")
      .then(({ data }) => setLista((data as Titulo[] | null) ?? []));
  }, [idioma]);

  const col = useMemo(() => {
    const l = lista ?? [];
    return {
      assistindo: l.filter((t) => t.situacao === "assistindo"),
      // do mais fácil ao mais difícil: primeiro com boia, depois sem
      quero: l.filter((t) => t.situacao === "quero").sort((a, b) => a.nivel - b.nivel || a.posicao - b.posicao),
      visto: l.filter((t) => t.situacao === "visto").sort((a, b) => (b.visto_em ?? "").localeCompare(a.visto_em ?? "")),
    };
  }, [lista]);

  // indicadores
  const dia = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
  const vistosP = col.visto.filter((t) => dia(t.visto_em) >= periodo.de && dia(t.visto_em) <= periodo.ate).length;
  const vistosA = col.visto.filter((t) => dia(t.visto_em) >= periodo.antDe && dia(t.visto_em) <= periodo.antAte).length;
  const emUso = [...col.assistindo, ...col.visto];
  const semBoia = emUso.length ? emUso.filter((t) => t.legenda === "sem").length / emUso.length : null;
  const faceis = col.quero.filter((t) => t.nivel === 1).length;
  const porPlataforma = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of lista ?? []) { const p = plataformaDe(t.onde); if (p) m.set(t.onde, (m.get(t.onde) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [lista]);

  async function adicionar() {
    const t = titulo.trim();
    if (!t) return;
    const posicao = Math.max(0, ...(lista ?? []).map((x) => x.posicao)) + 1;
    const { data } = await supabase().from("mar_titulos")
      .insert({ idioma, titulo: t, tipo, onde: onde.trim(), nivel, posicao, situacao: "quero", legenda: "en", progresso: "", nota: "" }).select().single();
    if (data) setLista((l) => [...(l ?? []), data as Titulo]);
    setTitulo(""); setOnde("");
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
    const temPlat = !!plataformaDe(t.onde);
    return (
      <li key={t.id} className="group rounded-lg border border-line bg-surface px-2.5 py-2">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5">{temPlat ? <PlataformaIcone onde={t.onde} /> : <span className="w-5 h-5 rounded-[5px] bg-surface-2 grid place-items-center"><T.icone size={12} className="text-icon" /></span>}</span>
          <div className="min-w-0 flex-1">
            <div className={`text-sm leading-snug ${t.situacao === "visto" ? "text-muted" : ""}`}>{t.titulo}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
              <span>{T.nome}{t.onde ? ` · ${t.onde}` : ""}</span>
              <select aria-label="Nível" value={t.nivel} onChange={(e) => mudar(t, { nivel: Number(e.target.value) as 1 | 2 | 3 })}
                className="outline-none cursor-pointer rounded px-1 py-px bg-surface-2" style={{ color: COR_NIVEL[t.nivel] }}>
                {([1, 2, 3] as const).map((n) => <option key={n} value={n}>{NIVEIS[n]}</option>)}
              </select>
              <button type="button" className="rounded px-1.5 py-px bg-surface-2 hover:text-ink"
                title="Com boia = legenda em inglês · sem boia = sem legenda (clique para trocar)"
                onClick={() => mudar(t, { legenda: t.legenda === "en" ? "sem" : "en" })}>
                {t.legenda === "en" ? "com boia" : "sem boia"}
              </button>
            </div>
            {t.situacao === "assistindo" && (
              <input className="input mt-1.5 py-0.5 px-2 text-xs" placeholder="onde parou (ex.: T2 E5)" defaultValue={t.progresso}
                onBlur={(e) => e.target.value !== t.progresso && mudar(t, { progresso: e.target.value })} />
            )}
          </div>
          <div className="flex items-center shrink-0 -mr-1">
            {t.situacao === "quero" && <button className="btn btn-ghost px-1.5 py-1" title="Começar a assistir" onClick={() => mudar(t, { situacao: "assistindo" })}><Play size={14} /></button>}
            {t.situacao === "assistindo" && <button className="btn btn-ghost px-1.5 py-1" title="Terminei" onClick={() => mudar(t, { situacao: "visto", visto_em: new Date().toISOString() })}><Check size={15} /></button>}
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

  const Mini = ({ rotulo, valor, dica, hint }: { rotulo: string; valor: React.ReactNode; dica?: string; hint?: React.ReactNode }) => (
    <div className="rounded-lg bg-surface-2/60 px-3 py-2 min-w-0" title={dica}>
      <div className="text-[11px] text-muted truncate">{rotulo}</div>
      <div className="text-xl tabular-nums leading-tight mt-0.5">{valor}</div>
      {hint && <div className="text-[11px] text-faint truncate">{hint}</div>}
    </div>
  );

  return (
    <section id="mar" className={`card p-4 min-w-0 flex flex-col ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="font-medium flex items-center gap-2"><Waves size={16} className="text-icon" /> MAR</h3>
          <p className="text-xs text-muted mt-0.5">{idioma} de verdade — séries, filmes, canais e podcasts. {compacto ? "Do mais fácil, com boia, ao sem boia." : "Comece pelo mais fácil, com boia; depois tire a boia."}</p>
        </div>
        {!form && <button className="btn text-sm" onClick={() => setForm(true)}><Plus size={15} /> Adicionar</button>}
      </div>

      {form && (
        <form className="flex flex-wrap items-center gap-2 mb-3 rounded-lg bg-surface-2/60 p-2.5" onSubmit={(e) => { e.preventDefault(); void adicionar(); }}>
          <input className="input flex-1 min-w-[12rem]" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título (ex.: Friends)" autoFocus />
          <select aria-label="Tipo" className="input w-auto" value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
            {TIPOS.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
          <span className="relative inline-flex items-center">
            <span className="absolute left-2 pointer-events-none"><PlataformaIcone onde={onde} tamanho={16} /></span>
            <input className={`input w-40 ${plataformaDe(onde) ? "pl-8" : ""}`} list="mar-plataformas" value={onde} onChange={(e) => setOnde(e.target.value)} placeholder="Onde (Netflix…)" />
            <datalist id="mar-plataformas">{PLATAFORMAS.map((p) => <option key={p.id} value={p.nome} />)}</datalist>
          </span>
          <select aria-label="Nível" className="input w-auto" value={nivel} onChange={(e) => setNivel(Number(e.target.value) as 1 | 2 | 3)}>
            {([1, 2, 3] as const).map((n) => <option key={n} value={n}>{NIVEIS[n]}</option>)}
          </select>
          <button className="btn btn-primary" disabled={!titulo.trim()}><Plus size={15} /> Adicionar</button>
          <button type="button" className="btn btn-ghost px-2" title="Fechar" onClick={() => setForm(false)}><X size={15} /></button>
        </form>
      )}

      {/* indicadores */}
      <div className={`grid gap-2 ${compacto ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 lg:grid-cols-4"}`}>
        <Mini rotulo="Assistindo" valor={col.assistindo.length} hint={col.assistindo[0]?.titulo ?? "nada agora"} />
        <Mini rotulo="Na fila" valor={col.quero.length} hint={col.quero.length ? `${faceis} ${faceis === 1 ? "fácil" : "fáceis"} para começar` : "adicione títulos"} />
        <Mini rotulo={`Vistos · ${periodo.nome.toLowerCase()}`} valor={vistosP} hint={<Variacao atual={vistosP} base={vistosA} vs={periodo.vs} />}
          dica={`Terminados no período. Período anterior: ${vistosA}. No total: ${col.visto.length}.`} />
        <Mini rotulo="Sem boia" valor={semBoia === null ? "—" : `${Math.round(semBoia * 100)}%`} hint={compacto ? "sem legenda" : "do que você assiste e já viu, sem legenda"}
          dica="Com boia = com legenda em inglês. O objetivo, com o tempo, é tirar a boia." />
      </div>
      {porPlataforma.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5 text-xs text-muted">
          {porPlataforma.map(([o, n]) => <span key={o} className="inline-flex items-center gap-1.5"><PlataformaIcone onde={o} tamanho={16} />{o} <b className="font-medium text-ink tabular-nums">{n}</b></span>)}
        </div>
      )}

      {/* compacto: uma coluna por vez, em abas */}
      {compacto ? (() => {
        const atual: Situacao = aba ?? (col.assistindo.length ? "assistindo" : "quero");
        const c = COLUNAS.find((x) => x.id === atual)!;
        return (
          <div className="mt-3">
            <div className="inline-flex rounded-lg bg-surface-2 p-0.5 text-xs mb-2" role="tablist">
              {COLUNAS.map((x) => (
                <button key={x.id} role="tab" aria-selected={x.id === atual} onClick={() => setAba(x.id)}
                  className={`px-2.5 py-1 rounded-md ${x.id === atual ? "bg-seg shadow-sm font-medium" : "text-muted hover:text-ink"}`}>
                  {x.nome} <span className="tabular-nums text-muted">{col[x.id].length}</span>
                </button>
              ))}
            </div>
            {lista === null ? <p className="text-sm text-muted">…</p>
              : col[atual].length === 0 ? <p className="text-xs text-muted">{c.vazio}</p>
              : <ul className="space-y-2 max-h-[15.5rem] overflow-y-auto pr-0.5">{col[atual].map(cartao)}</ul>}
          </div>
        );
      })() : (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 items-start">
        {COLUNAS.map((c) => (
          <div key={c.id} className="rounded-xl bg-surface-2/40 p-2.5 min-w-0">
            <div className="flex items-baseline justify-between px-0.5 mb-2">
              <span className="text-[11px] uppercase tracking-wider text-muted">{c.nome}</span>
              <span className="text-xs text-muted tabular-nums">{nf.format(col[c.id].length)}</span>
            </div>
            {lista === null ? <p className="text-sm text-muted px-0.5">…</p>
              : col[c.id].length === 0 ? <p className="text-xs text-muted px-0.5 pb-1">{c.vazio}</p>
              : <ul className="space-y-2 max-h-80 overflow-y-auto">{col[c.id].map(cartao)}</ul>}
          </div>
        ))}
      </div>
      )}
    </section>
  );
}
