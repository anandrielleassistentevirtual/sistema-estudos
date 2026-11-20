"use client";
/**
 * Visão do ano: as 4 estações lado a lado — quanto você estudou, como executou o plano, o que entregou
 * (livros, aulas, cartões, palavras, MAR), as metas de cada estação e o ano semana a semana por área.
 * Os números saem das mesmas fontes do Dashboard e de cada temporada (tempo de estudo, leitura, Anki, escrita).
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { todas } from "@/lib/supabase/todas";
import { addDays, dayKey, fmtDuration, nf, parseDay, weekStart } from "@/lib/dates";
import { arvoreDePastas, faltam, subarvore, type PastaEstudo } from "@/lib/estudos";
import { progressoDoLivro, type BookStatus } from "@/lib/types";
import { contaAnki } from "@/lib/anki";
import { ehMar } from "@/lib/tempo";
import { corDaNota } from "@/lib/cores";
import { EstacaoIcone } from "@/components/estacao-icone";
import {
  AREAS, carregarTemporadas, diasEntre, estacaoDe, execucaoDaSemana, feitoEm, limites, nomeDaTemporada, rendimento,
  semanasDa, tempoPorArea, vizinha, type Area, type Estacao, type Meta, type Registros, type Temporada,
} from "@/lib/temporadas";

interface LivroA { id: string; title: string; word_count: number | null; progress: number; status: BookStatus; finished_at: string | null }
interface AulaA { id: string; title: string; palavras: number; progresso: number; situacao: "pendente" | "lendo" | "concluida"; completed_at: string | null; pasta_id: string | null }
interface AnkiDia { day: string; baralho: string; reviews: number; criados: number }
interface Dados {
  temporadas: Temporada[]; metas: Meta[]; reg: Registros; livros: LivroA[]; aulas: AulaA[]; pastas: PastaEstudo[];
  ankiDias: AnkiDia[]; totais: Map<string, number>; mar: { day: string; seconds: number }[];
}

const fmtData = (k: string) => parseDay(k).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
const horas = (seg: number) => (seg >= 3600 ? `${nf.format(Math.round(seg / 360) / 10)} h` : fmtDuration(seg));
const N = (v: number) => nf.format(Math.round(v));
/** 157 mil · 1,2 mi */
const curto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
/** a unidade natural de cada área quando se fala do que foi entregue */
const NATURAL: Record<Area, { u: "palavras" | "cartoes" | "min"; nome: string }> = {
  leitura: { u: "palavras", nome: "palavras lidas" }, estudos: { u: "palavras", nome: "palavras estudadas" },
  idiomas: { u: "cartoes", nome: "cartões novos" }, escrita: { u: "palavras", nome: "palavras escritas" },
  pesquisa: { u: "min", nome: "de pesquisa" }, exercicio: { u: "min", nome: "de exercício" },
};

