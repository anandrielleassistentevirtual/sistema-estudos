"use client";
import { useEffect, useState } from "react";
import { Heatmap } from "@/components/heatmap";
import { addDays, dayKey, weekStart } from "@/lib/dates";
import { DayStats, inicio12Meses, loadDaily, Metric, METRICS } from "@/lib/stats";

export function CalendarPanel({ compacto = false }: { compacto?: boolean }) {
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
  useEffect(() => { void loadDaily(desde).then(setDaily); }, [desde]);

  const end = year === "12m" ? new Date() : new Date(year, 11, 31);
  const weeks = year === "12m" ? 53 : Math.ceil((end.getTime() - weekStart(new Date(year, 0, 1)).getTime()) / (7 * 864e5));
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <section id="calendario" className={compacto ? "card p-4 scroll-mt-4 min-w-0" : "mt-4 scroll-mt-4"}>
      <div className={`flex flex-wrap items-center gap-2 ${compacto ? "mb-2" : "mb-3"}`}>
        <h2 className="font-medium mr-auto">Calendário</h2>
        <div className={`inline-flex rounded-lg bg-surface-2 p-1 ${compacto ? "text-xs" : "text-sm"}`}>
          {METRICS.map((m) => (
            <button key={m.id} onClick={() => setMetric(m.id)}
              className={`${compacto ? "px-2.5 py-1" : "px-3 py-1.5"} rounded-md ${metric === m.id ? "bg-seg shadow-sm font-medium" : "text-muted"}`}>
              {m.label}
            </button>
          ))}
        </div>
        <select className={`input w-auto ${compacto ? "py-1 text-xs" : ""}`} value={year} onChange={(e) => setYear(e.target.value === "12m" ? "12m" : Number(e.target.value))}>
          <option value="12m">Últimos 12 meses</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {compacto ? (
        <Heatmap data={daily} metric={metric} weeks={weeks} end={end} encaixar />
      ) : (
        <div className="card p-5">
          <Heatmap data={daily} metric={metric} weeks={weeks} end={end} />
        </div>
      )}
    </section>
  );
}
