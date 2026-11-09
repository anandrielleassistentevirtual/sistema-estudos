"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Headphones, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward } from "lucide-react";
import { Empty } from "@/components/page";
import { IdiomasTabs } from "@/components/idiomas-tabs";
import { audioUrl, registerListen } from "@/lib/lessons";
import { dayKey, fmtClock } from "@/lib/dates";
import { supabase, fire } from "@/lib/supabase/client";
import type { Lesson } from "@/lib/types";

const KEY = "playlist-selecao";

/** Playlist de áudios para escuta passiva/ativa — cada áudio ouvido até o fim conta 1 escuta. */
export default function Playlist() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lang, setLang] = useState<string>("");
  const [picked, setPicked] = useState<string[]>([]);
  const [cur, setCur] = useState(-1);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [loop, setLoop] = useState(true);
  const [rate, setRate] = useState(1);
  const audio = useRef<HTMLAudioElement>(null);
  const listened = useRef<Record<string, number>>({});
  const curLang = useRef<string>("");
  const tick = useRef<number | null>(null);

  useEffect(() => {
    void supabase().from("lessons").select("*").not("audio_path", "is", null).order("language").order("collection").order("position")
      .then(({ data }) => {
        const list = (data as Lesson[]) ?? [];
        setLessons(list);
        const want = new URLSearchParams(window.location.search).get("idioma");
        setLang(want && list.some((l) => l.language === want) ? want : list[0]?.language ?? "");
        try {
          const saved: string[] = JSON.parse(localStorage.getItem(KEY) || "[]");
          setPicked(saved.filter((id) => list.some((l) => l.id === id)));
        } catch {}
      });
    return () => {
      const rows = Object.entries(listened.current)
        .filter(([, secs]) => secs >= 30)
        .map(([language, secs]) => ({ day: dayKey(), seconds: Math.round(secs), category: "Idiomas", language, label: "Playlist" }));
      if (rows.length) fire(supabase().from("study_sessions").insert(rows));
    };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(picked)); } catch {}
  }, [picked]);

  const queue = picked.map((id) => lessons.find((l) => l.id === id)).filter(Boolean) as Lesson[];

  async function playAt(i: number) {
    const l = queue[i];
    if (!l?.audio_path) return;
    setCur(i);
    curLang.current = l.language;
    const url = await audioUrl(l.audio_path);
    setSrc(url);
    setTimeout(() => { if (audio.current) { audio.current.playbackRate = rate; void audio.current.play(); } }, 50);
  }

  async function onEnded() {
    const l = queue[cur];
    if (l) void registerListen(l.id);
    if (cur + 1 < queue.length) void playAt(cur + 1);
    else if (loop && queue.length) void playAt(0);
  }

  const inLang = lessons.filter((l) => l.language === lang);
  const langs = [...new Set(lessons.map((l) => l.language))];

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 pb-36">
      <IdiomasTabs />
      <h1 className="text-2xl font-medium tracking-tight mb-1">Playlist</h1>
      <p className="text-sm text-muted mb-5">Monte uma sequência de áudios para ouvir em loop. Cada áudio ouvido até o fim conta uma escuta.</p>

      {lessons.length === 0 ? (
        <Empty>Nenhuma lição com áudio ainda.</Empty>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium text-sm">Lições disponíveis</h2>
              <select className="input w-auto py-1 text-xs" value={lang} onChange={(e) => setLang(e.target.value)}>
                {langs.map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mb-2">
              <button className="btn text-xs py-1" onClick={() => setPicked((p) => [...p, ...inLang.map((l) => l.id).filter((id) => !p.includes(id))])}>Adicionar todas</button>
              <button className="btn btn-ghost text-xs py-1" onClick={() => setPicked([])}>Limpar playlist</button>
            </div>
            <ul className="space-y-0.5 max-h-[55vh] overflow-y-auto">
              {inLang.map((l) => (
                <li key={l.id}>
                  <label className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={picked.includes(l.id)}
                      onChange={(e) => setPicked((p) => (e.target.checked ? [...p, l.id] : p.filter((x) => x !== l.id)))} />
                    <span className="truncate flex-1">{l.collection ? <span className="text-faint">{l.collection} · </span> : null}{l.title}</span>
                    <span className="text-xs text-faint">{l.listen_count}×</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium text-sm">Na playlist ({queue.length})</h2>
              <button className="btn text-xs py-1" disabled={queue.length < 2}
                onClick={() => setPicked((p) => [...p].sort(() => Math.random() - 0.5))}><Shuffle size={13} /> Embaralhar</button>
            </div>
            {queue.length === 0 && <p className="text-sm text-muted">Marque lições à esquerda.</p>}
            <ol className="space-y-0.5 max-h-[55vh] overflow-y-auto">
              {queue.map((l, i) => (
                <li key={l.id}>
                  <button onClick={() => playAt(i)} className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left ${i === cur ? "bg-accent-soft font-medium" : "hover:bg-surface-2"}`}>
                    <span className="w-5 text-xs text-faint tabular-nums">{i + 1}</span>
                    {i === cur && playing ? <Headphones size={14} className="text-icon" /> : null}
                    <span className="truncate flex-1">{l.title}</span>
                    <Link href={`/idiomas/${l.id}`} onClick={(e) => e.stopPropagation()} className="text-xs text-accent">texto</Link>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 inset-x-0 app-left z-20 border-t border-line bg-surface/95 backdrop-blur pb-safe">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-3 flex flex-wrap items-center gap-3">
          <audio ref={audio} src={src ?? undefined} onEnded={onEnded}
            onTimeUpdate={(e) => {
              setT(e.currentTarget.currentTime);
              const now = performance.now();
              if (tick.current !== null && !e.currentTarget.paused && curLang.current) listened.current[curLang.current] = (listened.current[curLang.current] ?? 0) + Math.min(2, (now - tick.current) / 1000);
              tick.current = now;
            }}
            onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
            onPlay={() => { setPlaying(true); tick.current = performance.now(); }} onPause={() => { setPlaying(false); tick.current = null; }} />
          <div className="min-w-0 flex-1 basis-40">
            <div className="text-sm font-medium truncate">{queue[cur]?.title ?? "Nada tocando"}</div>
            <div className="text-xs text-muted tabular-nums font-mono">{fmtClock(t)} / {fmtClock(dur)}</div>
          </div>
          <button className="p-2 text-muted" onClick={() => playAt(Math.max(0, cur - 1))} disabled={cur <= 0}><SkipBack size={17} /></button>
          <button className="w-11 h-11 rounded-full grid place-items-center bg-accent text-accent-ink" disabled={!queue.length}
            onClick={() => { if (cur < 0) void playAt(0); else if (audio.current?.paused) void audio.current.play(); else audio.current?.pause(); }}>
            {playing ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
          </button>
          <button className="p-2 text-muted" onClick={() => playAt(cur + 1)} disabled={cur + 1 >= queue.length}><SkipForward size={17} /></button>
          <select className="input w-auto py-1 text-xs" value={rate} onChange={(e) => { setRate(Number(e.target.value)); if (audio.current) audio.current.playbackRate = Number(e.target.value); }}>
            {[0.75, 0.9, 1, 1.1, 1.25, 1.5].map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
          <button className={`p-2 ${loop ? "text-accent" : "text-muted"}`} title="Repetir a playlist" onClick={() => setLoop(!loop)}><Repeat size={17} /></button>
        </div>
      </div>
    </div>
  );
}
