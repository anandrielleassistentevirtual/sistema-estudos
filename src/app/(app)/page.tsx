"use client";
import Link from "next/link";
import { ChevronRight, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Page } from "@/components/page";
import { CalendarPanel } from "@/components/calendar-panel";
import { ConfissaoAviso } from "@/components/confissao-aviso";
import { Cover } from "@/components/cover";
import { coverUrls } from "@/lib/covers";
import { TimeBreakdown } from "@/components/time-breakdown";
import { WritingPanel } from "@/components/writing-panel";
import { addDays, dayKey, fmtDuration, nf, parseDay } from "@/lib/dates";
import { FiltroPeriodo } from "@/components/filtro-periodo";
import { Variacao } from "@/components/variacao";
import { SeasonPainel } from "@/components/season-painel";
import { QuadroSonhos } from "@/components/quadro-sonhos";
import { Contagens } from "@/components/contagens";
import { somaNoPeriodo, usePeriodo } from "@/lib/periodo";
import { DayStats, inicio12Meses, loadDaily } from "@/lib/stats";
import { supabase } from "@/lib/supabase/client";
import { ppmDosLivros } from "@/lib/books";
import { sincronizarAnkiSeAntigo } from "@/lib/anki";
import { todas } from "@/lib/supabase/todas";
import { progressoDoLivro, STATUS_LABEL, type Book } from "@/lib/types";
import { OPCOES_LIVRO } from "@/components/status-pill";
import { COR_AREA } from "@/lib/cores";


