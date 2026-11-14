"use client";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Page } from "@/components/page";
import { useTimer } from "@/components/timer-context";
import { TimerControls } from "@/components/timer-controls";
import { dayKey, fmtDuration } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";
import { ankiPorIdioma, contaComoEstudo } from "@/lib/tempo";

interface Session { id: string; started_at: string; seconds: number; category: string; label: string }

export default function TimerPage() {
  const t = useTimer();
  const [today, setToday] = useState<Session[]>([]);
  // o resto do tempo de hoje, pela mesma regra do Dashboard: leitura no leitor sem o Timer e o tempo no Anki
  const [extras, setExtras] = useState<{ leitura: number; estudosLeitor: number; anki: { idioma: string; segundos: number }[]; ankiWeb: boolean }>({ leitura: 0, estudosLeitor: 0, anki: [], ankiWeb: false });

  const load = async () => {
    const sb = supabase();
    const hoje = dayKey();
    const [sess, leit, a] = await Promise.all([
      sb.from("study_sessions").select("*").eq("day", hoje).order("started_at", { ascending: false }),
      sb.from("reading_sessions").select("seconds,during_timer,note_id").eq("day", hoje),
      ankiPorIdioma(hoje),
    ]);
    setToday((sess.data as Session[]) ?? []);
    const fora = ((leit.data as { seconds: number; during_timer: boolean; note_id: string | null }[] | null) ?? []).filter((x) => !x.during_timer);
    const porIdioma = new Map<string, number>();
    for (const d of a.dias) porIdioma.set(d.idioma, (porIdioma.get(d.idioma) ?? 0) + d.segundos);
    setExtras({
      leitura: fora.filter((x) => !x.note_id).reduce((n, x) => n + x.seconds, 0),
      estudosLeitor: fora.filter((x) => x.note_id).reduce((n, x) => n + x.seconds, 0),
      anki: [...porIdioma.entries()].map(([idioma, segundos]) => ({ idioma, segundos })),
      ankiWeb: a.ankiWeb,
    });
  };
  useEffect(() => {
    void load();
  }, [t.lastSaved]);

  const contadas = today.filter((s) => contaComoEstudo(s.label, extras.ankiWeb));
  const byCat = contadas.reduce<Record<string, number>>((a, s) => ((a[s.category] = (a[s.category] ?? 0) + s.seconds), a), {});
  if (extras.leitura) byCat.Leitura = (byCat.Leitura ?? 0) + extras.leitura;
  if (extras.estudosLeitor) byCat.Estudos = (byCat.Estudos ?? 0) + extras.estudosLeitor;
  const ankiHoje = extras.anki.reduce((n, a) => n + a.segundos, 0);
  if (ankiHoje) byCat.Idiomas = (byCat.Idiomas ?? 0) + ankiHoje;
  const totalHoje = Object.values(byCat).reduce((n, v) => n + v, 0);

  return (
    <Page wide title="Timer">
      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <div className="card p-5 lg:p-6">
          <TimerControls />
        </div>

        <div className="card p-5 flex flex-col lg:max-h-[calc(100vh-11rem)]">
          <h2 className="font-medium">Hoje</h2>
          <p className="text-3xl font-medium mt-1 tabular-nums">{fmtDuration(totalHoje)}</p>
          <div className="mt-3 space-y-1">
            {Object.entries(byCat).map(([c, secs]) => (
              <div key={c} className="flex justify-between text-sm"><span className="text-muted">{c}</span><span className="tabular-nums">{fmtDuration(secs)}</span></div>
            ))}
          </div>
          <h3 className="label mt-5 mb-2">Sessões</h3>
          {today.length === 0 && !extras.leitura && !extras.estudosLeitor && !ankiHoje && <p className="text-sm text-muted">Nenhuma sessão salva hoje.</p>}
          <ul className="space-y-1.5 overflow-y-auto min-h-0 -mr-2 pr-2">
            {/* o que entra sem passar pelo Timer (mesma regra do Dashboard) */}
            {extras.anki.filter((a) => a.segundos >= 30).map((a) => (
              <li key={`anki-${a.idioma}`} className="flex items-center justify-between text-sm">
                <span><span className="text-faint mr-2">Anki</span>{a.idioma}</span>
                <span className="tabular-nums text-muted mr-6">{fmtDuration(a.segundos)}</span>
              </li>
            ))}
            {extras.leitura >= 30 && (
              <li className="flex items-center justify-between text-sm">
                <span><span className="text-faint mr-2">Leitor</span>Leitura sem o Timer</span>
                <span className="tabular-nums text-muted mr-6">{fmtDuration(extras.leitura)}</span>
              </li>
            )}
            {extras.estudosLeitor >= 30 && (
              <li className="flex items-center justify-between text-sm">
                <span><span className="text-faint mr-2">Leitor</span>Aulas sem o Timer</span>
                <span className="tabular-nums text-muted mr-6">{fmtDuration(extras.estudosLeitor)}</span>
              </li>
            )}
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
