"use client";
/**
 * Temporadas: o ano de 12 semanas no ritmo das estações. Uma tela só: a temporada, o plano por área
 * (com o seu ritmo real ao lado), as metas com a previsão e a execução de cada semana.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Page } from "@/components/page";
import { supabase } from "@/lib/supabase/client";
import { todas } from "@/lib/supabase/todas";
import { addDays, dayKey, fmtDuration, nf, parseDay } from "@/lib/dates";
import { ppmDosLivros } from "@/lib/books";
import { faltam, ppmMedio, porOrdem, subarvore, arvoreDePastas, type PastaEstudo } from "@/lib/estudos";
import { progressoDoLivro } from "@/lib/types";
import { contaAnki } from "@/lib/anki";
import {
  AREAS, ESTACOES, NOME_UNIDADE, UNIDADES, carregarTemporadas, diasEntre, enfase, estacaoDe, execucaoDaSemana, feitoEm, limites, nomeDaTemporada,
  rendimento, ritmoPorArea, salvarTemporada, semanasDa, tempoPorArea, unidadeDe, vizinha,
  type Area, type Estacao, type Meta, type Registros, type Temporada, type Unidade,
} from "@/lib/temporadas";
import { NovaMeta, type Livro, type AulaT, type BaralhoT } from "./nova-meta";

const fmtData = (k: string) => parseDay(k).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
/** Arredonda um plano para um número redondo na unidade. */
const redondo = (v: number, u: Unidade) =>
  u === "min" ? Math.round(v / 5) * 5 : u === "cartoes" ? Math.round(v / 5) * 5 : v >= 2000 ? Math.round(v / 500) * 500 : Math.round(v / 100) * 100;
/** "11.200 palavras", "60 cartões", "1 h 20" */
const fmtQ = (v: number, u: Unidade, curto = false) =>
  u === "min" ? (curto ? `${Math.round(v)} min` : fmtDuration(v * 60)) : `${nf.format(Math.round(v))} ${u === "palavras" ? (curto ? "pal." : "palavras") : "cartões"}`;
interface AnkiDia { day: string; baralho: string; reviews: number; criados: number }
const corExecucao = (v: number) => (v >= 0.85 ? "var(--good)" : v >= 0.6 ? "#c98a1a" : "var(--critical)");

