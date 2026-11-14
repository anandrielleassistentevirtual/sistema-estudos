"use client";
import { useEffect, useRef, useState } from "react";
import { nf } from "@/lib/dates";

/**
 * Barras verticais de uma série (ex.: minutos por semana, palavras por dia).
 * - Mouse: passar por cima mostra o valor.
 * - Celular: tocar numa barra mostra o valor; arrastar o dedo percorre as barras; tocar fora fecha.
 * - Teclado: Tab chega ao gráfico e as setas andam pelas barras.
 */
export function BarChart({
  data,
  unit,
  height: alturaPedida = 160,
  average,
}: {
  data: { label: string; value: number; detail?: string }[];
  unit: string;
  height?: number;
  average?: number;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const [largura, setLargura] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  const toque = useRef(false);

  // quantos rótulos do eixo cabem (cada um precisa de ~40px): no celular, menos rótulos
  useEffect(() => {
    const el = plot.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setLargura(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // no celular a dica fica até tocar fora do gráfico
  useEffect(() => {
    if (sel === null) return;
    const fora = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) setSel(null); };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [sel]);

  // no celular o gráfico fica mais baixo (a tela é estreita: barras altas só gastam rolagem)
  const height = largura && largura < 480 ? Math.round(alturaPedida * 0.62) : alturaPedida;
  const max = Math.max(1, ...data.map((d) => d.value), average ?? 0);
  const nice = niceMax(max);
  const n = data.length;
  const W = 100 / n;
  const passo = largura ? Math.max(1, Math.ceil(n / Math.max(2, Math.floor(largura / 40)))) : Math.ceil(n / 6);
  // rótulos alinhados pela direita: o último (o mais recente) sempre aparece
  const mostraRotulo = (i: number) => (n - 1 - i) % passo === 0;

  const indiceEm = (clientX: number) => {
    const r = plot.current!.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.floor(((clientX - r.left) / r.width) * n)));
  };

  // posição da dica, sem sair do quadro nas barras das pontas
  const frac = sel === null ? 0 : (sel + 0.5) / n;
  const alinhamento = frac < 0.2 ? "translate-x-0" : frac > 0.8 ? "-translate-x-full" : "-translate-x-1/2";
  const xDica = sel === null ? "0" : frac < 0.2 ? `calc((100% - 2.25rem) * ${sel / n})` : frac > 0.8 ? `calc((100% - 2.25rem) * ${(sel + 1) / n})` : `calc((100% - 2.25rem) * ${frac})`;
  const total = data.reduce((a, d) => a + d.value, 0);

  return (
    <div ref={raiz} className="relative select-none" style={{ height: height + 22 }}>
      <div
        ref={plot}
        className="absolute left-0 right-9 top-0 touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-sm"
        style={{ height }}
        role="img"
        tabIndex={0}
        aria-label={`Gráfico de barras: ${n} períodos, ${nf.format(total)} ${unit} no total. Use as setas para ver cada barra.`}
        onPointerDown={(e) => {
          toque.current = e.pointerType !== "mouse";
          const i = indiceEm(e.clientX);
          // tocar de novo na mesma barra fecha a dica
          setSel((s) => (toque.current && s === i ? null : i));
        }}
        onPointerMove={(e) => {
          // mouse: passa por cima; dedo: arrasta para percorrer (o gráfico rola a página só na vertical)
          if (e.pointerType === "mouse" || e.buttons) setSel(indiceEm(e.clientX));
        }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") setSel(null); }}
        onBlur={() => setSel(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            const d = e.key === "ArrowRight" ? 1 : -1;
            setSel((s) => Math.max(0, Math.min(n - 1, s === null ? (d > 0 ? 0 : n - 1) : s + d)));
          }
          if (e.key === "Escape") setSel(null);
        }}
      >
        {/* grade: linhas finas e contínuas (tracejado parece "meta" ou "projeção") */}
        {[0.5, 1].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-line/70" style={{ bottom: f * height }}>
            <span className="absolute -top-2 -right-9 w-8 text-left z-10 text-[10px] text-faint pl-1 tabular-nums">{nf.format(nice * f)}</span>
          </div>
        ))}
        <div className="absolute inset-x-0 bottom-0 border-t border-line" />
        {average !== undefined && average > 0 && (
          <div className="absolute inset-x-0 border-t-2 border-faint/70 pointer-events-none" style={{ bottom: (average / nice) * height }}>
            <span className="absolute -top-4 left-0 text-[10px] text-muted bg-surface pr-1">média {nf.format(Math.round(average))}</span>
          </div>
        )}
        {data.map((d, i) => (
          <div key={i} className="absolute bottom-0 flex justify-center pointer-events-none" style={{ left: `${i * W}%`, width: `${W}%`, height }}>
            {/* barra selecionada: um fundo leve marca a coluna inteira, também nas barras vazias */}
            {sel === i && <div className="absolute inset-y-0 inset-x-[8%] rounded-md bg-ink/[0.05]" />}
            <div
              className="absolute bottom-0 rounded-t-[4px] transition-opacity"
              style={{
                width: "62%",
                maxWidth: 40,
                height: d.value > 0 ? `max(2px, ${(d.value / nice) * 100}%)` : 0,
                background: "linear-gradient(to top, color-mix(in srgb, var(--chart) 35%, transparent), var(--chart))",
                opacity: sel === null || sel === i ? 1 : 0.45,
              }}
            />
          </div>
        ))}
      </div>
      <div className="absolute left-0 right-9 bottom-0 flex text-[10px] text-faint tabular-nums pointer-events-none" aria-hidden>
        {data.map((d, i) => (
          <div key={i} className="whitespace-nowrap flex justify-center" style={{ width: `${W}%` }}>
            <span className={sel === i ? "text-ink font-medium" : ""}>
              {/* a data da barra escolhida aparece; as vizinhas saem para não encavalar */}
              {sel === i || (mostraRotulo(i) && (sel === null || Math.abs(i - sel) >= passo)) ? d.label : ""}
            </span>
          </div>
        ))}
      </div>
      {sel !== null && data[sel] && (
        <div
          className={`pointer-events-none absolute z-10 ${alinhamento} rounded-md px-2.5 py-1.5 text-xs shadow-lg whitespace-nowrap`}
          style={{ left: xDica, top: 0, background: "var(--text)", color: "var(--bg)" }}
          role="status"
        >
          <div className="font-medium tabular-nums">
            {nf.format(data[sel].value)} {unit}
          </div>
          <div className="opacity-80">{data[sel].detail ?? data[sel].label}</div>
        </div>
      )}
      {/* os mesmos números em texto, para leitores de tela */}
      <table className="sr-only">
        <tbody>
          {data.map((d, i) => (
            <tr key={i}><th scope="row">{d.detail ?? d.label}</th><td>{nf.format(d.value)} {unit}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
