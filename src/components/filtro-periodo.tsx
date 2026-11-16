"use client";
import { dayKey } from "@/lib/dates";
import type { Periodo, PeriodoId } from "@/lib/periodo";

const ATALHOS: [PeriodoId, string][] = [["semana", "Semana"], ["mes", "Mês"], ["ano", "Ano"]];

/**
 * O filtro de período dos painéis, enxuto: as duas datas sempre à vista (é só escolher) e três atalhos.
 * Muda todos os números da tela.
 */
export function FiltroPeriodo({ periodo, onMudar }: { periodo: Periodo; onMudar: (id: PeriodoId, custom?: { de: string; ate: string }) => void }) {
  const hoje = dayKey();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="inline-flex rounded-lg bg-surface-2 p-0.5 text-xs" role="group" aria-label="Atalhos de período">
        {ATALHOS.map(([id, nome]) => (
          <button key={id} onClick={() => onMudar(id)}
            className={`px-2.5 py-1 rounded-md ${periodo.id === id ? "bg-seg shadow-sm font-medium" : "text-muted hover:text-ink"}`}>{nome}</button>
        ))}
      </div>
      <span className="inline-flex items-center gap-1 text-sm">
        <input type="date" aria-label="De" className="input w-auto py-1 px-2 text-sm" value={periodo.de} max={hoje}
          onChange={(e) => e.target.value && onMudar("custom", { de: e.target.value, ate: periodo.ate })} />
        <span className="text-muted">–</span>
        <input type="date" aria-label="Até" className="input w-auto py-1 px-2 text-sm" value={periodo.ate} max={hoje}
          onChange={(e) => e.target.value && onMudar("custom", { de: periodo.de, ate: e.target.value })} />
      </span>
    </div>
  );
}
