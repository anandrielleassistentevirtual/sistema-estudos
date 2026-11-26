"use client";
/**
 * A Season no Dashboard: a estação, as semanas (com a nota de execução de cada uma) e as metas — com os mesmos
 * números da página da Season (a conta é a mesma: lib/metas).
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Plus, Sprout } from "lucide-react";
import { EstacaoIcone } from "@/components/estacao-icone";
import { CartaoMeta, gradeDeMetas } from "@/components/cartao-meta";
import { supabase } from "@/lib/supabase/client";
import { addDays, dayKey } from "@/lib/dates";
import { corDaNota } from "@/lib/cores";
import { loadLanguages } from "@/lib/languages";
import { calculoDasMetas, carregarDadosDasMetas, fmtData, planoCompletoDe, type Previsao } from "@/lib/metas";
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

  if (!s) return <div className="card h-[168px] animate-pulse opacity-60" aria-hidden />;

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
      {/* a estação e as semanas; no celular: o nome com o Abrir, a frase e as barras, uma por linha */}
      <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-2.5 border-b border-line">
        <div className="flex items-center gap-3 min-w-0 flex-1 sm:flex-none">
          <span className="w-8 h-8 rounded-full grid place-items-center bg-surface-2 shrink-0"><EstacaoIcone estacao={s.estacao} size={16} /></span>
          <div className="min-w-0">
            <div className="eyebrow">Season</div>
            <div className="font-semibold leading-tight truncate">{s.nome}</div>
          </div>
        </div>
        <Link href="/season" className="link-ir sm:order-last sm:ml-auto">Abrir <ChevronRight size={15} /></Link>
        {/* onde estou e como estou, numa frase só */}
        <div className="text-sm text-muted tabular-nums">
          {s.semana >= 0 ? <>semana <b className="text-ink font-medium">{s.semana + 1}</b> de {s.semanas.length}</> : "fora das semanas"}
          {/* cada pedaço fica inteiro: a frase quebra no "·", sem deixar o número sozinho na linha de baixo */}
          {s.diasRestantes > 0 && <> · <span className="whitespace-nowrap">faltam <b className="text-ink font-medium">{s.diasRestantes}</b> dias (até {fmtData(s.fim)})</span></>}
          {atual?.nota != null && <> · <span className="whitespace-nowrap">esta semana <b className="font-semibold" style={{ color: corDaNota(atual.nota) }}>{Math.round(atual.nota * 100)}%</b></span></>}
        </div>
        {/* uma barra por semana: a altura e a cor são a nota de execução */}
        <div className="flex items-end gap-1 h-7 flex-1 min-w-full sm:min-w-[140px] max-w-[300px]" aria-label="Execução por semana">
          {s.semanas.map((w, i) => (
            <span key={w.de} className={`flex-1 h-full rounded-[4px] bg-surface-2 relative overflow-hidden ${i === s.semana ? "ring-1 ring-[var(--muted)]" : ""}`}
              title={`Semana ${i + 1} (${fmtData(w.de)} a ${fmtData(w.ate)})${w.nota !== null ? `: ${Math.round(w.nota * 100)}%` : ""}`}>
              {w.nota !== null && <span className="absolute inset-x-0 bottom-0" style={{ height: `${Math.max(6, w.nota * 100)}%`, background: corDaNota(w.nota) }} />}
            </span>
          ))}
        </div>
      </div>

      {/* as metas */}
      {s.metas.length === 0 ? (
        <Link href="/season" className="flex items-center gap-2 px-4 py-4 text-sm text-muted hover:text-ink"><Plus size={15} /> Nenhuma meta nesta Season ainda: escolha de 1 a 3 (livros, aulas, cartões do Anki…).</Link>
      ) : (
        <div className={gradeDeMetas(s.metas.length)}>
          {s.metas.map(({ m, p }) => {
            const area = AREAS.find((a) => a.id === m.area)!;
            return (
              <CartaoMeta key={m.id} m={m} p={p} href={`/season#meta-${m.id}`} corArea={area.cor}
                nomeArea={m.area === "idiomas" && s.idioma ? s.idioma : area.nome}
                rodape={m.tipo === "contagem" && p.estado !== "feita" && (
                  <button className="btn py-0.5 px-2 text-xs" title={`Marcar 1 ${(m.unidade || "item").replace(/s$/, "")} feita hoje`} onClick={() => void maisUm(m)}><Plus size={12} /> 1</button>
                )} />
            );
          })}
        </div>
      )}
    </section>
  );
}
