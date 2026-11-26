"use client";
/**
 * Temporadas: o ano de 12 semanas no ritmo das estações. Uma tela só, de cima para baixo: onde estou (a estação,
 * as semanas e a execução), as metas cabem? (os mesmos cartões do Dashboard) e o plano por área, para ajustar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { CardHead, Empty, Page } from "@/components/page";
import { CartaoMeta, gradeDeMetas } from "@/components/cartao-meta";
import { RowMenu } from "@/components/row-menu";
import { EstacaoIcone } from "@/components/estacao-icone";
import { supabase } from "@/lib/supabase/client";
import { addDays, dayKey, fmtDuration, nf, nfc, parseDay, weekStart } from "@/lib/dates";
import type { PastaEstudo } from "@/lib/estudos";
import { loadLanguages } from "@/lib/languages";
import {
  AREAS, NOME_UNIDADE, UNIDADES, carregarTemporadas, detalheDaSemana, diasEntre, estacaoDe, execucaoDaSemana, feitoEm, limites, nomeDaTemporada,
  rendimento, ritmoPorArea, salvarTemporada, semanasDa, tempoPorArea, unidadeDe, vizinha,
  type Area, type Estacao, type Meta, type Registros, type Temporada, type Unidade,
} from "@/lib/temporadas";
import { NovaMeta } from "./nova-meta";
import { COR_ESTADO, calculoDasMetas, carregarDadosDasMetas, fmtData, redondo, type AnkiDia, type AulaT, type BaralhoT, type Livro } from "@/lib/metas";
import { corDaNota } from "@/lib/cores";
import { DetalheDaMeta } from "./detalhe-meta";
import { VisaoAno } from "./visao-ano";

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
  const [semanaSel, setSemanaSel] = useState<number | null>(null);
  /** metas com a lista de livros/aulas aberta */
  /** a meta aberta no detalhamento */
  const [metaAberta, setMetaAberta] = useState<string | null>(null);
  /** a meta foi editada a partir do detalhamento: ao salvar (ou cancelar), volta para ele */
  const [voltarAoDetalhe, setVoltarAoDetalhe] = useState<string | null>(null);
  /** tira um livro ou uma aula da meta (o nome automático acompanha: "Fazer 15 aulas" → "Fazer 14 aulas") */
  async function tirarDaMeta(m: Meta, id: string) {
    const item = m.tipo === "livros" ? livros.find((b) => b.id === id)?.title : aulas.find((a) => a.id === id)?.title;
    if (!confirm(`Tirar “${item ?? "este item"}” da meta “${m.titulo}”?`)) return;
    const refs = m.refs.filter((x) => x !== id);
    const n = refs.length;
    const auto = m.tipo === "livros" ? /^Ler \d+ livros?$/ : /^Fazer \d+ aulas?$/;
    const titulo = auto.test(m.titulo) ? (m.tipo === "livros" ? `Ler ${n} ${n === 1 ? "livro" : "livros"}` : `Fazer ${n} ${n === 1 ? "aula" : "aulas"}`) : m.titulo;
    const { data, error } = await supabase().from("temporada_metas").update({ refs, titulo }).eq("id", m.id!).select().single();
    if (error) return alert(`Não consegui salvar: ${error.message}`);
    setMetas((l) => l.map((x) => (x.id === m.id ? (data as Meta) : x)));
  }
  const [idiomas, setIdiomas] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  /** a temporada (plano, metas, semanas) ou o ano (as 4 estações lado a lado) */
  const [visao, setVisaoEstado] = useState<"temporada" | "ano">("temporada");
  useEffect(() => { try { if (localStorage.getItem("temporadas-visao") === "ano") setVisaoEstado("ano"); } catch {} }, []);
  const setVisao = (v: "temporada" | "ano") => { setVisaoEstado(v); try { localStorage.setItem("temporadas-visao", v); } catch {} };

  const carregar = useCallback(async () => {
    const desde = dayKey(addDays(new Date(), -400));
    const [t, m, d] = await Promise.all([carregarTemporadas(), tempoPorArea(desde), carregarDadosDasMetas(desde)]);
    setTemporadas(t.temporadas);
    setMetas(t.metas);
    setReg(m);
    setLivros(d.livros);
    setAulas(d.aulas);
    setPastas(d.pastas);
    setAnkiDias(d.ankiDias);
    setBaralhos(d.baralhos);
    setPpm(d.ppm);
    setCarregando(false);
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  // vindo do Dashboard (/season#meta-…): abre o detalhamento daquela meta
  useEffect(() => {
    if (carregando || typeof location === "undefined" || !location.hash.startsWith("#meta-")) return;
    setVisao("temporada");
    setMetaAberta(location.hash.slice(6));
    history.replaceState(history.state, "", location.pathname); // tira o #meta- do endereço (mantendo o estado do Next)
  }, [carregando]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadLanguages().then((l) => setIdiomas(l.map((x) => x.name))).catch(() => {}); }, []);

  const lim = limites(sel.estacao, sel.ano);
  const registro = temporadas.find((t) => t.estacao === sel.estacao && t.ano === sel.ano);
  const ehAtual = sel.estacao === atual.estacao && sel.ano === atual.ano;
  const hoje = dayKey();
  const futura = lim.inicio > hoje;
  const passada = lim.fim < hoje;
  // ainda não planejada: mostra como seria, com o seu ritmo atual (a partir desta semana, se for a atual)
  const t: Temporada = registro ?? {
    ano: sel.ano, estacao: sel.estacao, inicio: lim.inicio, fim: lim.fim,
    comeca_em: ehAtual ? dayKey(weekStart(new Date())) : lim.inicio, plano: {},
  };
  const u = (a: Area) => unidadeDe(t, a);
  const unidadesCompletas = Object.fromEntries(AREAS.map((a) => [a.id, u(a.id)])) as Record<Area, Unidade>;
  const ritmo = useMemo(() => ritmoPorArea(reg, (a) => unidadesCompletas[a]), [reg, JSON.stringify(unidadesCompletas)]); // eslint-disable-line react-hooks/exhaustive-deps
  const ritmoMin = useMemo(() => ritmoPorArea(reg), [reg]);
  const rend = useMemo(() => rendimento(reg), [reg]);
  const plano = (a: Area) => t.plano[a] ?? redondo(ritmo[a], u(a));
  const planoCompleto = Object.fromEntries(AREAS.map((a) => [a.id, plano(a.id)])) as Record<Area, number>;
  const { execucao, revisao } = semanasDa(t);
  const fimExecucao = execucao[execucao.length - 1]?.ate ?? t.fim;
  const desdeHoje = hoje > t.comeca_em ? hoje : t.comeca_em;
  const diasRestantes = passada ? 0 : diasEntre(desdeHoje > hoje ? desdeHoje : hoje, fimExecucao);
  const semanaAtual = execucao.findIndex((w) => hoje >= w.de && hoje <= w.ate);
  const notas = execucao.map((w) => (w.de > hoje ? null : execucaoDaSemana(reg, t, planoCompleto, w.de, w.ate > hoje ? hoje : w.ate, rend)));
  const feitas = notas.filter((n): n is number => n !== null);
  const mediaExec = feitas.length ? feitas.reduce((a, b) => a + b, 0) / feitas.length : null;
  // a semana aberta no detalhe (a atual, se nada for escolhido)
  const iSel = semanaSel !== null && semanaSel < execucao.length && notas[semanaSel] !== null ? semanaSel : semanaAtual >= 0 ? semanaAtual : notas.findLastIndex((n) => n !== null);
  const wSel = iSel >= 0 ? execucao[iSel] : null;
  const detalhe = wSel ? detalheDaSemana(reg, t, planoCompleto, wSel.de, wSel.ate > hoje ? hoje : wSel.ate, rend) : null;

  async function mudar(campos: Partial<Temporada>) {
    const novo = await salvarTemporada({
      ...t, ...campos, plano: { ...planoCompleto, ...(campos.plano ?? {}) }, unidades: { ...unidadesCompletas, ...(campos.unidades ?? {}) },
    });
    setTemporadas((l) => [...l.filter((x) => x.id !== novo.id), novo]);
  }

  // ---- previsão de cada meta (a mesma conta do Dashboard: lib/metas) ----
  const calc = calculoDasMetas(t, reg, planoCompleto, { livros, aulas, pastas, ankiDias, baralhos, ppm });
  const { previsao, contagem, converte, feitoNaTemporada, ateHoje } = calc;
  const COR = COR_ESTADO;
  async function marcarContagem(m: Meta, delta: 1 | -1) {
    let refs = [...m.refs];
    if (delta > 0) refs.push(hoje);
    else { const i = refs.lastIndexOf(hoje); if (i >= 0) refs.splice(i, 1); else refs = refs.slice(0, -1); }
    setMetas((l) => l.map((x) => (x.id === m.id ? { ...x, refs } : x)));
    await supabase().from("temporada_metas").update({ refs }).eq("id", m.id!);
  }

  /** meta de contagem: um quadrado por dia, do começo ao prazo (quantos foram feitos em cada dia), com +1 e −1 */
  function reguaDaContagem(m: Meta) {
    const c = contagem(m);
    const meta = Math.ceil(c.porDia);
    const dias: string[] = [];
    for (let d = parseDay(c.ini); dayKey(d) <= c.prazo && dias.length < 60; d = addDays(d, 1)) dias.push(dayKey(d));
    const noDia = (k: string) => m.refs.filter((x) => x === k).length;
    const un = m.unidade || "itens";
    return (
      <div className="mt-2.5 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2">
        <div className="basis-full sm:basis-0 flex-1 min-w-0 flex gap-[3px]">
          {dias.map((k) => {
            const n = noDia(k);
            const futuro = k > hoje;
            const cor = n >= meta ? "var(--good)" : n > 0 ? "var(--warn)" : futuro || k === hoje ? "var(--surface-2)" : "color-mix(in srgb, var(--critical) 35%, var(--surface-2))";
            return (
              <span key={k} className={`flex-1 h-5 rounded-[4px] grid place-items-center text-[10px] tabular-nums ${k === hoje ? "ring-1 ring-[var(--muted)]" : ""}`}
                style={{ background: cor, color: n >= meta ? "#fff" : "var(--muted)" }}
                title={`${fmtData(k)}: ${n} ${un}${futuro ? "" : ` (meta do dia: ${meta})`}`}>{n || ""}</span>
            );
          })}
        </div>
        {c.falta > 0 && hoje <= c.prazo && (
          <span className="ml-auto flex items-center gap-1.5 sm:gap-1 shrink-0">
            <button className="btn btn-ghost px-3 py-1.5 sm:px-1.5 sm:py-0.5 text-sm sm:text-xs" title="Desfazer a última" disabled={!m.refs.length} onClick={() => void marcarContagem(m, -1)}>−1</button>
            <button className="btn px-3.5 py-1.5 sm:px-2 sm:py-0.5 text-sm sm:text-xs" title={`Marcar 1 ${un.replace(/s$/, "")} feita hoje`} onClick={() => void marcarContagem(m, 1)}><Plus size={13} /> 1<span className="sm:hidden">&nbsp;{un.replace(/s$/, "")}</span></button>
          </span>
        )}
      </div>
    );
  }

  const minhasMetas = metas.filter((m) => registro && m.temporada_id === registro.id);
  const previsoes = new Map(minhasMetas.map((m) => [m.id!, previsao(m)]));
  // Idiomas leva o nome do idioma quando há um só (Inglês)
  const nomeDaArea = (a: Area) => (a === "idiomas" && idiomas.length === 1 ? idiomas[0] : AREAS.find((x) => x.id === a)!.nome);
  // as metas na ordem das áreas: Leitura, Estudos, Inglês…
  const metasEmOrdem = AREAS.flatMap((a) => minhasMetas.filter((m) => m.area === a.id));
  // até 3 metas da temporada, mais até 2 retas curtas de contagem (ex.: 28 aulas em 14 dias)
  const retas = minhasMetas.filter((m) => m.tipo === "contagem").length;
  const grandes = minhasMetas.length - retas;
  const diasDaTemporada = diasEntre(t.comeca_em, fimExecucao);
  function metaTotal(a: Area): { total: number; daMeta: boolean } {
    const feito = feitoNaTemporada(a);
    const dasMetas = minhasMetas.filter((m) => m.area === a).map((m) => previsoes.get(m.id!)!).filter((p) => p.noTotal);
    if (dasMetas.length) return { total: feito + dasMetas.reduce((n, p) => n + converte(p.falta, p.un, u(a), a), 0), daMeta: true };
    return { total: plano(a) * diasDaTemporada, daMeta: false };
  }
  async function apagarMeta(m: Meta) {
    if (!confirm(`Apagar a meta “${m.titulo}”?`)) return;
    await supabase().from("temporada_metas").delete().eq("id", m.id!);
    setMetas((l) => l.filter((x) => x.id !== m.id));
  }

  /** o resumo do cartão Metas: quantas não cabem, estão em risco ou atrasadas (a contagem fala em atraso, como no selo) */
  const situacoes = (() => {
    let fora = 0, risco = 0, atrasadas = 0, corAtraso = COR.risco;
    for (const m of minhasMetas) {
      const p = previsoes.get(m.id!)!;
      if (m.tipo === "contagem" && p.selo.includes("atrasada")) { atrasadas++; if (p.estado === "fora") corAtraso = COR.fora; }
      else if (p.estado === "fora") fora++;
      else if (p.estado === "risco") risco++;
    }
    return [
      { n: fora, texto: fora > 1 ? "não cabem" : "não cabe", cor: COR.fora },
      { n: risco, texto: "em risco", cor: COR.risco },
      { n: atrasadas, texto: atrasadas > 1 ? "atrasadas" : "atrasada", cor: corAtraso },
    ].filter((x) => x.n > 0);
  })();

  // uma linha do plano por área (a tabela no computador e a lista no celular usam as mesmas contas)
  const linhasDoPlano = AREAS.map((a) => {
    const p = plano(a.id);
    const un = u(a.id);
    const feito = feitoNaTemporada(a.id);
    const hojeFeito = feitoEm(reg, a.id, un, hoje, hoje);
    const pctHoje = p > 0 ? hojeFeito / p : null;
    const mt = metaTotal(a.id);
    const precisa = passada ? 0 : Math.max(0, mt.total - feito) / Math.max(1, diasRestantes);
    const corPrecisa = precisa <= 0 ? "var(--muted)" : precisa <= ritmo[a.id] ? "var(--good)" : precisa <= p ? "var(--warn)" : "var(--critical)";
    const vazio = p === 0 && feito < 1 && !mt.daMeta;
    // por dia: só o número (a unidade está na caixa do plano); totais em minutos viram horas
    const dia = (v: number) => (v >= 0.5 ? nf.format(un === "cartoes" && v < 10 && v % 1 ? Math.round(v * 10) / 10 : Math.round(v)) : "—");
    const tot = (v: number) => (v < 1 ? "—" : un === "min" ? fmtDuration(v * 60) : nf.format(Math.round(v)));
    /** total curto: 433 mil, 36 h */
    const curto = (v: number) => (v < 1 ? "—" : un === "min" ? (v >= 600 ? `${Math.round(v / 60)} h` : fmtDuration(v * 60)) : v >= 10000 ? nfc.format(v) : nf.format(Math.round(v)));
    // a semana escolhida nas barras: o feito × o plano dos dias dela (só as áreas com plano entram na nota)
    const sem = detalhe?.areas.find((x) => x.area === a.id);
    const qSem = (v: number) => (un === "min" ? fmtDuration(v * 60) : nf.format(Math.round(v)));
    const semana = sem && detalhe ? {
      pct: sem.pct,
      texto: `${qSem(sem.feito)} de ${qSem(sem.plano)}`,
      explica: `Feito ${qSem(sem.feito)} de ${qSem(sem.plano)} planejados (${detalhe.dias} ${detalhe.dias === 1 ? "dia" : "dias"} × o plano diário) · pesa ${Math.round((sem.peso / detalhe.areas.reduce((n, y) => n + y.peso, 0)) * 100)}% da nota`,
    } : null;
    return { a, p, un, feito, hojeFeito, pctHoje, mt, precisa, corPrecisa, vazio, dia, tot, curto, semana };
  });
  type LinhaDoPlano = (typeof linhasDoPlano)[number];
  /** a caixa do plano: o número por dia e a unidade (o plano é convertido pelo seu ritmo ao trocar a unidade) */
  const campoPlano = ({ a, p, un }: LinhaDoPlano) => (
    <span className="inline-flex items-center rounded-lg border border-line bg-surface focus-within:border-ink/40">
      <input type="number" min={0} step={un === "palavras" ? 500 : un === "cartoes" ? 1 : 5} aria-label={`Plano de ${a.nome} (${NOME_UNIDADE[un]}/dia)`}
        title={registro ? "O plano é salvo ao mudar" : "Mude o valor para guardar o plano desta season"}
        className="w-[4.4rem] xl:w-[4.6rem] bg-transparent py-1 xl:py-0.5 pl-2 text-right text-sm tabular-nums text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" value={p}
        onChange={(ev) => void mudar({ plano: { ...t.plano, [a.id]: Math.max(0, Number(ev.target.value) || 0) } })} />
      {UNIDADES[a.id].length > 1 ? (
        <select aria-label={`Unidade de ${a.nome}`} className="w-[4.6rem] xl:w-[3.9rem] bg-transparent pl-1.5 pr-1 py-0.5 text-xs text-muted hover:text-ink outline-none cursor-pointer" value={un}
          title={`Mudar a unidade (o plano é convertido pelo seu ritmo)${UNIDADES[a.id].includes("cartoes") ? ". Cartões novos são os criados no Anki" : ""}`}
          onChange={(ev) => {
            const nova = ev.target.value as Unidade;
            const emMin = un === "min" ? p : p / (rend[a.id] || 1);
            const v = nova === "min" ? emMin : emMin * (rend[a.id] || 1);
            const valor = nova === "min" ? Math.round(v) : nova === "cartoes" ? Math.round(v) : Math.round(v / 100) * 100;
            void mudar({ plano: { ...t.plano, [a.id]: valor }, unidades: { ...unidadesCompletas, [a.id]: nova } });
          }}>
          {UNIDADES[a.id].map((x) => <option key={x} value={x}>{x === "palavras" ? "pal." : x === "cartoes" ? "novos" : "min"}</option>)}
        </select>
      ) : <span className="w-[4.6rem] xl:w-[3.9rem] pl-2.5 text-left text-xs text-muted">min</span>}
    </span>
  );
  /** o total da season, curto: ganha "≈" quando não vem de metas (é o plano × os dias) */
  const totalCurto = ({ mt, curto }: LinhaDoPlano) => `${mt.daMeta || mt.total < 1 ? "" : "≈"}${curto(mt.total)}`;
  const explicaSeason = ({ feito, mt, tot }: LinhaDoPlano) =>
    `${tot(feito)} de ${mt.daMeta ? "" : "≈ "}${tot(mt.total)} · ${mt.daMeta ? "a meta vem das metas desta área" : "sem meta nesta área: o plano × os dias da season"}`;

  // a semana escolhida nas barras: as datas, quem mais puxou a nota para baixo e as setas para trocar
  const fimSel = wSel ? (wSel.ate > hoje ? hoje : wSel.ate) : "";
  /** "23 a 26 de nov." (no mesmo mês, o mês aparece uma vez), "30 de nov. a 6 de dez." ou "21 de set." (semana de um dia só) */
  const periodo = (de: string, ate: string) => (de === ate ? fmtData(de) : de.slice(0, 7) === ate.slice(0, 7) ? `${parseDay(de).getDate()} a ${fmtData(ate)}` : `${fmtData(de)} a ${fmtData(ate)}`);
  const pior = detalhe ? [...detalhe.areas].sort((a, b) => b.perde - a.perde)[0] : undefined;
  const podeIr = (i: number) => i >= 0 && i < execucao.length && notas[i] !== null;

  return (
    <Page title="Season"
      ajuda={<>O ano em 12 semanas, no ritmo das estações: planeje cada season com o seu ritmo real. Cada semana ganha uma nota de execução: o que você fez em cada área × o plano dos dias da semana (85% ou mais é uma semana bem executada). Toque numa barra para ver a semana no plano.</>}
      actions={
        <div className="seg" role="tablist" aria-label="Visão">
          {([["temporada", "Season"], ["ano", "Ano"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={visao === k} aria-pressed={visao === k} onClick={() => setVisao(k)}>{l}</button>
          ))}
        </div>
      }>
      {visao === "ano" ? <VisaoAno onAbrir={(estacao, ano) => { setSel({ estacao, ano }); setVisao("temporada"); }} /> : (
      <div className="space-y-3 md:space-y-4">
        {/* onde estou: a estação (anterior · esta · seguinte), a semana, as barras de execução e a média.
            No celular: ‹ nome › / semana e dias / barras / média e começou */}
        <section className="card px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1 sm:flex-none">
            <button className="btn btn-ghost px-1.5 -ml-1.5" title="Season anterior" aria-label="Season anterior" onClick={() => setSel(vizinha(sel.estacao, sel.ano, -1))}><ChevronLeft size={16} /></button>
            <span className="w-8 h-8 rounded-full grid place-items-center bg-surface-2 shrink-0"><EstacaoIcone estacao={sel.estacao} size={16} /></span>
            <div className="min-w-0">
              <div className="eyebrow">Season</div>
              <div className="font-semibold leading-tight truncate">{nomeDaTemporada(sel.estacao, sel.ano)}</div>
              <div className="text-xs text-muted mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span>{fmtData(t.inicio)} a {fmtData(t.fim)}</span>
                {ehAtual && <span className="rounded-full px-1.5 text-[10.5px] leading-4 bg-accent-soft text-ink">agora</span>}
                {revisao.length > 0 && <span>· revisão a partir de {fmtData(revisao[0].de)}</span>}
                <span className="hidden sm:inline" aria-hidden>·</span>
                <InicioDaSeason className="hidden sm:inline-flex" lado="esquerda" valor={t.comeca_em} min={t.inicio} max={t.fim} onMudar={(d) => void mudar({ comeca_em: d })} />
              </div>
            </div>
          </div>
          <button className="btn btn-ghost px-1.5 -mr-1.5 sm:order-last" title="Próxima season" aria-label="Próxima season" onClick={() => setSel(vizinha(sel.estacao, sel.ano, 1))}><ChevronRight size={16} /></button>

          {!passada && execucao.length > 0 && (
            <div className="basis-full sm:basis-auto text-sm text-muted tabular-nums">
              {semanaAtual >= 0 ? <>semana <b className="text-ink font-medium">{semanaAtual + 1}</b> de {execucao.length}</> : futura ? `${execucao.length} semanas` : "season encerrada"}
              {diasRestantes > 0 && <> · faltam <b className="text-ink font-medium">{diasRestantes}</b> dias</>}
              {/* a data final só aparece quando não é a da linha das datas (com semanas de revisão) */}
              {diasRestantes > 0 && fimExecucao !== t.fim && ` (até ${fmtData(fimExecucao)})`}
            </div>
          )}

          {/* uma barra por semana (a altura e a cor são a nota); a escolhida leva o anel e abre no plano, lá embaixo */}
          {execucao.length > 0 && (
            <div className="flex items-end gap-1.5 flex-1 min-w-full sm:min-w-[200px] max-w-[360px]" role="group" aria-label="Execução por semana">
              {execucao.map((w, i) => {
                const n = notas[i];
                return (
                  <button key={w.de} type="button" disabled={n === null} onClick={() => setSemanaSel(i)} aria-pressed={i === iSel}
                    className={`group flex-1 min-w-0 flex flex-col items-center gap-1 rounded-md ${n === null ? "cursor-default" : ""}`}
                    title={`Semana ${i + 1} (${fmtData(w.de)} a ${fmtData(w.ate)})${n !== null ? `: ${Math.round(n * 100)}% · ver no plano` : ""}`}>
                    <span className="h-2.5 text-[10px] leading-none tabular-nums text-muted">{n !== null ? `${Math.round(n * 100)}%` : ""}</span>
                    <span className={`w-full h-9 rounded-[5px] bg-surface-2 relative overflow-hidden ${i === iSel ? "ring-2 ring-[var(--muted)]" : n !== null ? "group-hover:ring-1 group-hover:ring-[var(--faint)]" : ""}`}>
                      {n !== null && <span className="absolute inset-x-0 bottom-0" style={{ height: `${Math.max(4, n * 100)}%`, background: corDaNota(n) }} />}
                    </span>
                    <span className={`text-[10px] leading-none tabular-nums ${i === semanaAtual ? "text-ink font-medium" : "text-faint"}`}>S{i + 1}</span>
                  </button>
                );
              })}
            </div>
          )}

          {mediaExec !== null && (
            <div className="sm:ml-auto text-sm text-muted whitespace-nowrap" title="A média das notas das semanas · 85% ou mais é uma semana bem executada">
              média <b className="ml-0.5 text-[1.375rem] font-semibold tracking-[-0.02em] tabular-nums" style={{ color: corDaNota(mediaExec) }}>{Math.round(mediaExec * 100)}%</b>
            </div>
          )}
          <InicioDaSeason className="inline-flex sm:hidden ml-auto text-xs text-muted" lado="direita" valor={t.comeca_em} min={t.inicio} max={t.fim} onMudar={(d) => void mudar({ comeca_em: d })} />
        </section>

        {/* as metas cabem? os mesmos cartões do Dashboard; o ⋯ edita e apaga, o cartão abre o detalhamento */}
        <section className="card overflow-hidden">
          <div className="px-4 pt-3 border-b border-line">
            <CardHead titulo="Metas" className="!flex-nowrap"
              meta={minhasMetas.length > 0 && (situacoes.length ? (
                // as bolinhas separam (quebra sem deixar um "·" solto no começo da linha)
                <span className="inline-flex flex-wrap items-center gap-x-2.5">
                  {situacoes.map((x) => (
                    <span key={x.texto} className="inline-flex items-center gap-1.5">
                      <span className="dot !w-1.5 !h-1.5" style={{ background: x.cor }} aria-hidden />{x.n} {x.texto}
                    </span>
                  ))}
                </span>
              ) : <span style={{ color: "var(--good)" }}>todas no ritmo</span>)}
              acao={(grandes < 3 || retas < 2) && !passada && (
                <button className="btn text-xs py-1" title="Até 3 metas grandes e 2 retas de contagem por season"
                  onClick={async () => { if (!registro) await mudar({}); setNovaMeta(true); }}><Plus size={13} /> Meta</button>
              )} />
          </div>
          {minhasMetas.length > 0 ? (
            <div className={gradeDeMetas(minhasMetas.length)}>
              {metasEmOrdem.map((m) => (
                <CartaoMeta key={m.id} m={m} p={previsoes.get(m.id!)!} nomeArea={nomeDaArea(m.area)} corArea={AREAS.find((a) => a.id === m.area)!.cor}
                  onAbrir={() => setMetaAberta(m.id!)}
                  acoes={<RowMenu label="Ações da meta" botaoClass="p-1.5 -my-1.5 -mr-1.5" items={[
                    { label: "Editar", icon: Pencil, onClick: () => setEditando(m) },
                    { label: "Apagar", icon: Trash2, danger: true, onClick: () => void apagarMeta(m) },
                  ]} />}
                  abaixo={m.tipo === "contagem" ? reguaDaContagem(m) : undefined} />
              ))}
            </div>
          ) : !carregando && (
            <div className="p-4">
              <Empty>Escolha o que esta season precisa entregar: livros para ler, aulas para fazer, um baralho do Anki, palavras para escrever ou horas numa área. O sistema projeta com o seu plano e diz se cabe.</Empty>
            </div>
          )}
        </section>

        {/* o plano por área, para ajustar: o ritmo real, o que a meta pede por dia, o plano, hoje, a semana escolhida e a season */}
        <section className="card px-4 py-3 min-w-0">
          <CardHead titulo="Plano da season" className="!flex-nowrap"
            meta={detalhe && wSel ? (
              // quebra em vez de cortar: a frase da semana é o "por quê" da nota
              <span className="whitespace-normal">
                {periodo(wSel.de, fimSel)}{wSel.ate > hoje ? " (até hoje)" : ""} · {detalhe.areas.length === 0 ? "sem plano nesta season: defina quanto por dia em cada área"
                  : pior && pior.perde >= 0.01 ? <>quem mais puxou para baixo: <b className="font-medium text-ink">{nomeDaArea(pior.area)}</b> (−{Math.round(pior.perde * 100)} pontos)</>
                  : <span style={{ color: "var(--good)" }}>todas as áreas no plano</span>}
              </span>
            ) : undefined}
            acao={wSel && (
              <span className="inline-flex items-center text-sm">
                <button className="btn btn-ghost px-1 py-1" title="Semana anterior" aria-label="Semana anterior" disabled={!podeIr(iSel - 1)} onClick={() => setSemanaSel(iSel - 1)}><ChevronLeft size={15} /></button>
                <span className="px-1 font-medium text-ink tabular-nums">Semana {iSel + 1}</span>
                <button className="btn btn-ghost px-1 py-1" title="Semana seguinte" aria-label="Semana seguinte" disabled={!podeIr(iSel + 1)} onClick={() => setSemanaSel(iSel + 1)}><ChevronRight size={15} /></button>
              </span>
            )} />
          {!registro && !carregando && (
            <p className="mb-3 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted">Ainda não planejada: os números são o seu ritmo atual. Mude qualquer valor para guardar o plano.</p>
          )}

          {/* celular, tablet e telas médias: uma linha por área (o plano à direita, os números embaixo, sem rolar para o lado) */}
          <ul className="xl:hidden divide-y divide-line border-t border-line">
            {linhasDoPlano.map((l) => l.vazio ? (
              // área sem plano, sem feito e sem meta: uma linha só, com o campo para planejar
              <li key={l.a.id} className="py-2 flex items-center gap-2 text-faint">
                <span className="dot" style={{ background: l.a.cor }} aria-hidden />
                <span className="min-w-0 truncate">{l.a.nome}</span>
                {/* o ritmo só aparece se houver (plano zerado à mão numa área que você pratica) */}
                {ritmo[l.a.id] >= 0.5 && <span className="text-[11px] tabular-nums whitespace-nowrap">seu ritmo {l.dia(ritmo[l.a.id])}</span>}
                <span className="ml-auto shrink-0">{campoPlano(l)}</span>
              </li>
            ) : (
              <li key={l.a.id} className="py-2.5">
                <div className="flex items-center gap-2">
                  <span className="dot" style={{ background: l.a.cor }} aria-hidden />
                  {/* a unidade já aparece na caixa do plano */}
                  <span className="min-w-0 truncate text-ink">{l.a.nome}</span>
                  <span className="ml-auto shrink-0 flex items-center gap-1.5 text-[11px] text-faint">plano/dia {campoPlano(l)}</span>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-1.5 pl-4 tabular-nums">
                  <div className="min-w-0"><div className="text-sm text-muted truncate">{l.dia(ritmo[l.a.id])}</div><div className="text-[10.5px] text-faint leading-tight">seu ritmo</div></div>
                  <div className="min-w-0"><div className="text-sm truncate" style={{ color: l.corPrecisa }}>{l.precisa > 0 ? l.dia(l.precisa) : "—"}</div><div className="text-[10.5px] text-faint leading-tight">precisa</div></div>
                  <div className="min-w-0">
                    <div className="text-sm truncate text-ink">{l.hojeFeito >= 0.5 ? l.dia(l.hojeFeito) : "—"}</div>
                    <div className="text-[10.5px] text-faint leading-tight">hoje{l.pctHoje !== null && <> · {Math.round(l.pctHoje * 100)}%</>}</div>
                  </div>
                  <div className="min-w-0" title={explicaSeason(l)}>
                    <div className="text-sm truncate text-ink">{l.curto(l.feito)}</div>
                    <div className="text-[10.5px] text-faint leading-tight truncate">{l.mt.total < 1 ? "na season" : `de ${totalCurto(l)}`}</div>
                  </div>
                </div>
                {l.semana && (
                  <div className="flex items-center gap-2 mt-2 pl-4" title={l.semana.explica}>
                    <span className="flex-1 h-1 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${l.semana.pct * 100}%`, background: l.a.cor }} /></span>
                    <span className="text-[11px] text-muted tabular-nums whitespace-nowrap">S{iSel + 1} <span className="text-ink">{Math.round(l.semana.pct * 100)}%</span> · {l.semana.texto}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* a tabela só a partir de xl: com o menu aberto, abaixo disso ela não cabe sem rolar */}
          <div className="hidden xl:block overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-faint [&>th]:font-normal [&>th]:pt-1 [&>th]:px-3">
                  <th />
                  <th colSpan={4} className="text-center"><span className="block border-b border-line pb-1">por dia</span></th>
                  {detalhe && <th className="text-center"><span className="block border-b border-line pb-1 whitespace-nowrap">semana {iSel + 1}{wSel && wSel.ate > hoje ? " (até hoje)" : ""}</span></th>}
                  <th className="text-center !pr-0"><span className="block border-b border-line pb-1">na season</span></th>
                </tr>
                <tr className="text-xs text-muted [&>th]:font-normal [&>th]:py-1.5 [&>th]:px-3 [&>th]:text-right">
                  <th className="!text-left !pl-0">Área</th>
                  <th title="Média por dia nos últimos 28 dias">Seu ritmo</th>
                  <th title="Quanto precisa por dia, daqui ao fim da season, para chegar à meta total">Precisa</th>
                  <th className="!text-center">Plano</th>
                  <th title="O que já fez hoje e quanto isso é do plano do dia">Hoje</th>
                  {detalhe && <th title="O que fez na semana × o plano dos dias dela: é o que entra na nota da semana">Execução</th>}
                  <th className="!pr-0" title="Das metas: o que já fez + o que falta nos livros, aulas… Sem meta (≈): o plano × os dias da season">Feito / meta</th>
                </tr>
              </thead>
              <tbody>
                {linhasDoPlano.map((l) => {
                  const { a, p, vazio, dia } = l;
                  return (
                    <tr key={a.id} className={`border-t border-line tabular-nums [&>td]:py-1.5 [&>td]:px-3 [&>td]:text-right [&>td]:whitespace-nowrap ${vazio ? "text-faint" : ""}`}>
                      <td className="!text-left !pl-0"><span className="dot mr-2 align-middle" style={{ background: a.cor }} aria-hidden /><span className={vazio ? "" : "text-ink"}>{a.nome}</span>
                        <span className="ml-1.5 text-xs text-faint">{l.un === "palavras" ? "palavras" : l.un === "cartoes" ? "cartões novos" : "minutos"}</span></td>
                      <td className="text-muted" title={l.un === "min" ? undefined : `≈ ${Math.round(ritmoMin[a.id])} min/dia`}>{dia(ritmo[a.id])}</td>
                      <td style={{ color: l.corPrecisa }}
                        title={l.precisa > 0 ? (l.precisa <= ritmo[a.id] ? "Seu ritmo dá conta" : l.precisa <= p ? "Seu ritmo não dá conta; seguindo o plano, dá" : "Nem o plano dá conta: aumente o plano ou reveja a meta") : undefined}>
                        {l.precisa > 0 ? dia(l.precisa) : "—"}
                      </td>
                      <td className="!text-center">{campoPlano(l)}</td>
                      <td>
                        {/* o feito de hoje aparece mesmo sem plano (como no celular); o % só quando há plano, numa coluna própria */}
                        <span className={vazio || l.hojeFeito < 0.5 ? "" : "text-ink"}>{dia(l.hojeFeito)}</span>
                        <span className={`ml-1.5 inline-block min-w-[2.2rem] text-[11px] ${l.pctHoje !== null && l.pctHoje >= 1 ? "text-ink" : "text-muted"}`}>{l.pctHoje !== null && `${Math.round(l.pctHoje * 100)}%`}</span>
                      </td>
                      {detalhe && (
                        <td title={l.semana?.explica}>
                          {l.semana ? (
                            <>
                              <span className="flex items-center justify-end gap-2">
                                <span className="w-20 h-1.5 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${l.semana.pct * 100}%`, background: a.cor }} /></span>
                                <span className="w-9 text-ink">{Math.round(l.semana.pct * 100)}%</span>
                              </span>
                              <span className="block text-[11px] text-muted leading-tight">{l.semana.texto}</span>
                            </>
                          ) : "—"}
                        </td>
                      )}
                      <td className="!pr-0" title={explicaSeason(l)}>
                        <span className={vazio ? "" : "text-ink"}>{l.curto(l.feito)}</span>
                        {l.mt.total >= 1 && <span className="text-muted"> / {totalCurto(l)}</span>}
                        {l.mt.total >= 1 && (
                          <span className="block mt-1 ml-auto w-28 h-1 rounded-full bg-surface-2 overflow-hidden">
                            <span className="block h-full rounded-full" style={{ width: `${Math.min(1, l.feito / l.mt.total) * 100}%`, background: l.mt.daMeta ? a.cor : `color-mix(in srgb, ${a.cor} 45%, var(--faint))` }} />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* a legenda das cores de Precisa (a única coluna com cor de situação) */}
          <div className="mt-2.5 pt-2 border-t border-line flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-faint">
            <span>Precisa:</span>
            {([["var(--good)", "seu ritmo dá conta"], ["var(--warn)", "só com o plano"], ["var(--critical)", "nem o plano"]] as const).map(([cor, texto]) => (
              <span key={texto} className="inline-flex items-center gap-1">
                <span className="dot !w-1.5 !h-1.5" style={{ background: cor }} aria-hidden />{texto}
              </span>
            ))}
          </div>
        </section>
      </div>
      )}
      {metaAberta && visao === "temporada" && (() => {
        const m = minhasMetas.find((x) => x.id === metaAberta);
        const p = m && previsoes.get(m.id!);
        if (!m || !p) return null;
        return (
          <DetalheDaMeta meta={m} cor={AREAS.find((a) => a.id === m.area)?.cor ?? "var(--accent)"} area={nomeDaArea(m.area)} comecaEm={t.comeca_em} hoje={ateHoje} ankiDias={ankiDias}
            minutosPorDia={(d) => feitoEm(reg, m.area, "min", d, d)} onClose={() => setMetaAberta(null)}
            onEditar={passada ? undefined : () => { setVoltarAoDetalhe(m.id!); setMetaAberta(null); setEditando(m); }}
            onTirar={passada || !(m.tipo === "livros" || m.tipo === "aulas") || m.refs.length <= 1 ? undefined : (id) => void tirarDaMeta(m, id)}
            resumo={{ numeros: p.numeros, selo: p.selo, corSelo: COR[p.estado], sub: p.sub, pct: p.pct, itens: p.itens, precisa: p.precisaN, ritmo: p.ritmoN }} />
        );
      })()}
      {editando && registro && (
        <NovaMeta temporadaId={registro.id!} livros={livros} pastas={pastas} aulas={aulas} baralhos={baralhos} posicao={editando.posicao ?? 0} editar={editando} fimPadrao={dayKey(addDays(new Date(), 13))}
          onClose={() => { setEditando(null); if (voltarAoDetalhe) { setMetaAberta(voltarAoDetalhe); setVoltarAoDetalhe(null); } }}
          onSalva={(m) => { setMetas((l) => l.map((x) => (x.id === m.id ? m : x))); setEditando(null); if (voltarAoDetalhe) { setMetaAberta(voltarAoDetalhe); setVoltarAoDetalhe(null); } }} />
      )}
      {novaMeta && registro && (
        <NovaMeta temporadaId={registro.id!} livros={livros} pastas={pastas} aulas={aulas} baralhos={baralhos} posicao={minhasMetas.length}
          soContagem={grandes >= 3} fimPadrao={dayKey(addDays(new Date(), 13))}
          onClose={() => setNovaMeta(false)} onSalva={(m) => { setMetas((l) => [...l, m]); setNovaMeta(false); }} />
      )}
    </Page>
  );
}

/** "começou 9 de nov. ✎": o dia em que a season começou, editável num balão (o input de data fica fora do caminho) */
function InicioDaSeason({ valor, min, max, onMudar, lado, className = "" }: {
  valor: string; min: string; max: string; onMudar: (dia: string) => void;
  /** de que lado o balão se abre (no celular o botão fica na ponta direita) */
  lado: "esquerda" | "direita";
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLSpanElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  // fecha com Esc e com clique fora
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { setAberto(false); botao.current?.focus(); } };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("pointerdown", fora); document.removeEventListener("keydown", tecla); };
  }, [aberto]);
  return (
    <span ref={caixa} className={`relative items-center ${className}`}>
      <button ref={botao} type="button" className="inline-flex items-center gap-1 hover:text-ink" aria-expanded={aberto} title="Mudar o dia em que a season começou"
        onClick={() => setAberto((a) => !a)}>
        começou {fmtData(valor)} <Pencil size={12} />
      </button>
      {aberto && (
        <span className={`popover absolute top-full mt-2 z-40 p-3 w-max ${lado === "esquerda" ? "left-0" : "right-0"}`}>
          <label className="flex flex-col gap-1.5 text-xs text-muted">Começou em
            <input type="date" className="input w-auto py-1 text-sm" autoFocus value={valor} min={min} max={max}
              onChange={(e) => e.target.value && onMudar(e.target.value)} />
          </label>
        </span>
      )}
    </span>
  );
}
