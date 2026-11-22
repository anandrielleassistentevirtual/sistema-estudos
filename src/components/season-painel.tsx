"use client";
/**
 * A Season no Dashboard: a estação, as semanas (com a nota de execução de cada uma) e as metas — com os mesmos
 * números da página da Season (a conta é a mesma: lib/metas).
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Plus, Sprout } from "lucide-react";
import { EstacaoIcone } from "@/components/estacao-icone";
import { Anel } from "@/components/biblioteca/visual";
import { supabase } from "@/lib/supabase/client";
import { addDays, dayKey } from "@/lib/dates";
import { corDaNota } from "@/lib/cores";
import { loadLanguages } from "@/lib/languages";
import { COR_ESTADO, calculoDasMetas, carregarDadosDasMetas, fmtData, planoCompletoDe, type Previsao } from "@/lib/metas";
import {
  AREAS, carregarTemporadas, estacaoDe, execucaoDaSemana, nomeDaTemporada, rendimento, semanasDa, tempoPorArea,
  type Estacao, type Meta,
} from "@/lib/temporadas";

interface Estado {
  nome: string;
  estacao: Estacao;
  planejada: boolean;
  semana: number; // índice da semana atual (-1 = fora)
  semanas: { de: string; ate: string; nota: number | null }[];
  diasRestantes: number;
  fim: string;
  metas: { m: Meta; p: Previsao }[];
  idioma: string | null;
}

export function SeasonPainel() {
  const [s, setS] = useState<Estado | null>(null);

  const carregar = useCallback(async () => {
    const e = estacaoDe();
    const nome = nomeDaTemporada(e.estacao, e.ano);
    const [{ temporadas, metas }, langs] = await Promise.all([carregarTemporadas(), loadLanguages().catch(() => [])]);
    const t = temporadas.find((x) => x.estacao === e.estacao && x.ano === e.ano);
    const idioma = langs.length === 1 ? langs[0].name : null;
    if (!t) { setS({ nome, estacao: e.estacao, planejada: false, semana: -1, semanas: [], diasRestantes: 0, fim: e.fim, metas: [], idioma }); return; }
    const sessenta = dayKey(addDays(new Date(), -60));
    const desde = t.comeca_em < sessenta ? t.comeca_em : sessenta;
    const [reg, dados] = await Promise.all([tempoPorArea(desde), carregarDadosDasMetas(desde)]);
    const plano = planoCompletoDe(t, reg);
    const calc = calculoDasMetas(t, reg, plano, dados);
    const rend = rendimento(reg);
    const hoje = dayKey();
    const { execucao } = semanasDa(t);
    setS({
      nome, estacao: e.estacao, planejada: true, idioma,
      semana: execucao.findIndex((w) => hoje >= w.de && hoje <= w.ate),
      semanas: execucao.map((w) => ({ ...w, nota: w.de > hoje ? null : execucaoDaSemana(reg, t, plano, w.de, w.ate > hoje ? hoje : w.ate, rend) })),
      diasRestantes: calc.diasRestantes, fim: calc.fimExecucao,
      metas: metas.filter((m) => m.temporada_id === t.id).map((m) => ({ m, p: calc.previsao(m) })),
    });
  }, []);
  useEffect(() => { void carregar().catch(() => {}); }, [carregar]);

  /** +1 numa meta de contagem (ex.: uma aula do curso feita hoje), sem sair do Dashboard */
  async function maisUm(m: Meta) {
    const refs = [...m.refs, dayKey()];
    await supabase().from("temporada_metas").update({ refs }).eq("id", m.id!);
    void carregar();
  }

  if (!s) return <div className="card h-[214px] animate-pulse opacity-60" aria-hidden />;

  if (!s.planejada) {
    return (
      <Link href="/season" className="card card-hover p-4 flex items-center gap-4">
        <span className="w-11 h-11 rounded-full grid place-items-center bg-surface-2 shrink-0"><EstacaoIcone estacao={s.estacao} size={20} /></span>
        <span className="min-w-0 flex-1">
          <span className="eyebrow">Season</span>
          <span className="block font-semibold">{s.nome} ainda não foi planejada</span>
          <span className="block text-xs text-muted mt-0.5">Defina quanto por dia em cada área e de 1 a 3 metas: o Dashboard passa a mostrar se elas cabem.</span>
        </span>
        <span className="btn btn-primary shrink-0"><Sprout size={15} /> Planejar</span>
      </Link>
    );
  }

  const atual = s.semana >= 0 ? s.semanas[s.semana] : null;
  return (
    <section className="card overflow-hidden">
      {/* a estação e as semanas */}
      <div className="px-4 pt-3.5 pb-3 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-full grid place-items-center bg-surface-2 shrink-0"><EstacaoIcone estacao={s.estacao} size={19} /></span>
          <div className="min-w-0">
            <div className="eyebrow">Season</div>
            <div className="font-semibold leading-tight">{s.nome}</div>
          </div>
        </div>
        <div className="text-sm text-muted tabular-nums">
          {s.semana >= 0 ? <>semana <b className="text-ink font-medium">{s.semana + 1}</b> de {s.semanas.length}</> : "fora das semanas"}
          {s.diasRestantes > 0 && <> · faltam <b className="text-ink font-medium">{s.diasRestantes}</b> dias (até {fmtData(s.fim)})</>}
        </div>
        {/* uma barra por semana: a altura e a cor são a nota de execução */}
        <div className="flex items-end gap-1 h-9 flex-1 min-w-[160px] max-w-[360px]" aria-label="Execução por semana">
          {s.semanas.map((w, i) => (
            <span key={w.de} className={`flex-1 h-full rounded-[4px] bg-surface-2 relative overflow-hidden ${i === s.semana ? "ring-1 ring-[var(--muted)]" : ""}`}
              title={`Semana ${i + 1} (${fmtData(w.de)} a ${fmtData(w.ate)})${w.nota !== null ? `: ${Math.round(w.nota * 100)}%` : ""}`}>
              {w.nota !== null && <span className="absolute inset-x-0 bottom-0" style={{ height: `${Math.max(6, w.nota * 100)}%`, background: corDaNota(w.nota) }} />}
            </span>
          ))}
        </div>
        {atual?.nota != null && (
          <div className="text-sm text-muted">esta semana <b className="font-semibold tabular-nums text-base" style={{ color: corDaNota(atual.nota) }}>{Math.round(atual.nota * 100)}%</b></div>
        )}
        <Link href="/season" className="ml-auto text-sm link inline-flex items-center gap-0.5">Abrir <ChevronRight size={15} /></Link>
      </div>

      {/* as metas */}
      {s.metas.length === 0 ? (
        <Link href="/season" className="flex items-center gap-2 px-4 py-4 text-sm text-muted hover:text-ink"><Plus size={15} /> Nenhuma meta nesta Season ainda: escolha de 1 a 3 (livros, aulas, cartões do Anki…).</Link>
      ) : (
        // tantas colunas quantas metas (sem buraco no fim); no tablet, a última sobra ocupa a linha
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${["xl:grid-cols-1", "xl:grid-cols-1", "xl:grid-cols-2", "xl:grid-cols-3", "xl:grid-cols-4", "xl:grid-cols-5"][Math.min(5, s.metas.length)]} gap-px bg-line sm:[&>*:last-child:nth-child(odd)]:col-span-2 xl:[&>*:last-child:nth-child(odd)]:col-span-1`}>
          {s.metas.map(({ m, p }) => {
            const area = AREAS.find((a) => a.id === m.area)!;
            const nomeArea = m.area === "idiomas" && s.idioma ? s.idioma : area.nome;
            const cor = COR_ESTADO[p.estado];
            const [principal, precisa, ritmo] = p.numeros;
            return (
              <article key={m.id} className="bg-surface p-4 min-w-0 flex flex-col">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[11.5px] text-muted min-w-0"><span className="dot !w-1.5 !h-1.5" style={{ background: area.cor }} /><span className="truncate">{nomeArea}</span></span>
                  <span className="text-[11px] font-medium rounded-full px-2 py-0.5 whitespace-nowrap" style={{ color: cor, background: `color-mix(in srgb, ${cor} 14%, transparent)` }}>{p.selo}</span>
                </div>
                <Link href={`/season#meta-${m.id}`} className="font-medium leading-snug mt-1.5 line-clamp-2 hover:underline underline-offset-2" title={p.resumo}>{m.titulo}</Link>
                <div className="flex items-center gap-3 mt-2 sm:mt-3">
                  <Anel valor={p.pct} cor={area.cor} tamanho={54} espessura={5}>
                    <span className="text-[13px] font-semibold tabular-nums">{Math.round(p.pct * 100)}%</span>
                  </Anel>
                  <div className="min-w-0">
                    <div className="text-xl font-semibold tabular-nums leading-none">
                      {principal.valor.includes("/") ? <>{principal.valor.split("/")[0]}<span className="text-sm font-normal text-muted">/{principal.valor.split("/")[1]}</span></> : principal.valor}
                    </div>
                    <div className="text-[11.5px] text-muted mt-1">{principal.rotulo}</div>
                  </div>
                </div>
                {/* o que a meta pede por dia × o que você faz (ou os dias que restam, na contagem) */}
                <div className="sm:hidden mt-2 text-xs text-muted tabular-nums">
                  {[precisa, ritmo].filter(Boolean).map((n, i) => <span key={n.rotulo}>{i ? " · " : ""}<b className="font-semibold" style={{ color: n.cor ?? "var(--text)" }}>{n.valor}</b> {n.rotulo}</span>)}
                </div>
                <div className="hidden sm:grid mt-3 grid-cols-2 gap-2 text-[11.5px]">
                  {[precisa, ritmo].filter(Boolean).map((n) => (
                    <div key={n.rotulo} className="rounded-lg bg-surface-2/60 px-2.5 py-1.5 min-w-0">
                      <div className="font-semibold tabular-nums text-sm" style={{ color: n.cor }}>{n.valor}</div>
                      <div className="text-muted truncate">{n.rotulo}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-auto pt-2 sm:pt-3 flex items-center justify-between gap-2 text-[11.5px] text-muted">
                  <span className="truncate" title={p.sub}>{p.sub}</span>
                  {m.tipo === "contagem" && p.estado !== "feita" && (
                    <button className="btn py-0.5 px-2 text-xs shrink-0" title={`Marcar 1 ${(m.unidade || "item").replace(/s$/, "")} feita hoje`} onClick={() => void maisUm(m)}><Plus size={12} /> 1</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
