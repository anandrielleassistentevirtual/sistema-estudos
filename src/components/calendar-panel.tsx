"use client";
import { useEffect, useState } from "react";
import { Heatmap } from "@/components/heatmap";
import { addDays, dayKey, weekStart } from "@/lib/dates";
import { DayStats, loadDaily, Metric, METRICS } from "@/lib/stats";

export function CalendarPanel() {
  const [year, setYear] = useState<number | "12m">("12m");
  const [metric, setMetric] = useState<Metric>("tempo");
  const [daily, setDaily] = useState<Map<string, DayStats>>(new Map());

  useEffect(() => {
    void loadDaily(dayKey(addDays(weekStart(new Date()), -6 * 53 * 7))).then(setDaily);
  }, []);

  const end = year === "12m" ? new Date() : new Date(year, 11, 31);
  const weeks = year === "12m" ? 53 : Math.ceil((end.getTime() - weekStart(new Date(year, 0, 1)).getTime()) / (7 * 864e5));
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <section id="calendario" className="mt-4 scroll-mt-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="font-semibold mr-auto">Calendário</h2>
        <div className="inline-flex rounded-lg bg-surface-2 p-1 text-sm">
          {METRICS.map((m) => (
            <button key={m.id} onClick={() => setMetric(m.id)}
              className={`px-3 py-1.5 rounded-md ${metric === m.id ? "bg-surface shadow-sm font-medium" : "text-muted"}`}>
              {m.label}
            </button>
          ))}
        </div>
        <select className="input w-auto" value={year} onChange={(e) => setYear(e.target.value === "12m" ? "12m" : Number(e.target.value))}>
          <option value="12m">Últimos 12 meses</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="card p-5">
        <Heatmap data={daily} metric={metric} weeks={weeks} end={end} />
      </div>
    </section>
  );
}
