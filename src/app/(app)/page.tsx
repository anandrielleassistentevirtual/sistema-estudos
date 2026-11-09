"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpen } from "lucide-react";
import { Page, Stat } from "@/components/page";
import { CalendarPanel } from "@/components/calendar-panel";
import { Cover } from "@/components/cover";
import { coverUrls } from "@/lib/covers";
import { TimeBreakdown } from "@/components/time-breakdown";
import { WritingPanel } from "@/components/writing-panel";
import { StoragePanel } from "@/components/storage-panel";
import { addDays, dayKey, fmtDuration, nf, weekStart } from "@/lib/dates";
import { DayStats, inicio12Meses, loadDaily } from "@/lib/stats";
import { supabase } from "@/lib/supabase/client";
import type { Book } from "@/lib/types";

const WEEKS = 12;

export default function Dashboard() {
  const [daily, setDaily] = useState<Map<string, DayStats>>(new Map());
  const [books, setBooks] = useState<Book[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState("");
  useEffect(() => {
    void supabase().auth.getUser().then(({ data }) => {
      const m = data.user?.user_metadata ?? {};
      setNome(String(m.nome ?? m.full_name ?? m.name ?? ""));
    });
  }, []);

  useEffect(() => {
    Promise.all([
      loadDaily(inicio12Meses()),
      supabase().from("books").select("*").order("created_at", { ascending: false }),
    ]).then(([d, b]) => {
      setDaily(d);
      setBooks((b.data as Book[]) ?? []);
      void coverUrls((b.data as Book[]) ?? []).then(setCovers);
      setLoading(false);
    });
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
      const any = v && (v.study + v.reading > 0 || v.reads > 0 || v.anki > 0);
      if (any) streak++;
      else if (dayKey(d) !== today) break;
      if (streak > 400) break;
    }
    return {
      today: time(daily.get(today) ?? ({} as DayStats)) || 0,
      week: sum(ws, now, time),
      weekWords: sum(ws, now, (d) => d.words),
      weekReads: sum(ws, now, (d) => d.reads),
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
    .filter((b) => b.status !== "lido")
    .reduce((a, b) => a + (b.word_count ?? 0) * (1 - b.progress), 0);

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
        <Stat label="Velocidade" value={s.wpm ? `${s.wpm} ppm` : "—"} hint="palavras/min, últimos 30 dias" />
        <Stat label="Palavras na semana" value={nf.format(s.weekWords)} hint={`média semanal: ${nf.format(Math.round(s.avgWeek))}`} />
        <Stat label="Frases lidas (idiomas)" value={nf.format(s.weekReads)} hint="esta semana" />
        <Stat label="Revisões Anki" value={nf.format(s.weekAnki)} hint="esta semana (sincronizado)" />
        <Stat
          label="Mapa da Ignorância"
          value={`${count("aguardando")} livros`}
          hint={s.wpm && remainingWords ? `≈ ${fmtDuration((remainingWords / s.wpm) * 60)} de leitura pela frente` : "aguardando leitura"}
        />
      </div>

      <CalendarPanel />

      <TimeBreakdown />

      <WritingPanel />

      <section className="mt-4 grid md:grid-cols-2 gap-4">
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
                    <Cover book={b} url={covers[b.id]} className="w-9 h-12" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">
                        {b.author && <><span className="font-medium">{b.author}</span><span className="text-faint"> — </span></>}
                        <span className="font-medium">{b.title}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-2 mt-1.5 overflow-hidden">
                        <div className="h-full bg-chart rounded-full" style={{ width: `${Math.round(b.progress * 100)}%` }} />
                      </div>
                    </div>
                    <span className="text-xs text-muted tabular-nums">{Math.round(b.progress * 100)}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <h2 className="font-medium mb-3">Biblioteca</h2>
          <div className="grid grid-cols-4 gap-2 text-center">
            {(["aguardando", "lendo", "pausado", "lido"] as const).map((st) => (
              <div key={st} className="rounded-lg bg-surface-2 py-3">
                <div className="text-xl font-medium tabular-nums">{count(st)}</div>
                <div className="text-xs text-muted capitalize">{st}</div>
              </div>
            ))}
          </div>
          {lastDone && (
            <p className="text-xs text-muted mt-3">
              Último concluído: {lastDone.title}, em {new Date(lastDone.finished_at!).toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
      </section>

      <StoragePanel />
    </Page>
  );
}
