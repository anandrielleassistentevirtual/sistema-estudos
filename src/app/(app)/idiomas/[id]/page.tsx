"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check, ChevronLeft, Eye, EyeOff, Layers, Minus, Pause, Play, Plus, Repeat, RotateCcw, SkipBack, SkipForward, Timer, Trash2,
} from "lucide-react";
import { audioUrl, fullReads, registerListen, registerRead, undoRead } from "@/lib/lessons";
import { addBasicNote, toBase64 } from "@/lib/anki";
import { dayKey, fmtClock, nf } from "@/lib/dates";
import { supabase, fire } from "@/lib/supabase/client";
import type { Lesson, Sentence } from "@/lib/types";

type Layout = "lado" | "texto" | "intercalado";
const RATES = [0.6, 0.75, 0.9, 1, 1.1, 1.25, 1.5];

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [sents, setSents] = useState<Sentence[]>([]);
  const [src, setSrc] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [layout, setLayout] = useState<Layout>("lado");
  const [showTr, setShowTr] = useState(true);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [loopId, setLoopId] = useState<string | null>(null);
  const [loopLesson, setLoopLesson] = useState(false);
  const [sync, setSync] = useState<{ idx: number; marks: number[] } | null>(null);
  const [focus, setFocus] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ s: Sentence | null; key: number } | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const stopAt = useRef<{ start: number; end: number } | null>(null);
  const fullPlay = useRef(false);
  const listened = useRef(0);
  const lastTick = useRef<number | null>(null);
  const [verseUrls, setVerseUrls] = useState<Record<string, string>>({});
  const [verseIdx, setVerseIdx] = useState(-1);
  const verse = useRef<HTMLAudioElement | null>(null);
  const verseTick = useRef<number | null>(null);

  useEffect(() => {
    const sb = supabase();
    (async () => {
      const [l, s] = await Promise.all([
        sb.from("lessons").select("*").eq("id", id).single(),
        sb.from("lesson_sentences").select("*").eq("lesson_id", id).order("idx"),
      ]);
      if (!l.data) return;
      setLesson(l.data as Lesson);
      const list = (s.data as Sentence[]) ?? [];
      setSents(list);
      if ((l.data as Lesson).audio_path) setSrc(await audioUrl((l.data as Lesson).audio_path!));
      const withAudio = list.filter((x) => x.audio_path);
      if (withAudio.length) {
        const { data } = await sb.storage.from("audios").createSignedUrls(withAudio.map((x) => x.audio_path!), 60 * 60 * 6);
        const map: Record<string, string> = {};
        (Array.isArray(data) ? data : []).forEach((d, k) => { if (d.signedUrl) map[withAudio[k].id] = d.signedUrl; });
        setVerseUrls(map);
      }
    })();
    try {
      const p = JSON.parse(localStorage.getItem("licao-prefs") || "{}");
      if (p.layout) setLayout(p.layout);
      if (typeof p.showTr === "boolean") setShowTr(p.showTr);
      if (p.rate) setRate(p.rate);
    } catch {}
  }, [id]);

  useEffect(() => {
    try { localStorage.setItem("licao-prefs", JSON.stringify({ layout, showTr, rate })); } catch {}
    if (audio.current) audio.current.playbackRate = rate;
    if (verse.current) verse.current.playbackRate = rate;
  }, [layout, showTr, rate]);

  // tempo de escuta vai para o timer como "Idiomas"
  useEffect(() => {
    return () => {
      verse.current?.pause();
      const secs = Math.round(listened.current);
      if (secs >= 30 && lesson) {
        fire(supabase().from("study_sessions").insert({ day: dayKey(), seconds: secs, category: "Idiomas", language: lesson.language, label: `Lição: ${lesson.title}` }));
      }
    };
  }, [lesson]);

  useEffect(() => {
    if (!toast) return;
    const x = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(x);
  }, [toast]);

  const timed = sents.some((s) => s.start_s !== null || verseUrls[s.id]);
  const currentIdx = useMemo(() => {
    if (!timed) return -1;
    for (let i = sents.length - 1; i >= 0; i--) {
      const s = sents[i];
      if (s.start_s !== null && t >= s.start_s - 0.05) return s.end_s !== null && t > s.end_s + 0.3 && i === sents.length - 1 ? -1 : i;
    }
    return -1;
  }, [t, sents, timed]);

  useEffect(() => {
    if (currentIdx >= 0 && playing) {
      setFocus(currentIdx);
      document.getElementById(`s-${currentIdx}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [currentIdx, playing]);

  function onTime() {
    const a = audio.current!;
    setT(a.currentTime);
    const now = performance.now();
    if (lastTick.current !== null && !a.paused) listened.current += Math.min(2, (now - lastTick.current) / 1000);
    lastTick.current = now;
    const seg = stopAt.current;
    if (seg && a.currentTime >= seg.end) {
      if (loopId) a.currentTime = seg.start;
      else { a.pause(); stopAt.current = null; }
    }
  }

  function segmentOf(i: number) {
    const s = sents[i];
    if (!s || s.start_s === null) return null;
    const end = s.end_s ?? sents[i + 1]?.start_s ?? dur;
    return { start: s.start_s, end };
  }

  // áudio próprio do verso (um arquivo por verso)
  function playVerse(i: number, url: string, loop: boolean) {
    audio.current?.pause();
    stopAt.current = null;
    if (!verse.current) {
      const v = new Audio();
      v.ontimeupdate = () => {
        const now = performance.now();
        if (verseTick.current !== null && !v.paused) listened.current += Math.min(2, (now - verseTick.current) / 1000);
        verseTick.current = now;
      };
      v.onplay = () => { verseTick.current = performance.now(); };
      v.onpause = () => { verseTick.current = null; };
      v.onended = () => setVerseIdx(-1);
      verse.current = v;
    }
    const v = verse.current;
    v.src = url;
    v.loop = loop;
    v.playbackRate = rate;
    setVerseIdx(i);
    void v.play();
  }

  const playSentence = useCallback((i: number, loop = false) => {
    const a = audio.current;
    const own = sents[i] && verseUrls[sents[i].id];
    setFocus(i);
    document.getElementById(`s-${i}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (own) {
      playVerse(i, own, loop);
      setLoopId(loop ? sents[i].id : null);
      return;
    }
    const seg = segmentOf(i);
    if (!a || !seg) return;
    fullPlay.current = false;
    stopAt.current = seg;
    a.currentTime = seg.start;
    void a.play();
    if (loop) setLoopId(sents[i].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sents, dur, loopId, verseUrls, rate]);

  function togglePlay() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      verse.current?.pause();
      setVerseIdx(-1);
      if (!stopAt.current) fullPlay.current = fullPlay.current || a.currentTime < 1;
      void a.play();
    } else a.pause();
  }

  async function onEnded() {
    if (fullPlay.current && lesson) {
      await registerListen(lesson.id);
      setLesson({ ...lesson, listen_count: lesson.listen_count + 1 });
      setToast("Escuta completa registrada.");
    }
    if (sync) finishSync(true);
    if (loopLesson && audio.current) {
      audio.current.currentTime = 0;
      fullPlay.current = true;
      void audio.current.play();
    } else fullPlay.current = false;
  }

  async function plusOne(s: Sentence | null) {
    if (!lesson) return;
    setSents((all) => all.map((x) => (s === null || x.id === s.id ? { ...x, read_count: x.read_count + 1 } : x)));
    await registerRead(lesson.id, s?.id ?? null);
    setUndo({ s, key: Date.now() });
  }

  async function minusOne(s: Sentence | null) {
    if (!lesson) return;
    setSents((all) => all.map((x) => ((s === null || x.id === s.id) && x.read_count > 0 ? { ...x, read_count: x.read_count - 1 } : x)));
    setUndo(null);
    await undoRead(lesson.id, s?.id ?? null);
  }

  useEffect(() => {
    if (!undo) return;
    const x = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(x);
  }, [undo]);

  // ───── sincronização manual ─────
  function startSync() {
    const a = audio.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    stopAt.current = null;
    setLoopId(null);
    setSync({ idx: 0, marks: [] });
    setFocus(0);
    void a.play();
  }
  function mark() {
    if (!sync || !audio.current) return;
    const marks = [...sync.marks, audio.current.currentTime];
    const idx = sync.idx + 1;
    setSync({ idx, marks });
    setFocus(Math.min(idx, sents.length - 1));
    document.getElementById(`s-${idx}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (idx >= sents.length) finishSync(false, marks);
  }
  async function finishSync(atEnd: boolean, m?: number[]) {
    const marks = m ?? sync?.marks ?? [];
    setSync(null);
    if (!marks.length) return;
    const end = audio.current?.duration || dur;
    const updated = sents.map((s, i) => ({
      ...s,
      start_s: i < marks.length ? marks[i] : s.start_s,
      end_s: i < marks.length ? (marks[i + 1] ?? (atEnd || i === sents.length - 1 ? end : s.end_s)) : s.end_s,
    }));
    setSents(updated);
    const sb = supabase();
    await Promise.all(updated.slice(0, marks.length).map((s) => sb.from("lesson_sentences").update({ start_s: s.start_s, end_s: s.end_s }).eq("id", s.id)));
    setToast(`Tempos salvos para ${marks.length} frases.`);
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (sync) mark();
        else togglePlay();
      } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        const i = Math.min(sents.length - 1, focus + 1);
        if (timed) playSentence(i); else setFocus(i);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        const i = Math.max(0, focus - 1);
        if (timed) playSentence(i); else setFocus(i);
      } else if (e.key === "Enter" && sents[focus]) {
        void plusOne(sents[focus]);
      } else if (e.key.toLowerCase() === "r" && timed) {
        playSentence(focus, true);
      } else if (e.key.toLowerCase() === "t") {
        setShowTr((v) => !v);
      }
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  });

  async function toAnki(s: Sentence) {
    if (!lesson) return;
    const deck = `Idiomas::${lesson.language}`;
    try {
      const url = verseUrls[s.id];
      const audioFile = url
        ? { data: await toBase64(url), filename: `sistema-estudos-${s.id}.mp3` }
        : undefined;
      await addBasicNote(deck, s.text, s.translation || "", [lesson.language.toLowerCase(), "frase"], audioFile);
      setToast(`Frase${verseUrls[s.id] ? " com áudio" : ""} enviada ao baralho “${deck}”.`);
    } catch (e) {
      setToast(`Anki: ${(e as Error).message || "abra o Anki com o AnkiConnect."}`);
    }
  }

  async function removeLesson() {
    if (!lesson || !confirm(`Apagar a lição “${lesson.title}” e suas contagens?`)) return;
    const sb = supabase();
    const files = [lesson.audio_path, ...sents.map((x) => x.audio_path)].filter(Boolean) as string[];
    if (files.length) await sb.storage.from("audios").remove(files);
    await sb.from("lessons").delete().eq("id", lesson.id);
    router.push("/idiomas");
  }

  if (!lesson) return <div className="p-8 text-sm text-muted">Carregando lição…</div>;

  const reads = fullReads(sents);
  const total = sents.reduce((a, s) => a + s.read_count, 0);
  const pct = Math.min(1, reads / Math.max(1, lesson.read_goal));
  const trVisible = (s: Sentence) => showTr || revealed.has(s.id);

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 pb-40">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <Link href="/idiomas" className="text-sm text-muted flex items-center gap-1 mb-1"><ChevronLeft size={15} /> {lesson.language}{lesson.collection ? ` · ${lesson.collection}` : ""}</Link>
          <h1 className="text-2xl font-medium tracking-tight">{lesson.title}</h1>
          <p className="text-sm text-muted mt-1">
            {sents.length} frases · {nf.format(total)} leituras de frases · {lesson.listen_count} escutas completas
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="label">Leituras completas</div>
            <div className="text-2xl font-medium tabular-nums">{reads}<span className="text-faint text-base">/{lesson.read_goal}</span></div>
          </div>
          <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90">
            <circle cx="26" cy="26" r="21" fill="none" stroke="var(--surface-2)" strokeWidth="6" />
            <circle cx="26" cy="26" r="21" fill="none" stroke={pct >= 1 ? "var(--good)" : "var(--accent)"} strokeWidth="6" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 21} strokeDashoffset={2 * Math.PI * 21 * (1 - pct)} />
          </svg>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="inline-flex rounded-lg bg-surface-2 p-1 text-xs">
          {([["lado", "Lado a lado"], ["intercalado", "Intercalado"], ["texto", "Só o texto"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setLayout(v)} className={`px-2.5 py-1 rounded-md ${layout === v ? "bg-seg shadow-sm font-medium" : "text-muted"}`}>{l}</button>
          ))}
        </div>
        {layout !== "texto" && (
          <button className="btn text-xs py-1" onClick={() => setShowTr(!showTr)} title="Atalho: T">
            {showTr ? <EyeOff size={14} /> : <Eye size={14} />} {showTr ? "Esconder tradução" : "Mostrar tradução"}
          </button>
        )}
        <button className="btn btn-primary text-xs py-1" onClick={() => plusOne(null)}><Check size={14} /> Li o texto inteiro (+1)</button>
        {src && !sync && <button className="btn text-xs py-1" onClick={startSync} title="Tocar o áudio e marcar o início de cada frase com a barra de espaço"><Timer size={14} /> Sincronizar tempos</button>}
        <button className="btn btn-ghost text-xs py-1 ml-auto hover:text-critical" onClick={removeLesson}><Trash2 size={14} /></button>
      </div>

      {sync && (
        <div className="card p-3 mb-4 flex flex-wrap items-center gap-3 border-accent">
          <span className="text-sm">
            Sincronizando: aperte <kbd className="px-1.5 py-0.5 rounded bg-surface-2 text-xs">Espaço</kbd> (ou o botão) no <b>início</b> de cada frase. Frase {Math.min(sync.idx + 1, sents.length)} de {sents.length}.
          </span>
          <button className="btn btn-primary" onClick={mark}>Marcar início</button>
          <button className="btn" onClick={() => finishSync(false)}>Salvar e parar</button>
          <button className="btn btn-ghost" onClick={() => setSync(null)}>Cancelar</button>
        </div>
      )}

      <div className="card divide-y divide-line">
        {sents.map((s, i) => {
          const active = i === currentIdx || i === verseIdx || (sync ? i === sync.idx : false);
          const focused = i === focus;
          return (
            <div key={s.id} id={`s-${i}`}
              className={`group grid gap-x-6 gap-y-1 p-3 md:p-4 transition-colors ${layout === "lado" ? "md:grid-cols-[1fr_1fr_auto]" : "grid-cols-[1fr_auto]"} ${active ? "bg-accent-soft" : focused ? "bg-surface-2/60" : ""}`}
              onClick={() => setFocus(i)}>
              <p className={`font-serif text-[1.15rem] leading-relaxed ${timed ? "cursor-pointer" : ""}`} onDoubleClick={() => playSentence(i)}
                onClick={() => timed && !sync && playSentence(i)}>
                {s.text}
              </p>
              {layout === "lado" && (
                <p className={`font-serif text-[1.02rem] leading-relaxed text-muted ${trVisible(s) ? "" : "blur-sm select-none cursor-pointer"}`}
                  onClick={(e) => { e.stopPropagation(); setRevealed((r) => new Set(r).add(s.id)); }}>
                  {s.translation || <span className="text-faint italic text-sm">sem tradução</span>}
                </p>
              )}
              <div className={`flex items-start gap-1 ${layout === "lado" ? "" : "row-span-2"} justify-end`}>
                {timed && (
                  <>
                    <button className="p-1.5 rounded-md text-muted hover:bg-surface-2" title="Ouvir frase" onClick={(e) => { e.stopPropagation(); playSentence(i); }}><Play size={15} /></button>
                    <button className={`p-1.5 rounded-md hover:bg-surface-2 ${loopId === s.id ? "text-accent" : "text-muted"}`} title="Repetir frase em loop (R)"
                      onClick={(e) => { e.stopPropagation(); if (loopId === s.id) { setLoopId(null); stopAt.current = null; audio.current?.pause(); verse.current?.pause(); setVerseIdx(-1); } else playSentence(i, true); }}>
                      <Repeat size={15} />
                    </button>
                  </>
                )}
                <button className="p-1.5 rounded-md text-muted hover:bg-surface-2 opacity-0 group-hover:opacity-100" title="Enviar ao Anki" onClick={(e) => { e.stopPropagation(); void toAnki(s); }}><Layers size={15} /></button>
                <div className={`flex items-center rounded-md border text-sm tabular-nums ${s.read_count >= lesson.read_goal ? "border-good text-good" : "border-line"}`}>
                  <button className="px-1.5 py-1 rounded-l-md hover:bg-surface-2 disabled:opacity-30" title="−1 leitura (desfazer)" disabled={s.read_count === 0}
                    onClick={(e) => { e.stopPropagation(); void minusOne(s); }}>
                    <Minus size={13} />
                  </button>
                  <span className="px-1.5 min-w-[1.75rem] text-center">{s.read_count}</span>
                  <button className="px-1.5 py-1 rounded-r-md hover:bg-surface-2" title="+1 leitura (Enter)"
                    onClick={(e) => { e.stopPropagation(); void plusOne(s); }}>
                    <Plus size={13} />
                  </button>
                </div>
              </div>
              {layout === "intercalado" && (
                <p className={`font-serif text-[0.98rem] leading-relaxed text-muted ${trVisible(s) ? "" : "blur-sm select-none cursor-pointer"}`}
                  onClick={(e) => { e.stopPropagation(); setRevealed((r) => new Set(r).add(s.id)); }}>
                  {s.translation || <span className="text-faint italic text-sm">sem tradução</span>}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-faint mt-3">
        Atalhos: Espaço tocar/pausar · ↑↓ frase anterior/próxima · Enter +1 leitura · R repetir frase · T tradução
      </p>

      {src && (
        <div className="fixed bottom-0 inset-x-0 app-left z-20 border-t border-line bg-surface/95 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 md:px-8 py-3 flex flex-wrap items-center gap-3">
            <audio ref={audio} src={src} preload="metadata" onTimeUpdate={onTime} onLoadedMetadata={(e) => { setDur(e.currentTarget.duration); e.currentTarget.playbackRate = rate; }}
              onPlay={() => { setPlaying(true); lastTick.current = performance.now(); }} onPause={() => { setPlaying(false); lastTick.current = null; }} onEnded={onEnded} />
            <button className="p-2 text-muted" title="Voltar 5 s" onClick={() => audio.current && (audio.current.currentTime -= 5)}><RotateCcw size={17} /></button>
            <button className="p-2 text-muted" title="Frase anterior" onClick={() => playSentence(Math.max(0, focus - 1))} disabled={!timed}><SkipBack size={17} /></button>
            <button className="w-11 h-11 rounded-full grid place-items-center bg-accent text-accent-ink" onClick={togglePlay}>
              {playing ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
            </button>
            <button className="p-2 text-muted" title="Próxima frase" onClick={() => playSentence(Math.min(sents.length - 1, focus + 1))} disabled={!timed}><SkipForward size={17} /></button>
            <span className="text-xs tabular-nums font-mono text-muted w-24">{fmtClock(t)} / {fmtClock(dur)}</span>
            <input type="range" min={0} max={dur || 1} step={0.1} value={t} className="flex-1 min-w-[120px]"
              onChange={(e) => { stopAt.current = null; if (audio.current) audio.current.currentTime = Number(e.target.value); }} />
            <select className="input w-auto py-1 text-xs" value={rate} onChange={(e) => setRate(Number(e.target.value))} title="Velocidade">
              {RATES.map((r) => <option key={r} value={r}>{r}×</option>)}
            </select>
            <button className={`p-2 ${loopLesson ? "text-accent" : "text-muted"}`} title="Repetir a lição inteira" onClick={() => setLoopLesson(!loopLesson)}><Repeat size={17} /></button>
          </div>
        </div>
      )}

      {undo && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-40 flex items-center gap-3 rounded-lg pl-4 pr-2 py-2 text-sm shadow-lg" style={{ background: "var(--text)", color: "var(--bg)" }}>
          <span>{undo.s ? `+1 leitura: “${undo.s.text.length > 40 ? undo.s.text.slice(0, 40) + "…" : undo.s.text}”` : "+1 leitura em todas as frases"}</span>
          <button className="rounded-md px-2.5 py-1 font-medium underline underline-offset-2" onClick={() => minusOne(undo.s)}>Desfazer</button>
        </div>
      )}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 top-4 z-40 rounded-lg px-4 py-2 text-sm shadow-lg" style={{ background: "var(--text)", color: "var(--bg)" }}>{toast}</div>
      )}
    </div>
  );
}
