"use client";
import { useEffect, useMemo, useState } from "react";
import { Page, Stat } from "@/components/page";
import { Heatmap } from "@/components/heatmap";
import { addDays, dayKey, fmtDayLong, fmtDuration, nf, weekStart } from "@/lib/dates";
import { DayStats, loadDaily, Metric, METRICS, metricValue } from "@/lib/stats";

export default function Calendario() {
  const [year, setYear] = useState<number | "12m">("12m");
  const [metric, setMetric] = useState<Metric>("tempo");
  const [daily, setDaily] = useState<Map<string, DayStats>>(new Map());
  const [sel, setSel] = useState<string | null>(dayKey());

  useEffect(() => {
    void loadDaily(dayKey(addDays(weekStart(new Date()), -6 * 53 * 7))).then(setDaily);
  }, []);

  const end = year === "12m" ? new Date() : new Date(year, 11, 31);
  const weeks = year === "12m" ? 53 : Math.ceil((end.getTime() - weekStart(new Date(year, 0, 1)).getTime()) / (7 * 864e5));
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  const summary = useMemo(() => {
    const start = addDays(weekStart(end), -(weeks - 1) * 7);
    let total = 0, active = 0, best = 0, bestDay = "", cur = 0, longest = 0;
    for (let d = new Date(start); d <= end && dayKey(d) <= dayKey(); d = addDays(d, 1)) {
      const v = metricValue(daily.get(dayKey(d)), metric);
      total += v;
      if (v > 0) { active++; cur++; longest = Math.max(longest, cur); } else cur = 0;
      if (v > best) { best = v; bestDay = dayKey(d); }
    }
    return { total, active, best, bestDay, longest, avg: active ? total / active : 0 };
  }, [daily, metric, weeks, end]);

  const unit = METRICS.find((m) => m.id === metric)!.unit;
  const fmt = (v: number) => (metric === "tempo" ? fmtDuration(v * 60) : `${nf.format(Math.round(v))} ${unit}`);
  const d = sel ? daily.get(sel) : undefined;

  return (
    <Page title="Calendário" subtitle="Cada quadrado é um dia. Quanto mais intensa a cor, mais estudo.">
      <div className="flex flex-wrap gap-2 mb-4">
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
        <Heatmap data={daily} metric={metric} weeks={weeks} end={end} onSelect={setSel} selected={sel} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        <Stat label="Total no período" value={fmt(summary.total)} />
        <Stat label="Dias ativos" value={nf.format(summary.active)} hint={`média de ${fmt(summary.avg)} por dia ativo`} />
        <Stat label="Maior sequência" value={`${summary.longest} dias`} />
        <Stat label="Melhor dia" value={summary.best ? fmt(summary.best) : "—"} hint={summary.bestDay ? fmtDayLong(summary.bestDay) : undefined} />
      </div>
      {sel && (
        <div className="card p-5 mt-4">
          <h2 className="font-semibold first-letter:uppercase">{fmtDayLong(sel)}</h2>
          <dl className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3 text-sm">
            <div><dt className="text-muted">Timer</dt><dd className="font-medium">{fmtDuration(d?.study ?? 0)}</dd></div>
            <div><dt className="text-muted">Leitura</dt><dd className="font-medium">{fmtDuration(d?.reading ?? 0)}</dd></div>
            <div><dt className="text-muted">Palavras</dt><dd className="font-medium">{nf.format(d?.words ?? 0)}</dd></div>
            <div><dt className="text-muted">Frases / escutas</dt><dd className="font-medium">{nf.format(d?.reads ?? 0)} / {nf.format(d?.listens ?? 0)}</dd></div>
            <div><dt className="text-muted">Anki</dt><dd className="font-medium">{nf.format(d?.anki ?? 0)} revisões</dd></div>
          </dl>
        </div>
      )}
    </Page>
  );
}
