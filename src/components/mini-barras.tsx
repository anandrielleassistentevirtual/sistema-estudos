/**
 * Mini-gráfico de barras para os indicadores: a "dinâmica" do número no período (dia a dia, ou por semana
 * em períodos longos), sem eixos nem rótulos. A última barra (a mais recente) fica cheia; as outras, suaves.
 */
export function MiniBarras({ valores, cor = "var(--chart)", largura = 64, altura = 22, className = "", titulo, fluido }: {
  valores: number[];
  cor?: string;
  largura?: number;
  altura?: number;
  className?: string;
  titulo?: string;
  /** ocupa a largura do contêiner (as barras se ajustam) */
  fluido?: boolean;
}) {
  const n = valores.length;
  if (n < 2) return null;
  const max = Math.max(0, ...valores);
  const vao = n > 32 ? 0.75 : n > 16 ? 1.25 : 2;
  const w = Math.max(0.75, (largura - vao * (n - 1)) / n);
  return (
    <svg width={fluido ? "100%" : largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} preserveAspectRatio={fluido ? "none" : undefined}
      className={`${fluido ? "" : "shrink-0"} overflow-visible ${className}`}
      role={titulo ? "img" : undefined} aria-label={titulo} aria-hidden={titulo ? undefined : true}>
      {titulo && <title>{titulo}</title>}
      {valores.map((v, i) => {
        const h = v > 0 && max > 0 ? Math.max(2, (v / max) * altura) : 1.5;
        return (
          <rect key={i} x={i * (w + vao)} y={altura - h} width={w} height={h} rx={Math.min(1.5, w / 2)}
            fill={v > 0 ? cor : "var(--border)"} opacity={v > 0 ? (i === n - 1 ? 1 : 0.5) : 1} />
        );
      })}
    </svg>
  );
}

/**
 * Valores por dia de um período → no máximo ~31 barras: até 31 dias, um por dia; depois, agrupa
 * por semana (ou por mês, em períodos de mais de meio ano), contando a partir do fim (a barra
 * mais recente é sempre a do período em curso).
 */
export function agrupar(porDia: number[]): number[] {
  if (porDia.length <= 31) return porDia;
  const passo = porDia.length <= 217 ? 7 : 30;
  const out: number[] = [];
  for (let fim = porDia.length; fim > 0; fim -= passo) out.unshift(porDia.slice(Math.max(0, fim - passo), fim).reduce((a, b) => a + b, 0));
  return out;
}
