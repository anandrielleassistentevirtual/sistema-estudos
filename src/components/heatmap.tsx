"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { addDays, dayKey, DIAS, fmtDayLong, MESES, nf, weekStart } from "@/lib/dates";
import { DayStats, Metric, METRICS, metricValue } from "@/lib/stats";

const CELL = 12;
const GAP = 3;
const PASSO = CELL + GAP;

/**
 * Heatmap estilo "Review Heatmap": uma coluna por semana, linhas seg→dom.
 * - Mouse: passar por cima mostra o dia.
 * - Celular: tocar num quadradinho mostra o dia (o vão entre eles também conta); tocar fora fecha.
 *   O ano não cabe na largura: começa nas semanas mais recentes e rola para os lados,
 *   com os dias da semana sempre visíveis à esquerda.
 */
export function Heatmap({
  data,
  metric,
  weeks = 53,
  end = new Date(),
  onSelect,
  selected,
  unidade,
  paleta,
}: {
  data: Map<string, DayStats>;
  metric: Metric;
  weeks?: number;
  end?: Date;
  onSelect?: (day: string) => void;
  selected?: string | null;
  /** nome da quantidade na dica (padrão: o da métrica) */
  unidade?: string;
  /** escala de cores (padrão: azul; "escritas" usa laranja) */
  paleta?: "heat" | "out" | "ama";
}) {
  const [hover, setHover] = useState<{ day: string; x: number; y: number } | null>(null);
  const unit = unidade ?? METRICS.find((m) => m.id === metric)!.unit;
  const today = dayKey();
  const raiz = useRef<HTMLDivElement>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  // há semanas escondidas à esquerda (mostra um esmaecido indicando que dá para rolar)
  const [maisAntigas, setMaisAntigas] = useState(false);

  // quando o ano não cabe na largura (celular), começa mostrando as semanas mais recentes, à direita
  const fimKey = dayKey(end);
  useLayoutEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    setMaisAntigas(el.scrollLeft > 4);
  }, [weeks, fimKey]);

  // dica aberta por toque: fecha ao tocar fora
  useEffect(() => {
    if (!hover) return;
    const fora = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) setHover(null); };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [hover]);

  const { cells, months, thresholds, first } = useMemo(() => {
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
    return { cells, months, thresholds, first };
  }, [data, metric, weeks, end, today]);

  const nivel = (v: number, ts: number[]) => {
    if (v <= 0) return 0;
    let l = 1;
    for (const t of ts) if (v > t) l++;
    return Math.min(5, l);
  };
  const level = (v: number) => nivel(v, thresholds);
  /** escrita (saída) em laranja; o resto em azul */
  const escala = paleta ?? (metric === "escritas" ? "out" : "heat");
  const cor = (v: number) => `var(--${v > 0 ? escala : "heat"}-${level(v)})`;

  const left = 26; // coluna fixa com os dias da semana
  const top = 16;
  const width = weeks * PASSO;
  const height = top + 7 * PASSO;

  /** dia sob o ponteiro: a célula inteira mais o vão até a próxima (alvo maior para o dedo) */
  function diaEm(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const w = Math.floor((e.clientX - r.left) / PASSO);
    const d = Math.floor((e.clientY - r.top - top) / PASSO);
    if (w < 0 || w >= weeks || d < 0 || d > 6) return null;
    const k = dayKey(addDays(first, w * 7 + d));
    return k > today ? null : { k, w, d };
  }
  function mostrar(alvo: { k: string; w: number; d: number }, svg: SVGSVGElement) {
    const r = svg.getBoundingClientRect();
    const p = raiz.current!.getBoundingClientRect();
    setHover({ day: alvo.k, x: r.left - p.left + alvo.w * PASSO + CELL / 2, y: r.top - p.top + top + alvo.d * PASSO });
  }

  // a dica não passa das bordas do quadro
  const larguraRaiz = raiz.current?.clientWidth ?? 0;
  const ancora = !hover ? "-translate-x-1/2" : hover.x < 80 ? "translate-x-[-12px]" : larguraRaiz && hover.x > larguraRaiz - 80 ? "translate-x-[calc(-100%+12px)]" : "-translate-x-1/2";

  return (
    <div ref={raiz} className="relative select-none">
      <div className="flex">
        {/* dias da semana: ficam no lugar enquanto as semanas rolam */}
        <svg width={left} height={height} aria-hidden className="block shrink-0">
          {[0, 2, 4].map((d) => (
            <text key={d} x={0} y={top + d * PASSO + 10} fontSize={10} fill="var(--muted)">
              {DIAS[d]}
            </text>
          ))}
        </svg>
        <div className="relative min-w-0 flex-1">
          <div ref={rolagem} className="overflow-x-auto overscroll-x-contain no-scrollbar"
            onScroll={(e) => { setMaisAntigas(e.currentTarget.scrollLeft > 4); setHover(null); }}>
            <svg width={width} height={height} role="img" aria-label={`Calendário de ${unit}, ${weeks} semanas`} className="block"
              style={{ cursor: onSelect ? "pointer" : "default" }}
              onPointerMove={(e) => {
                if (e.pointerType !== "mouse") return;
                const a = diaEm(e);
                if (a) mostrar(a, e.currentTarget); else setHover(null);
              }}
              onPointerLeave={(e) => { if (e.pointerType === "mouse") setHover(null); }}
              onClick={(e) => {
                const a = diaEm(e as unknown as React.PointerEvent<SVGSVGElement>);
                if (!a) return;
                // toque: abre a dica do dia; tocar de novo no mesmo dia fecha
                const mouse = (e.nativeEvent as PointerEvent).pointerType === "mouse";
                if (!mouse && hover?.day === a.k && !onSelect) setHover(null); else mostrar(a, e.currentTarget);
                onSelect?.(a.k);
              }}>
              {months.map((m) => (
                <text key={`${m.w}-${m.label}`} x={m.w * PASSO} y={10} fontSize={10} fill="var(--muted)">
                  {m.label}
                </text>
              ))}
              {cells.map((c) =>
                c.future ? null : (
                  <rect
                    key={c.day}
                    x={c.w * PASSO}
                    y={top + c.d * PASSO}
                    width={CELL}
                    height={CELL}
                    rx={3}
                    fill={cor(c.v)}
                    stroke={selected === c.day || hover?.day === c.day ? "var(--text)" : c.day === today ? "var(--muted)" : "none"}
                    strokeWidth={selected === c.day || hover?.day === c.day ? 2 : 1}
                  />
                ),
              )}
            </svg>
          </div>
          {/* há semanas mais antigas à esquerda */}
          {maisAntigas && <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-surface to-transparent" />}
        </div>
      </div>
      {hover && (
        <div
          className={`pointer-events-none absolute z-10 ${ancora} -translate-y-full rounded-md px-2.5 py-1.5 text-xs shadow-lg whitespace-nowrap`}
          style={{ left: hover.x, top: hover.y - 6, background: "var(--text)", color: "var(--bg)" }}
          role="status"
        >
          <div className="font-medium tabular-nums">
            {`${nf.format(metricValue(data.get(hover.day), metric))} ${unit}`}
          </div>
          <div className="opacity-80">{fmtDayLong(hover.day)}</div>
        </div>
      )}
      <div className="flex items-center gap-1.5 mt-2 text-xs text-muted justify-end">
        <span className="mr-auto text-[11px] text-faint md:hidden whitespace-nowrap">{maisAntigas ? "← deslize: meses anteriores" : ""}</span>
        menos
        {[0, 1, 2, 3, 4, 5].map((l) => (
          <span key={l} className="inline-block rounded-[3px]" style={{ width: 11, height: 11, background: `var(--${l ? escala : "heat"}-${l})` }} />
        ))}
        mais
      </div>
    </div>
  );
}
