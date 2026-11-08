"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, Headphones, Pencil, Plus, Trash2, X } from "lucide-react";
import { Empty, Page } from "@/components/page";
import { IdiomasTabs } from "@/components/idiomas-tabs";
import { BarChart } from "@/components/bar-chart";
import { createLesson } from "@/lib/lessons";
import { Language, loadLanguages, ONDE, SUGESTOES } from "@/lib/languages";
import { addDays, dayKey, fmtDuration, nf, parseDay, weekStart } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";
import type { Lesson } from "@/lib/types";

interface Row extends Lesson { sentences: number; reads: number; minReads: number }
interface Sess { day: string; seconds: number; language: string | null; label: string }

const WEEKS = 12;

export default function Idiomas() {
  const [langs, setLangs] = useState<Language[]>([]);
  const [lessons, setLessons] = useState<Row[]>([]);
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [lang, setLang] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "licao" | "idioma" | "tempo" | { edit: Language }>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const [l, s, st, lg] = await Promise.all([
      sb.from("lessons").select("*").order("collection").order("position"),
      sb.from("lesson_sentences").select("lesson_id,read_count").limit(50000),
      sb.from("study_sessions").select("day,seconds,language,label").eq("category", "Idiomas").limit(50000),
      loadLanguages(),
    ]);
    const agg = new Map<string, { n: number; sum: number; min: number }>();
    for (const r of s.data ?? []) {
      const a = agg.get(r.lesson_id) ?? { n: 0, sum: 0, min: Infinity };
      a.n++; a.sum += r.read_count; a.min = Math.min(a.min, r.read_count);
      agg.set(r.lesson_id, a);
    }
    const rows = ((l.data as Lesson[]) ?? []).map((x) => {
      const a = agg.get(x.id);
      return { ...x, sentences: a?.n ?? 0, reads: a?.sum ?? 0, minReads: a && isFinite(a.min) ? a.min : 0 };
    });
    setLessons(rows);
    setSessions((st.data as Sess[]) ?? []);
    setLangs(lg);
    setLang((cur) => cur ?? lg[0]?.name ?? rows[0]?.language ?? null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // idiomas cadastrados + qualquer idioma que já tenha lição ou tempo
  const allLangs = useMemo(() => {
    const names = new Set(langs.map((l) => l.name));
    const extra = [...new Set([...lessons.map((l) => l.language), ...sessions.map((s) => s.language).filter(Boolean) as string[]])]
      .filter((n) => !names.has(n))
      .map((name) => ({ id: `extra-${name}`, name, weekly_goal_min: null, position: 999 }) as Language);
    return [...langs, ...extra];
  }, [langs, lessons, sessions]);

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

  const collections = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const l of lessons.filter((x) => x.language === lang)) m.set(l.collection || "Sem coleção", [...(m.get(l.collection || "Sem coleção") ?? []), l]);
    return [...m.entries()];
  }, [lessons, lang]);

  const recent = sessions.filter((s) => s.language === lang).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 6);

  return (
    <Page
      tabs={<IdiomasTabs />}
      title="Idiomas"
      subtitle="Quanto tempo vai para cada idioma, e as lições de leitura e escuta."
      actions={
        <>
          <button className="btn" onClick={() => setModal("idioma")}><Plus size={15} /> Cadastrar idioma</button>
          <button className="btn" onClick={() => setModal("tempo")} disabled={!allLangs.length}><Clock size={15} /> Registrar tempo</button>
          <button className="btn btn-primary" onClick={() => setModal("licao")}><Plus size={15} /> Nova lição</button>
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
                    <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: pct >= 1 ? "var(--good)" : "var(--accent)" }} />
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

      {lang && (
        <>
          <h2 className="font-medium mb-3">Lições de {lang}</h2>
          {collections.length === 0 ? (
            <Empty>Nenhuma lição de {lang} ainda.</Empty>
          ) : (
            collections.map(([c, list]) => (
              <section key={c} className="mb-6">
                <h3 className="label mb-2">{c}</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {list.map((l) => {
                    const pct = Math.min(1, l.minReads / Math.max(1, l.read_goal));
                    return (
                      <Link key={l.id} href={`/idiomas/${l.id}`} className="card p-4 hover:border-faint transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {l.level && <div className="text-xs text-faint">{l.level}</div>}
                            <div className="font-medium truncate">{l.title}</div>
                          </div>
                          {l.audio_path && <Headphones size={15} className="text-faint shrink-0 mt-1" />}
                        </div>
                        <div className="mt-3 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: pct >= 1 ? "var(--good)" : "var(--accent)" }} />
                        </div>
                        <div className="mt-2 flex justify-between text-xs text-muted">
                          <span>{l.minReads}/{l.read_goal} leituras completas</span>
                          <span>{l.listen_count} escutas · {l.sentences} frases</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </>
      )}

      {modal === "licao" && (
        <NewLessonModal langs={allLangs.map((l) => l.name)} defaultLang={lang ?? allLangs[0]?.name ?? "Inglês"}
          onClose={() => setModal(null)} onCreated={() => { setModal(null); void load(); }} />
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
      await sb.from("lessons").update({ language: n }).eq("language", edit.name);
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

function NewLessonModal({ langs, defaultLang, onClose, onCreated }: { langs: string[]; defaultLang: string; onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState({ language: defaultLang, collection: "", title: "", level: "", text: "", translation: "", read_goal: 10 });
  const [audio, setAudio] = useState<File | null>(null);
  const [cues, setCues] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = f.text.split("\n").filter((x) => x.trim()).length;
  const m = f.translation.split("\n").filter((x) => x.trim()).length;
  const options = langs.length ? langs : SUGESTOES;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await createLesson({ ...f, audio, cues });
      if (!langs.includes(f.language)) await supabase().from("languages").insert({ name: f.language }).then(() => {});
      onCreated();
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Nova lição" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid sm:grid-cols-4 gap-3">
          <label className="space-y-1"><span className="label">Idioma</span>
            <select className="input" value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}>
              {options.map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
          <label className="space-y-1 sm:col-span-2"><span className="label">Coleção</span>
            <input className="input" placeholder="ex.: Divina Commedia — Inferno" value={f.collection} onChange={(e) => setF({ ...f, collection: e.target.value })} />
          </label>
          <label className="space-y-1"><span className="label">Nível</span>
            <input className="input" placeholder="A1, B2…" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} />
          </label>
          <label className="space-y-1 sm:col-span-3"><span className="label">Título</span>
            <input className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </label>
          <label className="space-y-1"><span className="label">Meta de leituras</span>
            <input className="input" type="number" min={1} max={100} value={f.read_goal} onChange={(e) => setF({ ...f, read_goal: Number(e.target.value) || 10 })} />
          </label>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="space-y-1"><span className="label">Texto — uma frase por linha ({n})</span>
            <textarea className="input min-h-[220px] font-serif" required value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
          </label>
          <label className="space-y-1"><span className="label">Tradução — mesma ordem ({m}{n && m && n !== m ? " ⚠ quantidade diferente" : ""})</span>
            <textarea className="input min-h-[220px] font-serif" value={f.translation} onChange={(e) => setF({ ...f, translation: e.target.value })} />
          </label>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="space-y-1"><span className="label">Áudio (MP3, M4A, OGG)</span>
            <input className="input" type="file" accept="audio/*" onChange={(e) => setAudio(e.target.files?.[0] ?? null)} />
          </label>
          <label className="space-y-1"><span className="label">Tempos das frases (.vtt/.srt, opcional)</span>
            <input className="input" type="file" accept=".vtt,.srt" onChange={(e) => setCues(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <p className="text-xs text-muted">Sem arquivo de tempos, você pode sincronizar depois dentro da lição (modo “Sincronizar”), tocando o áudio e marcando o início de cada frase.</p>
        {err && <p className="text-sm text-critical">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Salvando…" : "Criar lição"}</button>
        </div>
      </form>
    </Modal>
  );
}
