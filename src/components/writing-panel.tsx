"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Feather } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { addDays, dayKey, fmtDuration, nf, weekStart } from "@/lib/dates";
import { tipoDe, type Projeto } from "@/lib/escrita";

interface S { projeto_id: string; dia: string; palavras: number; segundos: number }

/** Escrita no Dashboard: só os indicadores principais (o resto fica nas Estatísticas de cada projeto). */
export function WritingPanel() {
  const [dados, setDados] = useState<{ projetos: Projeto[]; sessoes: S[]; totais: Record<string, number> } | null>(null);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const [p, s, d] = await Promise.all([
        sb.from("escrita_projetos").select("*").order("updated_at", { ascending: false }),
        sb.from("escrita_sessoes").select("projeto_id,dia,palavras,segundos").gte("dia", dayKey(addDays(new Date(), -60))),
        sb.from("escrita_docs").select("projeto_id,palavras").eq("secao", "manuscrito"),
      ]);
      const totais: Record<string, number> = {};
      for (const x of (d.data as { projeto_id: string; palavras: number }[]) ?? []) totais[x.projeto_id] = (totais[x.projeto_id] ?? 0) + x.palavras;
      setDados({ projetos: (p.data as Projeto[]) ?? [], sessoes: (s.data as S[]) ?? [], totais });
    })();
  }, []);

  if (!dados) return null;
  if (!dados.projetos.length) {
    return (
      <section className="card p-5 mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-medium flex items-center gap-2"><Feather size={16} className="text-icon" /> Escrita</h2>
          <p className="text-sm text-muted mt-1">Nenhum projeto ainda. As palavras escritas por dia, a sequência e o ritmo aparecem aqui.</p>
        </div>
        <Link href="/escrita" className="btn shrink-0 self-start sm:self-auto">Criar projeto</Link>
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

  return (
    <section className="card p-5 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-medium flex items-center gap-2"><Feather size={16} className="text-icon" /> Escrita</h2>
        <Link href="/escrita" className="text-sm text-accent flex items-center gap-0.5">Abrir <ChevronRight size={15} /></Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-6">
        <div className="grid grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-4 min-w-0">
          <div>
            <div className="text-[13px] text-muted">Hoje</div>
            <div className="text-[1.6rem] tracking-tight tabular-nums leading-tight">{nf.format(hoje)}</div>
            {metaDia > 0 ? (
              <>
                <div className="mt-1.5 h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full bg-chart" style={{ width: `${pctDia * 100}%` }} /></div>
                <div className="text-xs text-faint mt-1">{hoje >= metaDia ? "meta do dia cumprida" : `meta ${nf.format(metaDia)}`}</div>
              </>
            ) : <div className="text-xs text-faint">palavras escritas</div>}
          </div>
          <div>
            <div className="text-[13px] text-muted">Esta semana</div>
            <div className="text-[1.6rem] tracking-tight tabular-nums leading-tight">{nf.format(semanaPalavras)}</div>
            <div className="text-xs text-faint">{semanaTempo ? `${fmtDuration(semanaTempo)} escrevendo` : "palavras"}</div>
          </div>
          <div>
            <div className="text-[13px] text-muted">Sequência</div>
            <div className="text-[1.6rem] tracking-tight tabular-nums leading-tight">{seq} {seq === 1 ? "dia" : "dias"}</div>
            <div className="text-xs text-faint">escrevendo seguidos</div>
          </div>
          <div>
            <div className="text-[13px] text-muted">Ritmo</div>
            <div className="text-[1.6rem] tracking-tight tabular-nums leading-tight">{ritmo ? nf.format(ritmo) : "—"}</div>
            <div className="text-xs text-faint">palavras por hora</div>
          </div>
        </div>
        <ul className="space-y-1 min-w-0">
          {projetos.slice(0, 3).map((p) => {
            const total = totais[p.id] ?? 0;
            const pct = p.meta_palavras ? Math.min(1, total / p.meta_palavras) : 0;
            const h = hojePorProjeto(p.id);
            return (
              <li key={p.id}>
                <Link href={`/escrita/${p.id}`} className="block rounded-lg px-3 py-2 -mx-3 sm:-mx-1 hover:bg-surface-2">
                  <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-x-3 gap-y-0.5">
                    <span className="truncate">{p.titulo} <span className="text-xs text-faint">· {tipoDe(p.tipo).label}</span></span>
                    <span className="text-xs text-muted tabular-nums sm:shrink-0">
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
