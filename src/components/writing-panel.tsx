"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Feather } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { addDays, dayKey, fmtDuration, nf, weekStart } from "@/lib/dates";
import { tipoDe, type Projeto } from "@/lib/escrita";
import type { Periodo } from "@/lib/periodo";

interface S { projeto_id: string; dia: string; palavras: number; segundos: number }

/** Escrita no Dashboard: só os indicadores principais (o resto fica nas Estatísticas de cada projeto). */
/** Com `periodo` (filtro do painel), os quatro números são do período: palavras, tempo, dias escrevendo e ritmo. */
export function WritingPanel({ compacto = false, periodo, className = "" }: { compacto?: boolean; periodo?: Periodo; className?: string } = {}) {
  const [dados, setDados] = useState<{ projetos: Projeto[]; sessoes: S[]; totais: Record<string, number> } | null>(null);

  const padrao = dayKey(addDays(new Date(), -60));
  const desde = periodo && periodo.de < padrao ? periodo.de : padrao;
  useEffect(() => {
    (async () => {
      const sb = supabase();
      const [p, s, d] = await Promise.all([
        sb.from("escrita_projetos").select("*").order("updated_at", { ascending: false }),
        sb.from("escrita_sessoes").select("projeto_id,dia,palavras,segundos").gte("dia", desde),
        sb.from("escrita_docs").select("projeto_id,palavras").eq("secao", "manuscrito"),
      ]);
      const totais: Record<string, number> = {};
      for (const x of (d.data as { projeto_id: string; palavras: number }[]) ?? []) totais[x.projeto_id] = (totais[x.projeto_id] ?? 0) + x.palavras;
      setDados({ projetos: (p.data as Projeto[]) ?? [], sessoes: (s.data as S[]) ?? [], totais });
    })();
  }, [desde]);

  if (!dados) return null;
  if (!dados.projetos.length) {
    return (
      <section className={`card ${compacto ? "p-4" : "p-5 mt-4"} flex items-center justify-between gap-4 ${className}`}>
        <div>
          <h2 className="font-medium flex items-center gap-2"><Feather size={16} className="text-icon" /> Escrita</h2>
          <p className="text-sm text-muted mt-1">Nenhum projeto ainda. As palavras escritas por dia, a sequência e o ritmo aparecem aqui.</p>
        </div>
        <Link href="/escrita" className="btn shrink-0">Criar projeto</Link>
      </section>
    );
  }
  const { projetos, sessoes, totais } = dados;

  const hojeK = dayKey();
  const semanaK = dayKey(weekStart(new Date()));
  const porDia = new Map<string, number>();
  for (const s of sessoes) porDia.set(s.dia, (porDia.get(s.dia) ?? 0) + s.palavras);
  const hoje = porDia.get(hojeK) ?? 0;
  const semana = sessoes.filter((s) => s.dia >= semanaK);
  const semanaPalavras = semana.reduce((n, s) => n + s.palavras, 0);
  const semanaTempo = semana.reduce((n, s) => n + s.segundos, 0);
  const metaDia = projetos.reduce((n, p) => n + (p.meta_diaria || 0), 0);
  // sequência: dias seguidos escrevendo (se hoje ainda não escreveu, conta até ontem)
  let seq = 0;
  for (let d = (porDia.get(hojeK) ?? 0) > 0 ? new Date() : addDays(new Date(), -1); (porDia.get(dayKey(d)) ?? 0) > 0; d = addDays(d, -1)) seq++;
  const t30 = sessoes.filter((s) => s.dia >= dayKey(addDays(new Date(), -30)));
  const seg30 = t30.reduce((n, s) => n + s.segundos, 0);
  const ritmo = seg30 > 600 ? Math.round(t30.reduce((n, s) => n + s.palavras, 0) / (seg30 / 3600)) : 0;
  const hojePorProjeto = (id: string) => sessoes.filter((s) => s.projeto_id === id && s.dia === hojeK).reduce((n, s) => n + s.palavras, 0);
  const pctDia = metaDia ? Math.min(1, hoje / metaDia) : 0;
  // no período do filtro
  const doPeriodo = periodo ? sessoes.filter((s) => s.dia >= periodo.de && s.dia <= periodo.ate) : [];
  const pPalavras = doPeriodo.reduce((n, s) => n + s.palavras, 0);
  const pTempo = doPeriodo.reduce((n, s) => n + s.segundos, 0);
  const pDias = new Set(doPeriodo.filter((s) => s.palavras > 0).map((s) => s.dia)).size;
  const pRitmo = pTempo > 600 ? Math.round(pPalavras / (pTempo / 3600)) : 0;

  return (
    <section className={`${compacto ? "card p-4 min-w-0" : "card p-5 mt-4"} ${className}`}>
      <div className={`flex items-center justify-between ${compacto ? "mb-3" : "mb-4"}`}>
        <h2 className="font-medium flex items-center gap-2"><Feather size={16} className="text-icon" /> Escrita</h2>
        <Link href="/escrita" className="text-sm text-accent flex items-center gap-0.5">Abrir <ChevronRight size={15} /></Link>
      </div>
      <div className={compacto ? "space-y-4" : "grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-3 md:gap-6"}>
        {periodo ? (
          <div className={`grid min-w-0 ${compacto ? "grid-cols-2 md:grid-cols-4 xl:grid-cols-2 gap-x-4 gap-y-3" : "grid-cols-4 md:grid-cols-2 gap-x-2 sm:gap-x-6 gap-y-4"}`}>
            {/* compacto: o rótulo já diz o que é (sem a linha de dica), para o cartão ter a altura dos vizinhos */}
            {([
              ["Palavras", "Palavras escritas", nf.format(pPalavras), "escritas"],
              ["Tempo", "Tempo escrevendo", pTempo ? fmtDuration(pTempo) : "0 min", "escrevendo"],
              ["Dias", "Dias escrevendo", `${pDias}`, pDias === 1 ? "dia escrevendo" : "dias escrevendo"],
              ["Ritmo", "Palavras por hora", pRitmo ? nf.format(pRitmo) : "—", "palavras por hora"],
            ] as const).map(([rot, rotCompacto, val, dica]) => (
              <div key={rot} className="min-w-0">
                <div className="text-[11.5px] sm:text-[13px] text-muted truncate">{compacto ? rotCompacto : rot}</div>
                <div className={`${compacto ? "text-[1.15rem] min-[400px]:text-[1.3rem]" : "text-[1.15rem] min-[400px]:text-[1.3rem] md:text-[1.6rem]"} tracking-tight tabular-nums leading-tight`}>{val}</div>
                {!compacto && <div className="text-[10.5px] sm:text-xs text-faint leading-snug truncate">{dica}</div>}
              </div>
            ))}
          </div>
        ) : (
        <div className={`grid min-w-0 ${compacto ? "grid-cols-2 md:grid-cols-4 xl:grid-cols-2 gap-x-4 gap-y-3" : "grid-cols-4 md:grid-cols-2 gap-x-2 sm:gap-x-6 gap-y-4"}`}>
          <div>
            <div className="text-[11.5px] sm:text-[13px] text-muted truncate">Hoje</div>
            <div className={`${compacto ? "text-[1.15rem] min-[400px]:text-[1.3rem]" : "text-[1.15rem] min-[400px]:text-[1.3rem] md:text-[1.6rem]"} tracking-tight tabular-nums leading-tight`}>{nf.format(hoje)}</div>
            {metaDia > 0 ? (
              <>
                <div className="mt-1.5 h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full bg-chart" style={{ width: `${pctDia * 100}%` }} /></div>
                <div className="text-[10.5px] sm:text-xs text-faint mt-1 leading-snug">{hoje >= metaDia ? "meta do dia cumprida" : `meta ${nf.format(metaDia)}`}</div>
              </>
            ) : <div className="text-[10.5px] sm:text-xs text-faint leading-snug">palavras escritas</div>}
          </div>
          <div>
            <div className="text-[11.5px] sm:text-[13px] text-muted truncate"><span className="min-[400px]:hidden">Semana</span><span className="hidden min-[400px]:inline">Esta semana</span></div>
            <div className={`${compacto ? "text-[1.15rem] min-[400px]:text-[1.3rem]" : "text-[1.15rem] min-[400px]:text-[1.3rem] md:text-[1.6rem]"} tracking-tight tabular-nums leading-tight`}>{nf.format(semanaPalavras)}</div>
            <div className="text-[10.5px] sm:text-xs text-faint leading-snug">{semanaTempo ? `${fmtDuration(semanaTempo)} escrevendo` : "palavras"}</div>
          </div>
          <div>
            <div className="text-[11.5px] sm:text-[13px] text-muted truncate">Sequência</div>
            <div className={`${compacto ? "text-[1.15rem] min-[400px]:text-[1.3rem]" : "text-[1.15rem] min-[400px]:text-[1.3rem] md:text-[1.6rem]"} tracking-tight tabular-nums leading-tight`}>{seq} {seq === 1 ? "dia" : "dias"}</div>
            <div className="text-[10.5px] sm:text-xs text-faint leading-snug">escrevendo seguidos</div>
          </div>
          <div>
            <div className="text-[11.5px] sm:text-[13px] text-muted truncate">Ritmo</div>
            <div className={`${compacto ? "text-[1.15rem] min-[400px]:text-[1.3rem]" : "text-[1.15rem] min-[400px]:text-[1.3rem] md:text-[1.6rem]"} tracking-tight tabular-nums leading-tight`}>{ritmo ? nf.format(ritmo) : "—"}</div>
            <div className="text-[10.5px] sm:text-xs text-faint leading-snug">palavras por hora</div>
          </div>
        </div>
        )}
        <ul className="space-y-1">
          {projetos.slice(0, compacto ? 2 : 3).map((p) => {
            const total = totais[p.id] ?? 0;
            const pct = p.meta_palavras ? Math.min(1, total / p.meta_palavras) : 0;
            const h = hojePorProjeto(p.id);
            return (
              <li key={p.id}>
                <Link href={`/escrita/${p.id}`} className={`block rounded-lg px-2 -mx-2 hover:bg-surface-2 ${compacto ? "py-1.5" : "py-2"}`}>
                  <div className={`flex flex-col gap-x-3 gap-y-0.5 ${compacto ? "" : "sm:flex-row sm:items-baseline sm:justify-between"}`}>
                    <span className="truncate min-w-0" title={p.titulo}>{p.titulo} <span className="text-xs text-faint">· {tipoDe(p.tipo).label}</span></span>
                    <span className={`text-xs text-muted tabular-nums ${compacto ? "" : "sm:shrink-0"}`}>
                      {nf.format(total)}{p.meta_palavras ? ` / ${nf.format(p.meta_palavras)}` : ""} pal.{h > 0 ? ` · hoje +${nf.format(h)}` : ""}
                    </span>
                  </div>
                  {p.meta_palavras > 0 && (
                    <div className="mt-1.5 h-1 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full bg-chart" style={{ width: `${pct * 100}%` }} /></div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
