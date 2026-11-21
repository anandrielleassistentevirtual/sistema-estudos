"use client";
import Link from "next/link";
import { ChevronRight, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Page, Stat } from "@/components/page";
import { CalendarPanel } from "@/components/calendar-panel";
import { ConfissaoAviso } from "@/components/confissao-aviso";
import { Cover } from "@/components/cover";
import { coverUrls } from "@/lib/covers";
import { TimeBreakdown } from "@/components/time-breakdown";
import { WritingPanel } from "@/components/writing-panel";
import { addDays, dayKey, fmtDuration, nf, parseDay } from "@/lib/dates";
import { FiltroPeriodo } from "@/components/filtro-periodo";
import { Variacao } from "@/components/variacao";
import { TemporadaLinha } from "@/components/temporada-linha";
import { somaNoPeriodo, usePeriodo } from "@/lib/periodo";
import { DayStats, inicio12Meses, loadDaily } from "@/lib/stats";
import { supabase } from "@/lib/supabase/client";
import { ppmDosLivros } from "@/lib/books";
import { sincronizarAnkiSeAntigo } from "@/lib/anki";
import { todas } from "@/lib/supabase/todas";
import { progressoDoLivro, STATUS_LABEL, type Book } from "@/lib/types";
import { OPCOES_LIVRO } from "@/components/status-pill";
import { agrupar } from "@/components/mini-barras";
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
    // a dinâmica de cada número no período (um valor por dia; em períodos longos, por semana)
    const serie = (f: (d: DayStats) => number) => {
      const out: number[] = [];
      for (let d = parseDay(de); dayKey(d) <= ate; d = addDays(d, 1)) { const v = daily.get(dayKey(d)); out.push(v ? f(v) : 0); }
      return agrupar(out);
    };
    return {
      series: { tempo: serie(time), lidas: serie((d) => d.words), escritas: serie((d) => d.written), anki: serie((d) => d.anki) },
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
  const concluidosAnt = books.filter((b) => naData(b.finished_at, periodo.antDe, periodo.antAte)).length;
  const lastDone = books.filter((b) => b.finished_at).sort((a, b) => (b.finished_at! > a.finished_at! ? 1 : -1))[0];
  const remainingWords = books
    .filter((b) => b.status !== "lido")
    .reduce((a, b) => a + (b.word_count ?? 0) * (1 - progressoDoLivro(b)), 0);

  // média simples entre os dois ritmos (a aula falada costuma render mais palavras por minuto que o livro)
  const ppmMedia = ppm.leitura && ppm.estudos ? Math.round((ppm.leitura + ppm.estudos) / 2) : ppm.leitura || ppm.estudos || s.ppm;
  const ppmLivros = ritmoLivros || ppm.leitura || ppmMedia;

  return (
    // tudo numa tela: indicadores no topo; calendário e tempo lado a lado; escrita, leitura e biblioteca embaixo
    <Page denso title={nome ? `Olá, ${nome.split(/\s+/)[0]}` : "Olá"} subtitle={<>{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })} · <TemporadaLinha /></>}
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
      <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3 md:gap-4">
        {/* tudo no período do filtro; legendas: uma linha curta comparando com o período anterior (o tooltip explica) */}
        <Stat compacto label="Tempo" value={fmtDuration(s.tempo)} serie={s.series.tempo} hint={<Variacao atual={s.tempo} base={s.tempoAnt} vs={periodo.vs} />}
          explica={`Timer, leitura no leitor e tempo no Anki dos seus idiomas — ${periodo.nome.toLowerCase()}. Período anterior: ${fmtDuration(s.tempoAnt)}.`} />
        <Stat compacto label="Média por dia" value={fmtDuration(s.media)} hint={<Variacao atual={s.media} base={s.mediaAnt} vs={periodo.vs} />}
          explica={`Tempo dividido pelos dias do período (os dias antes do seu primeiro registro não contam). Período anterior: ${fmtDuration(s.mediaAnt)} por dia.`} />
        <Stat compacto label="Dias de estudo" value={`${s.diasAtivos} de ${s.dias}`} hint={`sequência atual: ${s.streak} ${s.streak === 1 ? "dia" : "dias"}`}
          explica="Dias do período com algum estudo, leitura, revisão ou escrita (contando a partir do seu primeiro registro). A sequência é de dias seguidos até hoje." />
        <Stat compacto label="Velocidade" cor={COR_AREA.leitura} value={s.ppm ? `${s.ppm} ppm` : "—"} hint={<Variacao atual={s.ppm} base={s.ppmAnt} vs={periodo.vs} />}
          explica={`Palavras por minuto no leitor (livros e aulas) — ${periodo.nome.toLowerCase()}. Período anterior: ${s.ppmAnt || "—"} ppm.`} />
        <Stat compacto label="Palavras lidas" cor={COR_AREA.leitura} serie={s.series.lidas} value={nf.format(s.lidas)} hint={<Variacao atual={s.lidas} base={s.lidasAnt} vs={periodo.vs} />}
          explica={`Palavras lidas no leitor — ${periodo.nome.toLowerCase()}. Período anterior: ${nf.format(s.lidasAnt)}.`} />
        <Stat compacto label="Palavras escritas" cor={COR_AREA.escrita} serie={s.series.escritas} value={nf.format(s.escritas)} hint={<Variacao atual={s.escritas} base={s.escritasAnt} vs={periodo.vs} />}
          explica={`Palavras escritas na sala de escrita — ${periodo.nome.toLowerCase()}. Período anterior: ${nf.format(s.escritasAnt)}.`} />
        <Stat compacto label="Revisões Anki" cor={COR_AREA.idiomas} serie={s.series.anki} value={nf.format(s.anki)} hint={<Variacao atual={s.anki} base={s.ankiAnt} vs={periodo.vs} />}
          explica={`Revisões nos baralhos dos seus idiomas — ${periodo.nome.toLowerCase()}. Período anterior: ${nf.format(s.ankiAnt)}.`} />
        <Stat compacto label="Livros concluídos" cor={COR_AREA.leitura} value={nf.format(concluidos)}
          hint={concluidos || concluidosAnt ? <Variacao atual={concluidos} base={concluidosAnt} vs={periodo.vs} /> : `${count("aguardando")} aguardando na fila`}
          explica={`Livros terminados — ${periodo.nome.toLowerCase()}. Na fila: ${count("aguardando")} aguardando${ppmLivros && remainingWords ? `, ≈ ${Math.round(remainingWords / ppmLivros / 60)} h de leitura pela frente` : ""}.`} />
      </div>

      <ConfissaoAviso />

      {/* o calendário fica com a maior parte da largura: os quadradinhos do ano continuam legíveis */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-3 md:gap-4">
        <CalendarPanel compacto periodo={periodo} />
        <TimeBreakdown compacto periodo={periodo} />
      </div>

      {/* tablet: a Escrita ocupa a linha toda e os outros dois dividem a de baixo; computador largo: três colunas */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
        <WritingPanel compacto periodo={periodo} className="md:col-span-2 xl:col-span-1" />
        <div className="card p-4 min-w-0">
          <h2 className="card-title mb-3">Continuar lendo</h2>
          {reading.length === 0 ? (
            <p className="text-sm text-muted">
              Nada em andamento. Veja o próximo no <Link className="text-accent" href="/biblioteca">plano de leitura</Link>.
            </p>
          ) : (
            <ul className="space-y-1">
              {reading.slice(0, 3).map((b) => (
                <li key={b.id}>
                  <Link href={`/ler/${b.id}`} className="flex items-center gap-3 rounded-lg p-1.5 -mx-1.5 hover:bg-surface-2">
                    <Cover book={b} url={covers[b.id]} className="w-7 h-10 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate font-medium" title={`${b.author ? `${b.author} — ` : ""}${b.title}`}>{b.title}</div>
                      <div className="h-1 rounded-full bg-surface-2 mt-1 overflow-hidden">
                        <div className="h-full bg-area-leitura rounded-full" style={{ width: `${Math.round(progressoDoLivro(b) * 100)}%` }} />
                      </div>
                      {b.word_count && ppmLivros ? (
                        <div className="text-[11px] text-muted mt-0.5 tabular-nums truncate">
                          {Math.round(progressoDoLivro(b) * 100)}% · faltam ≈ {fmtDuration((b.word_count * (1 - progressoDoLivro(b)) / ppmLivros) * 60)}
                        </div>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
              {reading.length > 3 && <li className="text-xs text-muted pt-1"><Link href="/biblioteca" className="hover:text-ink">+ {reading.length - 3} em leitura →</Link></li>}
            </ul>
          )}
        </div>
        <div className="card p-4 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="card-title">Biblioteca</h2>
            <Link href="/biblioteca" className="text-sm text-accent flex items-center gap-0.5">Abrir <ChevronRight size={15} /></Link>
          </div>
          {/* 2 × 2: o nome inteiro de cada situação cabe em qualquer largura */}
          <div className="grid grid-cols-2 gap-2">
            {/* a bolinha de cada situação tem a cor da etiqueta na Biblioteca */}
            {(["aguardando", "lendo", "pausado", "lido"] as const).map((st) => (
              <Link key={st} href="/biblioteca" className="rounded-lg bg-surface-2 hover:bg-sel px-3 py-2 min-w-0 flex items-baseline justify-between gap-2 transition-colors">
                <span className="text-xs text-muted truncate flex items-center gap-1.5">
                  <span className="dot !w-1.5 !h-1.5 self-center" style={{ background: OPCOES_LIVRO.find((o) => o.value === st)?.cor }} aria-hidden />
                  {STATUS_LABEL[st]}
                </span>
                <span className="text-lg font-medium tabular-nums leading-tight">{count(st)}</span>
              </Link>
            ))}
          </div>
          <p className="text-xs text-muted mt-2">Concluídos — {periodo.nome.toLowerCase()}: <b className="text-ink font-medium">{concluidos}</b></p>
          {lastDone && (
            <p className="text-xs text-muted mt-1 truncate" title={lastDone.title}>
              Último concluído: {lastDone.title}, em {new Date(lastDone.finished_at!).toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
      </section>
      </div>
    </Page>
  );
}
