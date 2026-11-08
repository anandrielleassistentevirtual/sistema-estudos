"use client";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Page } from "@/components/page";
import { useTimer } from "@/components/timer-context";
import { TimerControls } from "@/components/timer-controls";
import { dayKey, fmtDuration } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";

interface Session { id: string; started_at: string; seconds: number; category: string; label: string }

export default function TimerPage() {
  const t = useTimer();
  const [today, setToday] = useState<Session[]>([]);

  const load = () =>
    supabase()
      .from("study_sessions")
      .select("*")
      .eq("day", dayKey())
      .order("started_at", { ascending: false })
      .then(({ data }) => setToday((data as Session[]) ?? []));
  useEffect(() => {
    void load();
  }, [t.lastSaved]);

  const byCat = today.reduce<Record<string, number>>((a, s) => ((a[s.category] = (a[s.category] ?? 0) + s.seconds), a), {});

  return (
    <Page title="Timer" subtitle="Cada sessão de foco entra no calendário e no dashboard.">
      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <div className="card p-6">
          <TimerControls />
        </div>

        <div className="card p-5">
          <h2 className="font-semibold">Hoje</h2>
          <p className="text-3xl font-semibold mt-1 tabular-nums">{fmtDuration(today.reduce((a, s) => a + s.seconds, 0))}</p>
          <div className="mt-3 space-y-1">
            {Object.entries(byCat).map(([c, secs]) => (
              <div key={c} className="flex justify-between text-sm"><span className="text-muted">{c}</span><span className="tabular-nums">{fmtDuration(secs)}</span></div>
            ))}
          </div>
          <h3 className="label mt-5 mb-2">Sessões</h3>
          {today.length === 0 && <p className="text-sm text-muted">Nenhuma sessão salva hoje.</p>}
          <ul className="space-y-1.5">
            {today.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm group">
                <span>
                  <span className="text-faint tabular-nums mr-2">
                    {new Date(s.started_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {s.label || s.category}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums text-muted">{fmtDuration(s.seconds)}</span>
                  <button className="opacity-0 group-hover:opacity-100 text-faint hover:text-critical" title="Apagar"
                    onClick={async () => { await supabase().from("study_sessions").delete().eq("id", s.id); void load(); }}>
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Page>
  );
}
