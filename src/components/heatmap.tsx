"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { addDays, dayKey, DIAS, fmtDayLong, MESES, nf, weekStart } from "@/lib/dates";
import { DayStats, Metric, METRICS, metricValue } from "@/lib/stats";

/** passo (quadradinho + vão) no computador */
const PASSO_MAX = 15;
/** abaixo disso o quadradinho fica pequeno demais para ler e tocar: o ano se divide em faixas */
const PASSO_MIN = 9.5;
const ENTRE_FAIXAS = 8;
const TOPO = 13; // altura dos nomes dos meses

/**
 * Heatmap estilo "Review Heatmap": uma coluna por semana, linhas seg→dom.
 * Cabe sempre na largura, sem rolar para os lados: no computador é uma faixa só;
 * no celular o período se divide em faixas empilhadas (a de cima é a mais antiga).
 * - Mouse: passar por cima mostra o dia.
 * - Toque: tocar num quadradinho mostra o dia (o vão entre eles também conta); tocar fora fecha.
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
  inicio,
  fim,
  ladoMaximo,
}: {
  data: Map<string, DayStats>;
  metric: Metric;
  weeks?: number;
  end?: Date;
  onSelect?: (day: string) => void;
  selected?: string | null;
  /** nome da quantidade na dica (padrão: o da métrica) */
  unidade?: string;
  /** escala de cores (padrão: azul; "escritas" usa laranja e o Anki verde, as cores das áreas) */
  paleta?: "heat" | "out" | "ama" | "verde";
  /** período escolhido no filtro (aaaa-mm-dd): os dias de fora ficam apagados e as cores se calculam só com os de dentro */
  inicio?: string;
  fim?: string;
  /** altura máxima de cada dia no calendário de semana/mês (px), para telas apertadas (ex.: Idiomas) */
  ladoMaximo?: number;
}) {
  const [hover, setHover] = useState<{ day: string; x: number; y: number } | null>(null);
  const unit = unidade ?? METRICS.find((m) => m.id === metric)!.unit;
  const today = dayKey();
  const raiz = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);

  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    setLargura(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setLargura(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // dica aberta por toque: fecha ao tocar fora
  useEffect(() => {
    if (!hover) return;
    const fora = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) setHover(null); };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [hover]);

  // geometria: quantas faixas e o tamanho do quadradinho para caber na largura
  const rotulo = largura && largura < 480 ? 22 : 26; // coluna dos dias da semana
  const util = Math.max(0, (largura || 9999) - rotulo);
  let faixas = 1;
  while (faixas < 4 && Math.ceil(weeks / faixas) * PASSO_MIN > util) faixas++;
  const porFaixa = Math.ceil(weeks / faixas);
  // períodos curtos (uma semana, um mês) ganham quadradinhos maiores
  const passoMax = weeks <= 6 ? 30 : weeks <= 14 ? 21 : PASSO_MAX;
  const passo = Math.min(passoMax, util / porFaixa);
  const cel = passo * 0.8;
  // a primeira faixa (a mais antiga) é a que fica mais curta, alinhada à direita como as outras
  const sobra = faixas * porFaixa - weeks;
  const alturaFaixa = TOPO + 7 * passo;
  const altura = faixas * alturaFaixa + (faixas - 1) * ENTRE_FAIXAS;
  const largSvg = rotulo + porFaixa * passo;
  const pos = (w: number) => {
    const k = w + sobra;
    return { f: Math.floor(k / porFaixa), c: k % porFaixa };
  };

  const { cells, months, thresholds, first } = useMemo(() => {
    const first = addDays(weekStart(end), -(weeks - 1) * 7);
    const cells: { day: string; w: number; d: number; v: number; future: boolean; fora: boolean }[] = [];
    const months: { w: number; label: string }[] = [];
    const values: number[] = [];
    let lastMonth = -1;
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const date = addDays(first, w * 7 + d);
        const k = dayKey(date);
        const v = metricValue(data.get(k), metric);
        const future = k > today;
        const fora = !!(inicio && fim && (k < inicio || k > fim));
        cells.push({ day: k, w, d, v, future, fora });
        if (v > 0 && !fora) values.push(v);
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
  }, [data, metric, weeks, end, today, inicio, fim]);

  // nomes dos meses por faixa; cada faixa começa dizendo em que mês está (se o mês não muda logo em seguida)
  const rotulosMeses = useMemo(() => {
    const out: { f: number; c: number; label: string }[] = months.map((m) => ({ ...pos(m.w), label: m.label }));
    for (let f = 1; f < faixas; f++) {
      const w0 = f * porFaixa - sobra;
      if (out.some((m) => m.f === f && m.c < 3)) continue;
      const mes = addDays(first, w0 * 7).getMonth();
      out.push({ f, c: 0, label: MESES[mes] });
    }
    // sem encavalar: some o rótulo que ficaria colado no anterior da mesma faixa
    // e o que não cabe antes da borda direita (seria cortado)
    return out.sort((a, b) => a.f - b.f || a.c - b.c)
      .filter((m, i, l) => !(l[i - 1]?.f === m.f && (m.c - l[i - 1].c) * passo < 24))
      .filter((m) => (porFaixa - m.c) * passo >= 18);
  }, [months, faixas, porFaixa, sobra, first, passo]); // eslint-disable-line react-hooks/exhaustive-deps

  const nivel = (v: number, ts: number[]) => {
    if (v <= 0) return 0;
    let l = 1;
    for (const t of ts) if (v > t) l++;
    return Math.min(5, l);
  };
  /** as cores das áreas: escrita em laranja, Anki (Idiomas) em verde; tempo e leitura em azul */
  const escala = paleta ?? (metric === "escritas" ? "out" : metric === "anki" ? "verde" : "heat");
  const cor = (v: number) => `var(--${v > 0 ? escala : "heat"}-${nivel(v, thresholds)})`;
  const x = (c: number) => rotulo + c * passo;
  const y = (f: number, d: number) => f * (alturaFaixa + ENTRE_FAIXAS) + TOPO + d * passo;

  /** dia sob o ponteiro: o quadradinho inteiro mais o vão até o próximo (alvo maior para o dedo) */
  function diaEm(e: { clientX: number; clientY: number; currentTarget: SVGSVGElement }) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left - rotulo;
    const py = e.clientY - r.top;
    const f = Math.floor(py / (alturaFaixa + ENTRE_FAIXAS));
    const d = Math.floor((py - f * (alturaFaixa + ENTRE_FAIXAS) - TOPO) / passo);
    const c = Math.floor(px / passo);
    const w = f * porFaixa + c - sobra;
    if (px < 0 || c >= porFaixa || f < 0 || f >= faixas || d < 0 || d > 6 || w < 0 || w >= weeks) return null;
    const k = dayKey(addDays(first, w * 7 + d));
    return k > today ? null : { k, f, c, d };
  }
  function mostrar(a: { k: string; f: number; c: number; d: number }, svg: SVGSVGElement) {
    const r = svg.getBoundingClientRect();
    const p = raiz.current!.getBoundingClientRect();
    setHover({ day: a.k, x: r.left - p.left + x(a.c) + cel / 2, y: r.top - p.top + y(a.f, a.d) });
  }

  // a dica não passa das bordas do quadro
  const ancora = !hover ? "-translate-x-1/2" : hover.x < 80 ? "translate-x-[-12px]" : largura && hover.x > largura - 80 ? "translate-x-[calc(-100%+12px)]" : "-translate-x-1/2";

  // a mesma dica (balão) para o calendário anual e o de mês
  const dica = hover && (
    <div
      className={`pointer-events-none absolute z-10 ${ancora} -translate-y-full rounded-md px-2.5 py-1.5 text-xs shadow-lg whitespace-nowrap`}
      style={{ left: hover.x, top: hover.y - 6, background: "var(--text)", color: "var(--bg)" }}
      role="status"
    >
      <div className="font-medium tabular-nums">{`${nf.format(metricValue(data.get(hover.day), metric))} ${unit}`}</div>
      <div className="opacity-80">{fmtDayLong(hover.day)}</div>
    </div>
  );

  // períodos curtos (até 6 semanas): calendário de mês, mais fácil de ler que uma ou duas colunas soltas
  if (weeks <= 6) {
    const mostrarCelula = (el: HTMLElement, dia: string) => {
      const r = el.getBoundingClientRect();
      const p = raiz.current!.getBoundingClientRect();
      setHover({ day: dia, x: r.left - p.left + r.width / 2, y: r.top - p.top });
    };
    const nomes = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
    // as 7 colunas ocupam a largura toda do quadro (sem sobra à direita); a altura tem teto
    // (mais alta numa semana, mais baixa com 5–6 semanas) para o painel continuar cabendo na tela
    const maximo = Math.min(ladoMaximo ?? Infinity, weeks <= 2 ? 46 : weeks <= 4 ? 40 : 34);
    const lado = largura ? Math.min(maximo, (largura - 6 * 5) / 7) : maximo;
    const linhas = Array.from({ length: weeks }, (_, w) => cells.filter((c) => c.w === w));
    return (
      <div ref={raiz} className="relative select-none">
        <div className="grid gap-[5px]" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
          {nomes.map((n) => <div key={n} className="text-[10px] text-muted text-center">{n}</div>)}
          {linhas.flat().map((c) => {
            const dia = Number(c.day.slice(8));
            // fora do período: a cor do dia, bem apagada (contexto); futuro: vazio
            const fundo = c.future ? "var(--heat-0)" : cor(c.v);
            const forte = !c.future && !c.fora && nivel(c.v, thresholds) >= 3;
            return (
              <div key={c.day}
                onPointerEnter={(e) => { if (e.pointerType === "mouse" && !c.future) mostrarCelula(e.currentTarget, c.day); }}
                onPointerLeave={(e) => { if (e.pointerType === "mouse") setHover(null); }}
                onClick={(e) => {
                  if (c.future) return;
                  // toque: abre a dica do dia; tocar de novo no mesmo dia fecha
                  if ((e.nativeEvent as PointerEvent).pointerType !== "mouse" && hover?.day === c.day && !onSelect) setHover(null);
                  else mostrarCelula(e.currentTarget, c.day);
                  onSelect?.(c.day);
                }}
                className={`rounded-md grid place-items-center text-[11px] tabular-nums ${onSelect && !c.future ? "cursor-pointer" : ""}`}
                style={{ height: lado, background: fundo, opacity: c.future ? 0.25 : c.fora ? 0.3 : 1, color: forte ? "#fff" : "var(--muted)",
                  outline: c.day === today ? "1.5px solid var(--muted)" : selected === c.day ? "2px solid var(--text)" : undefined }}>
                {dia}
              </div>
            );
          })}
        </div>
        {dica}
        <div className="flex items-center gap-1 mt-1.5 text-[11px] text-muted justify-end">
          menos
          {[0, 1, 2, 3, 4, 5].map((l) => (
            <span key={l} className="inline-block rounded-[2px]" style={{ width: 9, height: 9, background: `var(--${l ? escala : "heat"}-${l})` }}
              title={l === 0 ? `nada` : l === 1 ? `até ${nf.format(thresholds[0])} ${unit}` : l === 5 ? `mais de ${nf.format(thresholds[3])} ${unit}` : `${nf.format(thresholds[l - 2])} a ${nf.format(thresholds[l - 1])} ${unit}`} />
          ))}
          mais
        </div>
      </div>
    );
  }

  return (
    <div ref={raiz} className="relative select-none">
      {/* calendário e legenda centrados juntos: quando o quadradinho chega ao tamanho máximo, a sobra fica dos dois lados */}
      <div className="mx-auto max-w-full" style={largura > 0 ? { width: largSvg } : undefined}>
      {largura > 0 && (
        <svg width={largSvg} height={altura} role="img" aria-label={`Calendário de ${unit}, ${weeks} semanas`} className="block max-w-full"
          style={{ cursor: onSelect ? "pointer" : "default" }}
          onPointerMove={(e) => {
            if (e.pointerType !== "mouse") return;
            const a = diaEm(e);
            if (a) mostrar(a, e.currentTarget); else setHover(null);
          }}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") setHover(null); }}
          onClick={(e) => {
            const a = diaEm(e);
            if (!a) return;
            // toque: abre a dica do dia; tocar de novo no mesmo dia fecha
            const mouse = (e.nativeEvent as PointerEvent).pointerType === "mouse";
            if (!mouse && hover?.day === a.k && !onSelect) setHover(null); else mostrar(a, e.currentTarget);
            onSelect?.(a.k);
          }}>
          {Array.from({ length: faixas }, (_, f) => (
            <g key={f}>
              {[0, 2, 4].map((d) => (
                <text key={d} x={0} y={y(f, d) + cel * 0.85} fontSize={10} fill="var(--muted)">{DIAS[d]}</text>
              ))}
            </g>
          ))}
          {rotulosMeses.map((m) => (
            <text key={`${m.f}-${m.c}`} x={x(m.c)} y={m.f * (alturaFaixa + ENTRE_FAIXAS) + 9} fontSize={10} fill="var(--muted)">{m.label}</text>
          ))}
          {cells.map((c) => {
            if (c.future) return null;
            const { f, c: col } = pos(c.w);
            const marcado = selected === c.day || hover?.day === c.day;
            return (
              <rect key={c.day} x={x(col)} y={y(f, c.d)} width={cel} height={cel} rx={Math.min(3, cel / 4)} fill={c.fora ? "var(--heat-0)" : cor(c.v)}
                opacity={c.fora ? 0.35 : 1}
                stroke={marcado ? "var(--text)" : c.day === today ? "var(--muted)" : "none"} strokeWidth={marcado ? 2 : 1} />
            );
          })}
        </svg>
      )}
      {!largura && <div style={{ height: 7 * PASSO_MAX + TOPO }} />}
      {dica}
      <div className="flex items-center gap-1 mt-1.5 text-[11px] text-muted justify-end">
        menos
        {[0, 1, 2, 3, 4, 5].map((l) => (
          <span key={l} className="inline-block rounded-[2px]" style={{ width: 9, height: 9, background: `var(--${l ? escala : "heat"}-${l})` }}
            title={l === 0 ? `nada` : l === 1 ? `até ${nf.format(thresholds[0])} ${unit}` : l === 5 ? `mais de ${nf.format(thresholds[3])} ${unit}` : `${nf.format(thresholds[l - 2])} a ${nf.format(thresholds[l - 1])} ${unit}`} />
        ))}
        mais
      </div>
      </div>
    </div>
  );
}
