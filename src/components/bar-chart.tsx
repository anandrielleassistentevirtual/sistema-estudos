"use client";
import { useState } from "react";
import { nf } from "@/lib/dates";

/** Barras verticais de uma série (ex.: palavras por semana). */
export function BarChart({
  data,
  unit,
  height = 160,
  average,
}: {
  data: { label: string; value: number; detail?: string }[];
  unit: string;
  height?: number;
  average?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value), average ?? 0);
  const nice = niceMax(max);
  const W = 100 / data.length;
  return (
    <div className="relative" style={{ height: height + 22 }}>
      <div className="absolute left-0 right-9 top-0" style={{ height }}>
        {[0.5, 1].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: f * height }}>
            <span className="absolute -top-2 -right-9 w-8 text-left z-10 text-[10px] text-faint pl-1">{nf.format(nice * f)}</span>
          </div>
        ))}
        <div className="absolute inset-x-0 bottom-0 border-t border-line" />
        {average !== undefined && average > 0 && (
          <div className="absolute inset-x-0 border-t-2 border-faint/70" style={{ bottom: (average / nice) * height }}>
            <span className="absolute -top-4 left-0 text-[10px] text-muted bg-surface pr-1">média {nf.format(Math.round(average))}</span>
          </div>
        )}
        {data.map((d, i) => (
          <div
            key={i}
            className="absolute bottom-0 flex justify-center"
            style={{ left: `${i * W}%`, width: `${W}%`, height }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div
              className="absolute bottom-0 rounded-t-[4px] transition-opacity"
              style={{
                width: "62%",
                height: `${(d.value / nice) * 100}%`,
                background: "linear-gradient(to top, color-mix(in srgb, var(--chart) 35%, transparent), var(--chart))",
                opacity: hover === null || hover === i ? 1 : 0.55,
              }}
            />
          </div>
        ))}
      </div>
      <div className="absolute left-0 right-9 bottom-0 flex text-[10px] text-faint">
        {data.map((d, i) => (
          <div key={i} className="text-center whitespace-nowrap flex justify-center" style={{ width: `${W}%` }}>
            {/* rótulos espaçados para caber: no celular cada barra é estreita demais para um rótulo próprio */}
            <span>{i % Math.ceil(data.length / 6) === 0 ? d.label : ""}</span>
          </div>
        ))}
      </div>
      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md px-2.5 py-1.5 text-xs shadow-lg whitespace-nowrap"
          style={{ left: `calc((100% - 2.25rem) * ${(hover + 0.5) / data.length})`, top: 0, background: "var(--text)", color: "var(--bg)" }}
        >
          <div className="font-medium">
            {nf.format(data[hover].value)} {unit}
          </div>
          <div className="opacity-80">{data[hover].detail ?? data[hover].label}</div>
        </div>
      )}
    </div>
  );
}

function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
