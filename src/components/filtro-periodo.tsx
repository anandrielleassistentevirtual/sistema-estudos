"use client";
import { useState } from "react";
import { dayKey } from "@/lib/dates";
import type { Periodo, PeriodoId } from "@/lib/periodo";

const ATALHOS: [PeriodoId, string][] = [["semana", "Semana"], ["mes", "Mês"], ["ano", "Ano"]];

/**
 * O filtro de período dos painéis, enxuto: três atalhos e as duas datas (é só escolher). Muda todos os números da tela.
 * No celular as datas ficam a um toque ("Datas"), para o filtro caber numa linha; aparecem sozinhas quando o período
 * em vigor não é um dos atalhos (personalizado, ou um salvo de antes, como "Últimos 30 dias").
 */
export function FiltroPeriodo({ periodo, onMudar }: { periodo: Periodo; onMudar: (id: PeriodoId, custom?: { de: string; ate: string }) => void }) {
  const hoje = dayKey();
  const [abrirDatas, setAbrirDatas] = useState(false);
  const foraDosAtalhos = !ATALHOS.some(([id]) => id === periodo.id);
  const datasNoCelular = foraDosAtalhos || abrirDatas;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="seg" role="group" aria-label="Atalhos de período">
        {ATALHOS.map(([id, nome]) => (
          <button key={id} onClick={() => { setAbrirDatas(false); onMudar(id); }} aria-pressed={periodo.id === id}>{nome}</button>
        ))}
        <button className="sm:hidden" onClick={() => setAbrirDatas((a) => !a)} aria-pressed={datasNoCelular} title={foraDosAtalhos ? periodo.nome : "Escolher as datas"}>Datas</button>
      </div>
      <span className={`${datasNoCelular ? "inline-flex" : "hidden sm:inline-flex"} items-center gap-1 text-sm`}>
        <input type="date" aria-label="De" className="input w-auto py-1 px-2 text-sm" value={periodo.de} max={hoje}
          onChange={(e) => e.target.value && onMudar("custom", { de: e.target.value, ate: periodo.ate })} />
        <span className="text-muted">–</span>
        <input type="date" aria-label="Até" className="input w-auto py-1 px-2 text-sm" value={periodo.ate} max={hoje}
          onChange={(e) => e.target.value && onMudar("custom", { de: periodo.de, ate: e.target.value })} />
      </span>
    </div>
  );
}
