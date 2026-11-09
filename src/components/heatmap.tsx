"use client";
import { useMemo, useState } from "react";
import { addDays, dayKey, DIAS, fmtDayLong, MESES, nf, weekStart } from "@/lib/dates";
import { DayStats, Metric, METRICS, metricValue } from "@/lib/stats";

const CELL = 12;
const GAP = 3;

/** Heatmap estilo "Review Heatmap": uma coluna por semana, linhas seg→dom. */
export function Heatmap({
  data,
  metric,
  weeks = 53,
  end = new Date(),
  onSelect,
  selected,
}: {
  data: Map<string, DayStats>;
  metric: Metric;
  weeks?: number;
  end?: Date;
  onSelect?: (day: string) => void;
  selected?: string | null;
}) {
  const [hover, setHover] = useState<{ day: string; x: number; y: number } | null>(null);
  const unit = METRICS.find((m) => m.id === metric)!.unit;
  const today = dayKey();

  const { cells, months, thresholds, tLidas, tEscritas } = useMemo(() => {
    const first = addDays(weekStart(end), -(weeks - 1) * 7);
    const cells: { day: string; w: number; d: number; v: number; future: boolean }[] = [];
    const months: { w: number; label: string }[] = [];
    const values: number[] = [];
    let lastMonth = -1;
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const date = addDays(first, w * 7 + d);
        const k = dayKey(date);
        const v = metricValue(data.get(k), metric);
        const future = k > today;
        cells.push({ day: k, w, d, v, future });
        if (v > 0) values.push(v);
        if (d === 0 && date.getMonth() !== lastMonth) {
          lastMonth = date.getMonth();
          months.push({ w, label: MESES[lastMonth] });
        }
      }
    }
    const quart = (vs: number[]) => {
      vs.sort((a, b) => a - b);
      const q = (p: number) => vs[Math.min(vs.length - 1, Math.floor(p * vs.length))] ?? 0;
      return vs.length ? [q(0.2), q(0.4), q(0.6), q(0.8)] : [1, 2, 3, 4];
    };
    const thresholds = quart(values);
    // leitura × escrita: cada série com a própria escala (lemos milhares de palavras, escrevemos centenas)
    const lidas: number[] = [];
    const escritas: number[] = [];
    if (metric === "io") for (const c of cells) {
      const st = data.get(c.day);
      if (st?.words) lidas.push(st.words);
      if (st?.written) escritas.push(st.written);
    }
    const tLidas = quart(lidas);
    const tEscritas = quart(escritas);
    return { cells, months, thresholds, tLidas, tEscritas };
  }, [data, metric, weeks, end, today]);

  const nivel = (v: number, ts: number[]) => {
    if (v <= 0) return 0;
    let l = 1;
    for (const t of ts) if (v > t) l++;
    return Math.min(5, l);
  };
  const level = (v: number) => nivel(v, thresholds);
  /** cor da célula: em "leitura × escrita", laranja = dia de escrita (saída), azul = só leitura (entrada) */
  const cor = (day: string, v: number) => {
    if (metric === "escritas") return `var(--out-${level(v)})`;
    if (metric !== "io") return `var(--heat-${level(v)})`;
    const st = data.get(day);
    if (st?.written) return `var(--out-${nivel(st.written, tEscritas)})`;
    return `var(--heat-${nivel(st?.words ?? 0, tLidas)})`;
  };

  const left = 26;
  const top = 16;
  const width = left + weeks * (CELL + GAP);
  const height = top + 7 * (CELL + GAP);

  return (
    <div className="relative">
      <div className="overflow-x-auto pb-1">
        <svg width={width} height={height} role="img" aria-label={`Heatmap de ${unit}`} className="block">
          {months.map((m) => (
            <text key={`${m.w}-${m.label}`} x={left + m.w * (CELL + GAP)} y={10} fontSize={10} fill="var(--muted)">
              {m.label}
            </text>
          ))}
          {[0, 2, 4].map((d) => (
            <text key={d} x={0} y={top + d * (CELL + GAP) + 10} fontSize={10} fill="var(--muted)">
              {DIAS[d]}
            </text>
          ))}
          {cells.map((c) =>
            c.future ? null : (
              <rect
                key={c.day}
                x={left + c.w * (CELL + GAP)}
                y={top + c.d * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={3}
                fill={cor(c.day, c.v)}
                stroke={selected === c.day ? "var(--text)" : c.day === today ? "var(--muted)" : "none"}
                strokeWidth={selected === c.day ? 2 : 1}
                style={{ cursor: onSelect ? "pointer" : "default" }}
                onMouseEnter={(e) => {
                  const r = (e.target as SVGRectElement).getBoundingClientRect();
                  const p = (e.currentTarget.ownerSVGElement!.parentElement!.parentElement as HTMLElement).getBoundingClientRect();
                  setHover({ day: c.day, x: r.left - p.left + CELL / 2, y: r.top - p.top });
                }}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect?.(c.day)}
              />
            ),
          )}
        </svg>
      </div>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md px-2.5 py-1.5 text-xs shadow-lg whitespace-nowrap"
          style={{ left: hover.x, top: hover.y - 6, background: "var(--text)", color: "var(--bg)" }}
        >
          <div className="font-medium">
            {metric === "io"
              ? `${nf.format(data.get(hover.day)?.words ?? 0)} lidas · ${nf.format(data.get(hover.day)?.written ?? 0)} escritas`
              : `${nf.format(metricValue(data.get(hover.day), metric))} ${unit}`}
          </div>
          <div className="opacity-80">{fmtDayLong(hover.day)}</div>
        </div>
      )}
      <div className="flex items-center gap-1.5 mt-2 text-xs text-muted justify-end">
        {metric === "io" ? (
          <>
            <span className="inline-block rounded-[3px]" style={{ width: 11, height: 11, background: "var(--heat-4)" }} /> leitura (entrada)
            <span className="inline-block rounded-[3px] ml-3" style={{ width: 11, height: 11, background: "var(--out-4)" }} /> escrita (saída)
          </>
        ) : (
          <>
            menos
            {[0, 1, 2, 3, 4, 5].map((l) => (
              <span key={l} className="inline-block rounded-[3px]" style={{ width: 11, height: 11, background: `var(--${metric === "escritas" && l ? "out" : "heat"}-${l})` }} />
            ))}
            mais
          </>
        )}
      </div>
    </div>
  );
}
