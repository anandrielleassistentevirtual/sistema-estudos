"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Download, Highlighter, Layers, ListTree, Trash2, Type, X, ZoomIn, ZoomOut } from "lucide-react";
import { EpubReader } from "@/components/reader/epub-reader";
import { TextReader } from "@/components/reader/text-reader";
import { DEFAULT_PREFS, FONTS, HL_COLORS, ReaderFont, ReaderHandle, ReaderPrefs, THEMES, TocItem } from "@/components/reader/types";
import { downloadBook, saveBookFile } from "@/lib/books";
import { fmtClock, nf } from "@/lib/dates";
import { addBasicNote } from "@/lib/anki";
import { ReadingTracker } from "@/lib/reading-tracker";
import { supabase } from "@/lib/supabase/client";
import type { Annotation, Book } from "@/lib/types";
import { useTimer } from "@/components/timer-context";
import { literaryFromHighlight } from "@/lib/zettel";

const PREFS_KEY = "leitor-prefs-v2";
/** Níveis de zoom (100% = Times 12 pt). */
const ZOOM = [75, 90, 100, 110, 125, 150, 175, 200, 250];
const defaultPrefs: ReaderPrefs = DEFAULT_PREFS;

export default function Ler() {
  const { id } = useParams<{ id: string }>();
  const [book, setBook] = useState<Book | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anns, setAnns] = useState<Annotation[]>([]);
  const [prefs, setPrefs] = useState<ReaderPrefs>(defaultPrefs);
  const [showPrefs, setShowPrefs] = useState(false);
  const [showAnns, setShowAnns] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [location, setLocation] = useState("");
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
  const timer = useTimer();
  const timerOn = useRef(false);
  timerOn.current = timer.running && timer.phase === "foco";

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
    const t = new ReadingTracker(id, () => timerOn.current);
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
    if (location) setLocation(location);
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
    if (data) {
      setAnns((a) => [...a, data as Annotation]);
      // todo destaque vira nota literária na Inbox do Zettelkasten
      if (book) {
        void literaryFromHighlight({
          bookId: book.id, bookTitle: book.title, annotationId: (data as Annotation).id,
          quote: sel.quote, note: selNote, location: sel.location,
        });
        setToast("Destaque salvo — e enviado para a Inbox das notas.");
      }
    }
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

  const zoom = Math.round((prefs.sizePt / 12) * 100);
  function setZoom(dir: 1 | -1) {
    const next = dir > 0 ? ZOOM.find((z) => z > zoom + 1) : [...ZOOM].reverse().find((z) => z < zoom - 1);
    if (next) setPrefs((p) => ({ ...p, sizePt: Math.round((12 * next) / 100 * 10) / 10 }));
  }
  const zoomRef = useRef(setZoom);
  zoomRef.current = setZoom;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select") || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "+" || e.key === "=") zoomRef.current(1);
      if (e.key === "-" || e.key === "_") zoomRef.current(-1);
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, []);

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
        <span className="text-xs opacity-70 tabular-nums w-10 text-right" title="Progresso no livro">{Math.round(progress * 100)}%</span>
        <div className="flex items-center rounded-lg border mx-1" style={{ borderColor: prefs.theme === "escuro" ? "#2f2f2c" : "#00000018" }} title="Zoom (teclas + e −)">
          <button className="p-1.5 opacity-70 hover:opacity-100 disabled:opacity-30" onClick={() => setZoom(-1)} disabled={zoom <= ZOOM[0]} aria-label="Diminuir"><ZoomOut size={16} /></button>
          <button className="text-xs tabular-nums w-11 text-center opacity-80 hover:opacity-100" onClick={() => setPrefs((p) => ({ ...p, sizePt: 12 }))} title="Voltar a 100%">{zoom}%</button>
          <button className="p-1.5 opacity-70 hover:opacity-100 disabled:opacity-30" onClick={() => setZoom(1)} disabled={zoom >= ZOOM[ZOOM.length - 1]} aria-label="Aumentar"><ZoomIn size={16} /></button>
        </div>
        {progress > 0.97 && book?.status !== "lido" && (
          <button className="btn text-xs py-1" onClick={markRead}><Check size={14} /> Concluir</button>
        )}
        {book && book.format !== "fisico" && (
          <button className="p-2 opacity-70 hover:opacity-100 hidden sm:block" title="Baixar o arquivo do livro" onClick={() => book && void saveBookFile(book)}><Download size={18} /></button>
        )}
        {toc.length > 0 && (
          <button className="p-2 opacity-70 hover:opacity-100" onClick={() => { setShowToc(!showToc); setShowPrefs(false); setShowAnns(false); }} title="Sumário"><ListTree size={18} /></button>
        )}
        <button className="p-2 opacity-70 hover:opacity-100" onClick={() => { setShowPrefs(!showPrefs); setShowAnns(false); setShowToc(false); }} title="Aparência"><Type size={18} /></button>
        <button className="p-2 opacity-70 hover:opacity-100 relative" onClick={() => { setShowAnns(!showAnns); setShowPrefs(false); setShowToc(false); }} title="Anotações">
          <Highlighter size={18} />
          {anns.length > 0 && <span className="absolute top-1 right-0.5 text-[9px] font-bold">{anns.length}</span>}
        </button>
      </header>

      <div className="relative flex-1 min-h-0">
        {blob && book && (
          book.format === "epub" ? (
            <EpubReader ref={reader} data={blob} format="epub" startAt={book.last_location} prefs={prefs} annotations={anns}
              knownWords={book.word_count} onTurn={onTurn} onLocation={onLocation} onSelect={setSel} onWordCount={onWordCount}
              onAnnotationClick={() => setShowAnns(true)} onToc={setToc} onView={(w, last) => tracker.current?.see(w, last)} />
          ) : (
            <TextReader ref={reader} data={blob} format={book.format as "txt" | "md"} startAt={book.last_location} prefs={prefs} annotations={anns}
              knownWords={book.word_count} onTurn={onTurn} onLocation={onLocation} onSelect={setSel} onWordCount={onWordCount}
              onAnnotationClick={() => setShowAnns(true)} onToc={setToc} onView={(w, last) => tracker.current?.see(w, last)} />
          )
        )}
        {!blob && <div className="p-10 opacity-60 text-sm">Baixando o livro…</div>}

        {showToc && (
          <aside className="absolute left-0 top-0 bottom-0 z-30 w-full sm:w-80 bg-surface text-ink border-r border-line flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-4 h-12 border-b border-line">
              <span className="font-semibold text-sm">Sumário</span>
              <button onClick={() => setShowToc(false)}><X size={18} /></button>
            </div>
            <nav className="overflow-y-auto flex-1 py-2">
              {toc.map((item, i) => {
                const pageOf = (l: string) => (l.startsWith("p:") ? Number(l.slice(2)) : -1);
                const curPage = pageOf(location);
                const next = toc[i + 1];
                const here = curPage >= 0
                  ? pageOf(item.location) <= curPage && (!next || pageOf(next.location) > curPage)
                  : false;
                return (
                  <button key={i} onClick={() => { reader.current?.goTo(item.location); setShowToc(false); }}
                    className={`block w-full text-left text-sm py-1.5 pr-3 hover:bg-surface-2 ${here ? "text-accent font-medium" : ""}`}
                    style={{ paddingLeft: 16 + (item.level - 1) * 16 }}>
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </aside>
        )}

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
              <div className="label mb-2">Fonte</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(FONTS) as ReaderFont[]).map((f) => (
                  <button key={f} onClick={() => setPrefs({ ...prefs, font: f })}
                    className={`btn justify-center text-xs px-1 ${prefs.font === f ? "border-accent ring-2 ring-accent-soft" : ""}`}
                    style={{ fontFamily: FONTS[f].css }}>
                    {f === "times" ? "Times" : FONTS[f].label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="label mb-2 flex justify-between"><span>Tamanho</span><span className="normal-case">{prefs.sizePt} pt</span></div>
              <div className="flex items-center gap-2">
                <button className="btn px-2.5" onClick={() => setPrefs({ ...prefs, sizePt: Math.max(9, prefs.sizePt - 1) })}>A−</button>
                <input type="range" min={9} max={30} step={0.5} value={prefs.sizePt} className="flex-1"
                  onChange={(e) => setPrefs({ ...prefs, sizePt: Number(e.target.value) })} />
                <button className="btn px-2.5" onClick={() => setPrefs({ ...prefs, sizePt: Math.min(30, prefs.sizePt + 1) })}>A+</button>
              </div>
            </div>
            <div>
              <div className="label mb-2">Espaçamento entre linhas</div>
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 1.15, 1.5, 2].map((lh) => (
                  <button key={lh} onClick={() => setPrefs({ ...prefs, lineHeight: lh })}
                    className={`btn justify-center text-xs px-1 ${prefs.lineHeight === lh ? "border-accent ring-2 ring-accent-soft" : ""}`}>
                    {String(lh).replace(".", ",")}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="label mb-2">Alinhamento</div>
              <div className="grid grid-cols-2 gap-1.5">
                <button className={`btn justify-center text-xs ${prefs.justify ? "border-accent ring-2 ring-accent-soft" : ""}`} onClick={() => setPrefs({ ...prefs, justify: true })}>Justificado</button>
                <button className={`btn justify-center text-xs ${!prefs.justify ? "border-accent ring-2 ring-accent-soft" : ""}`} onClick={() => setPrefs({ ...prefs, justify: false })}>À esquerda</button>
              </div>
            </div>
            <button className="text-xs text-accent" onClick={() => setPrefs({ ...DEFAULT_PREFS, theme: prefs.theme })}>
              Voltar ao padrão (Times 12, justificado, 1,5)
            </button>
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
                      onClick={async () => {
                        setAnns((all) => all.filter((x) => x.id !== a.id));
                        await supabase().from("notes").delete().eq("annotation_id", a.id).eq("status", "a_tratar");
                        await supabase().from("annotations").delete().eq("id", a.id);
                      }}>
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
