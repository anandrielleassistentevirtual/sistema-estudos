"use client";
/**
 * Detalhamento de uma meta da temporada: o que foi feito, dia a dia (com a linha do que é preciso por dia),
 * e item a item (cada livro ou aula: progresso, o que foi lido na temporada, o que falta e a previsão).
 */
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { todas } from "@/lib/supabase/todas";
import { addDays, dayKey, fmtDuration, nf, parseDay } from "@/lib/dates";
import type { Meta } from "@/lib/temporadas";

export interface ItemDaMeta { id: string; titulo: string; total: number; falta: number; feito: boolean; quando?: string; ok?: boolean }
export interface ResumoDaMeta {
  numeros: { valor: string; rotulo: string; cor?: string }[];
  selo: string; corSelo: string; sub?: string; pct: number;
  itens?: ItemDaMeta[];
  /** quanto precisa por dia e o seu ritmo, na unidade do dia (para a linha do gráfico) */
  precisa?: number; ritmo?: number;
}

const fmtData = (k: string) => parseDay(k).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
const N = (v: number) => nf.format(v > 0 && v < 10 && v % 1 ? Math.round(v * 10) / 10 : Math.round(v));

export function DetalheDaMeta({ meta, cor, area, resumo, comecaEm, hoje, ankiDias, minutosPorDia, onClose }: {
  meta: Meta; cor: string; area: string; resumo: ResumoDaMeta;
  comecaEm: string; hoje: string;
  ankiDias: { day: string; baralho: string; reviews: number; criados: number }[];
  /** metas de horas: minutos por dia na área */
  minutosPorDia: (dia: string) => number;
  onClose: () => void;
}) {
  // o que é contado por dia, e o nome da unidade
  const [porDia, setPorDia] = useState<Map<string, number> | null>(null);
  const [porItem, setPorItem] = useState<Map<string, { palavras: number; segundos: number }>>(new Map());
  const ini = meta.tipo === "contagem" && meta.created_at ? dayKey(new Date(meta.created_at)) : comecaEm;
  const ate = meta.tipo === "contagem" && meta.prazo && meta.prazo < hoje ? meta.prazo : hoje;
  const unidade = meta.tipo === "livros" || meta.tipo === "aulas" || meta.tipo === "curso" || meta.tipo === "palavras" ? "palavras"
    : meta.tipo === "anki" ? (meta.medida === "revisoes" ? "revisões" : "cartões novos")
    : meta.tipo === "contagem" ? meta.unidade || "itens" : "min";

  useEffect(() => {
    const sb = supabase();
    const m = new Map<string, number>();
    const add = (d: string, v: number) => m.set(d, (m.get(d) ?? 0) + v);
    (async () => {
      if (meta.tipo === "livros" || meta.tipo === "aulas" || meta.tipo === "curso") {
        const ids = (resumo.itens ?? []).map((i) => i.id);
        const col = meta.tipo === "livros" ? "book_id" : "note_id";
        const linhas = ids.length ? await todas<{ day: string; words: number | null; seconds: number; book_id: string | null; note_id: string | null }>((de, a) =>
          sb.from("reading_sessions").select("day,words,seconds,book_id,note_id").in(col, ids).gte("day", ini).order("id").range(de, a)).catch(() => []) : [];
        const it = new Map<string, { palavras: number; segundos: number }>();
        for (const r of linhas) {
          add(r.day, r.words ?? 0);
          const k = (meta.tipo === "livros" ? r.book_id : r.note_id) ?? "";
          const x = it.get(k) ?? { palavras: 0, segundos: 0 };
          x.palavras += r.words ?? 0; x.segundos += r.seconds;
          it.set(k, x);
        }
        setPorItem(it);
      } else if (meta.tipo === "palavras") {
        const linhas = await todas<{ dia: string; palavras: number }>((de, a) =>
          sb.from("escrita_sessoes").select("dia,palavras").gte("dia", ini).order("id").range(de, a)).catch(() => []);
        for (const r of linhas) add(r.dia, Math.max(0, r.palavras));
      } else if (meta.tipo === "anki") {
        const decks = new Set(meta.refs);
        for (const d of ankiDias) if (decks.has(d.baralho) && d.day >= ini) add(d.day, meta.medida === "revisoes" ? d.reviews : d.criados);
      } else if (meta.tipo === "contagem") {
        for (const d of meta.refs) add(d, 1);
      } else {
        for (let d = parseDay(ini); dayKey(d) <= ate; d = addDays(d, 1)) add(dayKey(d), minutosPorDia(dayKey(d)));
      }
      setPorDia(m);
    })();
  }, [meta]); // eslint-disable-line react-hooks/exhaustive-deps

  const dias = useMemo(() => {
    const l: string[] = [];
    for (let d = parseDay(ini); dayKey(d) <= ate; d = addDays(d, 1)) l.push(dayKey(d));
    return l.slice(-120);
  }, [ini, ate]);
  const valores = dias.map((d) => porDia?.get(d) ?? 0);
  const total = valores.reduce((a, b) => a + b, 0);
  const ativos = valores.filter((v) => v > 0).length;
  const maior = Math.max(0, ...valores);
  const melhor = maior > 0 ? dias[valores.indexOf(maior)] : null;
  const ref = resumo.precisa && isFinite(resumo.precisa) ? resumo.precisa : 0;
  const topo = Math.max(maior, ref, 1) * 1.12;
  const q = (v: number) => (unidade === "min" ? fmtDuration(v * 60) : `${N(v)} ${unidade}`);

  return (
    <div className="modal fixed inset-0 z-[62] grid place-items-center p-3 md:p-6 bg-black/45" onClick={onClose}>
      <div className="card w-full max-w-3xl max-h-[92vh] overflow-y-auto p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: cor }} />{area}
            </div>
            <h2 className="text-lg font-medium mt-0.5 leading-snug break-words">{meta.titulo}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-medium rounded-full px-2 py-0.5" style={{ color: resumo.corSelo, background: `color-mix(in srgb, ${resumo.corSelo} 14%, transparent)` }}>{resumo.selo}</span>
            <button onClick={onClose} className="p-1.5 -m-1.5 sm:p-0 sm:m-0 text-muted hover:text-ink" aria-label="Fechar"><X size={18} /></button>
          </div>
        </div>

        {/* os números do cartão e os da temporada */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-x-3 gap-y-4 mt-4 [&>div]:min-w-0 [&>div>div:first-child]:text-[1.15rem] sm:[&>div>div:first-child]:text-xl [&>div>div:first-child]:truncate">
          {resumo.numeros.map((n, i) => (
            <div key={i}><div className="text-xl font-medium tabular-nums leading-none" style={{ color: n.cor }}>
              {n.valor.includes("/") ? <>{n.valor.split("/")[0]}<span className="text-xs sm:text-sm font-normal text-muted">/{n.valor.split("/")[1]}</span></> : n.valor}
            </div><div className="text-[11px] text-muted mt-1 leading-tight">{n.rotulo}</div></div>
          ))}
          <div><div className="text-xl font-medium tabular-nums leading-none">{porDia ? (unidade === "min" ? fmtDuration(total * 60) : N(total)) : "…"}</div><div className="text-[11px] text-muted mt-1">{unidade === "min" ? "feito" : unidade} desde {fmtData(ini)}</div></div>
          <div><div className="text-xl font-medium tabular-nums leading-none">{ativos}<span className="text-sm text-muted">/{dias.length}</span></div><div className="text-[11px] text-muted mt-1">dias com avanço</div></div>
          <div><div className="text-xl font-medium tabular-nums leading-none">{melhor ? (unidade === "min" ? fmtDuration(maior * 60) : N(maior)) : "—"}</div><div className="text-[11px] text-muted mt-1">{melhor ? `melhor dia (${fmtData(melhor)})` : "melhor dia"}</div></div>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${resumo.pct * 100}%`, background: cor }} /></div>
        <div className="mt-1 flex justify-between gap-2 text-[11px] text-muted tabular-nums"><span className="min-w-0">{resumo.sub}</span><span>{Math.round(resumo.pct * 100)}%</span></div>

        {/* dia a dia */}
        <h3 className="text-sm font-medium mt-5 mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
          Dia a dia
          <span className="text-[11px] text-muted font-normal">
            {ref > 0 && <><span className="inline-block w-4 border-t border-dashed align-middle mr-1" style={{ borderColor: resumo.corSelo }} />precisa {q(ref)}/dia · </>}
            média {q(dias.length ? total / dias.length : 0)}/dia
          </span>
        </h3>
        <div className="relative h-24 sm:h-32 flex items-end gap-px sm:gap-[2px] border-b border-line">
          {ref > 0 && <div className="absolute left-0 right-0 border-t border-dashed pointer-events-none" style={{ bottom: `${(ref / topo) * 100}%`, borderColor: resumo.corSelo }} />}
          {dias.map((d, i) => {
            const v = valores[i];
            return (
              <div key={d} className="flex-1 min-w-0 max-w-[40px] h-full flex items-end" title={`${fmtData(d)}: ${q(v)}`}>
                <div className="w-full rounded-t-[3px]" style={{ height: v > 0 ? `${Math.max(2, (v / topo) * 100)}%` : 2, background: v > 0 ? cor : "var(--surface-2)", opacity: d === hoje ? 0.7 : 1 }} />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-faint mt-1 tabular-nums">
          <span>{fmtData(dias[0] ?? ini)}</span>{dias.length > 2 && <span>{fmtData(dias[Math.floor(dias.length / 2)])}</span>}<span>{dias.length > 1 ? fmtData(dias[dias.length - 1]) : ""}</span>
        </div>

        {/* item a item: livros ou aulas */}
        {resumo.itens && resumo.itens.length > 0 && (
          <>
            <h3 className="text-sm font-medium mt-5 mb-2">{meta.tipo === "livros" ? "Livros" : "Aulas"} <span className="text-[11px] text-muted font-normal">na ordem da meta · previsão pelo seu ritmo</span></h3>
            {/* celular: um bloco por item (título, barra e os números numa linha) */}
            <ul className="sm:hidden divide-y divide-line border-t border-line">
              {resumo.itens.map((it) => {
                const pct = it.total ? 1 - it.falta / it.total : it.feito ? 1 : 0;
                const x = porItem.get(it.id);
                return (
                  <li key={it.id} className="py-2 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={`min-w-0 line-clamp-2 break-words ${it.feito ? "text-muted line-through" : ""}`}>{it.titulo}</span>
                      <span className="shrink-0 text-xs tabular-nums" style={{ color: it.feito ? "var(--good)" : it.ok ? "var(--muted)" : "#c98a1a" }}>{it.feito ? "✓ feito" : it.quando ?? "—"}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted tabular-nums">
                      <span className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${pct * 100}%`, background: cor }} /></span>
                      <span className="w-8 text-right">{Math.round(pct * 100)}%</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-faint tabular-nums">
                      {x?.palavras ? `${nf.format(x.palavras)} pal. lidas na temporada` : "nada lido na temporada"}{x?.segundos ? ` · ${fmtDuration(x.segundos)}` : ""}
                      {!it.feito && ` · faltam ${nf.format(Math.round(it.falta))} pal.`}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="hidden sm:block max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-muted [&>th]:font-normal [&>th]:py-1 [&>th]:px-2 [&>th]:text-right [&>th]:whitespace-nowrap">
                    <th className="!text-left !pl-0">{meta.tipo === "livros" ? "Livro" : "Aula"}</th>
                    <th className="w-36">Progresso</th>
                    <th>Lido na temporada</th>
                    <th>Falta</th>
                    <th className="!pr-0">Previsão</th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.itens.map((it) => {
                    const pct = it.total ? 1 - it.falta / it.total : it.feito ? 1 : 0;
                    const x = porItem.get(it.id);
                    return (
                      <tr key={it.id} className="border-t border-line tabular-nums [&>td]:py-1.5 [&>td]:px-2 [&>td]:text-right [&>td]:whitespace-nowrap">
                        <td className={`!text-left !pl-0 !whitespace-normal ${it.feito ? "text-muted line-through" : ""}`}>{it.titulo}</td>
                        <td>
                          <span className="inline-flex items-center gap-2 w-full justify-end">
                            <span className="w-20 h-1.5 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${pct * 100}%`, background: cor }} /></span>
                            <span className="text-xs w-8">{Math.round(pct * 100)}%</span>
                          </span>
                        </td>
                        <td className="text-muted text-xs" title={x?.segundos ? `${fmtDuration(x.segundos)} de leitura` : undefined}>
                          {x?.palavras ? `${nf.format(x.palavras)} pal.` : "—"}{x?.segundos ? ` · ${fmtDuration(x.segundos)}` : ""}
                        </td>
                        <td className="text-muted text-xs">{it.feito ? "—" : `${nf.format(Math.round(it.falta))} pal.`}</td>
                        <td className="!pr-0 text-xs" style={{ color: it.feito ? "var(--good)" : it.ok ? "var(--muted)" : "#c98a1a" }}>{it.feito ? "✓ feito" : it.quando ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
