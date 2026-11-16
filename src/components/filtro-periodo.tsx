"use client";
import { CalendarRange } from "lucide-react";
import { dayKey } from "@/lib/dates";
import { PERIODOS, type Periodo, type PeriodoId } from "@/lib/periodo";

/** O filtro de período dos painéis: muda todos os números da tela. */
export function FiltroPeriodo({ periodo, onMudar }: { periodo: Periodo; onMudar: (id: PeriodoId, custom?: { de: string; ate: string }) => void }) {
  const hoje = dayKey();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative inline-flex items-center">
        <CalendarRange size={15} className="absolute left-2.5 text-icon pointer-events-none" />
        <select aria-label="Período" className="input w-auto pl-8 pr-8 py-1.5 text-sm font-medium" value={periodo.id}
          onChange={(e) => onMudar(e.target.value as PeriodoId, e.target.value === "custom" ? { de: periodo.de, ate: periodo.ate } : undefined)}>
          {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </label>
      {periodo.id === "custom" && (
        <span className="inline-flex items-center gap-1.5 text-sm">
          <input type="date" aria-label="De" className="input w-auto py-1.5 text-sm" value={periodo.de} max={hoje}
            onChange={(e) => e.target.value && onMudar("custom", { de: e.target.value, ate: periodo.ate })} />
          <span className="text-muted">a</span>
          <input type="date" aria-label="Até" className="input w-auto py-1.5 text-sm" value={periodo.ate} max={hoje}
            onChange={(e) => e.target.value && onMudar("custom", { de: periodo.de, ate: e.target.value })} />
        </span>
      )}
    </div>
  );
}
