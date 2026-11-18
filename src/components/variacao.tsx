/** "▲ 18% vs. anterior" (verde) / "▼ 12% vs. ontem" (vermelho): curto para caber no quadro; o tooltip do quadro explica. */
export function Variacao({ atual, base, vs }: { atual: number; base: number; vs: string }) {
  if (base <= 0) return <>{atual > 0 ? "sem comparação" : "—"}</>;
  const p = Math.round(((atual - base) / base) * 100);
  const cor = p > 0 ? "var(--good)" : p < 0 ? "var(--critical)" : undefined;
  return (
    <>
      <span className="font-medium tabular-nums" style={{ color: cor }}>{p > 0 ? "▲" : p < 0 ? "▼" : "="} {Math.abs(p)}%</span>
      <span> vs. {vs}</span>
    </>
  );
}
