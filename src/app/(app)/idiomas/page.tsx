"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Headphones, ListMusic, Plus, X } from "lucide-react";
import { Empty, Page, Stat } from "@/components/page";
import { createLesson, LANGUAGES } from "@/lib/lessons";
import { addDays, dayKey, nf } from "@/lib/dates";
import { supabase } from "@/lib/supabase/client";
import type { Lesson } from "@/lib/types";

interface Row extends Lesson { sentences: number; reads: number; minReads: number }

export default function Idiomas() {
  const [lessons, setLessons] = useState<Row[]>([]);
  const [lang, setLang] = useState<string | null>(null);
  const [week, setWeek] = useState({ reads: 0, listens: 0 });
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const sb = supabase();
    const [l, s, d] = await Promise.all([
      sb.from("lessons").select("*").order("collection").order("position"),
      sb.from("lesson_sentences").select("lesson_id,read_count").limit(50000),
      sb.from("language_daily").select("reads,listens").gte("day", dayKey(addDays(new Date(), -6))),
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
    setLang((cur) => cur ?? rows[0]?.language ?? null);
    setWeek({
      reads: (d.data ?? []).reduce((a, x) => a + x.reads, 0),
      listens: (d.data ?? []).reduce((a, x) => a + x.listens, 0),
    });
  };
  useEffect(() => { void load(); }, []);

  const langs = useMemo(() => [...new Set(lessons.map((l) => l.language))], [lessons]);
  const collections = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const l of lessons.filter((x) => x.language === lang)) m.set(l.collection || "Sem coleção", [...(m.get(l.collection || "Sem coleção") ?? []), l]);
    return [...m.entries()];
  }, [lessons, lang]);

  const inLang = lessons.filter((l) => l.language === lang);

  return (
    <Page
      title="Idiomas"
      subtitle="Método de leitura e escuta: texto + áudio, repetição contada frase a frase."
      actions={
        <>
          <Link className="btn" href={`/idiomas/playlist${lang ? `?idioma=${encodeURIComponent(lang)}` : ""}`}><ListMusic size={15} /> Playlist</Link>
          <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> Nova lição</button>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label="Frases lidas" value={nf.format(week.reads)} hint="últimos 7 dias" />
        <Stat label="Escutas completas" value={nf.format(week.listens)} hint="últimos 7 dias" />
        <Stat label="Lições" value={nf.format(inLang.length)} hint={lang ?? ""} />
        <Stat label="Leituras no idioma" value={nf.format(inLang.reduce((a, l) => a + l.reads, 0))} hint="todas as frases, desde o início" />
      </div>

      {langs.length > 1 && (
        <div className="inline-flex rounded-lg bg-surface-2 p-1 text-sm mb-4">
          {langs.map((l) => (
            <button key={l} onClick={() => setLang(l)} className={`px-3 py-1.5 rounded-md ${lang === l ? "bg-surface shadow-sm font-medium" : "text-muted"}`}>{l}</button>
          ))}
        </div>
      )}

      {lessons.length === 0 ? (
        <Empty>
          Nenhuma lição ainda. Crie uma com “Nova lição” (texto + tradução + áudio) — ou peça ao Claude para preparar e importar as lições para você.
        </Empty>
      ) : (
        collections.map(([c, list]) => (
          <section key={c} className="mb-6">
            <h2 className="label mb-2">{c}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {list.map((l) => {
                const pct = Math.min(1, l.minReads / Math.max(1, l.read_goal));
                return (
                  <Link key={l.id} href={`/idiomas/${l.id}`} className="card p-4 hover:border-accent transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs text-faint">#{l.position}{l.level ? ` · ${l.level}` : ""}</div>
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

      {creating && <NewLessonModal defaultLang={lang ?? "Inglês"} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void load(); }} />}
    </Page>
  );
}

function NewLessonModal({ defaultLang, onClose, onCreated }: { defaultLang: string; onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState({ language: defaultLang, collection: "", title: "", level: "", text: "", translation: "", read_goal: 10 });
  const [audio, setAudio] = useState<File | null>(null);
  const [cues, setCues] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = f.text.split("\n").filter((x) => x.trim()).length;
  const m = f.translation.split("\n").filter((x) => x.trim()).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await createLesson({ ...f, audio, cues });
      onCreated();
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="card w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold">Nova lição</h2>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="grid sm:grid-cols-4 gap-3">
          <label className="space-y-1"><span className="label">Idioma</span>
            <select className="input" value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}>
              {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
          <label className="space-y-1 sm:col-span-2"><span className="label">Coleção</span>
            <input className="input" placeholder="ex.: Divina Comédia — Inferno" value={f.collection} onChange={(e) => setF({ ...f, collection: e.target.value })} />
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
    </div>
  );
}
