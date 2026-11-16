"use client";
/**
 * Temporadas: o ano de 12 semanas no ritmo das estações. Uma tela só: a temporada, o plano por área
 * (com o seu ritmo real ao lado), as metas com a previsão e a execução de cada semana.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Page } from "@/components/page";
import { supabase } from "@/lib/supabase/client";
import { todas } from "@/lib/supabase/todas";
import { addDays, dayKey, fmtDuration, nf, parseDay } from "@/lib/dates";
import { ppmDosLivros } from "@/lib/books";
import { faltam, ppmMedio, subarvore, arvoreDePastas, type PastaEstudo } from "@/lib/estudos";
import { progressoDoLivro } from "@/lib/types";
import {
  AREAS, ESTACOES, carregarTemporadas, diasEntre, enfase, estacaoDe, execucaoDaSemana, limites, nomeDaTemporada, ritmoPorArea,
  salvarTemporada, semanasDa, somaArea, tempoPorArea, vizinha, type Area, type Estacao, type Meta, type Temporada,
} from "@/lib/temporadas";
import { NovaMeta, type Livro, type AulaT } from "./nova-meta";

const fmtData = (k: string) => parseDay(k).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
const corExecucao = (v: number) => (v >= 0.85 ? "var(--good)" : v >= 0.6 ? "#c98a1a" : "var(--critical)");

export default function Temporadas() {
  const atual = estacaoDe();
  const [sel, setSel] = useState<{ estacao: Estacao; ano: number }>({ estacao: atual.estacao, ano: atual.ano });
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [mapa, setMapa] = useState<Map<string, Record<Area, number>>>(new Map());
  const [livros, setLivros] = useState<Livro[]>([]);
  const [aulas, setAulas] = useState<AulaT[]>([]);
  const [pastas, setPastas] = useState<PastaEstudo[]>([]);
  const [escrita, setEscrita] = useState<{ dia: string; palavras: number; segundos: number }[]>([]);
  const [ppm, setPpm] = useState({ livros: 220, estudos: 220 });
  const [novaMeta, setNovaMeta] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    const sb = supabase();
    const desde = dayKey(addDays(new Date(), -400));
    const [t, m, b, a, p, e, pl, pe] = await Promise.all([
      carregarTemporadas(),
      tempoPorArea(desde),
      todas<Livro>((de, ate) => sb.from("books").select("id,title,author,word_count,progress,status,format").order("title").order("id").range(de, ate)),
      todas<AulaT>((de, ate) => sb.from("notes").select("id,title,pasta_id,palavras,progresso,situacao").eq("kind", "estudo").order("id").range(de, ate)),
      sb.from("estudo_pastas").select("id,parent_id,nome,posicao"),
      sb.from("escrita_sessoes").select("dia,palavras,segundos").gte("dia", desde),
      ppmDosLivros(),
      ppmMedio(),
    ]);
    setTemporadas(t.temporadas);
    setMetas(t.metas);
    setMapa(m);
    setLivros(b);
    setAulas(a);
    setPastas((p.data as PastaEstudo[]) ?? []);
    setEscrita((e.data as { dia: string; palavras: number; segundos: number }[]) ?? []);
    setPpm({ livros: pl || 220, estudos: pe.ppm || 220 });
    setCarregando(false);
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const lim = limites(sel.estacao, sel.ano);
  const registro = temporadas.find((t) => t.estacao === sel.estacao && t.ano === sel.ano);
  const ehAtual = sel.estacao === atual.estacao && sel.ano === atual.ano;
  const hoje = dayKey();
  const futura = lim.inicio > hoje;
  const passada = lim.fim < hoje;
  // ainda não planejada: mostra como seria, com o seu ritmo atual (a partir desta semana, se for a atual)
  const ritmo = useMemo(() => ritmoPorArea(mapa), [mapa]);
  const t: Temporada = registro ?? {
    ano: sel.ano, estacao: sel.estacao, inicio: lim.inicio, fim: lim.fim,
    comeca_em: ehAtual ? dayKey(addDays(new Date(), -((new Date().getDay() + 6) % 7))) : lim.inicio, plano: {},
  };
  const plano = (a: Area) => t.plano[a] ?? Math.round(ritmo[a] / 5) * 5;
  const planoCompleto = Object.fromEntries(AREAS.map((a) => [a.id, plano(a.id)])) as Record<Area, number>;
  const { execucao, revisao } = semanasDa(t);
  const fimExecucao = execucao[execucao.length - 1]?.ate ?? t.fim;
  const desdeHoje = hoje > t.comeca_em ? hoje : t.comeca_em;
  const diasRestantes = passada ? 0 : diasEntre(desdeHoje > hoje ? desdeHoje : hoje, fimExecucao);
  const semanaAtual = execucao.findIndex((w) => hoje >= w.de && hoje <= w.ate);
  const notas = execucao.map((w) => (w.de > hoje ? null : execucaoDaSemana(mapa, planoCompleto, w.de, w.ate > hoje ? hoje : w.ate)));
  const feitas = notas.filter((n): n is number => n !== null);
  const mediaExec = feitas.length ? feitas.reduce((a, b) => a + b, 0) / feitas.length : null;

  async function mudar(campos: Partial<Temporada>) {
    const novo = await salvarTemporada({ ...t, ...campos, plano: { ...planoCompleto, ...(campos.plano ?? {}) } });
    setTemporadas((l) => [...l.filter((x) => x.id !== novo.id), novo]);
  }

  // ---- previsão de cada meta ----
  const minutosAte = (a: Area) => plano(a) * diasRestantes; // o que ainda cabe, no plano
  const feitoNaTemporada = (a: Area) => somaArea(mapa, a, t.comeca_em, hoje < t.fim ? hoje : t.fim);
  function previsao(m: Meta): { linhas: { texto: string; ok: boolean; quando?: string }[]; resumo: string; ok: boolean; pct: number } {
    const porDia = plano(m.area);
    const quando = (min: number) => (porDia > 0 ? dayKey(addDays(parseDay(desdeHoje), Math.ceil(min / porDia) - 1)) : null);
    if (m.tipo === "livros") {
      let acum = 0;
      const linhas = m.refs.map((id) => livros.find((b) => b.id === id)).filter(Boolean).map((b) => {
        const lido = b!.status === "lido";
        const falta = lido ? 0 : (b!.word_count ?? 0) * (1 - progressoDoLivro(b!));
        acum += falta / ppm.livros;
        const fim = lido ? null : quando(acum);
        return { texto: b!.title, ok: lido || (!!fim && fim <= fimExecucao), quando: lido ? "lido ✓" : fim ? `termina ${fmtData(fim)}` : "sem tempo no plano" };
      });
      const ok = linhas.every((l) => l.ok);
      const precisa = diasRestantes ? Math.ceil(acum / diasRestantes) : 0;
      // a barra mostra o quanto já foi lido (em palavras) dos livros da meta
      const sel = m.refs.map((id) => livros.find((b) => b.id === id)).filter(Boolean);
      const total = sel.reduce((n, b) => n + (b!.word_count ?? 0), 0);
      const lidas = sel.reduce((n, b) => n + (b!.word_count ?? 0) * progressoDoLivro(b!), 0);
      return { linhas, ok, pct: total ? lidas / total : 0,
        resumo: ok ? `cabe no plano: ${fmtDuration(acum * 60)} de leitura` : `no plano, ${linhas.filter((l) => l.ok).length} de ${linhas.length}; para todos: ${precisa} min/dia de leitura` };
    }
    if (m.tipo === "curso") {
      const dentro = subarvore(m.refs[0] ?? "", arvoreDePastas(pastas).filhos);
      const doCurso = aulas.filter((a) => a.pasta_id && dentro.has(a.pasta_id));
      const pendentes = doCurso.filter((a) => a.situacao !== "concluida");
      const min = pendentes.reduce((n, a) => n + faltam(a), 0) / ppm.estudos;
      const fim = quando(min);
      const ok = pendentes.length === 0 || (!!fim && fim <= fimExecucao);
      const precisa = diasRestantes ? Math.ceil(min / diasRestantes) : 0;
      return { linhas: [], ok, pct: doCurso.length ? 1 - pendentes.length / doCurso.length : 0,
        resumo: pendentes.length === 0 ? "curso concluído ✓" : `${pendentes.length} aulas · ≈ ${fmtDuration(min * 60)} · ${ok ? `termina ${fmtData(fim!)}` : `precisa ${precisa} min/dia de estudos`}` };
    }
    if (m.tipo === "palavras") {
      const ate = hoje < t.fim ? hoje : t.fim;
      const feito = escrita.filter((e) => e.dia >= t.comeca_em && e.dia <= ate).reduce((n, e) => n + e.palavras, 0);
      const s60 = escrita.filter((e) => e.dia >= dayKey(addDays(new Date(), -60)));
      const seg = s60.reduce((n, e) => n + e.segundos, 0);
      const porHora = seg > 600 ? s60.reduce((n, e) => n + e.palavras, 0) / (seg / 3600) : 500;
      const previsto = feito + (minutosAte("escrita") / 60) * porHora;
      const ok = previsto >= m.alvo;
      const falta = Math.max(0, m.alvo - feito);
      const precisa = diasRestantes ? Math.ceil((falta / porHora) * 60 / diasRestantes) : 0;
      return { linhas: [], ok, pct: m.alvo ? Math.min(1, feito / m.alvo) : 0,
        resumo: `${nf.format(feito)} de ${nf.format(m.alvo)} · no plano chega a ${nf.format(Math.round(previsto))}${ok ? " ✓" : ` · precisa ${precisa} min/dia`}` };
    }
    // horas numa área
    const feito = feitoNaTemporada(m.area) / 3600;
    const previsto = feito + minutosAte(m.area) / 60;
    const ok = previsto >= m.alvo;
    const precisa = diasRestantes ? Math.ceil(((m.alvo - feito) * 60) / diasRestantes) : 0;
    return { linhas: [], ok, pct: m.alvo ? Math.min(1, feito / m.alvo) : 0,
      resumo: `${fmtDuration(feito * 3600)} de ${m.alvo} h · no plano chega a ${fmtDuration(previsto * 3600)}${ok ? " ✓" : ` · precisa ${Math.max(0, precisa)} min/dia`}` };
  }
  const minhasMetas = metas.filter((m) => registro && m.temporada_id === registro.id);

  return (
    <Page denso title="Temporadas" subtitle="O ano em 12 semanas, no ritmo das estações: planeje cada temporada com o seu ritmo real.">
      {/* estações: anterior · esta · seguinte */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button className="btn btn-ghost px-2" title="Temporada anterior" onClick={() => setSel(vizinha(sel.estacao, sel.ano, -1))}><ChevronLeft size={16} /></button>
        <div className="card px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 flex-1 min-w-0">
          <span className="text-lg font-medium">{ESTACOES[sel.estacao].emoji} {nomeDaTemporada(sel.estacao, sel.ano)}</span>
          <span className="text-sm text-muted">{fmtData(t.inicio)} a {fmtData(t.fim)}</span>
          {ehAtual && <span className="text-xs rounded-full px-2 py-0.5 bg-accent-soft text-ink">agora</span>}
          {!passada && execucao.length > 0 && (
            <span className="text-sm text-muted">
              {semanaAtual >= 0 ? <>semana <b className="text-ink">{semanaAtual + 1}</b> de {execucao.length}</> : futura ? `${execucao.length} semanas de execução` : "semana de revisão"}
              {diasRestantes > 0 && ` · faltam ${diasRestantes} dias`}
              {revisao.length > 0 && ` · revisão a partir de ${fmtData(revisao[0].de)}`}
            </span>
          )}
          <label className="ml-auto text-xs text-muted flex items-center gap-1.5">começou em
            <input type="date" className="input w-auto py-0.5 text-xs" value={t.comeca_em} min={t.inicio} max={t.fim}
              onChange={(e) => e.target.value && void mudar({ comeca_em: e.target.value })} />
          </label>
        </div>
        <button className="btn btn-ghost px-2" title="Próxima temporada" onClick={() => setSel(vizinha(sel.estacao, sel.ano, 1))}><ChevronRight size={16} /></button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-3 md:gap-4">
        {/* plano por área, com o ritmo real ao lado */}
        <section className="card p-4 min-w-0">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="font-medium">Plano da temporada</h2>
            <span className="text-xs text-muted">minutos por dia · seu ritmo: últimos 28 dias</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-normal">Área</th>
                <th className="py-1 font-normal text-right">Seu ritmo</th>
                <th className="py-1 font-normal text-right">Plano</th>
                <th className="py-1 font-normal text-center">Ênfase</th>
                <th className="py-1 font-normal text-right">Feito</th>
                <th className="py-1 font-normal text-right">Até o fim</th>
              </tr>
            </thead>
            <tbody>
              {AREAS.map((a) => {
                const p = plano(a.id);
                const e = enfase(p);
                const feito = feitoNaTemporada(a.id);
                return (
                  <tr key={a.id} className="border-t border-line">
                    <td className="py-1.5"><span className="inline-block w-2 h-2 rounded-full mr-2 align-middle" style={{ background: a.cor }} />{a.nome}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted">{Math.round(ritmo[a.id])} min</td>
                    <td className="py-1.5 text-right">
                      <input type="number" min={0} max={600} step={5} aria-label={`Plano de ${a.nome} (min/dia)`}
                        className="input w-20 py-0.5 text-right tabular-nums text-sm" value={p}
                        onChange={(ev) => void mudar({ plano: { ...t.plano, [a.id]: Math.max(0, Number(ev.target.value) || 0) } })} />
                    </td>
                    <td className="py-1.5 text-center">
                      <span className="text-[11px] rounded-full px-2 py-0.5" style={{ background: e.nivel ? `color-mix(in srgb, ${a.cor} ${e.nivel * 14}%, transparent)` : "var(--surface-2)", color: e.nivel ? undefined : "var(--muted)" }}>{e.nome}</span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{feito >= 60 ? fmtDuration(feito) : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted">{passada ? "—" : `+${fmtDuration(p * diasRestantes * 60)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-faint mt-2">
            {registro ? "O plano é salvo ao mudar." : "Ainda não planejada: os números são o seu ritmo atual. Mude qualquer valor para guardar o plano."}
            {" "}Ênfase: leve (&lt; 20 min), média, forte (1 h ou mais). Fazer menos coisas por vez é o que deixa uma temporada render.
          </p>
        </section>

        {/* metas com previsão */}
        <section className="card p-4 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium">Metas <span className="text-xs text-muted font-normal">· 1 a 3 por temporada</span></h2>
            {minhasMetas.length < 3 && !passada && (
              <button className="btn text-xs py-1" onClick={async () => { if (!registro) await mudar({}); setNovaMeta(true); }}><Plus size={13} /> Meta</button>
            )}
          </div>
          {minhasMetas.length === 0 ? (
            <p className="text-sm text-muted">
              {carregando ? "…" : "Escolha o que esta temporada precisa entregar: livros para ler, um curso para terminar, palavras para escrever ou horas numa área. O sistema projeta com o seu plano e diz se cabe."}
            </p>
          ) : (
            <ul className="space-y-3">
              {minhasMetas.map((m) => {
                const p = previsao(m);
                const area = AREAS.find((a) => a.id === m.area)!;
                return (
                  <li key={m.id} className="rounded-lg border border-line p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate"><span className="inline-block w-2 h-2 rounded-full mr-2 align-middle" style={{ background: area.cor }} />{m.titulo}</div>
                        <div className="text-xs mt-0.5" style={{ color: p.ok ? "var(--good)" : "#c98a1a" }}>{p.ok ? "✓ " : "⚠ "}{p.resumo}</div>
                      </div>
                      <button className="text-faint hover:text-critical shrink-0" title="Apagar a meta" onClick={async () => {
                        if (!confirm(`Apagar a meta “${m.titulo}”?`)) return;
                        await supabase().from("temporada_metas").delete().eq("id", m.id!);
                        setMetas((l) => l.filter((x) => x.id !== m.id));
                      }}><Trash2 size={14} /></button>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-2 mt-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${p.pct * 100}%`, background: area.cor }} /></div>
                    {p.linhas.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-xs">
                        {p.linhas.map((l, i) => (
                          <li key={i} className="flex justify-between gap-2">
                            <span className="truncate">{l.texto}</span>
                            <span className="shrink-0 tabular-nums" style={{ color: l.ok ? "var(--muted)" : "#c98a1a" }}>{l.quando}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* execução semanal (o placar do método das 12 semanas) */}
      <section className="card p-4 mt-3 md:mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 mb-3">
          <h2 className="font-medium">Execução semanal</h2>
          <span className="text-xs text-muted">
            quanto do plano foi feito em cada semana · 85% ou mais é uma semana bem executada
            {mediaExec !== null && <> · média <b style={{ color: corExecucao(mediaExec) }}>{Math.round(mediaExec * 100)}%</b></>}
          </span>
        </div>
        <div className="flex items-end gap-1.5 h-24">
          {execucao.map((w, i) => {
            const n = notas[i];
            return (
              <div key={w.de} className="flex-1 min-w-0 flex flex-col items-center gap-1" title={`Semana ${i + 1} (${fmtData(w.de)} a ${fmtData(w.ate)})${n !== null ? `: ${Math.round(n * 100)}%` : ""}`}>
                <span className="text-[10px] tabular-nums text-muted">{n !== null ? `${Math.round(n * 100)}%` : ""}</span>
                <div className="w-full rounded-t-md bg-surface-2 relative overflow-hidden" style={{ height: 56 }}>
                  {n !== null && <div className="absolute bottom-0 left-0 right-0 rounded-t-md" style={{ height: `${Math.max(4, n * 100)}%`, background: corExecucao(n), opacity: i === semanaAtual ? 0.75 : 1 }} />}
                </div>
                <span className={`text-[10px] tabular-nums ${i === semanaAtual ? "text-ink font-medium" : "text-faint"}`}>S{i + 1}</span>
              </div>
            );
          })}
          {revisao.length > 0 && (
            <div className="flex-1 min-w-0 flex flex-col items-center gap-1" title="Semana de revisão e descanso">
              <span className="text-[10px] text-muted"> </span>
              <div className="w-full rounded-t-md grid place-items-center text-[10px] text-muted" style={{ height: 56, background: "repeating-linear-gradient(135deg, var(--surface-2) 0 6px, transparent 6px 12px)" }}>rev.</div>
              <span className="text-[10px] text-faint">rev.</span>
            </div>
          )}
        </div>
      </section>

      {novaMeta && registro && (
        <NovaMeta temporadaId={registro.id!} livros={livros} pastas={pastas} posicao={minhasMetas.length}
          onClose={() => setNovaMeta(false)} onSalva={(m) => { setMetas((l) => [...l, m]); setNovaMeta(false); }} />
      )}
    </Page>
  );
}
