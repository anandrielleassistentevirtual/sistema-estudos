import { Leaf, Snowflake, Sprout, Sun } from "lucide-react";
import type { Estacao } from "@/lib/temporadas";

const ICONES = { verao: Sun, outono: Leaf, inverno: Snowflake, primavera: Sprout } as const;

/** Ícone discreto da estação (no lugar de emoji), na cor dos ícones do sistema. */
export function EstacaoIcone({ estacao, size = 16, className = "" }: { estacao: Estacao; size?: number; className?: string }) {
  const I = ICONES[estacao];
  return <I size={size} className={`text-icon inline-block align-[-0.15em] ${className}`} aria-hidden />;
}
