"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, Pencil, Plus, Trash2, X } from "lucide-react";
import { Empty, Page } from "@/components/page";
import { IdiomasTabs } from "@/components/idiomas-tabs";
import { BarChart } from "@/components/bar-chart";
import { Language, loadLanguages, ONDE, SUGESTOES } from "@/lib/languages";
import { addDays, dayKey, fmtDuration, parseDay, weekStart } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";
import { todas } from "@/lib/supabase/todas";

interface Sess { day: string; seconds: number; language: string | null; label: string }

const WEEKS = 12;

export default function Idiomas() {
  const [langs, setLangs] = useState<Language[]>([]);
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [lang, setLang] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "idioma" | "tempo" | { edit: Language }>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const [st, lg] = await Promise.all([
      todas<Sess>((de, ate) => sb.from("study_sessions").select("day,seconds,language,label").eq("category", "Idiomas").order("id").range(de, ate)),
      loadLanguages(),
    ]);
    setSessions(st);
    setLangs(lg);
    setLang((cur) => cur ?? lg[0]?.name ?? null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // idiomas cadastrados + qualquer idioma que já tenha tempo registrado
  const allLangs = useMemo(() => {
    const names = new Set(langs.map((l) => l.name));
    const extra = [...new Set(sessions.map((s) => s.language).filter(Boolean) as string[])]
      .filter((n) => !names.has(n))
      .map((name) => ({ id: `extra-${name}`, name, weekly_goal_min: null, position: 999 }) as Language);
    return [...langs, ...extra];
  }, [langs, sessions]);

  const time = useMemo(() => {
    const now = new Date();
    const ws = dayKey(weekStart(now));
    const ms = dayKey(new Date(now.getFullYear(), now.getMonth(), 1));
    const out = new Map<string, { week: number; month: number; total: number }>();
    for (const s of sessions) {
      if (!s.language) continue;
      const t = out.get(s.language) ?? { week: 0, month: 0, total: 0 };
      t.total += s.seconds;
      if (s.day >= ms) t.month += s.seconds;
      if (s.day >= ws) t.week += s.seconds;
      out.set(s.language, t);
    }
    return out;
  }, [sessions]);

  const weekly = useMemo(() => {
    const ws = weekStart(new Date());
    return Array.from({ length: WEEKS }, (_, i) => {
      const start = addDays(ws, -(WEEKS - 1 - i) * 7);
      const a = dayKey(start), z = dayKey(addDays(start, 6));
      const secs = sessions.filter((s) => s.language === lang && s.day >= a && s.day <= z).reduce((x, s) => x + s.seconds, 0);
      return {
        label: start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        detail: `semana de ${start.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} · ${fmtDuration(secs)}`,
        value: Math.round(secs / 60),
      };
    });
  }, [sessions, lang]);

  const bySource = useMemo(() => {
    const m = new Map<string, number>();
    const from = dayKey(addDays(new Date(), -29));
    for (const s of sessions) {
      if (s.language !== lang || s.day < from) continue;
      const k = s.label.startsWith("Lição") ? "Lições (este sistema)" : s.label === "Playlist" ? "Playlist (este sistema)" : s.label || "Timer";
      m.set(k, (m.get(k) ?? 0) + s.seconds);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [sessions, lang]);

  const recent = sessions.filter((s) => s.language === lang).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 6);

  return (
    <Page
      tabs={<IdiomasTabs />}
      title="Idiomas"
      subtitle="Quanto tempo vai para cada idioma. As revisões ficam no Anki."
      actions={
        <>
          <button className="btn" onClick={() => setModal("idioma")}><Plus size={15} /> Cadastrar idioma</button>
          <button className="btn" onClick={() => setModal("tempo")} disabled={!allLangs.length}><Clock size={15} /> Registrar tempo</button>
        </>
      }
    >
      {allLangs.length === 0 ? (
        <Empty>Cadastre os idiomas que você estuda para acompanhar quanto tempo vai para cada um.</Empty>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
          {allLangs.map((l) => {
            const t = time.get(l.name) ?? { week: 0, month: 0, total: 0 };
            const goal = l.weekly_goal_min ? l.weekly_goal_min * 60 : 0;
            const pct = goal ? Math.min(1, t.week / goal) : 0;
            const registered = !l.id.startsWith("extra-");
            return (
              <div key={l.id} onClick={() => setLang(l.name)}
                className={`card p-4 cursor-pointer transition-colors group ${lang === l.name ? "border-muted" : "hover:border-faint"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{l.name}</span>
                  <span className="flex gap-1 opacity-0 group-hover:opacity-100">
                    {registered ? (
                      <button className="p-1 text-faint hover:text-ink" title="Editar meta" onClick={(e) => { e.stopPropagation(); setModal({ edit: l }); }}><Pencil size={13} /></button>
                    ) : (
                      <button className="text-xs text-accent" onClick={(e) => { e.stopPropagation(); setModal("idioma"); }}>cadastrar</button>
                    )}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-medium tabular-nums">{fmtDuration(t.week)}</span>
                  <span className="text-xs text-muted">esta semana{goal ? ` de ${fmtDuration(goal)}` : ""}</span>
                </div>
                {goal > 0 && (
                  <div className="mt-2 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: pct >= 1 ? "var(--good)" : "var(--chart)" }} />
                  </div>
                )}
                <div className="mt-2 flex justify-between text-xs text-muted">
                  <span>mês: {fmtDuration(t.month)}</span>
                  <span>total: {fmtDuration(t.total)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {lang && (
        <div className="grid lg:grid-cols-[1fr_300px] gap-4 mb-6">
          <section className="card p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-medium">{lang}: minutos por semana</h2>
              <span className="text-xs text-muted">últimas {WEEKS} semanas</span>
            </div>
            <BarChart data={weekly} unit="min" />
          </section>
          <section className="card p-5">
            <h2 className="font-medium mb-3">Onde foi o tempo</h2>
            <p className="text-xs text-muted -mt-2 mb-3">últimos 30 dias</p>
            {bySource.length === 0 ? (
              <p className="text-sm text-muted">Nada ainda. Use o Timer (categoria Idiomas) ou “Registrar tempo”.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {bySource.map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-2"><span className="text-muted truncate">{k}</span><span className="tabular-nums">{fmtDuration(v)}</span></li>
                ))}
              </ul>
            )}
            {recent.length > 0 && (
              <>
                <h3 className="label mt-5 mb-2">Últimos registros</h3>
                <ul className="space-y-1 text-xs text-muted">
                  {recent.map((s, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate">{parseDay(s.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} · {s.label || "Timer"}</span>
                      <span className="tabular-nums">{fmtDuration(s.seconds)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      )}

      {(modal === "idioma" || (modal && typeof modal === "object")) && (
        <LanguageModal edit={typeof modal === "object" ? modal.edit : null} existing={langs.map((l) => l.name)}
          onClose={() => setModal(null)} onSaved={(name) => { setModal(null); setLang(name); void load(); }} />
      )}
      {modal === "tempo" && (
        <TimeModal langs={allLangs.map((l) => l.name)} defaultLang={lang ?? allLangs[0]?.name ?? ""}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} />
      )}
    </Page>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`card w-full ${wide ? "max-w-3xl" : "max-w-md"} max-h-[90vh] overflow-y-auto p-5 space-y-3`}>
        <div className="flex justify-between items-center">
          <h2 className="font-medium">{title}</h2>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LanguageModal({ edit, existing, onClose, onSaved }: { edit: Language | null; existing: string[]; onClose: () => void; onSaved: (name: string) => void }) {
  const [name, setName] = useState(edit?.name ?? "");
  const [goalH, setGoalH] = useState(edit?.weekly_goal_min ? String(edit.weekly_goal_min / 60) : "");
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const weekly_goal_min = goalH ? Math.round(Number(goalH.replace(",", ".")) * 60) : null;
    const sb = supabase();
    const { error } = edit
      ? await sb.from("languages").update({ name: n, weekly_goal_min }).eq("id", edit.id)
      : await sb.from("languages").insert({ name: n, weekly_goal_min, position: existing.length });
    if (error) return setErr(error.code === "23505" ? "Esse idioma já está cadastrado." : error.message);
    if (edit && n !== edit.name) {
      await sb.from("study_sessions").update({ language: n }).eq("language", edit.name);
    }
    onSaved(n);
  }

  async function remove() {
    if (!edit || !confirm(`Remover “${edit.name}” da lista? O tempo e as lições continuam salvos.`)) return;
    await supabase().from("languages").delete().eq("id", edit.id);
    onSaved("");
  }

  return (
    <Modal title={edit ? `Editar ${edit.name}` : "Cadastrar idioma"} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <label className="block space-y-1">
          <span className="label">Idioma</span>
          <input className="input" list="sugestoes-idiomas" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Italiano" />
          <datalist id="sugestoes-idiomas">{SUGESTOES.filter((s) => !existing.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <label className="block space-y-1">
          <span className="label">Meta semanal (horas, opcional)</span>
          <input className="input" inputMode="decimal" value={goalH} onChange={(e) => setGoalH(e.target.value)} placeholder="ex.: 5" />
        </label>
        {err && <p className="text-sm text-critical">{err}</p>}
        <div className="flex justify-between gap-2 pt-1">
          {edit ? <button type="button" className="btn btn-ghost hover:text-critical" onClick={remove}><Trash2 size={14} /> Remover</button> : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary">Salvar</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function TimeModal({ langs, defaultLang, onClose, onSaved }: { langs: string[]; defaultLang: string; onClose: () => void; onSaved: () => void }) {
  const [language, setLanguage] = useState(defaultLang);
  const [day, setDay] = useState(dayKey());
  const [h, setH] = useState("");
  const [m, setM] = useState("30");
  const [onde, setOnde] = useState(ONDE[0]);
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const seconds = (Number(h || 0) * 60 + Number(m || 0)) * 60;
    if (seconds <= 0) return setErr("Informe quanto tempo você estudou.");
    setBusy(true);
    const label = nota.trim() ? `${onde} · ${nota.trim()}` : onde;
    const { error } = await supabase().from("study_sessions").insert({
      day, started_at: new Date(`${day}T12:00:00`).toISOString(), seconds, category: "Idiomas", language, label,
    });
    if (error) { setErr(error.message); setBusy(false); return; }
    onSaved();
  }

  return (
    <Modal title="Registrar tempo de idioma" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1"><span className="label">Idioma</span>
            <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {langs.map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
          <label className="space-y-1"><span className="label">Dia</span>
            <input className="input" type="date" value={day} max={dayKey()} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="space-y-1"><span className="label">Horas</span>
            <input className="input" type="number" min={0} max={23} value={h} placeholder="0" onChange={(e) => setH(e.target.value)} />
          </label>
          <label className="space-y-1"><span className="label">Minutos</span>
            <input className="input" type="number" min={0} max={59} value={m} onChange={(e) => setM(e.target.value)} />
          </label>
        </div>
        <label className="block space-y-1"><span className="label">Onde</span>
          <select className="input" value={onde} onChange={(e) => setOnde(e.target.value)}>
            {ONDE.map((o) => <option key={o}>{o}</option>)}
          </select>
        </label>
        <label className="block space-y-1"><span className="label">Observação (opcional)</span>
          <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="ex.: Lição 14, revisão de frases" />
        </label>
        {err && <p className="text-sm text-critical">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Salvando…" : "Registrar"}</button>
        </div>
      </form>
    </Modal>
  );
}
