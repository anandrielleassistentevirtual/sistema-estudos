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
import { fmtDuration, nf } from "@/lib/dates";
import type { Periodo } from "@/lib/periodo";
import { RowMenu } from "./row-menu";
import { useTimerEstado } from "./timer-context";
import { Variacao } from "./variacao";
import { PLATAFORMAS, PlataformaIcone, plataformaDe } from "./plataforma";

type Tipo = "filme" | "serie" | "youtube" | "podcast" | "livro";
type Situacao = "quero" | "assistindo" | "visto";
interface Titulo {
  id: string; idioma: string; titulo: string; tipo: Tipo; situacao: Situacao; onde: string; legenda: "en" | "sem";
  nivel: 1 | 2 | 3; progresso: string; nota: string; posicao: number; visto_em: string | null; created_at: string;
  /** séries: nº de episódios de cada temporada, e quantos já foram vistos (T1 inteira, depois T2…) */
  temporadas: number[] | null; ep_vistos: number | null;
  /** minutos de cada episódio: cada episódio marcado vira tempo de estudo */
  min_ep: number | null;
}

const COR_EP = "var(--area-idiomas)"; // a cor de Idiomas
const totalEps = (t: Pick<Titulo, "temporadas">) => (t.temporadas ?? []).reduce((a, b) => a + b, 0);
/** o último episódio visto: temporada (1…) e episódio dentro dela; 0 = não começou */
function ondeEsta(t: Pick<Titulo, "temporadas" | "ep_vistos">) {
  let k = t.ep_vistos ?? 0;
  const ts = t.temporadas ?? [];
  if (k <= 0 || !ts.length) return { temp: 1, ep: 0 };
  for (let i = 0; i < ts.length; i++) { if (k <= ts[i]) return { temp: i + 1, ep: k }; k -= ts[i]; }
  return { temp: ts.length, ep: ts[ts.length - 1] };
}
/** "10, 12, 8" ou "3x10" (3 temporadas de 10) → [10, 12, 8] */
export function lerTemporadas(txt: string): number[] {
  const x = txt.trim().toLowerCase().match(/^(\d+)\s*[x×]\s*(\d+)$/);
  if (x) return Array.from({ length: Math.min(60, Number(x[1])) }, () => Number(x[2]));
  return txt.split(/[,;\s]+/).map((v) => parseInt(v, 10)).filter((v) => v > 0 && v < 1000).slice(0, 60);
}

const TIPOS: { id: Tipo; nome: string; icone: typeof Tv }[] = [
  { id: "serie", nome: "Série", icone: Tv },
  { id: "filme", nome: "Filme", icone: Clapperboard },
  { id: "youtube", nome: "Vídeo", icone: SquarePlay },
  { id: "podcast", nome: "Podcast", icone: Mic },
  { id: "livro", nome: "Livro", icone: BookOpen },
];
const NIVEIS = { 1: "fácil", 2: "médio", 3: "difícil" } as const;
const COR_NIVEL = { 1: "var(--good)", 2: "var(--warn)", 3: "var(--critical)" } as const;
const COLUNAS: { id: Situacao; nome: string; vazio: string }[] = [
  { id: "assistindo", nome: "Assistindo", vazio: "Nada em andamento. Escolha algo da fila e aperte ▶." },
  { id: "quero", nome: "Quero ver", vazio: "A fila está vazia. Use “Adicionar”." },
  { id: "visto", nome: "Vistos", vazio: "O que terminar vem para cá." },
];