export function VisaoAno({ onAbrir }: { onAbrir: (e: Estacao, ano: number) => void }) {
  const atual = estacaoDe();
  // as 4 estações até a de agora; as setas andam um ano
  const [desloca, setDesloca] = useState(0);
  const estacoes = useMemo(() => {
    let x = { estacao: atual.estacao, ano: atual.ano + desloca };
    const l = [x];
    for (let i = 0; i < 3; i++) { x = vizinha(x.estacao, x.ano, -1); l.unshift(x); }
    return l.map((e) => ({ ...e, ...limites(e.estacao, e.ano) }));
  }, [desloca]); // eslint-disable-line react-hooks/exhaustive-deps
  const desde = estacoes[0].inicio;
  const [d, setD] = useState<Dados | null>(null);

  useEffect(() => {
    let vivo = true;
    setD(null);
    (async () => {
      const sb = supabase();
      const [t, reg, livros, aulas, pastas, ankiDias, conta, sess] = await Promise.all([
        carregarTemporadas(),
        tempoPorArea(desde),
        todas<LivroA>((de, ate) => sb.from("books").select("id,title,word_count,progress,status,finished_at").order("id").range(de, ate)),
        todas<AulaA>((de, ate) => sb.from("notes").select("id,title,palavras,progresso,situacao,completed_at,pasta_id").eq("kind", "estudo").order("id").range(de, ate)),
        sb.from("estudo_pastas").select("id,parent_id,nome,posicao"),
        todas<AnkiDia>((de, ate) => sb.from("anki_baralho_dia").select("day,baralho,reviews,criados").gte("day", desde).order("day").order("baralho").range(de, ate)).catch(() => [] as AnkiDia[]),
        contaAnki().catch(() => null),
        todas<{ day: string; seconds: number; label: string; mar_titulo_id: string | null }>((de, ate) =>
          sb.from("study_sessions").select("day,seconds,label,mar_titulo_id").eq("category", "Idiomas").gte("day", desde).order("id").range(de, ate)).catch(() => []),
      ]);
      if (!vivo) return;
      setD({
        temporadas: t.temporadas, metas: t.metas, reg, livros, aulas, pastas: (pastas.data as PastaEstudo[] | null) ?? [],
        ankiDias: ankiDias.filter((x) => x.day >= desde),
        totais: new Map((conta?.baralhos ?? []).map((b) => [b.nome, b.total])),
        mar: sess.filter((s) => s.day >= desde && ehMar(s.label, s.mar_titulo_id)),
      });
    })();
    return () => { vivo = false; };
  }, [desde]);

  const hoje = dayKey();
  const calc = useMemo(() => {
    if (!d) return null;
    const rend = rendimento(d.reg);
    const segDia = (dia: string) => { const v = d.reg.seg.get(dia); return v ? AREAS.reduce((n, a) => n + v[a.id], 0) : 0; };
    const { filhos } = arvoreDePastas(d.pastas);

    /** quanto da meta foi feito (0 a 1), com o que existe hoje e o período da estação */
    function pctMeta(m: Meta, de: string, ate: string): number {
      if (m.tipo === "livros") {
        const ls = m.refs.map((id) => d!.livros.find((b) => b.id === id)).filter((b): b is LivroA => !!b);
        const tot = ls.reduce((n, b) => n + (b.word_count ?? 0), 0);
        return tot ? ls.reduce((n, b) => n + (b.word_count ?? 0) * progressoDoLivro(b), 0) / tot : ls.length ? ls.filter((b) => b.status === "lido").length / ls.length : 0;
      }
      if (m.tipo === "aulas" || m.tipo === "curso") {
        const as = m.tipo === "aulas" ? m.refs.map((id) => d!.aulas.find((a) => a.id === id)).filter((a): a is AulaA => !!a)
          : d!.aulas.filter((a) => a.pasta_id && subarvore(m.refs[0] ?? "", filhos).has(a.pasta_id));
        const tot = as.reduce((n, a) => n + (a.palavras || 0), 0);
        return tot ? as.reduce((n, a) => n + (a.palavras || 0) - faltam(a), 0) / tot : as.length ? as.filter((a) => a.situacao === "concluida").length / as.length : 0;
      }
      if (!m.alvo) return 0;
      if (m.tipo === "anki") {
        if ((m.medida ?? "total") === "total") return Math.min(1, m.refs.reduce((n, b) => n + (d!.totais.get(b) ?? 0), 0) / m.alvo);
        const campo = m.medida === "revisoes" ? "reviews" : "criados";
        return Math.min(1, d!.ankiDias.filter((x) => m.refs.includes(x.baralho) && x.day >= de && x.day <= ate).reduce((n, x) => n + x[campo], 0) / m.alvo);
      }
      if (m.tipo === "palavras") return Math.min(1, feitoEm(d!.reg, "escrita", "palavras", de, ate) / m.alvo);
      if (m.tipo === "horas") return Math.min(1, feitoEm(d!.reg, m.area, "min", de, ate) / (m.alvo * 60));
      if (m.tipo === "contagem") return Math.min(1, m.refs.length / m.alvo);
      return 0;
    }

    const porEstacao = estacoes.map((e) => {
      const t = d.temporadas.find((x) => x.estacao === e.estacao && x.ano === e.ano);
      const ate = e.fim < hoje ? e.fim : hoje;
      const comecou = e.inicio <= hoje;
      const dias = comecou ? diasEntre(e.inicio, ate) : 0;
      let seg = 0, ativos = 0;
      for (let k = parseDay(e.inicio); comecou && dayKey(k) <= ate; k = addDays(k, 1)) { const s = segDia(dayKey(k)); seg += s; if (s >= 60) ativos++; }
      // execução: a média das notas das semanas (só com plano salvo)
      let exec: number | null = null;
      if (t && comecou) {
        const plano = Object.fromEntries(AREAS.map((a) => [a.id, t.plano[a.id] ?? 0])) as Record<Area, number>;
        const notas = semanasDa(t).execucao.filter((w) => w.de <= hoje)
          .map((w) => execucaoDaSemana(d.reg, t, plano, w.de, w.ate > hoje ? hoje : w.ate, rend)).filter((n): n is number => n !== null);
        exec = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
      }
      const metas = t ? d.metas.filter((m) => m.temporada_id === t.id).map((m) => ({ m, pct: pctMeta(m, t.comeca_em, ate) })) : [];
      const area = Object.fromEntries(AREAS.map((a) => {
        const s = comecou ? feitoEm(d.reg, a.id, "min", e.inicio, ate) * 60 : 0;
        const q = comecou ? feitoEm(d.reg, a.id, NATURAL[a.id].u, e.inicio, ate) : 0;
        const pl = t?.plano[a.id];
        const un = t?.unidades?.[a.id] ?? (a.id === "idiomas" ? "cartoes" : a.id === "pesquisa" || a.id === "exercicio" ? "min" : "palavras");
        const pct = t && pl && comecou ? Math.min(9.99, feitoEm(d.reg, a.id, un, t.comeca_em, ate) / (pl * Math.max(1, diasEntre(t.comeca_em, ate)))) : null;
        return [a.id, { seg: s, q, pct }];
      })) as Record<Area, { seg: number; q: number; pct: number | null }>;
      const entre = (iso: string | null) => !!iso && dayKey(new Date(iso)) >= e.inicio && dayKey(new Date(iso)) <= ate;
      return {
        ...e, t, comecou, dias, seg, ativos, exec, metas, area,
        livros: d.livros.filter((b) => b.status === "lido" && entre(b.finished_at)).length,
        aulas: d.aulas.filter((a) => a.situacao === "concluida" && entre(a.completed_at)).length,
        cartoes: comecou ? feitoEm(d.reg, "idiomas", "cartoes", e.inicio, ate) : 0,
        lidas: comecou ? feitoEm(d.reg, "leitura", "palavras", e.inicio, ate) + feitoEm(d.reg, "estudos", "palavras", e.inicio, ate) : 0,
        escritas: comecou ? feitoEm(d.reg, "escrita", "palavras", e.inicio, ate) : 0,
        mar: d.mar.filter((s) => s.day >= e.inicio && s.day <= ate).reduce((n, s) => n + s.seconds, 0),
      };
    });

    // o ano semana a semana, por área (até hoje)
    const fimTudo = estacoes[3].fim < hoje ? estacoes[3].fim : hoje;
    const semanas: { de: string; seg: Record<Area, number>; total: number; estacao: Estacao }[] = [];
    for (let w = weekStart(parseDay(desde)); dayKey(w) <= estacoes[3].fim; w = addDays(w, 7)) {
      const de = dayKey(w);
      const seg = Object.fromEntries(AREAS.map((a) => [a.id, 0])) as Record<Area, number>;
      for (let k = 0; k < 7; k++) {
        const dia = dayKey(addDays(w, k));
        if (dia < desde || dia > fimTudo) continue;
        const v = d.reg.seg.get(dia);
        if (v) for (const a of AREAS) seg[a.id] += v[a.id];
      }
      const meio = dayKey(addDays(w, 3));
      const est = [...estacoes].reverse().find((x) => meio >= x.inicio)?.estacao ?? estacoes[0].estacao;
      semanas.push({ de, seg, total: AREAS.reduce((n, a) => n + seg[a.id], 0), estacao: est });
    }

    // marcos do período
    let melhor = { de: "", total: 0 };
    for (const s of semanas) if (s.total > melhor.total) melhor = { de: s.de, total: s.total };
    let seq = 0, maior = 0, diasCom = 0, diasTot = 0;
    for (let k = parseDay(desde); dayKey(k) <= fimTudo; k = addDays(k, 1)) {
      diasTot++;
      if (segDia(dayKey(k)) >= 60) { seq++; diasCom++; maior = Math.max(maior, seq); } else seq = 0;
    }
    const [penult, ult] = porEstacao.filter((e) => e.comecou).slice(-2);
    let cresceu: { area: Area; delta: number } | null = null;
    if (penult && ult) for (const a of AREAS) {
      const dlt = ult.area[a.id].seg / Math.max(1, ult.dias) - penult.area[a.id].seg / Math.max(1, penult.dias);
      if (!cresceu || dlt > cresceu.delta) cresceu = { area: a.id, delta: dlt };
    }
    return { porEstacao, semanas, melhor, maior, diasCom, diasTot, cresceu: cresceu && cresceu.delta > 0 ? cresceu : null };
  }, [d, estacoes, hoje]);

  const titulo = `${nomeDaTemporada(estacoes[0].estacao, estacoes[0].ano)} a ${nomeDaTemporada(estacoes[3].estacao, estacoes[3].ano)}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button className="btn btn-ghost px-2" title="Um ano antes" onClick={() => setDesloca((x) => x - 1)}><ChevronLeft size={16} /></button>
        <div className="card px-4 py-2.5 flex-1 min-w-0 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-lg font-medium">{desloca === 0 ? "Últimas 4 estações" : titulo}</span>
          <span className="text-sm text-muted">{desloca === 0 ? titulo : ""} · {fmtData(estacoes[0].inicio)} a {fmtData(estacoes[3].fim)}</span>
        </div>
        <button className="btn btn-ghost px-2" title="Um ano depois" disabled={desloca >= 0} onClick={() => setDesloca((x) => Math.min(0, x + 1))}><ChevronRight size={16} /></button>
      </div>

      {!calc ? <div className="card p-6 text-sm text-muted">Calculando o ano…</div> : (
        <>
          {/* 1) as 4 estações */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
            {calc.porEstacao.map((e, i) => {
              const ant = i > 0 ? calc.porEstacao[i - 1] : null;
              const var_ = ant && ant.comecou && ant.seg > 0 && e.comecou ? (e.seg / Math.max(1, e.dias) - ant.seg / Math.max(1, ant.dias)) / (ant.seg / Math.max(1, ant.dias)) : null;
              const cumpridas = e.metas.filter((x) => x.pct >= 0.999).length;
              const agora = e.estacao === atual.estacao && e.ano === atual.ano;
              return (
                <button key={`${e.estacao}${e.ano}`} onClick={() => onAbrir(e.estacao, e.ano)} title="Abrir esta temporada"
                  className={`card px-4 py-3 text-left min-w-0 hover:border-[var(--muted)] transition-colors ${agora ? "ring-1 ring-[var(--muted)]" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium flex items-center gap-1.5 min-w-0 truncate"><EstacaoIcone estacao={e.estacao} size={16} />{nomeDaTemporada(e.estacao, e.ano)}</span>
                    {agora ? <span className="text-[11px] rounded-full px-2 py-0.5 bg-accent-soft text-ink shrink-0">agora</span>
                      : !e.comecou ? <span className="text-[11px] text-muted shrink-0">ainda não começou</span> : null}
                  </div>
                  {!e.comecou ? <p className="text-sm text-muted mt-6">Começa em {fmtData(e.inicio)}.</p> : (
                    <>
                      <div className="grid grid-cols-3 gap-2 mt-2.5">
                        <div className="min-w-0"><div className="text-xl font-medium tabular-nums leading-none truncate">{horas(e.seg)}</div>
                          <div className="text-[11px] text-muted mt-1">estudo · {fmtDuration(e.seg / Math.max(1, e.dias))}/dia</div></div>
                        <div className="min-w-0"><div className="text-xl font-medium tabular-nums leading-none" style={{ color: e.exec !== null ? corDaNota(e.exec) : undefined }}>{e.exec !== null ? `${Math.round(e.exec * 100)}%` : "—"}</div>
                          <div className="text-[11px] text-muted mt-1">{e.t ? "execução" : "sem plano"}</div></div>
                        <div className="min-w-0"><div className="text-xl font-medium tabular-nums leading-none">{e.metas.length ? <>{cumpridas}<span className="text-sm text-muted">/{e.metas.length}</span></> : "—"}</div>
                          <div className="text-[11px] text-muted mt-1">metas cumpridas</div></div>
                      </div>
                      <div className="mt-2.5 text-xs text-muted grid grid-cols-3 gap-x-2 gap-y-0.5 tabular-nums [&>span]:truncate">
                        <span>{e.livros} {e.livros === 1 ? "livro" : "livros"}</span>
                        <span>{e.aulas} {e.aulas === 1 ? "aula" : "aulas"}</span>
                        <span title={`${N(e.cartoes)} cartões novos`}>{N(e.cartoes)} cartões</span>
                        <span title={`${N(e.lidas)} palavras lidas`}>{curto.format(e.lidas)} pal. lidas</span>
                        <span title={`${N(e.escritas)} palavras escritas`}>{curto.format(e.escritas)} escritas</span>
                        <span>MAR {horas(e.mar)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-faint tabular-nums">
                        <span>{e.ativos} de {e.dias} dias com estudo</span>
                        {var_ !== null && <span className="font-medium" style={{ color: var_ >= 0 ? "var(--good)" : "var(--critical)" }}>{var_ >= 0 ? "▲" : "▼"} {Math.abs(Math.round(var_ * 100))}% por dia</span>}
                      </div>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {/* 2) o ano semana a semana · marcos */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)] gap-3 md:gap-4">
            <section className="card p-4 min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2">
                <h3 className="card-title">Horas por semana</h3>
                <span className="flex flex-wrap gap-x-3 text-xs text-muted">
                  {AREAS.map((a) => <span key={a.id} className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm" style={{ background: a.cor }} />{a.nome}</span>)}
                </span>
              </div>
              <Semanas semanas={calc.semanas} hoje={hoje} />
            </section>
            <section className="card p-4 min-w-0">
              <h3 className="card-title mb-3">Marcos do período</h3>
              <ul className="space-y-2.5 text-sm">
                <li className="flex justify-between gap-3"><span className="text-muted">Melhor semana</span>
                  <span className="tabular-nums text-right">{calc.melhor.total ? <><b className="font-medium">{horas(calc.melhor.total)}</b> <span className="text-muted">· {fmtData(calc.melhor.de)}</span></> : "—"}</span></li>
                <li className="flex justify-between gap-3"><span className="text-muted">Maior sequência</span>
                  <span className="tabular-nums"><b className="font-medium">{calc.maior}</b> <span className="text-muted">{calc.maior === 1 ? "dia seguido" : "dias seguidos"}</span></span></li>
                <li className="flex justify-between gap-3"><span className="text-muted">Dias com estudo</span>
                  <span className="tabular-nums"><b className="font-medium">{calc.diasTot ? Math.round((calc.diasCom / calc.diasTot) * 100) : 0}%</b> <span className="text-muted">· {calc.diasCom} de {calc.diasTot}</span></span></li>
                <li className="flex justify-between gap-3"><span className="text-muted">O que mais cresceu</span>
                  <span className="tabular-nums text-right">{calc.cresceu ? <><b className="font-medium" style={{ color: AREAS.find((a) => a.id === calc.cresceu!.area)?.cor }}>{AREAS.find((a) => a.id === calc.cresceu!.area)?.nome}</b> <span className="text-muted">+{fmtDuration(calc.cresceu.delta)}/dia</span></> : "—"}</span></li>
                <li className="flex justify-between gap-3"><span className="text-muted">No período</span>
                  <span className="tabular-nums"><b className="font-medium">{horas(calc.porEstacao.reduce((n, e) => n + e.seg, 0))}</b> <span className="text-muted">de estudo</span></span></li>
              </ul>
            </section>
          </div>

          {/* 3) áreas × estações · metas */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3 md:gap-4">
            <section className="card p-4 min-w-0 overflow-x-auto">
              <h3 className="card-title mb-2">Áreas por estação <span className="text-xs text-muted font-normal">· horas · o que entregou · % do plano</span></h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-muted [&>th]:font-normal [&>th]:py-1 [&>th]:px-2 [&>th]:text-right">
                    <th className="!text-left !pl-0">Área</th>
                    {calc.porEstacao.map((e) => <th key={`${e.estacao}${e.ano}`} className="whitespace-nowrap"><EstacaoIcone estacao={e.estacao} size={12} /> {nomeDaTemporada(e.estacao, e.ano).split(" ")[0]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {AREAS.map((a) => (
                    <tr key={a.id} className="border-t border-line tabular-nums [&>td]:py-1 [&>td]:px-2 [&>td]:text-right">
                      <td className="!text-left !pl-0 whitespace-nowrap"><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: a.cor }} />{a.nome}</td>
                      {calc.porEstacao.map((e) => {
                        const x = e.area[a.id];
                        if (!e.comecou) return <td key={`${e.estacao}${e.ano}`} className="text-faint">—</td>;
                        const nat = NATURAL[a.id];
                        return (
                          <td key={`${e.estacao}${e.ano}`} className="whitespace-nowrap">
                            <span className={x.seg ? "" : "text-faint"}>{x.seg ? horas(x.seg) : "—"}</span>
                            {nat.u !== "min" && x.q > 0 && <span className="text-[11px] text-muted ml-1.5" title={`${N(x.q)} ${nat.nome}`}>{curto.format(x.q)} {nat.u === "cartoes" ? "novos" : "pal."}</span>}
                            {x.pct !== null && <span className="text-[11px] ml-1.5 font-medium inline-block w-9" style={{ color: corDaNota(Math.min(1, x.pct)) }} title="do plano da temporada">{Math.round(x.pct * 100)}%</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="card p-4 min-w-0 flex flex-col">
              <h3 className="card-title mb-2">Metas das estações</h3>
              {calc.porEstacao.every((e) => !e.metas.length) ? <p className="text-sm text-muted">Nenhuma meta nestas estações.</p> : (
                <ul className="space-y-3 xl:max-h-[13.5rem] overflow-y-auto pr-1">
                  {calc.porEstacao.filter((e) => e.metas.length).map((e) => (
                    <li key={`${e.estacao}${e.ano}`}>
                      <button className="text-[11px] uppercase tracking-wider text-muted hover:text-ink flex items-center gap-1.5 mb-1" onClick={() => onAbrir(e.estacao, e.ano)}>
                        <EstacaoIcone estacao={e.estacao} size={12} />{nomeDaTemporada(e.estacao, e.ano)} ›
                      </button>
                      <ul className="space-y-1.5">
                        {e.metas.map(({ m, pct }) => {
                          const cor = AREAS.find((a) => a.id === m.area)?.cor;
                          return (
                            <li key={m.id} className="text-sm">
                              <div className="flex justify-between gap-3">
                                <span className="truncate">{pct >= 0.999 ? "✓ " : ""}{m.titulo}</span>
                                <span className="tabular-nums text-xs shrink-0" style={{ color: pct >= 0.999 ? "var(--good)" : "var(--muted)" }}>{Math.round(pct * 100)}%</span>
                              </div>
                              <div className="mt-1 h-1 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(1, pct) * 100}%`, background: cor }} /></div>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

/** Uma barra por semana, empilhada pelas áreas; linhas finas onde muda a estação. */
function Semanas({ semanas, hoje }: { semanas: { de: string; seg: Record<Area, number>; total: number; estacao: Estacao }[]; hoje: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(3600, ...semanas.map((s) => s.total));
  const H = 104;
  const s = sel !== null ? semanas[sel] : null;
  return (
    <div className="relative">
      <div className="flex items-end gap-[2px]" style={{ height: H }} onMouseLeave={() => setSel(null)}>
        {semanas.map((w, i) => {
          const nova = i > 0 && semanas[i - 1].estacao !== w.estacao;
          const futura = w.de > hoje;
          return (
            <div key={w.de} className={`relative flex-1 min-w-0 h-full flex flex-col justify-end ${nova ? "border-l border-dashed border-line pl-[1px]" : ""}`}
              onMouseEnter={() => setSel(i)} onClick={() => setSel(i)}>
              {nova && <span className="absolute -top-0.5 left-1 text-[9px] text-faint whitespace-nowrap pointer-events-none"><EstacaoIcone estacao={w.estacao} size={10} /></span>}
              <div className="w-full flex flex-col-reverse rounded-t-[2px] overflow-hidden" style={{ height: futura ? 2 : `${Math.max(w.total ? 2 : 0, (w.total / max) * 100)}%`, opacity: sel === null || sel === i ? 1 : 0.5, background: futura ? "var(--surface-2)" : undefined }}>
                {!futura && AREAS.map((a) => w.seg[a.id] > 0 && <div key={a.id} style={{ height: `${(w.seg[a.id] / w.total) * 100}%`, background: a.cor }} />)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-faint mt-1 tabular-nums">
        <span>{fmtData(semanas[0]?.de ?? hoje)}</span>
        <span>{s ? <span className="text-ink">semana de {fmtData(s.de)} · {horas(s.total)}{s.total ? ` — ${AREAS.filter((a) => s.seg[a.id] >= 60).map((a) => `${a.nome} ${fmtDuration(s.seg[a.id])}`).join(" · ")}` : ""}</span> : "passe o mouse numa semana"}</span>
        <span>{fmtData(semanas[semanas.length - 1]?.de ?? hoje)}</span>
      </div>
    </div>
  );
}