export default function Temporadas() {
  const atual = estacaoDe();
  const [sel, setSel] = useState<{ estacao: Estacao; ano: number }>({ estacao: atual.estacao, ano: atual.ano });
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [reg, setReg] = useState<Registros>({ seg: new Map(), qtd: new Map(), segQ: new Map() });
  const [baralhos, setBaralhos] = useState<BaralhoT[]>([]);
  const [ankiDias, setAnkiDias] = useState<AnkiDia[]>([]);
  const [livros, setLivros] = useState<Livro[]>([]);
  const [aulas, setAulas] = useState<AulaT[]>([]);
  const [pastas, setPastas] = useState<PastaEstudo[]>([]);
  const [ppm, setPpm] = useState({ livros: 220, estudos: 220 });
  const [novaMeta, setNovaMeta] = useState(false);
  const [editando, setEditando] = useState<Meta | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    const sb = supabase();
    const desde = dayKey(addDays(new Date(), -400));
    const [t, m, b, a, p, ak, conta, pl, pe] = await Promise.all([
      carregarTemporadas(),
      tempoPorArea(desde),
      todas<Livro>((de, ate) => sb.from("books").select("id,title,author,word_count,progress,status,format").order("title").order("id").range(de, ate)),
      todas<AulaT>((de, ate) => sb.from("notes").select("id,title,pasta_id,palavras,progresso,situacao,ordem").eq("kind", "estudo").order("id").range(de, ate)),
      sb.from("estudo_pastas").select("id,parent_id,nome,posicao"),
      todas<AnkiDia>((de, ate) => sb.from("anki_baralho_dia").select("day,baralho,reviews,criados").gte("day", desde).order("day").order("baralho").range(de, ate)).catch(() => []),
      contaAnki().catch(() => null),
      ppmDosLivros(),
      ppmMedio(),
    ]);
    setTemporadas(t.temporadas);
    setMetas(t.metas);
    setReg(m);
    setLivros(b);
    setAulas(a.sort(porOrdem));
    setPastas((p.data as PastaEstudo[]) ?? []);
    setAnkiDias(ak);
    setBaralhos((conta?.baralhos ?? []).filter((x) => !x.nome.includes("::")).map((x) => ({ nome: x.nome, total: x.total })));
    setPpm({ livros: pl || 220, estudos: pe.ppm || 220 });
    setCarregando(false);
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const lim = limites(sel.estacao, sel.ano);
  const registro = temporadas.find((t) => t.estacao === sel.estacao && t.ano === sel.ano);
  const ehAtual = sel.estacao === atual.estacao && sel.ano === atual.ano;
  const hoje = dayKey();
  const futura = lim.inicio > hoje;
  const passada = lim.fim < hoje;
  // ainda não planejada: mostra como seria, com o seu ritmo atual (a partir desta semana, se for a atual)
  const t: Temporada = registro ?? {
    ano: sel.ano, estacao: sel.estacao, inicio: lim.inicio, fim: lim.fim,
    comeca_em: ehAtual ? dayKey(addDays(new Date(), -((new Date().getDay() + 6) % 7))) : lim.inicio, plano: {},
  };
  const u = (a: Area) => unidadeDe(t, a);
  const unidadesCompletas = Object.fromEntries(AREAS.map((a) => [a.id, u(a.id)])) as Record<Area, Unidade>;
  const ritmo = useMemo(() => ritmoPorArea(reg, (a) => unidadesCompletas[a]), [reg, JSON.stringify(unidadesCompletas)]); // eslint-disable-line react-hooks/exhaustive-deps
  const ritmoMin = useMemo(() => ritmoPorArea(reg), [reg]);
  const rend = useMemo(() => rendimento(reg), [reg]);
  const plano = (a: Area) => t.plano[a] ?? redondo(ritmo[a], u(a));
  const planoCompleto = Object.fromEntries(AREAS.map((a) => [a.id, plano(a.id)])) as Record<Area, number>;
  /** o plano em minutos por dia (para a ênfase e para metas de horas) */
  const planoMin = (a: Area) => (u(a) === "min" ? plano(a) : plano(a) / (rend[a] || 1));
  /** o plano em palavras (ou cartões) por dia; em minutos, convertido pelo seu ritmo de leitura */
  const planoQtd = (a: Area) => (u(a) !== "min" ? plano(a) : plano(a) * (a === "leitura" ? ppm.livros : a === "estudos" ? ppm.estudos : rend[a]));
  const { execucao, revisao } = semanasDa(t);
  const fimExecucao = execucao[execucao.length - 1]?.ate ?? t.fim;
  const desdeHoje = hoje > t.comeca_em ? hoje : t.comeca_em;
  const diasRestantes = passada ? 0 : diasEntre(desdeHoje > hoje ? desdeHoje : hoje, fimExecucao);
  const semanaAtual = execucao.findIndex((w) => hoje >= w.de && hoje <= w.ate);
  const notas = execucao.map((w) => (w.de > hoje ? null : execucaoDaSemana(reg, t, planoCompleto, w.de, w.ate > hoje ? hoje : w.ate, rend)));
  const feitas = notas.filter((n): n is number => n !== null);
  const mediaExec = feitas.length ? feitas.reduce((a, b) => a + b, 0) / feitas.length : null;

  async function mudar(campos: Partial<Temporada>) {
    const novo = await salvarTemporada({
      ...t, ...campos, plano: { ...planoCompleto, ...(campos.plano ?? {}) }, unidades: { ...unidadesCompletas, ...(campos.unidades ?? {}) },
    });
    setTemporadas((l) => [...l.filter((x) => x.id !== novo.id), novo]);
  }

  // ---- previsão de cada meta ----
  const ateHoje = hoje < t.fim ? hoje : t.fim;
  const feitoNaTemporada = (a: Area, un: Unidade = u(a)) => feitoEm(reg, a, un, t.comeca_em, ateHoje);
  /** "precisa de 9.500 palavras/dia" (ou em minutos, se o plano da área for em minutos) */
  const precisaPorDia = (a: Area, qtdPorDia: number) => {
    const nome = AREAS.find((x) => x.id === a)!.nome.toLowerCase();
    if (u(a) !== "min") return `precisa ${fmtQ(qtdPorDia, u(a), true)}/dia`;
    const ppmA = a === "leitura" ? ppm.livros : a === "estudos" ? ppm.estudos : rend[a] || 1;
    return `precisa ${Math.ceil(qtdPorDia / ppmA)} min/dia de ${nome}`;
  };
  type Linha = { texto: string; ok: boolean; quando?: string };
  type Previsao = { linhas: Linha[]; resumo: string; ok: boolean; pct: number; mais?: number; falta?: number; precisa?: string };
  /** itens lidos em sequência (livros ou aulas): quando termina cada um, no plano de palavras por dia */
  function emSequencia(a: Area, itens: { titulo: string; total: number; falta: number; feito: boolean }[], oQue: string): Previsao {
    const porDia = planoQtd(a);
    let acum = 0;
    const linhas = itens.map((i) => {
      acum += i.falta;
      const fim = i.feito ? null : porDia > 0 ? dayKey(addDays(parseDay(desdeHoje), Math.ceil(acum / porDia) - 1)) : null;
      return { texto: i.titulo, ok: i.feito || (!!fim && fim <= fimExecucao), quando: i.feito ? "✓" : fim ? `termina ${fmtData(fim)}` : "sem plano" };
    });
    const ok = linhas.every((l) => l.ok);
    const total = itens.reduce((n, i) => n + i.total, 0);
    const pct = total ? 1 - acum / total : 0;
    const precisa = precisaPorDia(a, diasRestantes ? acum / diasRestantes : acum);
    const resumo = acum === 0 ? "concluída ✓"
      : ok ? `cabe no plano: faltam ${nf.format(Math.round(acum))} palavras`
      : `no plano, ${linhas.filter((l) => l.ok).length} de ${linhas.length} ${oQue}; para todos: ${precisa}`;
    return { linhas, ok, pct, resumo, falta: acum, precisa };
  }
  function previsao(m: Meta): Previsao {
    if (m.tipo === "livros") {
      const sel = m.refs.map((id) => livros.find((b) => b.id === id)).filter((b): b is Livro => !!b);
      return emSequencia("leitura", sel.map((b) => {
        const total = b.word_count ?? 0, lido = b.status === "lido";
        return { titulo: b.title, total, falta: lido ? 0 : total * (1 - progressoDoLivro(b)), feito: lido };
      }), "livros");
    }
    if (m.tipo === "aulas" || m.tipo === "curso") {
      const sel = m.tipo === "aulas"
        ? m.refs.map((id) => aulas.find((x) => x.id === id)).filter((x): x is AulaT => !!x)
        : aulas.filter((x) => x.pasta_id && subarvore(m.refs[0] ?? "", arvoreDePastas(pastas).filhos).has(x.pasta_id));
      const p = emSequencia("estudos", sel.map((x) => ({ titulo: x.title, total: x.palavras || 0, falta: faltam(x), feito: x.situacao === "concluida" })), "aulas");
      // muitas aulas: mostra as próximas pendentes e quantas faltam depois
      const pend = p.linhas.filter((l) => l.quando !== "✓");
      const feitas = p.linhas.length - pend.length;
      return { ...p, linhas: pend.slice(0, 3), mais: Math.max(0, pend.length - 3),
        resumo: !p.falta ? `${p.linhas.length} de ${p.linhas.length} aulas feitas ✓`
          : `${feitas} de ${p.linhas.length} feitas · faltam ${nf.format(Math.round(p.falta))} palavras · ${p.ok ? "cabe no plano" : p.precisa}` };
    }
    if (m.tipo === "anki") {
      const decks = new Set(m.refs);
      const dias = ankiDias.filter((d) => decks.has(d.baralho));
      const medida = m.medida ?? "total";
      const campo = medida === "revisoes" ? "reviews" : "criados";
      const soma = (de: string, ate: string) => dias.filter((d) => d.day >= de && d.day <= ate).reduce((n, d) => n + d[campo], 0);
      // ritmo: últimos 28 dias, contando do primeiro registro
      const ini28 = dayKey(addDays(new Date(), -27));
      const primeiro = dias.map((d) => d.day).sort()[0] ?? hoje;
      const de = primeiro > ini28 ? primeiro : ini28;
      const ritmoDia = soma(de, hoje) / Math.max(1, diasEntre(de, hoje));
      const naTemporada = soma(t.comeca_em, ateHoje);
      const atual = medida === "total" ? baralhos.filter((b) => decks.has(b.nome)).reduce((n, b) => n + b.total, 0) : naTemporada;
      const previsto = atual + ritmoDia * diasRestantes;
      const ok = previsto >= m.alvo;
      const falta = Math.max(0, m.alvo - atual);
      const nomeM = medida === "revisoes" ? "revisões" : medida === "criados" ? "cartões novos" : "cartões no baralho";
      return { linhas: [], ok, pct: m.alvo ? Math.min(1, atual / m.alvo) : 0,
        resumo: `${nf.format(atual)} de ${nf.format(m.alvo)} ${nomeM} · no seu ritmo (${nf.format(Math.round(ritmoDia))}/dia) chega a ${nf.format(Math.round(previsto))}${ok || !diasRestantes ? "" : ` · precisa ${nf.format(Math.ceil(falta / diasRestantes))}/dia`}` };
    }
    if (m.tipo === "palavras") {
      const feito = feitoNaTemporada("escrita", "palavras");
      const previsto = feito + planoQtd("escrita") * diasRestantes;
      const ok = previsto >= m.alvo;
      const falta = Math.max(0, m.alvo - feito);
      return { linhas: [], ok, pct: m.alvo ? Math.min(1, feito / m.alvo) : 0,
        resumo: `${nf.format(feito)} de ${nf.format(m.alvo)} · no plano chega a ${nf.format(Math.round(previsto))}${ok || !diasRestantes ? "" : ` · ${precisaPorDia("escrita", falta / diasRestantes)}`}` };
    }
    // horas numa área
    const feito = feitoNaTemporada(m.area, "min") / 60;
    const previsto = feito + (planoMin(m.area) * diasRestantes) / 60;
    const ok = previsto >= m.alvo;
    const precisa = diasRestantes ? Math.ceil(((m.alvo - feito) * 60) / diasRestantes) : 0;
    return { linhas: [], ok, pct: m.alvo ? Math.min(1, feito / m.alvo) : 0,
      resumo: `${fmtDuration(feito * 3600)} de ${m.alvo} h · no plano chega a ${fmtDuration(previsto * 3600)}${ok ? "" : ` · precisa ${Math.max(0, precisa)} min/dia`}` };
  }
  const minhasMetas = metas.filter((m) => registro && m.temporada_id === registro.id);

  return (
    <Page denso title="Temporadas" subtitle="O ano em 12 semanas, no ritmo das estações: planeje cada temporada com o seu ritmo real.">
      {/* estações: anterior · esta · seguinte */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button className="btn btn-ghost px-2" title="Temporada anterior" onClick={() => setSel(vizinha(sel.estacao, sel.ano, -1))}><ChevronLeft size={16} /></button>
        <div className="card px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 flex-1 min-w-0">
          <span className="text-lg font-medium">{ESTACOES[sel.estacao].emoji} {nomeDaTemporada(sel.estacao, sel.ano)}</span>
          <span className="text-sm text-muted">{fmtData(t.inicio)} a {fmtData(t.fim)}</span>
          {ehAtual && <span className="text-xs rounded-full px-2 py-0.5 bg-accent-soft text-ink">agora</span>}
          {!passada && execucao.length > 0 && (
            <span className="text-sm text-muted">
              {semanaAtual >= 0 ? <>semana <b className="text-ink">{semanaAtual + 1}</b> de {execucao.length}</> : futura ? `${execucao.length} semanas de execução` : "semana de revisão"}
              {diasRestantes > 0 && ` · faltam ${diasRestantes} dias`}
              {revisao.length > 0 && ` · revisão a partir de ${fmtData(revisao[0].de)}`}
            </span>
          )}
          <label className="ml-auto text-xs text-muted flex items-center gap-1.5">começou em
            <input type="date" className="input w-auto py-0.5 text-xs" value={t.comeca_em} min={t.inicio} max={t.fim}
              onChange={(e) => e.target.value && void mudar({ comeca_em: e.target.value })} />
          </label>
        </div>
        <button className="btn btn-ghost px-2" title="Próxima temporada" onClick={() => setSel(vizinha(sel.estacao, sel.ano, 1))}><ChevronRight size={16} /></button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-3 md:gap-4">
        {/* plano por área, com o ritmo real ao lado */}
        <section className="card p-4 min-w-0">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="font-medium">Plano da temporada</h2>
            <span className="text-xs text-muted">por dia · seu ritmo: últimos 28 dias</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-normal">Área</th>
                <th className="py-1 font-normal text-right">Seu ritmo</th>
                <th className="py-1 font-normal text-right">Plano</th>
                <th className="py-1 font-normal text-center">Ênfase</th>
                <th className="py-1 font-normal text-right">Feito</th>
                <th className="py-1 font-normal text-right">Até o fim</th>
              </tr>
            </thead>
            <tbody>
              {AREAS.map((a) => {
                const p = plano(a.id);
                const un = u(a.id);
                const e = enfase(planoMin(a.id));
                const feito = feitoNaTemporada(a.id);
                const outra = un === "min" ? null : `≈ ${Math.round(ritmoMin[a.id])} min/dia`;
                return (
                  <tr key={a.id} className="border-t border-line">
                    <td className="py-1.5"><span className="inline-block w-2 h-2 rounded-full mr-2 align-middle" style={{ background: a.cor }} />{a.nome}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted" title={outra ?? undefined}>{fmtQ(ritmo[a.id], un, true)}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      <input type="number" min={0} step={un === "palavras" ? 500 : 5} aria-label={`Plano de ${a.nome} (${NOME_UNIDADE[un]}/dia)`}
                        className="input w-[5.5rem] py-0.5 text-right tabular-nums text-sm" value={p}
                        onChange={(ev) => void mudar({ plano: { ...t.plano, [a.id]: Math.max(0, Number(ev.target.value) || 0) } })} />
                      {UNIDADES[a.id].length > 1 ? (
                        <select aria-label={`Unidade de ${a.nome}`} className="ml-1 w-[4.4rem] bg-transparent text-xs text-muted hover:text-ink outline-none cursor-pointer" value={un}
                          title="Mudar a unidade (o plano é convertido pelo seu ritmo)"
                          onChange={(ev) => {
                            const nova = ev.target.value as Unidade;
                            const emMin = un === "min" ? p : p / (rend[a.id] || 1);
                            const v = nova === "min" ? emMin : emMin * (rend[a.id] || 1);
                            const valor = nova === "min" ? Math.round(v) : nova === "cartoes" ? Math.round(v) : Math.round(v / 100) * 100;
                            void mudar({ plano: { ...t.plano, [a.id]: valor }, unidades: { ...unidadesCompletas, [a.id]: nova } });
                          }}>
                          {UNIDADES[a.id].map((x) => <option key={x} value={x}>{x === "palavras" ? "pal." : NOME_UNIDADE[x]}</option>)}
                        </select>
                      ) : <span className="ml-1 text-xs text-muted inline-block w-[4.4rem] text-left pl-1">min</span>}
                    </td>
                    <td className="py-1.5 text-center">
                      <span className="text-[11px] rounded-full px-2 py-0.5" style={{ background: e.nivel ? `color-mix(in srgb, ${a.cor} ${e.nivel * 14}%, transparent)` : "var(--surface-2)", color: e.nivel ? undefined : "var(--muted)" }}>{e.nome}</span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{feito >= (un === "min" ? 1 : 1) ? fmtQ(feito, un, true) : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted">{passada ? "—" : `+${fmtQ(p * diasRestantes, un, true)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-faint mt-2">
            {registro ? "O plano é salvo ao mudar." : "Ainda não planejada: os números são o seu ritmo atual. Mude qualquer valor para guardar o plano."}
            {" "}Leitura, Estudos e Escrita em palavras, Idiomas em cartões do Anki (dá para trocar para minutos). Ênfase pelo tempo que o plano pede: leve (&lt; 20 min), média, forte (1 h ou mais).
          </p>
        </section>

        {/* metas com previsão */}
        <section className="card p-4 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium">Metas <span className="text-xs text-muted font-normal">· 1 a 3 por temporada</span></h2>
            {minhasMetas.length < 3 && !passada && (
              <button className="btn text-xs py-1" onClick={async () => { if (!registro) await mudar({}); setNovaMeta(true); }}><Plus size={13} /> Meta</button>
            )}
          </div>
          {minhasMetas.length === 0 ? (
            <p className="text-sm text-muted">
              {carregando ? "…" : "Escolha o que esta temporada precisa entregar: livros para ler, aulas para fazer, um baralho do Anki, palavras para escrever ou horas numa área. O sistema projeta com o seu plano e diz se cabe."}
            </p>
          ) : (
            <ul className="space-y-3">
              {minhasMetas.map((m) => {
                const p = previsao(m);
                const area = AREAS.find((a) => a.id === m.area)!;
                return (
                  <li key={m.id} className="rounded-lg border border-line p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate"><span className="inline-block w-2 h-2 rounded-full mr-2 align-middle" style={{ background: area.cor }} />{m.titulo}</div>
                        <div className="text-xs mt-0.5" style={{ color: p.ok ? "var(--good)" : "#c98a1a" }}>{p.ok ? "✓ " : "⚠ "}{p.resumo}</div>
                      </div>
                      <button className="text-faint hover:text-ink shrink-0" title="Editar a meta" onClick={() => setEditando(m)}><Pencil size={14} /></button>
                      <button className="text-faint hover:text-critical shrink-0" title="Apagar a meta" onClick={async () => {
                        if (!confirm(`Apagar a meta “${m.titulo}”?`)) return;
                        await supabase().from("temporada_metas").delete().eq("id", m.id!);
                        setMetas((l) => l.filter((x) => x.id !== m.id));
                      }}><Trash2 size={14} /></button>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-2 mt-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${p.pct * 100}%`, background: area.cor }} /></div>
                    {p.linhas.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-xs">
                        {p.linhas.map((l, i) => (
                          <li key={i} className="flex justify-between gap-2">
                            <span className="truncate">{l.texto}</span>
                            <span className="shrink-0 tabular-nums" style={{ color: l.ok ? "var(--muted)" : "#c98a1a" }}>{l.quando}</span>
                          </li>
                        ))}
                        {!!p.mais && <li className="text-faint">e mais {p.mais} {p.mais === 1 ? "aula" : "aulas"}</li>}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* execução semanal (o placar do método das 12 semanas) */}
      <section className="card p-4 mt-3 md:mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 mb-3">
          <h2 className="font-medium">Execução semanal</h2>
          <span className="text-xs text-muted">
            quanto do plano foi feito em cada semana · 85% ou mais é uma semana bem executada
            {mediaExec !== null && <> · média <b style={{ color: corExecucao(mediaExec) }}>{Math.round(mediaExec * 100)}%</b></>}
          </span>
        </div>
        <div className="flex items-end gap-1.5 h-24">
          {execucao.map((w, i) => {
            const n = notas[i];
            return (
              <div key={w.de} className="flex-1 min-w-0 flex flex-col items-center gap-1" title={`Semana ${i + 1} (${fmtData(w.de)} a ${fmtData(w.ate)})${n !== null ? `: ${Math.round(n * 100)}%` : ""}`}>
                <span className="text-[10px] tabular-nums text-muted">{n !== null ? `${Math.round(n * 100)}%` : ""}</span>
                <div className="w-full rounded-t-md bg-surface-2 relative overflow-hidden" style={{ height: 56 }}>
                  {n !== null && <div className="absolute bottom-0 left-0 right-0 rounded-t-md" style={{ height: `${Math.max(4, n * 100)}%`, background: corExecucao(n), opacity: i === semanaAtual ? 0.75 : 1 }} />}
                </div>
                <span className={`text-[10px] tabular-nums ${i === semanaAtual ? "text-ink font-medium" : "text-faint"}`}>S{i + 1}</span>
              </div>
            );
          })}
          {revisao.length > 0 && (
            <div className="flex-1 min-w-0 flex flex-col items-center gap-1" title="Semana de revisão e descanso">
              <span className="text-[10px] text-muted"> </span>
              <div className="w-full rounded-t-md grid place-items-center text-[10px] text-muted" style={{ height: 56, background: "repeating-linear-gradient(135deg, var(--surface-2) 0 6px, transparent 6px 12px)" }}>rev.</div>
              <span className="text-[10px] text-faint">rev.</span>
            </div>
          )}
        </div>
      </section>

      {editando && registro && (
        <NovaMeta temporadaId={registro.id!} livros={livros} pastas={pastas} aulas={aulas} baralhos={baralhos} posicao={editando.posicao ?? 0} editar={editando}
          onClose={() => setEditando(null)} onSalva={(m) => { setMetas((l) => l.map((x) => (x.id === m.id ? m : x))); setEditando(null); }} />
      )}
      {novaMeta && registro && (
        <NovaMeta temporadaId={registro.id!} livros={livros} pastas={pastas} aulas={aulas} baralhos={baralhos} posicao={minhasMetas.length}
          onClose={() => setNovaMeta(false)} onSalva={(m) => { setMetas((l) => [...l, m]); setNovaMeta(false); }} />
      )}
    </Page>
  );
}
