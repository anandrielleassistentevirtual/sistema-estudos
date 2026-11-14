"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Page, Stat } from "@/components/page";
import { CalendarPanel } from "@/components/calendar-panel";
import { ConfissaoAviso } from "@/components/confissao-aviso";
import { Cover } from "@/components/cover";
import { coverUrls } from "@/lib/covers";
import { TimeBreakdown } from "@/components/time-breakdown";
import { WritingPanel } from "@/components/writing-panel";
import { addDays, dayKey, fmtDuration, nf, weekStart } from "@/lib/dates";
import { DayStats, inicio12Meses, loadDaily } from "@/lib/stats";
import { supabase } from "@/lib/supabase/client";
import { ppmDosLivros } from "@/lib/books";
import { sincronizarAnkiSeAntigo } from "@/lib/anki";
import { todas } from "@/lib/supabase/todas";
import { progressoDoLivro, type Book } from "@/lib/types";

const WEEKS = 12;

export default function Dashboard() {
  const [daily, setDaily] = useState<Map<string, DayStats>>(new Map());
  const [books, setBooks] = useState<Book[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [nome, setNome] = useState("");
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
    void sincronizarAnkiSeAntigo(3).then((ok) => { if (ok) void loadDaily(inicio12Meses()).then(setDaily); });
  }, []);

  const s = useMemo(() => {
    const today = dayKey();
    const ws = weekStart(new Date());
    const sum = (from: Date, to: Date, f: (d: DayStats) => number) => {
      let t = 0;
      for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
        const v = daily.get(dayKey(d));
        if (v) t += f(v);
      }
      return t;
    };
    const now = new Date();
    const time = (d: DayStats) => d.study + d.reading;
    const weekly = Array.from({ length: WEEKS }, (_, i) => {
      const start = addDays(ws, -(WEEKS - 1 - i) * 7);
      const end = addDays(start, 6);
      return {
        label: start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        detail: `semana de ${start.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}`,
        value: sum(start, end, (d) => d.words),
      };
    });
    const past = weekly.slice(0, -1).filter((w) => w.value > 0);
    const avgWeek = past.length ? past.reduce((a, b) => a + b.value, 0) / past.length : 0;
    const from30 = addDays(now, -29);
    const words30 = sum(from30, now, (d) => d.words);
    const secs30 = sum(from30, now, (d) => d.readingAll);
    // sequência de dias com algum estudo
    let streak = 0;
    for (let d = new Date(now); ; d = addDays(d, -1)) {
      const v = daily.get(dayKey(d));
      const any = v && (v.study + v.reading > 0 || v.anki > 0 || v.written > 0);
      if (any) streak++;
      else if (dayKey(d) !== today) break;
      if (streak > 400) break;
    }
    return {
      today: time(daily.get(today) ?? ({} as DayStats)) || 0,
      week: sum(ws, now, time),
      weekWords: sum(ws, now, (d) => d.words),
      weekWritten: sum(ws, now, (d) => d.written),
      weekAnki: sum(ws, now, (d) => d.anki),
      wpm: secs30 > 60 ? Math.round(words30 / (secs30 / 60)) : 0,
      avgWeek,
      weekly,
      streak,
    };
  }, [daily]);

  const count = (st: Book["status"]) => books.filter((b) => b.status === st).length;
  const reading = books.filter((b) => b.status === "lendo");
  const lastDone = books.filter((b) => b.finished_at).sort((a, b) => (b.finished_at! > a.finished_at! ? 1 : -1))[0];
  const remainingWords = books
    .filter((b) => b.status !== "lido" && b.status !== "consulta") // obras de consulta não estão "pela frente"
    .reduce((a, b) => a + (b.word_count ?? 0) * (1 - progressoDoLivro(b)), 0);

  // média simples entre os dois ritmos (a aula falada costuma render mais palavras por minuto que o livro)
  const ppmMedia = ppm.leitura && ppm.estudos ? Math.round((ppm.leitura + ppm.estudos) / 2) : ppm.leitura || ppm.estudos || s.wpm;
  const ppmLivros = ritmoLivros || ppm.leitura || ppmMedia;

  return (
    // tudo numa tela: indicadores no topo; calendário e tempo lado a lado; escrita, leitura e biblioteca embaixo
    <Page denso title={nome ? `Olá, ${nome.split(/\s+/)[0]}` : "Olá"} subtitle={new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
      actions={<button className="text-xs text-faint hover:text-ink" title="Como você quer ser chamado" onClick={async () => {
        const n = prompt("Seu nome:", nome)?.trim();
        if (n === undefined || n === null) return;
        await supabase().auth.updateUser({ data: { nome: n } });
        setNome(n);
      }}>{nome ? "trocar nome" : "Como quer ser chamado?"}</button>}>
      <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3">
        <Stat compacto label="Hoje" value={fmtDuration(s.today)} hint="timer + leitura" />
        <Stat compacto label="Esta semana" value={fmtDuration(s.week)} />
        <Stat compacto label="Sequência" value={`${s.streak} ${s.streak === 1 ? "dia" : "dias"}`} />
        <Stat compacto label="Velocidade" value={ppmMedia ? `${ppmMedia} ppm` : "—"}
          hint={ppm.leitura && ppm.estudos ? `leitura ${ppm.leitura} · estudos ${ppm.estudos} (média, 30 dias)` : ppm.leitura ? `leitura, últimos 30 dias` : ppm.estudos ? "estudos, últimos 30 dias" : "palavras/min, últimos 30 dias"} />
        <Stat compacto label="Palavras na semana" value={nf.format(s.weekWords)} hint={`média semanal: ${nf.format(Math.round(s.avgWeek))}`} />
        <Stat compacto label="Palavras escritas" value={nf.format(s.weekWritten)} hint="esta semana" />
        <Stat compacto label="Revisões Anki" value={nf.format(s.weekAnki)} hint="esta semana (sincronizado)" />
        <Stat
          compacto
          label="Biblioteca"
          value={`${count("aguardando")} livros`}
          hint={ppmLivros && remainingWords ? `≈ ${fmtDuration((remainingWords / ppmLivros) * 60)} de leitura pela frente` : "aguardando leitura"}
        />
      </div>

      <ConfissaoAviso />

      <div className="grid xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4 mt-4">
        <CalendarPanel compacto />
        <TimeBreakdown compacto />
      </div>

      <section className="mt-4 grid lg:grid-cols-3 gap-4">
        <WritingPanel compacto />
        <div className="card p-4 min-w-0">
          <h2 className="font-medium mb-2">Continuar lendo</h2>
          {reading.length === 0 ? (
            <p className="text-sm text-muted">
              Nada em andamento. Escolha algo na <Link className="text-accent" href="/biblioteca">fila de leitura</Link>.
            </p>
          ) : (
            <ul className="space-y-1">
              {reading.slice(0, 3).map((b) => (
                <li key={b.id}>
                  <Link href={`/ler/${b.id}`} className="flex items-center gap-3 rounded-lg p-1.5 -mx-1.5 hover:bg-surface-2">
                    <Cover book={b} url={covers[b.id]} className="w-7 h-10" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate font-medium" title={`${b.author ? `${b.author} — ` : ""}${b.title}`}>{b.title}</div>
                      <div className="h-1 rounded-full bg-surface-2 mt-1 overflow-hidden">
                        <div className="h-full bg-chart rounded-full" style={{ width: `${Math.round(progressoDoLivro(b) * 100)}%` }} />
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
          <h2 className="font-medium mb-2">Biblioteca</h2>
          <div className="grid grid-cols-4 gap-2 text-center">
            {(["aguardando", "lendo", "pausado", "lido"] as const).map((st) => (
              <div key={st} className="rounded-lg bg-surface-2 py-2">
                <div className="text-lg font-medium tabular-nums">{count(st)}</div>
                <div className="text-[11px] text-muted capitalize">{st}</div>
              </div>
            ))}
          </div>
          {count("consulta") > 0 && (
            <p className="text-xs text-muted mt-2">+ {count("consulta")} {count("consulta") === 1 ? "obra" : "obras"} de consulta (fora dos indicadores)</p>
          )}
          {lastDone && (
            <p className="text-xs text-muted mt-2 truncate" title={lastDone.title}>
              Último concluído: {lastDone.title}, em {new Date(lastDone.finished_at!).toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
      </section>
    </Page>
  );
}
