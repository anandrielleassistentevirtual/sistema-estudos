"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Highlighter, Layers, Trash2, Type, X } from "lucide-react";
import { EpubReader } from "@/components/reader/epub-reader";
import { TextReader } from "@/components/reader/text-reader";
import { HL_COLORS, ReaderHandle, ReaderPrefs, THEMES } from "@/components/reader/types";
import { downloadBook } from "@/lib/books";
import { fmtClock, nf } from "@/lib/dates";
import { addBasicNote } from "@/lib/anki";
import { ReadingTracker } from "@/lib/reading-tracker";
import { supabase } from "@/lib/supabase/client";
import type { Annotation, Book } from "@/lib/types";

const PREFS_KEY = "leitor-prefs";
const defaultPrefs: ReaderPrefs = { theme: "claro", fontSize: 105, serif: true };

export default function Ler() {
  const { id } = useParams<{ id: string }>();
  const [book, setBook] = useState<Book | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anns, setAnns] = useState<Annotation[]>([]);
  const [prefs, setPrefs] = useState<ReaderPrefs>(defaultPrefs);
  const [showPrefs, setShowPrefs] = useState(false);
  const [showAnns, setShowAnns] = useState(false);
  const [sel, setSel] = useState<{ location: string; quote: string } | null>(null);
  const [selNote, setSelNote] = useState("");
  const [selColor, setSelColor] = useState("amarelo");
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const [session, setSession] = useState({ seconds: 0, words: 0 });
  const [toast, setToast] = useState<string | null>(null);
  const reader = useRef<ReaderHandle>(null);
  const tracker = useRef<ReadingTracker | null>(null);
  const lastSave = useRef(0);
  const bookRef = useRef<Book | null>(null);
  bookRef.current = book;

  useEffect(() => {
    try {
      const p = localStorage.getItem(PREFS_KEY);
      if (p) setPrefs({ ...defaultPrefs, ...JSON.parse(p) });
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
  }, [prefs]);

  useEffect(() => {
    const sb = supabase();
    (async () => {
      const { data, error } = await sb.from("books").select("*").eq("id", id).single();
      if (error || !data) return setError("Livro não encontrado.");
      setBook(data as Book);
      setProgress((data as Book).progress);
      const a = await sb.from("annotations").select("*").eq("book_id", id).order("created_at");
      setAnns((a.data as Annotation[]) ?? []);
      try { setBlob(await downloadBook(data as Book)); } catch (e) { setError((e as Error).message); }
    })();
    const t = new ReadingTracker(id);
    t.onChange = () => setSession({ ...t.session });
    tracker.current = t;
    return () => { void t.close(); };
  }, [id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  function onTurn(words: number, forward: boolean) {
    tracker.current?.turn(words, forward);
    const b = bookRef.current;
    if (forward && b && (b.status === "aguardando" || b.status === "pausado")) {
      const patch = { status: "lendo" as const, started_at: b.started_at ?? new Date().toISOString() };
      setBook({ ...b, ...patch });
      void supabase().from("books").update(patch).eq("id", b.id);
    }
  }

  function onLocation(location: string, p: number, l: string) {
    if (p > 0) setProgress(p);
    if (l) setLabel(l);
    const now = Date.now();
    if (now - lastSave.current < 2500 || !location) return;
    lastSave.current = now;
    void supabase().from("books").update({ last_location: location, progress: p || undefined }).eq("id", id);
  }

  function onWordCount(total: number) {
    const b = bookRef.current;
    if (b && total > 0 && b.word_count !== total) {
      setBook({ ...b, word_count: total });
      void supabase().from("books").update({ word_count: total }).eq("id", b.id);
    }
  }

  async function saveHighlight() {
    if (!sel) return;
    const { data } = await supabase()
      .from("annotations")
      .insert({ book_id: id, location: sel.location, quote: sel.quote, note: selNote, color: selColor })
      .select()
      .single();
    if (data) setAnns((a) => [...a, data as Annotation]);
    setSel(null);
    setSelNote("");
    window.getSelection()?.removeAllRanges();
  }

  async function markRead() {
    if (!book) return;
    const patch = { status: "lido" as const, finished_at: new Date().toISOString(), progress: 1, queue_position: null };
    setBook({ ...book, ...patch });
    await supabase().from("books").update(patch).eq("id", book.id);
    setToast("Livro marcado como lido. Parabéns!");
  }

  async function toAnki(a: Annotation) {
    const deck = (() => { try { return localStorage.getItem("anki-deck") || "Leituras"; } catch { return "Leituras"; } })();
    try {
      await addBasicNote(deck, a.quote, `${a.note ? a.note + "<br><br>" : ""}<i>${book?.title ?? ""}</i>`, ["leitura"]);
      setToast(`Enviado para o baralho “${deck}”.`);
    } catch (e) {
      setToast(`Anki: ${(e as Error).message || "abra o Anki com o AnkiConnect (veja a página Anki)."}`);
    }
  }

  const t = THEMES[prefs.theme];
  const wpm = session.seconds > 30 ? Math.round(session.words / (session.seconds / 60)) : 0;

  if (error) {
    return (
      <div className="p-8">
        <p className="text-critical">{error}</p>
        <Link href="/biblioteca" className="text-accent text-sm">← Voltar à biblioteca</Link>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-20 flex flex-col" style={{ background: t.bg, color: t.fg }}>
      <header className="flex items-center gap-2 px-3 h-12 border-b shrink-0" style={{ borderColor: prefs.theme === "escuro" ? "#2f2f2c" : "#00000014" }}>
        <Link href="/biblioteca" className="p-2 opacity-70 hover:opacity-100" title="Voltar"><ChevronLeft size={18} /></Link>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{book?.title ?? "Carregando…"}</div>
          {label && <div className="text-[11px] opacity-60 truncate">{label}</div>}
        </div>
        <div className="hidden sm:flex items-center gap-3 text-xs opacity-70 tabular-nums font-mono" title="Esta sessão de leitura">
          <span>{fmtClock(session.seconds)}</span>
          <span>{nf.format(session.words)} pal.</span>
          <span>{wpm ? `${wpm} ppm` : "— ppm"}</span>
        </div>
        <span className="text-xs opacity-70 tabular-nums w-10 text-right">{Math.round(progress * 100)}%</span>
        {progress > 0.97 && book?.status !== "lido" && (
          <button className="btn text-xs py-1" onClick={markRead}><Check size={14} /> Concluir</button>
        )}
        <button className="p-2 opacity-70 hover:opacity-100" onClick={() => { setShowPrefs(!showPrefs); setShowAnns(false); }} title="Aparência"><Type size={18} /></button>
        <button className="p-2 opacity-70 hover:opacity-100 relative" onClick={() => { setShowAnns(!showAnns); setShowPrefs(false); }} title="Anotações">
          <Highlighter size={18} />
          {anns.length > 0 && <span className="absolute top-1 right-0.5 text-[9px] font-bold">{anns.length}</span>}
        </button>
      </header>

      <div className="relative flex-1 min-h-0">
        {blob && book && (
          book.format === "epub" ? (
            <EpubReader ref={reader} data={blob} format="epub" startAt={book.last_location} prefs={prefs} annotations={anns}
              knownWords={book.word_count} onTurn={onTurn} onLocation={onLocation} onSelect={setSel} onWordCount={onWordCount}
              onAnnotationClick={() => setShowAnns(true)} />
          ) : (
            <TextReader ref={reader} data={blob} format={book.format} startAt={book.last_location} prefs={prefs} annotations={anns}
              knownWords={book.word_count} onTurn={onTurn} onLocation={onLocation} onSelect={setSel} onWordCount={onWordCount}
              onAnnotationClick={() => setShowAnns(true)} />
          )
        )}
        {!blob && <div className="p-10 opacity-60 text-sm">Baixando o livro…</div>}

        {showPrefs && (
          <div className="absolute right-3 top-3 z-30 card p-4 w-72 space-y-4 text-ink shadow-xl">
            <div>
              <div className="label mb-2">Tema</div>
              <div className="flex gap-2">
                {(Object.keys(THEMES) as (keyof typeof THEMES)[]).map((k) => (
                  <button key={k} onClick={() => setPrefs({ ...prefs, theme: k })}
                    className={`flex-1 rounded-lg border py-2 text-xs ${prefs.theme === k ? "border-accent ring-2 ring-accent-soft" : "border-line"}`}
                    style={{ background: THEMES[k].bg, color: THEMES[k].fg }}>
                    {THEMES[k].label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="label mb-2">Tamanho da letra · {prefs.fontSize}%</div>
              <input type="range" min={80} max={160} step={5} value={prefs.fontSize} className="w-full"
                onChange={(e) => setPrefs({ ...prefs, fontSize: Number(e.target.value) })} />
            </div>
            <div>
              <div className="label mb-2">Fonte</div>
              <div className="flex gap-2">
                <button className={`btn flex-1 justify-center ${prefs.serif ? "border-accent" : ""}`} style={{ fontFamily: "Literata, serif" }} onClick={() => setPrefs({ ...prefs, serif: true })}>Literata</button>
                <button className={`btn flex-1 justify-center ${!prefs.serif ? "border-accent" : ""}`} onClick={() => setPrefs({ ...prefs, serif: false })}>Inter</button>
              </div>
            </div>
            <p className="text-xs text-muted">Use ← e → do teclado ou toque nas bordas para virar a página.</p>
          </div>
        )}

        {showAnns && (
          <aside className="absolute right-0 top-0 bottom-0 z-30 w-full sm:w-96 bg-surface text-ink border-l border-line flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-4 h-12 border-b border-line">
              <span className="font-semibold text-sm">Anotações ({anns.length})</span>
              <button onClick={() => setShowAnns(false)}><X size={18} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-3">
              {anns.length === 0 && <p className="text-sm text-muted p-2">Selecione um trecho do texto para destacar e anotar.</p>}
              {anns.map((a) => (
                <div key={a.id} className="rounded-lg border border-line p-3">
                  <button className="text-left text-sm font-serif leading-relaxed border-l-[3px] pl-2.5"
                    style={{ borderColor: HL_COLORS[a.color] ?? HL_COLORS.amarelo }}
                    onClick={() => reader.current?.goTo(a.location)}>
                    “{a.quote.length > 280 ? a.quote.slice(0, 280) + "…" : a.quote}”
                  </button>
                  <textarea className="input mt-2 text-sm min-h-[56px]" placeholder="Sua nota…" defaultValue={a.note}
                    onBlur={(e) => {
                      const note = e.target.value;
                      if (note === a.note) return;
                      setAnns((all) => all.map((x) => (x.id === a.id ? { ...x, note } : x)));
                      void supabase().from("annotations").update({ note }).eq("id", a.id);
                    }} />
                  <div className="flex justify-end gap-1 mt-1.5">
                    <button className="btn btn-ghost text-xs px-2 py-1" onClick={() => toAnki(a)} title="Criar cartão no Anki"><Layers size={13} /> Anki</button>
                    <button className="btn btn-ghost text-xs px-2 py-1 hover:text-critical"
                      onClick={async () => { setAnns((all) => all.filter((x) => x.id !== a.id)); await supabase().from("annotations").delete().eq("id", a.id); }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}

        {sel && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-30 card shadow-xl p-3 w-[min(520px,calc(100%-2rem))] text-ink">
            <p className="text-xs text-muted line-clamp-2 font-serif">“{sel.quote}”</p>
            <div className="flex gap-2 mt-2 items-center">
              {Object.entries(HL_COLORS).map(([k, c]) => (
                <button key={k} title={k} onClick={() => setSelColor(k)}
                  className={`w-6 h-6 rounded-full shrink-0 ${selColor === k ? "ring-2 ring-offset-2 ring-accent" : ""}`} style={{ background: c }} />
              ))}
              <input className="input text-sm py-1.5" placeholder="Nota (opcional)" value={selNote} onChange={(e) => setSelNote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveHighlight()} />
              <button className="btn btn-primary py-1.5" onClick={saveHighlight}>Salvar</button>
              <button className="btn btn-ghost px-2 py-1.5" onClick={() => setSel(null)}><X size={15} /></button>
            </div>
          </div>
        )}

        {toast && (
          <div className="absolute left-1/2 -translate-x-1/2 top-4 z-40 rounded-lg px-4 py-2 text-sm shadow-lg" style={{ background: "var(--text)", color: "var(--bg)" }}>
            {toast}
          </div>
        )}
      </div>

      <footer className="shrink-0 flex items-center gap-2 px-3 h-9 text-xs opacity-80">
        <button className="p-1" onClick={() => reader.current?.prev()}><ChevronLeft size={16} /></button>
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: prefs.theme === "escuro" ? "#2f2f2c" : "#00000012" }}>
          <div className="h-full" style={{ width: `${progress * 100}%`, background: "#3987e5" }} />
        </div>
        <button className="p-1" onClick={() => reader.current?.next()}><ChevronRight size={16} /></button>
      </footer>
    </div>
  );
}
