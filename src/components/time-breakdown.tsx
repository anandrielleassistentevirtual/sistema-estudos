"use client";
import { useEffect, useMemo, useState } from "react";
import { addDays, dayKey, fmtDuration, weekStart } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";

type Period = "semana" | "30d" | "ano";
const PERIODS: { id: Period; label: string }[] = [
  { id: "semana", label: "Esta semana" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "ano", label: "Este ano" },
];

interface Sess { day: string; seconds: number; category: string; language: string | null; note_id: string | null; label: string }
interface Read { day: string; seconds: number; during_timer: boolean; note_id: string | null }

/** "Onde está indo seu tempo": Leitura, cada idioma, cada curso, outras categorias. */
export function TimeBreakdown() {
  const [period, setPeriod] = useState<Period>("semana");
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [reading, setReading] = useState<Read[]>([]);
  const [courseOf, setCourseOf] = useState<Map<string, string>>(new Map());
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const from = dayKey(new Date(new Date().getFullYear(), 0, 1) < addDays(new Date(), -31) ? new Date(new Date().getFullYear(), 0, 1) : addDays(new Date(), -31));
    const sb = supabase();
    void Promise.all([
      sb.from("study_sessions").select("day,seconds,category,language,note_id,label").gte("day", from).limit(50000),
      sb.from("reading_sessions").select("day,seconds,during_timer,note_id").gte("day", from).limit(50000),
      sb.from("notes").select("id,course").eq("kind", "estudo"),
    ]).then(([s, r, n]) => {
      setSessions((s.data as Sess[]) ?? []);
      setReading((r.data as Read[]) ?? []);
      setCourseOf(new Map(((n.data as { id: string; course: string }[]) ?? []).map((x) => [x.id, x.course])));
    });
  }, []);

  const rows = useMemo(() => {
    const now = new Date();
    const from = dayKey(period === "semana" ? weekStart(now) : period === "30d" ? addDays(now, -29) : new Date(now.getFullYear(), 0, 1));
    const m = new Map<string, { label: string; kind: string; seconds: number }>();
    const add = (key: string, label: string, kind: string, secs: number) => {
      const v = m.get(key) ?? { label, kind, seconds: 0 };
      v.seconds += secs;
      m.set(key, v);
    };
    for (const s of sessions) {
      if (s.day < from) continue;
      if (s.category === "Idiomas") add(`lang:${s.language ?? ""}`, s.language || "Idiomas (sem idioma)", "Idioma", s.seconds);
      else if (s.category === "Estudos") {
        const course = s.note_id ? courseOf.get(s.note_id) : undefined;
        add(`curso:${course ?? ""}`, course || "Estudos (sem curso)", "Curso", s.seconds);
      } else if (s.category === "Leitura") add("leitura", "Leitura", "Leitura", s.seconds);
      else add(`cat:${s.category}`, s.category, "Outros", s.seconds);
    }
    // leitura medida no leitor sem o timer ligado (com o timer, já entrou acima)
    for (const r of reading) {
      if (r.day < from || r.during_timer) continue;
      if (r.note_id) {
        const course = courseOf.get(r.note_id);
        add(`curso:${course ?? ""}`, course || "Estudos (sem curso)", "Curso", r.seconds);
      } else add("leitura", "Leitura", "Leitura", r.seconds);
    }
    return [...m.entries()].map(([key, v]) => ({ key, ...v })).filter((r) => r.seconds >= 60).sort((a, b) => b.seconds - a.seconds);
  }, [sessions, reading, courseOf, period]);

  const total = rows.reduce((a, r) => a + r.seconds, 0);
  const max = Math.max(1, ...rows.map((r) => r.seconds));

  return (
    <section className="card p-5 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="font-semibold">Onde está indo seu tempo</h2>
          <p className="text-xs text-muted mt-0.5">{total ? `${fmtDuration(total)} no total` : "Nenhum tempo registrado no período"}</p>
        </div>
        <div className="inline-flex rounded-lg bg-surface-2 p-1 text-xs">
          {PERIODS.map((p) => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`px-2.5 py-1 rounded-md ${period === p.id ? "bg-surface shadow-sm font-medium" : "text-muted"}`}>{p.label}</button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted py-6 text-center">Use o Timer (ou leia no leitor, faça lições e revisões) para ver aqui como seu tempo se divide.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const pct = r.seconds / total;
            return (
              <li key={r.key} className="grid grid-cols-[minmax(110px,180px)_1fr_auto] items-center gap-3 text-sm"
                onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(null)}>
                <span className="truncate" title={r.label}>
                  {r.label}
                  {r.kind !== r.label && <span className="block text-[11px] text-faint">{r.kind}</span>}
                </span>
                <span className="h-3.5 rounded-[4px] bg-surface-2 overflow-hidden" title={`${r.label}: ${fmtDuration(r.seconds)} (${Math.round(pct * 100)}%)`}>
                  <span className="block h-full rounded-[4px] transition-opacity"
                    style={{ width: `${(r.seconds / max) * 100}%`, background: "var(--accent)", opacity: hover && hover !== r.key ? 0.55 : 1 }} />
                </span>
                <span className="tabular-nums text-right whitespace-nowrap">
                  <span className="font-medium">{fmtDuration(r.seconds)}</span>
                  <span className="text-xs text-muted ml-1.5">{Math.round(pct * 100)}%</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
