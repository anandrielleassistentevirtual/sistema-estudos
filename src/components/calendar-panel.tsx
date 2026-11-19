"use client";
import { useEffect, useState } from "react";
import { Heatmap } from "@/components/heatmap";
import { addDays, dayKey, parseDay, weekStart } from "@/lib/dates";
import { semanasDoPeriodo, type Periodo } from "@/lib/periodo";
import { DayStats, inicio12Meses, loadDaily, Metric, METRICS } from "@/lib/stats";

const COR_METRICA: Record<Metric, string> = { tempo: "var(--heat-4)", palavras: "var(--area-leitura)", escritas: "var(--area-escrita)", anki: "var(--area-idiomas)" };

/** Com `periodo` (filtro do painel): mostra só esse período, com as cores calculadas dentro dele. */
export function CalendarPanel({ compacto = false, periodo }: { compacto?: boolean; periodo?: Periodo }) {
  const [year, setYear] = useState<number | "12m">("12m");
  const [metric, setMetric] = useState<Metric>("tempo");
  const [daily, setDaily] = useState<Map<string, DayStats>>(new Map());

  // começa com os últimos 12 meses (a mesma consulta do Dashboard); anos antigos só quando escolhidos
  const [desde, setDesde] = useState(inicio12Meses);
  useEffect(() => {
    if (year === "12m") return;
    const ini = dayKey(addDays(weekStart(new Date(year, 0, 1)), -7));
    if (ini < desde) setDesde(ini);
  }, [year, desde]);
  // período antigo escolhido no filtro: busca desde o começo dele
  useEffect(() => {
    if (!periodo) return;
    const ini = dayKey(addDays(weekStart(parseDay(periodo.de)), -7));
    if (ini < desde) setDesde(ini);
  }, [periodo?.de, desde]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadDaily(desde).then(setDaily); }, [desde]);

  const end = periodo ? parseDay(periodo.ate) : year === "12m" ? new Date() : new Date(year, 11, 31);
  // períodos curtos (uma semana, alguns dias) mostram pelo menos 5 semanas: o período em destaque e as
  // semanas de antes esmaecidas, como contexto (uma linha solta deixava o cartão quase vazio)
  const weeks = periodo ? Math.max(5, semanasDoPeriodo(periodo)) : year === "12m" ? 53 : Math.ceil((end.getTime() - weekStart(new Date(year, 0, 1)).getTime()) / (7 * 864e5));
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    // tudo num cartão só (título, filtros e calendário); o calendário sempre cabe na largura, sem rolar
    <section id="calendario" className={`card scroll-mt-4 min-w-0 flex flex-col ${compacto ? "p-4" : "mt-4 p-4 md:p-5"}`}>
      <div className={`flex flex-wrap items-center gap-2 ${compacto ? "mb-2" : "mb-3"}`}>
        <h2 className="card-title mr-auto">Calendário</h2>
        {/* celular: as métricas ganham a linha toda, embaixo do título */}
        <div className={`seg order-last sm:order-none w-full sm:w-auto flex sm:inline-flex ${compacto ? "" : "seg-md"}`}>
          {METRICS.map((m) => (
            <button key={m.id} onClick={() => setMetric(m.id)} aria-pressed={metric === m.id}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 ${compacto ? "" : "px-3"}`}>
              {/* a bolinha diz a cor do calendário nessa métrica (a cor da área: escrita laranja, Anki verde…) */}
              <span className="dot !w-1.5 !h-1.5" style={{ background: COR_METRICA[m.id], opacity: metric === m.id ? 1 : 0.6 }} aria-hidden />
              {m.label}
            </button>
          ))}
        </div>
        {!periodo && (
          <select className={`input w-auto py-1 pr-7 ${compacto ? "text-xs" : ""}`} value={year} onChange={(e) => setYear(e.target.value === "12m" ? "12m" : Number(e.target.value))}>
            <option value="12m">Últimos 12 meses</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>
      <div className="flex-1 flex flex-col justify-center min-w-0">
        <Heatmap data={daily} metric={metric} weeks={weeks} end={end} inicio={periodo?.de} fim={periodo?.ate} />
      </div>
    </section>
  );
}
