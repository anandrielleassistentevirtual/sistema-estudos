"use client";
/**
 * Filtro de período dos painéis (Dashboard, Idiomas…). Todos os números de um painel usam o mesmo período,
 * e a comparação "▲/▼ %" é sempre com o período anterior equivalente:
 *  - períodos em andamento (esta semana, este mês, este ano) → o anterior só até o mesmo ponto
 *    (seg–sáb desta semana contra seg–sáb da passada), para a comparação ser justa;
 *  - períodos fechados ou personalizados → o mesmo número de dias, logo antes.
 */
import { useEffect, useState } from "react";
import { addDays, dayKey, parseDay, weekStart } from "./dates";

export type PeriodoId = "hoje" | "semana" | "semana-passada" | "mes" | "mes-passado" | "30d" | "90d" | "ano" | "custom";

export const PERIODOS: { id: PeriodoId; nome: string }[] = [
  { id: "hoje", nome: "Hoje" },
  { id: "semana", nome: "Esta semana" },
  { id: "semana-passada", nome: "Semana passada" },
  { id: "mes", nome: "Este mês" },
  { id: "mes-passado", nome: "Mês passado" },
  { id: "30d", nome: "Últimos 30 dias" },
  { id: "90d", nome: "Últimos 90 dias" },
  { id: "ano", nome: "Este ano" },
  { id: "custom", nome: "Personalizado…" },
];

export interface Periodo {
  id: PeriodoId;
  /** primeiro e último dia (aaaa-mm-dd), inclusive; "ate" nunca passa de hoje */
  de: string;
  ate: string;
  /** o período anterior equivalente, para comparar */
  antDe: string;
  antAte: string;
  /** dias do período (até hoje) */
  dias: number;
  /** "Esta semana", "1/11 a 16/11"… */
  nome: string;
  /** "vs. semana anterior" etc. (curto, para as legendas) */
  vs: string;
}

const diasEntre = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 864e5) + 1;
const curta = (k: string) => parseDay(k).toLocaleDateString("pt-BR", { day: "numeric", month: "numeric" });

export function calcularPeriodo(id: PeriodoId, custom?: { de: string; ate: string }): Periodo {
  const hoje = new Date();
  const h = dayKey(hoje);
  const mk = (de: string, ate: string, antDe: string, antAte: string, vs: string, nome?: string): Periodo => ({
    id, de, ate, antDe, antAte, dias: diasEntre(de, ate), vs,
    nome: nome ?? PERIODOS.find((p) => p.id === id)?.nome ?? `${curta(de)} a ${curta(ate)}`,
  });
  const ws = weekStart(hoje);
  const ms = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  switch (id) {
    case "hoje":
      return mk(h, h, dayKey(addDays(hoje, -1)), dayKey(addDays(hoje, -1)), "ontem");
    case "semana":
      return mk(dayKey(ws), h, dayKey(addDays(ws, -7)), dayKey(addDays(hoje, -7)), "anterior");
    case "semana-passada":
      return mk(dayKey(addDays(ws, -7)), dayKey(addDays(ws, -1)), dayKey(addDays(ws, -14)), dayKey(addDays(ws, -8)), "anterior");
    case "mes": {
      const antIni = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      const antFimMes = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      const antFim = new Date(antIni.getFullYear(), antIni.getMonth(), Math.min(hoje.getDate(), antFimMes.getDate()));
      return mk(dayKey(ms), h, dayKey(antIni), dayKey(antFim), "mês anterior");
    }
    case "mes-passado": {
      const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1), fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      const antIni = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1), antFim = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 0);
      return mk(dayKey(ini), dayKey(fim), dayKey(antIni), dayKey(antFim), "mês anterior");
    }
    case "30d":
      return mk(dayKey(addDays(hoje, -29)), h, dayKey(addDays(hoje, -59)), dayKey(addDays(hoje, -30)), "30 dias antes");
    case "90d":
      return mk(dayKey(addDays(hoje, -89)), h, dayKey(addDays(hoje, -179)), dayKey(addDays(hoje, -90)), "90 dias antes");
    case "ano": {
      const ini = new Date(hoje.getFullYear(), 0, 1);
      return mk(dayKey(ini), h, dayKey(new Date(hoje.getFullYear() - 1, 0, 1)), dayKey(new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate())), "ano anterior");
    }
    case "custom": {
      let de = custom?.de || dayKey(ws), ate = custom?.ate || h;
      if (ate > h) ate = h;
      if (de > ate) [de, ate] = [ate, de];
      const n = diasEntre(de, ate);
      return mk(de, ate, dayKey(addDays(parseDay(de), -n)), dayKey(addDays(parseDay(de), -1)), "período anterior", `${curta(de)} a ${curta(ate)}`);
    }
  }
}

/** Semanas (colunas do calendário) que cobrem o período, terminando na semana do último dia. */
export function semanasDoPeriodo(p: Periodo): number {
  const ini = weekStart(parseDay(p.de)), fim = weekStart(parseDay(p.ate));
  return Math.round((fim.getTime() - ini.getTime()) / (7 * 864e5)) + 1;
}

/** O período escolhido, guardado no aparelho (o mesmo em todos os painéis). */
export function usePeriodo(): [Periodo, (id: PeriodoId, custom?: { de: string; ate: string }) => void] {
  const [estado, setEstado] = useState<{ id: PeriodoId; custom?: { de: string; ate: string } }>({ id: "semana" });
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("periodo") ?? "null");
      if (s && PERIODOS.some((p) => p.id === s.id)) setEstado(s);
    } catch {}
  }, []);
  const mudar = (id: PeriodoId, custom?: { de: string; ate: string }) => {
    const novo = { id, custom: id === "custom" ? custom ?? estado.custom : undefined };
    setEstado(novo);
    try { localStorage.setItem("periodo", JSON.stringify(novo)); } catch {}
  };
  return [calcularPeriodo(estado.id, estado.custom), mudar];
}

/** Soma de uma grandeza nos dias [de, ate] de um mapa por dia. */
export function somaNoPeriodo<T>(mapa: Map<string, T>, de: string, ate: string, f: (v: T) => number): number {
  let t = 0;
  for (let d = parseDay(de); dayKey(d) <= ate; d = addDays(d, 1)) {
    const v = mapa.get(dayKey(d));
    if (v !== undefined) t += f(v);
  }
  return t;
}
