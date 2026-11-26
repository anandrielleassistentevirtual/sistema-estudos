"use client";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Page } from "@/components/page";
import { useTimer } from "@/components/timer-context";
import { TimerControls } from "@/components/timer-controls";
import { dayKey, fmtDuration } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";
import { ankiPorIdioma, contaComoEstudo } from "@/lib/tempo";
import { apagarSessaoMar } from "@/lib/mar";
import { corDaCategoria } from "@/lib/cores";

interface Session { id: string; started_at: string; seconds: number; category: string; label: string; mar_titulo_id?: string | null }

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
  /** Tempo do MAR sai pelo banco (os episódios que ele cobria voltam a contar pela minutagem); o resto, delete comum. */
  async function apagar(s: Session) {
    if (s.mar_titulo_id) {
      if (!confirm("Apagar este tempo do MAR? Se ele cobria episódios, eles voltam a contar pela minutagem.")) return;
      const r = await apagarSessaoMar(s.id);
      if (!r.ok) { alert(r.msg); return; }
    } else {
      await supabase().from("study_sessions").delete().eq("id", s.id);
    }
    void load();
  }

  useEffect(() => {
    void load();
  }, [t.lastSaved]);

  const contadas = today.filter((s) => contaComoEstudo(s.label, extras.ankiWeb, s.category));
  const byCat = contadas.reduce<Record<string, number>>((a, s) => ((a[s.category] = (a[s.category] ?? 0) + s.seconds), a), {});
  if (extras.leitura) byCat.Leitura = (byCat.Leitura ?? 0) + extras.leitura;
  if (extras.estudosLeitor) byCat.Estudos = (byCat.Estudos ?? 0) + extras.estudosLeitor;
  const ankiHoje = extras.anki.reduce((n, a) => n + a.segundos, 0);
  if (ankiHoje) byCat.Idiomas = (byCat.Idiomas ?? 0) + ankiHoje;
  const totalHoje = Object.values(byCat).reduce((n, v) => n + v, 0);
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  /** A hora da sessão (HH:MM); um registro sem hora válida mostra um traço. */
  const hora = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };
  // a mesma regra do relógio: os pomodoros contam só no dia em que foram feitos
  const ciclosHoje = t.ciclosDia === dayKey() ? t.cycles : 0;
  // as sessões numa grade só: bolinha · hora (ou origem) · rótulo · duração, todas na mesma coluna
  const LINHA = "grid grid-cols-[auto_2.75rem_minmax(0,1fr)_auto] items-center gap-x-2 text-sm";
  const bolinha = (cor: string) => <span className="dot !w-1.5 !h-1.5" style={{ background: cor }} aria-hidden />;

  return (
    <Page title="Timer">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 md:gap-4">
        {/* @container: o TimerControls põe o relógio ao lado dos ajustes só quando o cartão tem largura para isso */}
        <div className="card @container p-4 sm:p-5 lg:p-6 min-w-0">
          <TimerControls />
        </div>

        <div className="card p-4 sm:p-5 lg:p-6 flex flex-col min-w-0 lg:max-h-[calc(100vh-11rem)]">
          <h2 className="card-title">Hoje</h2>
          <div className="flex items-baseline justify-between gap-3 mt-1">
            <p className="text-3xl font-medium tracking-[-0.02em] tabular-nums">{fmtDuration(totalHoje)}</p>
            {(t.mode === "pomodoro" || ciclosHoje > 0) && (
              <span className="text-xs text-faint tabular-nums whitespace-nowrap">{ciclosHoje} {ciclosHoje === 1 ? "pomodoro" : "pomodoros"}</span>
            )}
          </div>
          {/* a composição do dia nas cores das áreas (as mesmas do Dashboard) */}
          {cats.length > 1 && (
            <div className="flex h-1.5 gap-[2px] rounded-full overflow-hidden mt-3" aria-hidden>
              {cats.map(([c, secs]) => <span key={c} className="h-full" style={{ flexGrow: secs, flexBasis: 0, minWidth: 3, background: corDaCategoria(c) }} />)}
            </div>
          )}
          <div className="mt-3 space-y-1">
            {cats.map(([c, secs]) => (
              <div key={c} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted flex items-center gap-2 min-w-0">{bolinha(corDaCategoria(c))}<span className="truncate">{c}</span></span>
                <span className="tabular-nums">{fmtDuration(secs)}</span>
              </div>
            ))}
          </div>
          <h3 className="label mt-5 mb-2">Sessões</h3>
          {today.length === 0 && !extras.leitura && !extras.estudosLeitor && !ankiHoje && <p className="text-sm text-muted">Nenhuma sessão salva hoje.</p>}
          <ul className="space-y-1.5 overflow-y-auto min-h-0 -mr-2 pr-2">
            {/* o que entra sem passar pelo Timer (mesma regra do Dashboard) */}
            {extras.anki.filter((a) => a.segundos >= 30).map((a) => (
              <li key={`anki-${a.idioma}`} className={LINHA}>
                {bolinha(corDaCategoria("Idiomas"))}<span className="text-faint">Anki</span>
                <span className="truncate">{a.idioma}</span>
                <span className="tabular-nums text-muted">{fmtDuration(a.segundos)}</span>
              </li>
            ))}
            {extras.leitura >= 30 && (
              <li className={LINHA}>
                {bolinha(corDaCategoria("Leitura"))}<span className="text-faint">Leitor</span>
                <span className="truncate">Leitura sem o Timer</span>
                <span className="tabular-nums text-muted">{fmtDuration(extras.leitura)}</span>
              </li>
            )}
            {extras.estudosLeitor >= 30 && (
              <li className={LINHA}>
                {bolinha(corDaCategoria("Estudos"))}<span className="text-faint">Leitor</span>
                <span className="truncate">Aulas sem o Timer</span>
                <span className="tabular-nums text-muted">{fmtDuration(extras.estudosLeitor)}</span>
              </li>
            )}
            {today.map((s) => (
              <li key={s.id} className={`${LINHA} group`}>
                {bolinha(corDaCategoria(s.category))}
                <span className="text-faint tabular-nums">{hora(s.started_at)}</span>
                <span className="truncate" title={s.label || s.category}>{s.label || s.category}</span>
                {/* a lixeira fica antes da duração, para as durações formarem uma coluna só */}
                <span className="flex items-center gap-2">
                  <button className="p-1 -m-1 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 text-faint hover:text-critical" title="Apagar" aria-label="Apagar sessão"
                    onClick={() => void apagar(s)}>
                    <Trash2 size={14} />
                  </button>
                  <span className="tabular-nums text-muted">{fmtDuration(s.seconds)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Page>
  );
}
