"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Feather } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { addDays, dayKey, fmtDuration, nf, weekStart } from "@/lib/dates";
import { tipoDe, type Projeto } from "@/lib/escrita";
import type { Periodo } from "@/lib/periodo";
import { COR_AREA } from "@/lib/cores";
import { CardHead } from "@/components/page";

interface S { projeto_id: string; dia: string; palavras: number; segundos: number }

/** Escrita no Dashboard: só os indicadores principais (o resto fica nas Estatísticas de cada projeto). */
/** Com `periodo` (filtro do painel), os quatro números são do período: palavras, tempo, dias escrevendo e ritmo. */
/** Compacto, é o espelho do cartão Leitura ao lado: cabeçalho, uma linha de resumo e os projetos com barra. */
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
          <h2 className="card-title flex items-center gap-2"><Feather size={16} className="text-icon" /> Escrita</h2>
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

  // compacto: o mesmo desenho de linha dos livros na Leitura (título à esquerda, números à direita, barra embaixo)
  const projetoCompacto = (p: Projeto, total: number, pct: number, h: number) => (
    <Link href={`/escrita/${p.id}`} className="block rounded-lg px-1.5 -mx-1.5 py-1.5 hover:bg-surface-2" title={`${p.titulo} · ${tipoDe(p.tipo).label}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium truncate min-w-0">{p.titulo} <span className="text-xs font-normal text-faint">· {tipoDe(p.tipo).label}</span></span>
        <span className="text-xs text-muted tabular-nums shrink-0">
          {nf.format(total)}{p.meta_palavras ? ` / ${nf.format(p.meta_palavras)}` : ""} pal.{h > 0 ? ` · hoje +${nf.format(h)}` : ""}
        </span>
      </div>
      {p.meta_palavras > 0 && (
        <div className="mt-1.5 h-1 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full bg-area-escrita" style={{ width: `${pct * 100}%` }} /></div>
      )}
    </Link>
  );

  return (
    // @container: a linha de resumo encurta quando o cartão é estreito (celular, ou meia largura entre 1024 e 1280 px)
    <section className={`${compacto ? "card p-4 min-w-0 flex flex-col @container" : "card p-5 mt-4"} ${className}`}>
      {compacto ? (
        <CardHead titulo="Escrita" cor={COR_AREA.escrita} acao={<Link className="link-ir" href="/escrita">Abrir <ChevronRight size={14} /></Link>} />
      ) : (
        <div className="flex items-center justify-between mb-4">
          <h2 className="card-title flex items-center gap-2"><Feather size={16} className="text-icon" /> Escrita</h2>
          <Link href="/escrita" className="text-sm text-accent flex items-center gap-0.5">Abrir <ChevronRight size={15} /></Link>
        </div>
      )}
      <div className={compacto ? (periodo ? "space-y-2" : "space-y-4") : "grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-3 md:gap-6"}>
        {compacto && periodo ? (
          // os quatro números do período numa linha só, como a situação da biblioteca na Leitura (o total já está na faixa do topo)
          <p className="flex flex-wrap gap-x-1.5 gap-y-1 text-xs text-muted" title="Palavras escritas, tempo escrevendo, dias escrevendo e palavras por hora, no período">
            <span className="whitespace-nowrap"><b className="text-ink font-medium tabular-nums">{nf.format(pPalavras)}</b> palavras</span><span aria-hidden>·</span>
            <span className="whitespace-nowrap"><b className="text-ink font-medium tabular-nums">{pTempo ? fmtDuration(pTempo) : "0 min"}</b><span className="hidden @[24rem]:inline"> escrevendo</span></span><span aria-hidden>·</span>
            <span className="whitespace-nowrap"><b className="text-ink font-medium tabular-nums">{pDias}</b> {pDias === 1 ? "dia" : "dias"}</span><span aria-hidden>·</span>
            <span className="whitespace-nowrap"><b className="text-ink font-medium tabular-nums">{pRitmo ? nf.format(pRitmo) : "—"}</b> pal./h</span>
          </p>
        ) : periodo ? (
          <div className="grid min-w-0 grid-cols-4 md:grid-cols-2 gap-x-2 sm:gap-x-6 gap-y-4">
            {([
              ["Palavras", nf.format(pPalavras), "escritas"],
              ["Tempo", pTempo ? fmtDuration(pTempo) : "0 min", "escrevendo"],
              ["Dias", `${pDias}`, pDias === 1 ? "dia escrevendo" : "dias escrevendo"],
              ["Ritmo", pRitmo ? nf.format(pRitmo) : "—", "palavras por hora"],
            ] as const).map(([rot, val, dica]) => (
              <div key={rot} className="min-w-0">
                <div className="text-[11.5px] sm:text-[13px] text-muted truncate">{rot}</div>
                <div className="text-[1.15rem] min-[400px]:text-[1.3rem] md:text-[1.6rem] font-medium tracking-[-0.02em] tabular-nums leading-tight">{val}</div>
                <div className="text-[10.5px] sm:text-xs text-faint leading-snug truncate">{dica}</div>
              </div>
            ))}
          </div>
        ) : (
        <div className={`grid min-w-0 ${compacto ? "grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3" : "grid-cols-4 md:grid-cols-2 gap-x-2 sm:gap-x-6 gap-y-4"}`}>
          <div>
            <div className="text-[11.5px] sm:text-[13px] text-muted truncate">Hoje</div>
            <div className={`${compacto ? "text-[1.15rem] min-[400px]:text-[1.3rem]" : "text-[1.15rem] min-[400px]:text-[1.3rem] md:text-[1.6rem]"} font-medium tracking-[-0.02em] tabular-nums leading-tight`}>{nf.format(hoje)}</div>
            {metaDia > 0 ? (
              <>
                <div className="mt-1.5 h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full bg-area-escrita" style={{ width: `${pctDia * 100}%` }} /></div>
                <div className="text-[10.5px] sm:text-xs text-faint mt-1 leading-snug">{hoje >= metaDia ? "meta do dia cumprida" : `meta ${nf.format(metaDia)}`}</div>
              </>
            ) : <div className="text-[10.5px] sm:text-xs text-faint leading-snug">palavras escritas</div>}
          </div>
          <div>
            <div className="text-[11.5px] sm:text-[13px] text-muted truncate"><span className="min-[400px]:hidden">Semana</span><span className="hidden min-[400px]:inline">Esta semana</span></div>
            <div className={`${compacto ? "text-[1.15rem] min-[400px]:text-[1.3rem]" : "text-[1.15rem] min-[400px]:text-[1.3rem] md:text-[1.6rem]"} font-medium tracking-[-0.02em] tabular-nums leading-tight`}>{nf.format(semanaPalavras)}</div>
            <div className="text-[10.5px] sm:text-xs text-faint leading-snug">{semanaTempo ? `${fmtDuration(semanaTempo)} escrevendo` : "palavras"}</div>
          </div>
          <div>
            <div className="text-[11.5px] sm:text-[13px] text-muted truncate">Sequência</div>
            <div className={`${compacto ? "text-[1.15rem] min-[400px]:text-[1.3rem]" : "text-[1.15rem] min-[400px]:text-[1.3rem] md:text-[1.6rem]"} font-medium tracking-[-0.02em] tabular-nums leading-tight`}>{seq} {seq === 1 ? "dia" : "dias"}</div>
            <div className="text-[10.5px] sm:text-xs text-faint leading-snug">escrevendo seguidos</div>
          </div>
          <div>
            <div className="text-[11.5px] sm:text-[13px] text-muted truncate">Ritmo</div>
            <div className={`${compacto ? "text-[1.15rem] min-[400px]:text-[1.3rem]" : "text-[1.15rem] min-[400px]:text-[1.3rem] md:text-[1.6rem]"} font-medium tracking-[-0.02em] tabular-nums leading-tight`}>{ritmo ? nf.format(ritmo) : "—"}</div>
            <div className="text-[10.5px] sm:text-xs text-faint leading-snug">palavras por hora</div>
          </div>
        </div>
        )}
        <ul className={compacto ? "space-y-0.5" : "space-y-1"}>
          {projetos.slice(0, compacto ? 2 : 3).map((p) => {
            const total = totais[p.id] ?? 0;
            const pct = p.meta_palavras ? Math.min(1, total / p.meta_palavras) : 0;
            const h = hojePorProjeto(p.id);
            return (
              <li key={p.id}>
                {compacto ? projetoCompacto(p, total, pct, h) : (
                  <Link href={`/escrita/${p.id}`} className="block rounded-lg px-2 -mx-2 py-2 hover:bg-surface-2">
                    <div className="flex flex-col gap-x-3 gap-y-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                      <span className="truncate min-w-0" title={p.titulo}>{p.titulo} <span className="text-xs text-faint">· {tipoDe(p.tipo).label}</span></span>
                      <span className="text-xs text-muted tabular-nums sm:shrink-0">
                        {nf.format(total)}{p.meta_palavras ? ` / ${nf.format(p.meta_palavras)}` : ""} pal.{h > 0 ? ` · hoje +${nf.format(h)}` : ""}
                      </span>
                    </div>
                    {p.meta_palavras > 0 && (
                      <div className="mt-1.5 h-1 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full bg-area-escrita" style={{ width: `${pct * 100}%` }} /></div>
                    )}
                  </Link>
                )}
              </li>
            );
          })}
          {compacto && projetos.length > 2 && <li className="text-xs text-muted pt-1"><Link href="/escrita" className="hover:text-ink">+ {projetos.length - 2} {projetos.length - 2 === 1 ? "projeto" : "projetos"} →</Link></li>}
        </ul>
      </div>
      {/* o rodapé, como o da Leitura (e sem deixar vão quando ela é mais alta): quantos projetos e, se houver, a meta do dia */}
      {compacto && periodo && (
        <p className="mt-auto pt-2 text-xs text-muted truncate">
          <b className="text-ink font-medium tabular-nums">{projetos.length}</b> {projetos.length === 1 ? "projeto" : "projetos"}
          {metaDia > 0 && <> · meta do dia: <b className="text-ink font-medium tabular-nums">{nf.format(hoje)}</b> de {nf.format(metaDia)} palavras{hoje >= metaDia ? " ✓" : ""}</>}
        </p>
      )}
    </section>
  );
}
