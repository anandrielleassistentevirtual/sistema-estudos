"use client";
import { useEffect, useRef } from "react";
import { Check, MapPin, X } from "lucide-react";
import type { TocItem } from "./types";

/**
 * Qual item do sumário é "onde você está". `ordem` de cada item: página (MD/TXT) ou capítulo do EPUB.
 * Vários itens na mesma página/capítulo: no MD vale o último título que já passou; no EPUB, o primeiro do capítulo.
 */
export function itemAtual(toc: TocItem[], atual: number | null, escolha: "primeiro" | "ultimo"): number {
  if (atual == null || atual < 0) return -1;
  let melhor = -1, ordemMelhor = -Infinity;
  toc.forEach((t, i) => {
    if (t.ordem == null || t.ordem > atual) return;
    if (t.ordem > ordemMelhor || (t.ordem === ordemMelhor && escolha === "ultimo")) { melhor = i; ordemMelhor = t.ordem; }
  });
  return melhor;
}

/** Sumário lateral (livros e aulas): marca onde você está, esmaece o que já passou e mostra o que falta. */
export function Sumario({ toc, atual, escolha, onIr, onFechar, faltaTexto }: {
  toc: TocItem[];
  /** posição atual: página (MD/TXT) ou capítulo (EPUB) */
  atual: number | null;
  escolha: "primeiro" | "ultimo";
  onIr: (location: string) => void;
  onFechar: () => void;
  /** ex.: "≈ 2 h 10 de leitura pela frente" */
  faltaTexto?: string | null;
}) {
  const aqui = itemAtual(toc, atual, escolha);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: "center" }); }, []);
  const pelaFrente = aqui >= 0 ? toc.length - aqui - 1 : toc.length;

  return (
    <aside className="absolute left-0 top-0 bottom-0 z-30 w-full sm:w-80 bg-surface text-ink border-r border-line flex flex-col shadow-xl">
      <div className="flex items-center justify-between px-4 h-12 border-b border-line shrink-0">
        <span className="font-medium text-sm">Sumário</span>
        <button onClick={onFechar} aria-label="Fechar o sumário"><X size={18} /></button>
      </div>
      {aqui >= 0 && (
        <div className="px-4 py-2.5 border-b border-line text-xs text-muted shrink-0 space-y-0.5">
          <div className="flex items-center gap-1.5 text-ink"><MapPin size={12} className="text-accent shrink-0" /> <span className="truncate">Você está em: <b className="font-medium">{toc[aqui].label}</b></span></div>
          <div>
            {pelaFrente > 0 ? `${pelaFrente} ${pelaFrente === 1 ? "seção" : "seções"} pela frente` : "Última seção"}
            {faltaTexto && !/≈ 0 min/.test(faltaTexto) ? ` · ${faltaTexto}` : ""}
          </div>
        </div>
      )}
      <nav className="overflow-y-auto flex-1 py-2">
        {toc.map((item, i) => {
          const passou = aqui >= 0 && i < aqui;
          const eAqui = i === aqui;
          return (
            <button key={i} ref={eAqui ? ref : undefined} onClick={() => { onIr(item.location); onFechar(); }}
              aria-current={eAqui ? "location" : undefined}
              className={`relative flex w-full items-start gap-1.5 text-left text-sm py-1.5 pr-3 hover:bg-surface-2 ${eAqui ? "bg-accent-soft font-medium text-ink" : passou ? "text-faint" : "text-ink/90"}`}
              style={{ paddingLeft: 12 + (item.level - 1) * 16 }}>
              {eAqui && <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r bg-accent" />}
              <span className="w-3.5 shrink-0 mt-[3px] grid place-items-center">
                {passou ? <Check size={12} /> : eAqui ? <MapPin size={12} className="text-accent" /> : null}
              </span>
              <span className="min-w-0">
                {item.label}
                {eAqui && <span className="block text-[11px] font-normal text-accent">você está aqui</span>}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