export default function Dashboard() {
  const [daily, setDaily] = useState<Map<string, DayStats>>(new Map());
  const [books, setBooks] = useState<Book[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [nome, setNome] = useState("");
  const [periodo, setPeriodo] = usePeriodo();
  const [carregadoDesde, setCarregadoDesde] = useState(inicio12Meses);
  useEffect(() => {
    void supabase().auth.getUser().then(({ data }) => {
      const m = data.user?.user_metadata ?? {};
      setNome(String(m.nome ?? m.full_name ?? m.name ?? ""));
    });
  }, []);

  // ppm separado: leituras (livros) e estudos (aulas), últimos 30 dias; o principal é a média dos dois
  const [ppm, setPpm] = useState<{ leitura: number; estudos: number }>({ leitura: 0, estudos: 0 });
  const [ritmoLivros, setRitmoLivros] = useState(0); // o mesmo ritmo usado na Biblioteca e nas mesas
  useEffect(() => { void ppmDosLivros().then((v) => setRitmoLivros(v ?? 0)); }, []);
  useEffect(() => {
    const desde = dayKey(addDays(new Date(), -29));
    void todas<{ seconds: number; words: number; book_id: string | null; note_id: string | null }>((de, ate) =>
      supabase().from("reading_sessions").select("seconds,words,book_id,note_id").gte("day", desde).order("id").range(de, ate))
      .then((xs) => {
        const calc = (l: typeof xs) => {
          const secs = l.reduce((a, x) => a + x.seconds, 0);
          return secs > 120 ? Math.round(l.reduce((a, x) => a + x.words, 0) / (secs / 60)) : 0;
        };
        setPpm({ leitura: calc(xs.filter((x) => x.book_id)), estudos: calc(xs.filter((x) => x.note_id)) });
      });
  }, []);

  useEffect(() => {
    Promise.all([
      loadDaily(inicio12Meses()),
      todas<Book>((de, ate) => supabase().from("books").select("*").order("created_at", { ascending: false }).order("id").range(de, ate)),
    ]).then(([d, b]) => {
      setDaily(d);
      setBooks(b);
      void coverUrls(b).then(setCovers);
    });
  }, []);
  // Anki: se os números estão velhos (mais de 3 horas), busca no AnkiWeb em segundo plano e atualiza a tela
  useEffect(() => {
    void sincronizarAnkiSeAntigo(3).then((ok) => { if (ok) void loadDaily(carregadoDesde).then(setDaily); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // período (ou o anterior, para comparar) mais antigo do que o já carregado: busca desde ele
  useEffect(() => {
    if (periodo.antDe >= carregadoDesde) return;
    setCarregadoDesde(periodo.antDe);
    void loadDaily(periodo.antDe).then(setDaily);
  }, [periodo.antDe, carregadoDesde]);

  /** Todos os números do topo no período escolhido, comparados com o período anterior equivalente. */
  const s = useMemo(() => {
    const time = (d: DayStats) => d.study + d.reading;
    const ativo = (d: DayStats) => time(d) > 0 || d.anki > 0 || d.written > 0;
    const em = (de: string, ate: string, f: (d: DayStats) => number) => somaNoPeriodo(daily, de, ate, f);
    // primeiro dia com registro: os dias antes de começar a usar o sistema não entram nas médias
    let primeiro = "9999-12-31";
    for (const [k, v] of daily) if (k < primeiro && ativo(v)) primeiro = k;
    const diasUteis = (de: string, ate: string) => {
      const ini = de > primeiro ? de : primeiro;
      return ini > ate ? 0 : Math.round((parseDay(ate).getTime() - parseDay(ini).getTime()) / 864e5) + 1;
    };
    const { de, ate, antDe, antAte } = periodo;
    const tempo = em(de, ate, time), tempoAnt = em(antDe, antAte, time);
    const dU = diasUteis(de, ate), dUAnt = diasUteis(antDe, antAte);
    let diasAtivos = 0;
    for (let d = parseDay(de); dayKey(d) <= ate; d = addDays(d, 1)) { const v = daily.get(dayKey(d)); if (v && ativo(v)) diasAtivos++; }
    const ppmDe = (a: string, z: string) => { const seg = em(a, z, (d) => d.readingAll); return seg > 120 ? Math.round(em(a, z, (d) => d.words) / (seg / 60)) : 0; };
    // sequência atual (até hoje)
    let streak = 0;
    for (let d = new Date(); ; d = addDays(d, -1)) {
      const v = daily.get(dayKey(d));
      if (v && ativo(v)) streak++;
      else if (dayKey(d) !== dayKey()) break;
      if (streak > 400) break;
    }
    return {
      tempo, tempoAnt,
      media: dU ? tempo / dU : 0, mediaAnt: dUAnt ? tempoAnt / dUAnt : 0,
      // dias do período desde o primeiro registro (os dias antes de começar a usar o sistema não contam)
      diasAtivos, dias: dU || periodo.dias, streak,
      ppm: ppmDe(de, ate), ppmAnt: ppmDe(antDe, antAte),
      lidas: em(de, ate, (d) => d.words), lidasAnt: em(antDe, antAte, (d) => d.words),
      escritas: em(de, ate, (d) => d.written), escritasAnt: em(antDe, antAte, (d) => d.written),
      anki: em(de, ate, (d) => d.anki), ankiAnt: em(antDe, antAte, (d) => d.anki),
    };
  }, [daily, periodo]);

  const count = (st: Book["status"]) => books.filter((b) => b.status === st).length;
  const reading = books.filter((b) => b.status === "lendo");
  const naData = (iso: string | null | undefined, de: string, ate: string) => { const k = iso ? dayKey(new Date(iso)) : ""; return !!k && k >= de && k <= ate; };
  const concluidos = books.filter((b) => naData(b.finished_at, periodo.de, periodo.ate)).length;
  const lastDone = books.filter((b) => b.finished_at).sort((a, b) => (b.finished_at! > a.finished_at! ? 1 : -1))[0];

  // média simples entre os dois ritmos (a aula falada costuma render mais palavras por minuto que o livro)
  const ppmMedia = ppm.leitura && ppm.estudos ? Math.round((ppm.leitura + ppm.estudos) / 2) : ppm.leitura || ppm.estudos || s.ppm;
  const ppmLivros = ritmoLivros || ppm.leitura || ppmMedia;

  return (
    // tudo numa tela: indicadores no topo; calendário e tempo lado a lado; escrita, leitura e biblioteca embaixo
    <Page denso title={nome ? `Olá, ${nome.split(/\s+/)[0]}` : "Olá"} subtitle={<>{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}<span className="text-faint"> · ▲▼ comparado com {periodo.vs === "anterior" ? "a semana anterior" : periodo.vs === "ontem" ? "ontem" : `o ${periodo.vs}`}</span></>}
      titleExtra={
        <button className="text-faint hover:text-ink p-1 -m-1 rounded-md" title={nome ? "Trocar o nome" : "Como quer ser chamado?"} aria-label="Trocar o nome" onClick={async () => {
          const n = prompt("Seu nome:", nome)?.trim();
          if (n === undefined || n === null) return;
          await supabase().auth.updateUser({ data: { nome: n } });
          setNome(n);
        }}><Pencil size={14} /></button>
      }
      actions={<FiltroPeriodo periodo={periodo} onMudar={setPeriodo} />}>
      {/* um só ritmo vertical entre os blocos (o mesmo vão das grades) */}
      <div className="flex flex-col gap-3 md:gap-4">
      {/* contagens regressivas: dias, horas, minutos e segundos até as datas que importam */}
      <Contagens />
      {/* aviso que pede uma ação (só aparece quando está na hora) */}
      <ConfissaoAviso />
      {/* um bloco por assunto, cada um com o número principal, a comparação e um detalhe:
          tempo (e a média por dia), constância (dias e sequência), leitura (e o ritmo), escrita e idiomas.
          As setas comparam com o período anterior equivalente (o nome dele está no subtítulo). */}
      <div className="card grid grid-cols-2 md:grid-cols-5 gap-px bg-line overflow-hidden [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
        <Indicador label="Tempo de estudo" value={fmtDuration(s.tempo)} delta={<Variacao atual={s.tempo} base={s.tempoAnt} />}
          detalhe={`${fmtDuration(s.media)} por dia`}
          explica={`Timer, leitura no leitor e tempo no Anki dos seus idiomas — ${periodo.nome.toLowerCase()}. Período anterior: ${fmtDuration(s.tempoAnt)} (${fmtDuration(s.mediaAnt)} por dia).`} />
        <Indicador label="Constância" value={<>{s.diasAtivos}<span className="text-sm font-normal text-muted"> de {s.dias} dias</span></>}
          detalhe={`sequência de ${s.streak} ${s.streak === 1 ? "dia" : "dias"}`}
          explica="Dias do período com algum estudo, leitura, revisão ou escrita (contando a partir do seu primeiro registro). A sequência é de dias seguidos até hoje." />
        <Indicador label="Leitura" cor={COR_AREA.leitura} value={<>{nf.format(s.lidas)}<span className="text-sm font-normal text-muted"> pal.</span></>}
          delta={<Variacao atual={s.lidas} base={s.lidasAnt} />} detalhe={s.ppm ? `${s.ppm} ppm` : "—"}
          explica={`Palavras lidas no leitor (livros e aulas) — ${periodo.nome.toLowerCase()}, a ${s.ppm || "—"} palavras por minuto. Período anterior: ${nf.format(s.lidasAnt)} palavras, ${s.ppmAnt || "—"} ppm.`} />
        <Indicador label="Escrita" cor={COR_AREA.escrita} value={<>{nf.format(s.escritas)}<span className="text-sm font-normal text-muted"> pal.</span></>}
          delta={<Variacao atual={s.escritas} base={s.escritasAnt} />}
          explica={`Palavras escritas na sala de escrita — ${periodo.nome.toLowerCase()}. Período anterior: ${nf.format(s.escritasAnt)}.`} />
        <Indicador label="Idiomas" cor={COR_AREA.idiomas} value={<>{nf.format(s.anki)}<span className="text-sm font-normal text-muted"> revisões</span></>}
          delta={<Variacao atual={s.anki} base={s.ankiAnt} />}
          explica={`Revisões no Anki, nos baralhos dos seus idiomas — ${periodo.nome.toLowerCase()}. Período anterior: ${nf.format(s.ankiAnt)}.`} />
      </div>

      {/* a Season: a estação, as semanas e as metas (os mesmos números da página da Season) */}
      <SeasonPainel />

      {/* o calendário fica com a maior parte da largura: os quadradinhos do ano continuam legíveis */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-3 md:gap-4">
        <CalendarPanel compacto periodo={periodo} />
        <TimeBreakdown compacto periodo={periodo} />
      </div>

      {/* escrita e leitura lado a lado, da mesma altura (a leitura junta "continuar lendo" e a situação da biblioteca) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
        <WritingPanel compacto periodo={periodo} />
        <div className="card p-4 min-w-0 flex flex-col">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="card-title flex items-center gap-2"><span className="dot" style={{ background: COR_AREA.leitura }} aria-hidden /> Leitura</h2>
            <Link href="/biblioteca" className="text-sm text-accent flex items-center gap-0.5">Biblioteca <ChevronRight size={15} /></Link>
          </div>
          {/* a situação da biblioteca numa linha */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted mb-2">
            {(["lendo", "aguardando", "pausado", "lido"] as const).map((st) => (
              <span key={st} className="inline-flex items-center gap-1.5">
                <span className="dot !w-1.5 !h-1.5" style={{ background: OPCOES_LIVRO.find((o) => o.value === st)?.cor }} aria-hidden />
                <b className="text-ink font-medium tabular-nums">{count(st)}</b> {STATUS_LABEL[st].toLowerCase()}
              </span>
            ))}
          </div>
          {reading.length === 0 ? (
            <p className="text-sm text-muted">Nada em andamento. Veja o próximo no <Link className="text-accent" href="/biblioteca">plano de leitura</Link>.</p>
          ) : (
            <ul className="space-y-0.5">
              {reading.slice(0, 3).map((b) => {
                const p = progressoDoLivro(b);
                return (
                  <li key={b.id}>
                    <Link href={`/ler/${b.id}`} className="flex items-center gap-3 rounded-lg p-1.5 -mx-1.5 hover:bg-surface-2">
                      <Cover book={b} url={covers[b.id]} className="w-7 h-10 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm truncate font-medium" title={`${b.author ? `${b.author} — ` : ""}${b.title}`}>{b.title}</span>
                          <span className="text-xs tabular-nums text-muted shrink-0">{Math.round(p * 100)}%{b.word_count && ppmLivros ? ` · ≈ ${fmtDuration((b.word_count * (1 - p) / ppmLivros) * 60)}` : ""}</span>
                        </div>
                        <div className="h-1 rounded-full bg-surface-2 mt-1.5 overflow-hidden">
                          <div className="h-full bg-area-leitura rounded-full" style={{ width: `${Math.round(p * 100)}%` }} />
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
              {reading.length > 3 && <li className="text-xs text-muted pt-1"><Link href="/biblioteca" className="hover:text-ink">+ {reading.length - 3} em leitura →</Link></li>}
            </ul>
          )}
          {/* o que foi concluído no período (e o último livro terminado) */}
          <p className="mt-auto pt-2 text-xs text-muted truncate" title={lastDone?.title}>
            <b className="text-ink font-medium tabular-nums">{concluidos}</b> {concluidos === 1 ? "livro concluído" : "livros concluídos"} — {periodo.nome.toLowerCase()}
            {lastDone && <> · último: <span className="text-ink">{lastDone.title}</span>, em {new Date(lastDone.finished_at!).toLocaleDateString("pt-BR")}</>}
          </p>
        </div>
      </section>

      {/* para onde tudo isso leva */}
      <QuadroSonhos />
      </div>
    </Page>
  );
}

/** Um bloco da faixa: o assunto (com a bolinha da área), o número e, embaixo, a comparação e um detalhe. */
function Indicador({ label, value, delta, detalhe, cor, explica }: {
  label: string; value: React.ReactNode; delta?: React.ReactNode; detalhe?: string; cor?: string; explica?: string;
}) {
  return (
    <div className="bg-surface px-4 py-3 min-w-0" title={explica}>
      <div className="text-xs text-muted truncate flex items-center gap-1.5">
        {cor && <span className="dot !w-1.5 !h-1.5" style={{ background: cor }} aria-hidden />}<span className="truncate">{label}</span>
      </div>
      <div className="text-[1.35rem] font-medium tracking-[-0.02em] tabular-nums leading-none mt-1.5 whitespace-nowrap truncate">{value}</div>
      {(delta || detalhe) && (
        <div className="text-[11.5px] text-faint mt-1.5 truncate">
          {delta}{delta && detalhe ? <span className="mx-1">·</span> : null}{detalhe}
        </div>
      )}
    </div>
  );
}