export function MarPainel({ idioma, periodo, compacto, className = "mt-3 md:mt-4", onTempo }: {
  idioma: string; periodo: Periodo;
  /** um episódio entrou (ou saiu) do tempo de estudo: a página recarrega os números */
  onTempo?: () => void;
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
  const [eps, setEps] = useState("");
  /** série aberta no editor de episódios */
  const [editEps, setEditEps] = useState<Titulo | null>(null);
  /** episódios vistos por dia (para o indicador do período) */
  type Registro = { id?: string; titulo_id?: string; dia: string; episodios: number; sessao_id?: string | null };
  const [log, setLog] = useState<Registro[]>([]);
  const timer = useTimerEstado();

  useEffect(() => {
    void supabase().from("mar_log").select("id,titulo_id,dia,episodios,sessao_id").gte("dia", periodo.antDe < periodo.de ? periodo.antDe : periodo.de)
      .order("created_at").then(({ data }) => setLog((data as Registro[] | null) ?? []));
  }, [periodo.antDe, periodo.de]);
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
  const epsNo = (de: string, ate: string) => Math.max(0, log.filter((l) => l.dia >= de && l.dia <= ate).reduce((n, l) => n + l.episodios, 0));
  const epsP = epsNo(periodo.de, periodo.ate), epsA = epsNo(periodo.antDe, periodo.antAte);
  // o tempo desses episódios (a duração de cada série)
  const minDe = (id?: string) => (lista ?? []).find((x) => x.id === id)?.min_ep ?? 25;
  const minEpsP = Math.max(0, log.filter((l) => l.dia >= periodo.de && l.dia <= periodo.ate).reduce((n, l) => n + l.episodios * minDe(l.titulo_id), 0));
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
      .insert({ idioma, titulo: t, tipo, onde: onde.trim(), nivel, posicao, situacao: "quero", legenda: "en", progresso: "", nota: "",
        temporadas: tipo === "serie" ? lerTemporadas(eps) : [], ep_vistos: 0 }).select().single();
    if (data) setLista((l) => [...(l ?? []), data as Titulo]);
    setTitulo(""); setOnde(""); setEps("");
  }
  function mudar(t: Titulo, campos: Partial<Titulo>) {
    setLista((l) => l?.map((x) => (x.id === t.id ? { ...x, ...campos } : x)) ?? null);
    // o pedido ao banco só sai quando é aguardado (then)
    void supabase().from("mar_titulos").update(campos).eq("id", t.id).then(({ error }) => { if (error) alert(`Não consegui salvar: ${error.message}`); });
  }
  /**
   * +1 / −1 episódio: passa sozinho para a próxima temporada; no último, a série vai para Vistos.
   * Cada episódio vira tempo de estudo do idioma ("MAR · série", com a duração do episódio), que aparece no
   * Dashboard e em Idiomas — a não ser que o Timer esteja ligado (aí ele já está contando). O −1 desfaz o último.
   */
  async function episodio(t: Titulo, delta: 1 | -1) {
    const total = totalEps(t);
    const novo = Math.max(0, Math.min(total, (t.ep_vistos ?? 0) + delta));
    if (novo === (t.ep_vistos ?? 0)) return;
    const acabou = delta > 0 && novo === total;
    mudar(t, { ep_vistos: novo, ...(acabou ? { situacao: "visto" as Situacao, visto_em: new Date().toISOString() } : {}) });
    const sb = supabase();
    const agora = new Date();
    const dia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
    if (delta > 0) {
      const { temp, ep } = ondeEsta({ temporadas: t.temporadas, ep_vistos: novo });
      let sessao_id: string | null = null;
      if (!timer.running) {
        const seg = (t.min_ep ?? 25) * 60;
        const { data } = await sb.from("study_sessions").insert({
          day: dia, started_at: new Date(agora.getTime() - seg * 1000).toISOString(), seconds: seg,
          category: "Idiomas", language: idioma, label: `MAR · ${t.titulo} T${temp}E${ep}`,
        }).select("id").single();
        sessao_id = (data as { id: string } | null)?.id ?? null;
      }
      const { data: reg } = await sb.from("mar_log").insert({ titulo_id: t.id, dia, episodios: 1, sessao_id }).select("id").single();
      setLog((l) => [...l, { id: (reg as { id: string } | null)?.id, titulo_id: t.id, dia, episodios: 1, sessao_id }]);
    } else {
      // desfaz o último episódio marcado desta série (e o tempo que ele somou): primeiro o que está na tela, senão busca no banco
      let ult = [...log].reverse().find((x) => x.titulo_id === t.id && x.episodios > 0 && x.id) ?? null;
      if (!ult) {
        const { data } = await sb.from("mar_log").select("id,titulo_id,dia,episodios,sessao_id").eq("titulo_id", t.id).gt("episodios", 0)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        ult = (data as Registro | null) ?? null;
      }
      if (ult?.id) {
        if (ult.sessao_id) await sb.from("study_sessions").delete().eq("id", ult.sessao_id);
        await sb.from("mar_log").delete().eq("id", ult.id);
        const alvo = ult.id;
        setLog((l) => l.filter((x) => x.id !== alvo));
      }
    }
    onTempo?.();
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
            {t.tipo === "serie" && totalEps(t) > 0 ? (() => {
              // a barra dividida em temporadas, cada pedaço do tamanho da temporada, preenchida até onde você está
              const ts = t.temporadas ?? [];
              const vistos = t.ep_vistos ?? 0;
              const total = totalEps(t);
              const { temp, ep } = ondeEsta(t);
              let antes = 0;
              return (
                <div className="mt-2">
                  <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
                    <span>
                      {vistos === 0 ? <span className="text-muted">não começou · {ts.length} temp. · {total} ep. · {fmtDuration(total * (t.min_ep ?? 25) * 60)}</span>
                        : vistos >= total ? <span className="text-muted">todas as {ts.length} temporadas · {total} ep.</span>
                        : <><b className="font-medium text-ink">T{temp} · E{ep}</b><span className="text-muted"> de {ts[temp - 1]} · {vistos}/{total} ep.</span></>}
                    </span>
                    {t.situacao === "assistindo" && vistos < total && (
                      <span className="flex items-center gap-1 shrink-0">
                        <button className="btn btn-ghost px-1.5 py-0 text-[11px]" title="Desfazer o último episódio" disabled={!vistos} onClick={() => void episodio(t, -1)}>−1</button>
                        <button className="btn px-2 py-0 text-[11px]" title={`Vi o episódio ${ep + 1 > (ts[temp - 1] ?? 0) ? `1 da T${temp + 1}` : `${vistos ? ep + 1 : 1} da T${vistos ? temp : 1}`}`} onClick={() => void episodio(t, 1)}><Plus size={11} /> episódio</button>
                      </span>
                    )}
                  </div>
                  <div className="flex gap-[3px] mt-1.5">
                    {ts.map((n, i) => {
                      const feitos = Math.max(0, Math.min(n, vistos - antes));
                      antes += n;
                      return (
                        <div key={i} className="h-1.5 rounded-full bg-surface-2 overflow-hidden" style={{ flexGrow: n, flexBasis: 0 }}
                          title={`Temporada ${i + 1}: ${feitos} de ${n} episódios`}>
                          <div className="h-full rounded-full" style={{ width: `${(feitos / n) * 100}%`, background: COR_EP }} />
                        </div>
                      );
                    })}
                  </div>
                  {vistos > 0 && (
                    <div className="mt-1 flex justify-between text-[10.5px] text-faint tabular-nums">
                      <span>{t.min_ep ?? 25} min/ep. · assistido {fmtDuration(vistos * (t.min_ep ?? 25) * 60)}</span>
                      {vistos < total && <span>faltam {fmtDuration((total - vistos) * (t.min_ep ?? 25) * 60)}</span>}
                    </div>
                  )}
                </div>
              );
            })() : t.tipo === "serie" ? (
              <button className="mt-1.5 text-[11px] text-muted hover:text-ink underline-offset-2 hover:underline" onClick={() => setEditEps(t)}>+ episódios por temporada</button>
            ) : t.situacao === "assistindo" && (
              <input className="input mt-1.5 py-0.5 px-2 text-xs" placeholder="onde parou (ex.: 40 min, cap. 3)" defaultValue={t.progresso}
                onBlur={(e) => e.target.value !== t.progresso && mudar(t, { progresso: e.target.value })} />
            )}
          </div>
          <div className="flex items-center shrink-0 -mr-1">
            {t.situacao === "quero" && <button className="btn btn-ghost px-1.5 py-1" title="Começar a assistir" onClick={() => mudar(t, { situacao: "assistindo" })}><Play size={14} /></button>}
            {t.situacao === "assistindo" && (
              <button className="btn btn-ghost px-1.5 py-1" title={t.tipo === "serie" && totalEps(t) ? "Terminei a série (vai sozinha para Vistos no último episódio)" : "Terminei"}
                onClick={() => {
                  // série com episódios: só termina de uma vez se você confirmar (o normal é ir pelo “+ episódio”)
                  const faltam = totalEps(t) - (t.ep_vistos ?? 0);
                  if (t.tipo === "serie" && faltam > 0 && !confirm(`Marcar “${t.titulo}” como vista? Ainda faltam ${faltam} de ${totalEps(t)} episódios.`)) return;
                  mudar(t, { situacao: "visto", visto_em: new Date().toISOString() });
                }}><Check size={15} /></button>
            )}
            <RowMenu items={[
              ...(t.situacao !== "quero" ? [{ label: "Voltar para “Quero ver”", icon: RotateCcw, onClick: () => mudar(t, { situacao: "quero", visto_em: null }) }] : []),
              ...(t.situacao === "visto" ? [{ label: "Assistir de novo", icon: Play, onClick: () => mudar(t, { situacao: "assistindo", visto_em: null, ...(t.tipo === "serie" ? { ep_vistos: 0 } : {}) }) }] : []),
              ...(t.tipo === "serie" ? [{ label: "Temporadas e episódios…", icon: Tv, onClick: () => setEditEps(t) }] : []),
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
      <div className="text-xl font-medium tracking-[-0.02em] tabular-nums leading-tight mt-0.5">{valor}</div>
      {hint && <div className="text-[11px] text-faint truncate">{hint}</div>}
    </div>
  );

  return (
    <section id="mar" className={`card p-4 min-w-0 flex flex-col ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="card-title flex items-center gap-2"><Waves size={16} className="text-icon" /> MAR</h3>
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
          {tipo === "serie" && (
            <input className="input w-44" value={eps} onChange={(e) => setEps(e.target.value)} placeholder="episódios: 10, 12, 8 ou 3x10"
              title="Quantos episódios tem cada temporada (pode deixar para depois)" />
          )}
          <button className="btn btn-primary" disabled={!titulo.trim()}><Plus size={15} /> Adicionar</button>
          <button type="button" className="btn btn-ghost px-2" title="Fechar" onClick={() => setForm(false)}><X size={15} /></button>
        </form>
      )}

      {/* indicadores */}
      <div className={`grid gap-2 ${compacto ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 lg:grid-cols-4"}`}>
        <Mini rotulo="Assistindo" valor={col.assistindo.length} hint={col.assistindo[0]?.titulo ?? "nada agora"} />
        <Mini rotulo={`Episódios · ${periodo.nome.toLowerCase()}`} valor={nf.format(epsP)}
          hint={<>{minEpsP > 0 && <>{fmtDuration(minEpsP * 60)} · </>}<Variacao atual={epsP} base={epsA} vs={periodo.vs} /></>}
          dica={`Episódios vistos no período (pelo “+ episódio”; cada um soma a duração dele no tempo de estudo). Período anterior: ${epsA}. Na fila: ${col.quero.length} títulos, ${faceis} ${faceis === 1 ? "fácil" : "fáceis"}.`} />
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
            <div className="seg mb-2" role="tablist">
              {COLUNAS.map((x) => (
                <button key={x.id} role="tab" aria-selected={x.id === atual} aria-pressed={x.id === atual} onClick={() => setAba(x.id)}>
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
      {editEps && (
        <EditorDeEpisodios t={editEps} onClose={() => setEditEps(null)}
          onSalvar={(temporadas, ep_vistos, min_ep) => { mudar(editEps, { temporadas, ep_vistos, min_ep }); setEditEps(null); }} />
      )}
    </section>
  );
}

/** Temporadas e episódios de uma série: quantos episódios tem cada temporada e onde você parou. */
function EditorDeEpisodios({ t, onClose, onSalvar }: { t: Titulo; onClose: () => void; onSalvar: (temporadas: number[], epVistos: number, minEp: number) => void }) {
  const [ts, setTs] = useState<number[]>(t.temporadas?.length ? [...t.temporadas] : [10]);
  const [minEp, setMinEp] = useState(t.min_ep ?? 25);
  const inicio = ondeEsta(t);
  const [temp, setTemp] = useState(inicio.temp);
  const [ep, setEp] = useState(inicio.ep);
  const [rapido, setRapido] = useState("");
  const tempOk = Math.min(temp, ts.length);
  const epOk = Math.min(ep, ts[tempOk - 1] ?? 0);
  const vistos = ts.slice(0, tempOk - 1).reduce((a, b) => a + b, 0) + epOk;
  const total = ts.reduce((a, b) => a + b, 0);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/45" onClick={onClose}>
      <div className="card w-full max-w-md p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="modal-title">{t.titulo} <span className="text-muted font-normal">· temporadas</span></h2>
          <button onClick={onClose} className="modal-close" aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input className="input flex-1" value={rapido} onChange={(e) => setRapido(e.target.value)} placeholder="rápido: 3x10 ou 10, 12, 8" />
          <button className="btn" disabled={!lerTemporadas(rapido).length} onClick={() => { setTs(lerTemporadas(rapido)); setRapido(""); }}>Preencher</button>
        </div>
        <ul className="grid grid-cols-2 gap-2 text-sm">
          {ts.map((n, i) => (
            <li key={i} className="flex items-center gap-2 rounded-lg bg-surface-2/60 px-2.5 py-1.5">
              <span className="text-muted w-8">T{i + 1}</span>
              <input type="number" min={1} max={999} className="input py-0.5 px-2 w-16 text-right tabular-nums" value={n}
                onChange={(e) => setTs((l) => l.map((x, j) => (j === i ? Math.max(1, Number(e.target.value) || 1) : x)))} />
              <span className="text-xs text-muted">ep.</span>
              {ts.length > 1 && <button className="ml-auto text-faint hover:text-critical" title="Tirar a temporada" onClick={() => setTs((l) => l.filter((_, j) => j !== i))}><X size={13} /></button>}
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-3">
          <button className="btn text-xs" onClick={() => setTs((l) => [...l, l[l.length - 1] ?? 10])}><Plus size={13} /> Temporada</button>
          <label className="flex items-center gap-2 text-sm" title="Cada episódio marcado soma esse tempo no seu estudo de inglês (Dashboard e Idiomas)">
            <span className="text-xs text-muted">cada episódio</span>
            <input type="number" min={1} max={300} className="input py-0.5 px-2 w-16 text-right tabular-nums" value={minEp}
              onChange={(e) => setMinEp(Math.max(1, Math.min(300, Number(e.target.value) || 25)))} />
            <span className="text-xs text-muted">min</span>
          </label>
        </div>
        <div className="rounded-lg border border-line p-3 text-sm space-y-2">
          <div className="text-xs text-muted">Onde você parou (o último episódio que viu) — mudar aqui não soma tempo; o tempo entra pelo “+ episódio”</div>
          <div className="flex items-center gap-2">
            <select className="input w-auto" value={tempOk} onChange={(e) => { setTemp(Number(e.target.value)); setEp(0); }}>
              {ts.map((_, i) => <option key={i} value={i + 1}>Temporada {i + 1}</option>)}
            </select>
            <select className="input w-auto" value={epOk} onChange={(e) => setEp(Number(e.target.value))}>
              <option value={0}>{tempOk === 1 ? "não comecei" : "nenhum desta"}</option>
              {Array.from({ length: ts[tempOk - 1] ?? 0 }, (_, i) => <option key={i} value={i + 1}>Episódio {i + 1}</option>)}
            </select>
          </div>
          <div className="text-xs text-muted tabular-nums">{vistos} de {total} episódios ({total ? Math.round((vistos / total) * 100) : 0}%)</div>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSalvar(ts, vistos, minEp)}>Salvar</button>
        </div>
      </div>
    </div>
  );
}
