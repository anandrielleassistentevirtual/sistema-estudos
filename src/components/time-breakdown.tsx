"use client";
import { useEffect, useMemo, useState } from "react";
import { addDays, dayKey, fmtDuration, weekStart } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";
import { todas } from "@/lib/supabase/todas";
import { ankiPorIdioma, contaComoEstudo, type AnkiIdiomaDia } from "@/lib/tempo";
import type { Periodo } from "@/lib/periodo";
import { COR_AREA, corDaCategoria } from "@/lib/cores";
import { CardHead } from "@/components/page";

type Period = "semana" | "30d" | "ano";
const PERIODS: { id: Period; label: string }[] = [
  { id: "semana", label: "Esta semana" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "ano", label: "Este ano" },
];

interface Sess { day: string; seconds: number; category: string; language: string | null; note_id: string | null; label: string }
interface Read { day: string; seconds: number; during_timer: boolean; note_id: string | null }

/** "Onde está indo seu tempo": Leitura, cada idioma, cada curso, outras categorias. */
/** Com `periodo` (filtro do painel), usa esse período e esconde as abas próprias. */
export function TimeBreakdown({ compacto = false, periodo }: { compacto?: boolean; periodo?: Periodo } = {}) {
  const [period, setPeriod] = useState<Period>("semana");
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [reading, setReading] = useState<Read[]>([]);
  const [courseOf, setCourseOf] = useState<Map<string, string>>(new Map());
  const [anki, setAnki] = useState<{ dias: AnkiIdiomaDia[]; ankiWeb: boolean }>({ dias: [], ankiWeb: false });
  const [hover, setHover] = useState<string | null>(null);

  // busca desde o começo do ano (ou 31 dias), ou desde o começo do período do filtro, se for mais antigo
  const padrao = dayKey(new Date(new Date().getFullYear(), 0, 1) < addDays(new Date(), -31) ? new Date(new Date().getFullYear(), 0, 1) : addDays(new Date(), -31));
  const carregarDesde = periodo && periodo.de < padrao ? periodo.de : padrao;
  useEffect(() => {
    const from = carregarDesde;
    const sb = supabase();
    void Promise.all([
      todas<Sess>((de, ate) => sb.from("study_sessions").select("day,seconds,category,language,note_id,label").gte("day", from).order("id").range(de, ate)),
      todas<Read>((de, ate) => sb.from("reading_sessions").select("day,seconds,during_timer,note_id").gte("day", from).order("id").range(de, ate)),
      todas<{ id: string; course: string }>((de, ate) => sb.from("notes").select("id,course").eq("kind", "estudo").order("id").range(de, ate)),
      ankiPorIdioma(from),
    ]).then(([s, r, n, a]) => {
      setSessions(s);
      setReading(r);
      setAnki(a);
      // só a pasta do curso: "Paulo Cantarelli › EFESC › Correções" → "EFESC" (o autor e as subpastas ficam de fora)
      const doCurso = (caminho: string) => { const p = caminho.split(" › ").map((x) => x.trim()).filter(Boolean); return p[1] ?? p[0] ?? ""; };
      setCourseOf(new Map(n.map((x) => [x.id, doCurso(x.course)])));
    }).catch(() => {});
  }, [carregarDesde]);

  const todasLinhas = useMemo(() => {
    const now = new Date();
    const from = periodo ? periodo.de : dayKey(period === "semana" ? weekStart(now) : period === "30d" ? addDays(now, -29) : new Date(now.getFullYear(), 0, 1));
    const ate = periodo ? periodo.ate : "9999-12-31";
    // cada linha leva a cor da sua área (a mesma das Temporadas e dos gráficos)
    const m = new Map<string, { label: string; kind: string; seconds: number; cor: string }>();
    const corDoTipo: Record<string, string> = { Idioma: COR_AREA.idiomas, Curso: COR_AREA.estudos, Leitura: COR_AREA.leitura };
    const add = (key: string, label: string, kind: string, secs: number, cor = corDoTipo[kind] ?? COR_AREA.outro) => {
      const v = m.get(key) ?? { label, kind, seconds: 0, cor };
      v.seconds += secs;
      m.set(key, v);
    };
    for (const s of sessions) {
      // a Oração não entra aqui: este quadro é sobre o tempo de estudo (ela tem a sua própria aba)
      if (s.day < from || s.day > ate || s.category === "Oração" || !contaComoEstudo(s.label, anki.ankiWeb, s.category)) continue;
      if (s.category === "Idiomas") add(`lang:${s.language ?? ""}`, s.language || "Idiomas (sem idioma)", "Idioma", s.seconds);
      else if (s.category === "Estudos") {
        const course = s.note_id ? courseOf.get(s.note_id) : undefined;
        add(`curso:${course ?? ""}`, course || "Estudos (sem curso)", "Curso", s.seconds);
      } else if (s.category === "Leitura") add("leitura", "Leitura", "Leitura", s.seconds);
      else add(`cat:${s.category}`, s.category, "Outros", s.seconds, corDaCategoria(s.category));
    }
    // leitura medida no leitor sem o timer ligado (com o timer, já entrou acima)
    for (const r of reading) {
      if (r.day < from || r.day > ate || r.during_timer) continue;
      if (r.note_id) {
        const course = courseOf.get(r.note_id);
        add(`curso:${course ?? ""}`, course || "Estudos (sem curso)", "Curso", r.seconds);
      } else add("leitura", "Leitura", "Leitura", r.seconds);
    }
    // tempo no Anki: entra no idioma dono do baralho (a mesma regra dos indicadores do Dashboard)
    for (const a of anki.dias) if (a.day >= from && a.day <= ate) add(`lang:${a.idioma}`, a.idioma, "Idioma", a.segundos);
    return [...m.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.seconds - a.seconds);
  }, [sessions, reading, courseOf, period, anki, periodo?.de, periodo?.ate]); // eslint-disable-line react-hooks/exhaustive-deps
  // o total é o tempo de estudo (sem a Oração); itens com menos de 1 min só não ganham linha própria
  const total = todasLinhas.reduce((a, r) => a + r.seconds, 0);
  const rows = todasLinhas.filter((r) => r.seconds >= 60);

  // compacto: os 5 maiores e o resto somado em "Outros" (cabe na tela do Dashboard)
  const visiveis = compacto && rows.length > 6
    ? [...rows.slice(0, 5), { key: "__outros", label: "Outros", kind: `${rows.length - 5} itens`, seconds: rows.slice(5).reduce((a, r) => a + r.seconds, 0), cor: COR_AREA.outro } as typeof rows[number]]
    : rows;
  const max = Math.max(1, ...visiveis.map((r) => r.seconds));

  const meta = total ? `${fmtDuration(total)} de estudo${periodo ? ` · ${periodo.nome.toLowerCase()}` : ""}` : "Nenhum tempo registrado no período";
  const abas = !periodo && (
    <div className={`seg flex ${compacto ? "" : "w-full sm:w-auto sm:inline-flex"}`}>
      {PERIODS.map((p) => (
        <button key={p.id} onClick={() => setPeriod(p.id)} aria-pressed={period === p.id} className={compacto ? "" : "flex-auto sm:flex-none"}>{p.label}</button>
      ))}
    </div>
  );
  const pctDe = (r: { seconds: number }) => Math.round((r.seconds / total) * 100);

  return (
    <section className={compacto ? "card p-4 min-w-0" : "card p-5 mt-4"}>
      {compacto ? <CardHead titulo="Onde está indo seu tempo" meta={meta} acao={abas} /> : (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="card-title">Onde está indo seu tempo</h2>
            <p className="text-xs text-muted mt-0.5">{meta}</p>
          </div>
          {abas}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted py-6 text-center">Use o Timer (ou leia no leitor, faça lições e revisões) para ver aqui como seu tempo se divide.</p>
      ) : (
        <>
        {/* a composição do tempo numa faixa só, nas cores das áreas (no compacto, é o único gráfico) */}
        {visiveis.length > 1 && (
          <div className={`flex gap-[2px] rounded-full overflow-hidden ${compacto ? "h-2.5 mb-4" : "h-2 mb-3.5"}`} aria-hidden>
            {visiveis.map((r) => (
              <span key={r.key} className="h-full transition-opacity first:rounded-l-full last:rounded-r-full" title={`${r.label}: ${fmtDuration(r.seconds)} (${pctDe(r)}%)`}
                style={{ flexGrow: r.seconds, flexBasis: 0, minWidth: 3, background: r.cor, opacity: hover && hover !== r.key ? 0.35 : 1 }}
                onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(null)} />
            ))}
          </div>
        )}
        {compacto ? (
          // a legenda da faixa: bolinha · nome · tipo à esquerda, o tempo e a % à direita (passar o mouse acende o segmento)
          <ul className="divide-y divide-line -mb-2">
            {visiveis.map((r) => (
              <li key={r.key} className="flex items-baseline justify-between gap-3 py-2 text-sm"
                onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(null)}>
                <span className="truncate min-w-0" title={`${r.label}: ${fmtDuration(r.seconds)} (${pctDe(r)}%)`}>
                  <span className="dot mr-2 align-[0.05em]" style={{ background: r.cor }} />{r.label}
                  {r.kind !== r.label && <span className="text-[11px] text-faint ml-1.5">{r.kind}</span>}
                </span>
                <span className="tabular-nums text-right whitespace-nowrap shrink-0">
                  <span className="font-medium">{fmtDuration(r.seconds)}</span>
                  <span className="text-xs text-muted ml-1.5 w-8 inline-block">{pctDe(r)}%</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
        <ul className="space-y-2.5">
          {visiveis.map((r) => {
            const pct = r.seconds / total;
            return (
              <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(110px,180px)_minmax(0,1fr)_6.75rem]"
                onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(null)}>
                <span className="truncate min-w-0" title={r.label}>
                  <span className="dot mr-2 align-[0.05em]" style={{ background: r.cor }} />{r.label}
                  {r.kind !== r.label && <span className="text-[11px] text-faint ml-1.5 sm:ml-0 sm:block">{r.kind}</span>}
                </span>
                <span className="order-last col-span-2 h-1.5 rounded-full sm:order-none sm:col-span-1 sm:h-2.5 bg-surface-2 overflow-hidden" title={`${r.label}: ${fmtDuration(r.seconds)} (${Math.round(pct * 100)}%)`}>
                  <span className="block h-full rounded-full transition-opacity"
                    style={{ width: `${(r.seconds / max) * 100}%`, background: r.cor, opacity: hover && hover !== r.key ? 0.45 : 1 }} />
                </span>
                <span className="tabular-nums text-right whitespace-nowrap flex items-baseline justify-end">
                  <span className="font-medium">{fmtDuration(r.seconds)}</span>
                  <span className="text-xs text-muted ml-1.5 w-8 inline-block">{Math.round(pct * 100)}%</span>
                </span>
              </li>
            );
          })}
        </ul>
        )}
        </>
      )}
    </section>
  );
}
