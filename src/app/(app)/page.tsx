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
    <Page title={nome ? `Olá, ${nome.split(/\s+/)[0]}` : "Olá"} subtitle={new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
      actions={<button className="text-xs text-faint hover:text-ink" title="Como você quer ser chamado" onClick={async () => {
        const n = prompt("Seu nome:", nome)?.trim();
        if (n === undefined || n === null) return;
        await supabase().auth.updateUser({ data: { nome: n } });
        setNome(n);
      }}>{nome ? "trocar nome" : "Como quer ser chamado?"}</button>}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Hoje" value={fmtDuration(s.today)} hint="timer + leitura" />
        <Stat label="Esta semana" value={fmtDuration(s.week)} />
        <Stat label="Sequência" value={`${s.streak} ${s.streak === 1 ? "dia" : "dias"}`} />
        <Stat label="Velocidade" value={ppmMedia ? `${ppmMedia} ppm` : "—"}
          hint={ppm.leitura && ppm.estudos ? `leitura ${ppm.leitura} · estudos ${ppm.estudos} (média, 30 dias)` : ppm.leitura ? `leitura, últimos 30 dias` : ppm.estudos ? "estudos, últimos 30 dias" : "palavras/min, últimos 30 dias"} />
        <Stat label="Palavras na semana" value={nf.format(s.weekWords)} hint={`média semanal: ${nf.format(Math.round(s.avgWeek))}`} />
        <Stat label="Palavras escritas" value={nf.format(s.weekWritten)} hint="esta semana" />
        <Stat label="Revisões Anki" value={nf.format(s.weekAnki)} hint="esta semana (sincronizado)" />
        <Stat
          label="Biblioteca"
          value={`${count("aguardando")} livros`}
          hint={ppmLivros && remainingWords ? `≈ ${fmtDuration((remainingWords / ppmLivros) * 60)} de leitura pela frente` : "aguardando leitura"}
        />
      </div>

      <ConfissaoAviso />

      <CalendarPanel />

      <TimeBreakdown />

      <WritingPanel />

      <section className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-medium mb-3">Continuar lendo</h2>
          {reading.length === 0 ? (
            <p className="text-sm text-muted">
              Nada em andamento. Escolha algo na <Link className="text-accent" href="/biblioteca">fila de leitura</Link>.
            </p>
          ) : (
            <ul className="space-y-2">
              {reading.map((b) => (
                <li key={b.id}>
                  <Link href={`/ler/${b.id}`} className="flex items-center gap-3 rounded-lg p-2 -mx-2 hover:bg-surface-2">
                    <Cover book={b} url={covers[b.id]} className="w-9 h-12 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm line-clamp-2 sm:line-clamp-1 break-words leading-snug">
                        {b.author && <><span className="font-medium">{b.author}</span><span className="text-faint"> — </span></>}
                        <span className="font-medium">{b.title}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-2 mt-1.5 overflow-hidden">
                        <div className="h-full bg-chart rounded-full" style={{ width: `${Math.round(progressoDoLivro(b) * 100)}%` }} />
                      </div>
                      {b.word_count && ppmLivros ? (
                        <div className="text-[11px] text-muted mt-1 tabular-nums">
                          faltam {nf.format(Math.round(b.word_count * (1 - progressoDoLivro(b))))} palavras · ≈ {fmtDuration((b.word_count * (1 - progressoDoLivro(b)) / ppmLivros) * 60)}
                        </div>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted tabular-nums shrink-0">{Math.round(progressoDoLivro(b) * 100)}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <h2 className="font-medium mb-3">Biblioteca</h2>
          <div className="grid grid-cols-2 min-[420px]:grid-cols-4 gap-2 text-center">
            {(["aguardando", "lendo", "pausado", "lido"] as const).map((st) => (
              <div key={st} className="rounded-lg bg-surface-2 py-3">
                <div className="text-xl font-medium tabular-nums">{count(st)}</div>
                <div className="text-xs text-muted capitalize">{st}</div>
              </div>
            ))}
          </div>
          {count("consulta") > 0 && (
            <p className="text-xs text-muted mt-3">+ {count("consulta")} {count("consulta") === 1 ? "obra" : "obras"} de consulta (fora dos indicadores)</p>
          )}
          {lastDone && (
            <p className="text-xs text-muted mt-3">
              Último concluído: {lastDone.title}, em {new Date(lastDone.finished_at!).toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
      </section>
    </Page>
  );
}
