"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { dayKey } from "@/lib/dates";
import {
  AREAS, ESTACOES, carregarTemporadas, estacaoDe, execucaoDaSemana, nomeDaTemporada, rendimento, ritmoPorArea, semanasDa, tempoPorArea, unidadeDe, type Area, type Estacao,
} from "@/lib/temporadas";
import { addDays } from "@/lib/dates";
import { EstacaoIcone } from "./estacao-icone";

/** "Primavera 2026 · semana 2 de 5 · esta semana 78%" — uma linha discreta no Dashboard, que leva às Temporadas. */
export function TemporadaLinha() {
  const [texto, setTexto] = useState<{ base: string; exec: number | null; estacao?: Estacao } | null>(null);
  useEffect(() => {
    (async () => {
      const e = estacaoDe();
      const { temporadas } = await carregarTemporadas();
      const t = temporadas.find((x) => x.estacao === e.estacao && x.ano === e.ano);
      const nome = nomeDaTemporada(e.estacao, e.ano);
      if (!t) { setTexto({ base: `${nome} · planejar a temporada`, exec: null, estacao: e.estacao }); return; }
      const { execucao } = semanasDa(t);
      const hoje = dayKey();
      const i = execucao.findIndex((w) => hoje >= w.de && hoje <= w.ate);
      const base = i >= 0 ? `${nome} · semana ${i + 1} de ${execucao.length}` : `${nome} · temporada encerrada`;
      if (i < 0) { setTexto({ base, exec: null, estacao: e.estacao }); return; }
      const reg = await tempoPorArea(dayKey(addDays(new Date(), -60)));
      const ritmo = ritmoPorArea(reg, (a) => unidadeDe(t, a));
      const plano = Object.fromEntries(AREAS.map((a) => [a.id, t.plano[a.id] ?? ritmo[a.id]])) as Record<Area, number>;
      setTexto({ base, estacao: e.estacao, exec: execucaoDaSemana(reg, t, plano, execucao[i].de, hoje, rendimento(reg)) });
    })().catch(() => {});
  }, []);
  if (!texto) return null;
  const cor = texto.exec === null ? undefined : texto.exec >= 0.85 ? "var(--good)" : texto.exec >= 0.6 ? "#c98a1a" : "var(--critical)";
  return (
    <Link href="/temporadas" className="hover:text-ink" title="Abrir as Temporadas">
      {texto.estacao && <EstacaoIcone estacao={texto.estacao} size={14} className="mr-1" />}{texto.base}
      {texto.exec !== null && <> · esta semana <b className="font-medium tabular-nums" style={{ color: cor }}>{Math.round(texto.exec * 100)}%</b></>}
    </Link>
  );
}
