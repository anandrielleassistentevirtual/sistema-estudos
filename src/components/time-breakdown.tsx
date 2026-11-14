"use client";
import { useEffect, useMemo, useState } from "react";
import { addDays, dayKey, fmtDuration, weekStart } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";
import { todas } from "@/lib/supabase/todas";

type Period = "semana" | "30d" | "ano";
const PERIODS: { id: Period; label: string }[] = [
  { id: "semana", label: "Esta semana" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "ano", label: "Este ano" },
];

interface Sess { day: string; seconds: number; category: string; language: string | null; note_id: string | null; label: string }
interface Read { day: string; seconds: number; during_timer: boolean; note_id: string | null }

/** "Onde está indo seu tempo": Leitura, cada idioma, cada curso, outras categorias. */
export function TimeBreakdown({ compacto = false }: { compacto?: boolean } = {}) {
  const [period, setPeriod] = useState<Period>("semana");
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [reading, setReading] = useState<Read[]>([]);
  const [courseOf, setCourseOf] = useState<Map<string, string>>(new Map());
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const from = dayKey(new Date(new Date().getFullYear(), 0, 1) < addDays(new Date(), -31) ? new Date(new Date().getFullYear(), 0, 1) : addDays(new Date(), -31));
    const sb = supabase();
    void Promise.all([
      todas<Sess>((de, ate) => sb.from("study_sessions").select("day,seconds,category,language,note_id,label").gte("day", from).order("id").range(de, ate)),
      todas<Read>((de, ate) => sb.from("reading_sessions").select("day,seconds,during_timer,note_id").gte("day", from).order("id").range(de, ate)),
      todas<{ id: string; course: string }>((de, ate) => sb.from("notes").select("id,course").eq("kind", "estudo").order("id").range(de, ate)),
    ]).then(([s, r, n]) => {
      setSessions(s);
      setReading(r);
      // só a pasta do curso: "Paulo Cantarelli › EFESC › Correções" → "EFESC" (o autor e as subpastas ficam de fora)
      const doCurso = (caminho: string) => { const p = caminho.split(" › ").map((x) => x.trim()).filter(Boolean); return p[1] ?? p[0] ?? ""; };
      setCourseOf(new Map(n.map((x) => [x.id, doCurso(x.course)])));
    }).catch(() => {});
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
  // compacto: os 5 maiores e o resto somado em "Outros" (cabe na tela do Dashboard)
  const visiveis = compacto && rows.length > 6
    ? [...rows.slice(0, 5), { key: "__outros", label: "Outros", kind: `${rows.length - 5} itens`, seconds: rows.slice(5).reduce((a, r) => a + r.seconds, 0) } as typeof rows[number]]
    : rows;
  const max = Math.max(1, ...visiveis.map((r) => r.seconds));

  return (
    <section className={compacto ? "card p-4 min-w-0" : "card p-5 mt-4"}>
      <div className={`flex flex-wrap items-center justify-between gap-2 ${compacto ? "mb-3" : "mb-4"}`}>
        <div>
          <h2 className="font-medium">Onde está indo seu tempo</h2>
          <p className="text-xs text-muted mt-0.5">{total ? `${fmtDuration(total)} no total` : "Nenhum tempo registrado no período"}</p>
        </div>
        <div className="inline-flex rounded-lg bg-surface-2 p-1 text-xs">
          {PERIODS.map((p) => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`px-2.5 py-1 rounded-md ${period === p.id ? "bg-seg shadow-sm font-medium" : "text-muted"}`}>{p.label}</button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted py-6 text-center">Use o Timer (ou leia no leitor, faça lições e revisões) para ver aqui como seu tempo se divide.</p>
      ) : (
        <ul className={compacto ? "space-y-1.5" : "space-y-2.5"}>
          {visiveis.map((r) => {
            const pct = r.seconds / total;
            return (
              <li key={r.key} className="grid grid-cols-[minmax(110px,180px)_1fr_auto] items-center gap-3 text-sm"
                onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(null)}>
                <span className="truncate" title={r.label}>
                  {r.label}
                  {r.kind !== r.label && <span className={compacto ? "text-[11px] text-faint ml-1.5" : "block text-[11px] text-faint"}>{r.kind}</span>}
                </span>
                <span className="h-2.5 rounded-full bg-surface-2 overflow-hidden" title={`${r.label}: ${fmtDuration(r.seconds)} (${Math.round(pct * 100)}%)`}>
                  <span className="block h-full rounded-full transition-opacity"
                    style={{ width: `${(r.seconds / max) * 100}%`, background: "var(--chart)", opacity: hover && hover !== r.key ? 0.55 : 1 }} />
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
