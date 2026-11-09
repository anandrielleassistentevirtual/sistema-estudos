"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Play, RotateCcw, Undo2, Volume2 } from "lucide-react";
import { ANKI_INICIO, anki } from "@/lib/anki";
import { Language, loadLanguages } from "@/lib/languages";
import { dayKey, fmtClock } from "@/lib/dates";
import { supabase, fire } from "@/lib/supabase/client";

interface CurrentCard {
  cardId: number;
  question: string;
  answer: string;
  deckName: string;
  modelName: string;
  buttons: number[];
  nextReviews: string[];
  css?: string;
  fields?: Record<string, { value: string; order: number }>;
}

const EASE: Record<number, { label: string; key: string; color: string }> = {
  1: { label: "Errei", key: "1", color: "#d03b3b" },
  2: { label: "Difícil", key: "2", color: "#c98500" },
  3: { label: "Bom", key: "3", color: "#0ca30c" },
  4: { label: "Fácil", key: "4", color: "#2a78d6" },
};

/** Arquivos de áudio citados nos campos do cartão, na ordem dos campos. */
function fieldSounds(c: CurrentCard): string[] {
  return Object.values(c.fields ?? {})
    .sort((a, b) => a.order - b.order)
    .flatMap((f) => [...f.value.matchAll(/\[sound:([^\]]+)\]/g)].map((m) => m[1]));
}

/**
 * Prepara o HTML do cartão: tira as marcações de áudio e descobre quais arquivos tocar.
 * O Anki novo entrega [anki:play:q:0] em vez de [sound:arquivo]; o arquivo vem dos campos.
 */
async function prepare(html: string, c: CurrentCard, side: "q" | "a", qCount: number, cache: Map<string, string>) {
  const all = fieldSounds(c);
  const sounds: string[] = [...html.matchAll(/\[sound:([^\]]+)\]/g)].map((m) => m[1]);
  const tags = [...html.matchAll(/\[anki:play:([qa]):(\d+)\]/g)].map((m) => Number(m[2]));
  for (const i of tags) {
    let f: string | undefined;
    if (side === "q") f = all[i];
    else if (tags.length >= all.length) f = all[i]; // verso repete a frente ({{FrontSide}})
    else f = all[qCount + i] ?? all[i];
    if (f) sounds.push(f);
  }
  let out = html.replace(/\[sound:[^\]]+\]/g, "").replace(/\[anki:play:[qa]:\d+\]/g, "");
  const imgs = [...out.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]).filter((x) => !/^(https?:|data:|blob:)/.test(x));
  for (const src of new Set(imgs)) {
    const url = await media(src, cache);
    if (url) out = out.split(`"${src}"`).join(`"${url}"`).split(`'${src}'`).join(`'${url}'`);
  }
  return { html: out, sounds: [...new Set(sounds)], qCount: tags.length };
}

async function media(file: string, cache: Map<string, string>): Promise<string | null> {
  if (cache.has(file)) return cache.get(file)!;
  try {
    const b64 = await anki<string | false>("retrieveMediaFile", { filename: decodeURIComponent(file) });
    if (!b64) return null;
    const ext = file.split(".").pop()?.toLowerCase() ?? "";
    const mime =
      { mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4", opus: "audio/ogg", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" }[ext] ?? "application/octet-stream";
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bin], { type: mime }));
    cache.set(file, url);
    return url;
  } catch {
    return null;
  }
}

function srcdoc(html: string, css: string, dark: boolean) {
  return `<!doctype html><html><head><meta charset="utf-8">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,600&display=swap"><style>
    html,body{margin:0;padding:0;background:transparent}
    body{font-family:Literata,Georgia,serif;font-size:26px;line-height:1.5;text-align:center;color:${dark ? "#f0efec" : "#1d1c1a"};padding:28px 16px}
    img{max-width:100%;height:auto} hr{border:0;border-top:1px solid ${dark ? "#3a3a37" : "#e2ded4"};margin:24px 0}
    ${css}
    .card{background:transparent!important;color:inherit}
  </style></head><body class="card${dark ? " nightMode night_mode" : ""}">${html}</body></html>`;
}

export default function RevisarAnki() {
  const [deck, setDeck] = useState("");
  const [card, setCard] = useState<CurrentCard | null>(null);
  const [view, setView] = useState<{ html: string; sounds: string[]; qCount: number } | null>(null);
  const [shown, setShown] = useState(false);
  const [state, setState] = useState<"carregando" | "revisando" | "fim" | "erro">("carregando");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(0);
  const [secs, setSecs] = useState(0);
  const [langs, setLangs] = useState<Language[]>([]);
  const [lang, setLang] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const [dark, setDark] = useState(false);
  const [height, setHeight] = useState(240);
  const frame = useRef<HTMLIFrameElement>(null);
  const cache = useRef(new Map<string, string>());
  const audio = useRef<HTMLAudioElement | null>(null);
  const start = useRef(Date.now());
  const busy = useRef(false);

  const [blocked, setBlocked] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const playToken = useRef(0);
  useEffect(() => { try { setAutoplay(localStorage.getItem("anki-autoplay") !== "0"); } catch {} }, []);

  const play = useCallback(async (files: string[]) => {
    const token = ++playToken.current;
    if (!audio.current) audio.current = new Audio(); // um único player: o navegador não bloqueia os seguintes
    const a = audio.current;
    a.pause();
    for (const f of files) {
      const url = await media(f, cache.current);
      if (!url || token !== playToken.current) continue;
      a.src = url;
      setPlayingAudio(true);
      const ok = await new Promise<boolean>((res) => {
        a.onended = () => res(true);
        a.onerror = () => res(true);
        a.play().then(() => setBlocked(false)).catch((e: Error) => { if (e.name === "NotAllowedError") setBlocked(true); res(false); });
      });
      if (!ok || token !== playToken.current) break;
    }
    if (token === playToken.current) setPlayingAudio(false);
  }, []);

  const load = useCallback(async (first = false) => {
    try {
      const c = await anki<CurrentCard | null>("guiCurrentCard");
      if (!c) { setState("fim"); setCard(null); return; }
      setCard(c);
      setShown(false);
      const v = await prepare(c.question, c, "q", 0, cache.current);
      setView(v);
      setState("revisando");
      let auto = true;
      try { auto = localStorage.getItem("anki-autoplay") !== "0"; } catch {}
      if (auto && v.sounds.length) void play(v.sounds);
      void first;
    } catch (e) {
      setErr((e as Error).message || "Não foi possível falar com o Anki.");
      setState("erro");
    }
  }, [play]);

  // início: abre a revisão do baralho no Anki e pega o primeiro cartão
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("deck") ?? "";
    setDeck(d);
    setDark(document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches));
    (async () => {
      const ls = await loadLanguages();
      setLangs(ls);
      const guess = ls.find((l) => d.toLowerCase().includes(l.name.toLowerCase()));
      setLang(guess?.name ?? ls[0]?.name ?? "");
      try {
        if (d) await anki("guiDeckReview", { name: d });
        await new Promise((r) => setTimeout(r, 400));
        await load(true);
      } catch (e) {
        setErr((e as Error).message || "Não foi possível falar com o Anki.");
        setState("erro");
      }
    })();
  }, [load]);

  // relógio da sessão
  useEffect(() => {
    const t = setInterval(() => setSecs(Math.round((Date.now() - start.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // ao sair: grava o tempo no idioma e sincroniza o histórico do Anki
  const langRef = useRef(lang);
  langRef.current = lang;
  const doneRef = useRef(done);
  doneRef.current = done;
  useEffect(() => {
    return () => {
      audio.current?.pause();
      const s = Math.round((Date.now() - start.current) / 1000);
      if (s >= 30 && doneRef.current > 0) {
        fire(supabase().from("study_sessions").insert({
          day: dayKey(), seconds: s, category: "Idiomas", language: langRef.current || null, label: `Anki · ${doneRef.current} cartões`,
        }));
      }
      void anki<[string, number][]>("getNumCardsReviewedByDay").then((rows) => {
        const today = rows.filter(([d]) => d >= dayKey(new Date(Date.now() - 7 * 864e5)) && d >= ANKI_INICIO);
        if (today.length) fire(supabase().from("anki_daily").upsert(today.map(([day, reviews]) => ({ day, reviews }))));
      }).catch(() => {});
    };
  }, []);

  async function reveal() {
    if (!card || shown || busy.current) return;
    busy.current = true;
    try {
      await anki("guiShowAnswer");
      const v = await prepare(card.answer, card, "a", view?.qCount ?? 0, cache.current);
      const qSounds = new Set(view?.sounds ?? []);
      setView({ html: v.html, sounds: [...new Set([...(view?.sounds ?? []), ...v.sounds])], qCount: view?.qCount ?? 0 });
      setShown(true);
      const extra = v.sounds.filter((x) => !qSounds.has(x));
      if (autoplay && extra.length) void play(extra);
    } finally {
      busy.current = false;
    }
  }

  async function answer(ease: number) {
    if (!card || !shown || busy.current) return;
    busy.current = true;
    audio.current?.pause();
    try {
      await anki("guiAnswerCard", { ease });
      setDone((n) => n + 1);
      setCanUndo(true);
      await load();
    } catch (e) {
      setErr((e as Error).message);
      setState("erro");
    } finally {
      busy.current = false;
    }
  }

  async function undo() {
    if (busy.current) return;
    busy.current = true;
    try {
      await anki("guiUndo");
      setDone((n) => Math.max(0, n - 1));
      setCanUndo(false);
      await load();
    } catch {
      setCanUndo(false);
    } finally {
      busy.current = false;
    }
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,select,textarea")) return;
      if ((e.code === "Space" || e.key === "Enter") && !shown) { e.preventDefault(); void reveal(); }
      else if (shown && ["1", "2", "3", "4"].includes(e.key)) { e.preventDefault(); void answer(Number(e.key)); }
      else if (shown && (e.code === "Space" || e.key === "Enter")) { e.preventDefault(); void answer(3); }
      else if (e.key.toLowerCase() === "r" && view) void play(view.sounds);
      else if (e.key.toLowerCase() === "z" && canUndo) void undo();
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  });

  function fit() {
    const doc = frame.current?.contentDocument;
    if (doc?.body) setHeight(Math.max(200, doc.body.scrollHeight + 8));
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 min-h-screen flex flex-col">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Link href="/idiomas/anki" className="text-sm text-muted flex items-center gap-1"><ChevronLeft size={15} /> Anki</Link>
        <span className="font-medium truncate">{card?.deckName ?? deck}</span>
        <span className="ml-auto flex items-center gap-3 text-xs text-muted">
          <span className="tabular-nums font-mono">{fmtClock(secs)}</span>
          <span>{done} {done === 1 ? "cartão" : "cartões"}</span>
          <select className="input w-auto py-1 text-xs" value={lang} onChange={(e) => setLang(e.target.value)} title="O tempo desta revisão entra neste idioma">
            <option value="">sem idioma</option>
            {langs.map((l) => <option key={l.id}>{l.name}</option>)}
          </select>
        </span>
      </div>

      {state === "carregando" && <div className="card p-10 text-center text-muted text-sm">Abrindo a revisão no Anki…</div>}

      {state === "erro" && (
        <div className="card p-6 space-y-3 text-sm">
          <p className="text-critical font-medium">Não consegui falar com o Anki.</p>
          <p className="text-muted">{err}</p>
          <p className="text-muted">Confira se o Anki está aberto neste computador e se o AnkiConnect está configurado (veja a aba Anki).</p>
          <button className="btn" onClick={() => { setState("carregando"); void load(true); }}><RotateCcw size={14} /> Tentar de novo</button>
        </div>
      )}

      {state === "fim" && (
        <div className="card p-10 text-center space-y-3">
          <div className="text-4xl">🎉</div>
          <p className="font-medium text-lg">Parabéns! Você terminou este baralho por hoje.</p>
          <p className="text-sm text-muted">{done} cartões em {fmtClock(secs)}.</p>
          <Link href="/idiomas/anki" className="btn btn-primary inline-flex">Voltar aos baralhos</Link>
        </div>
      )}

      {state === "revisando" && view && card && (
        <>
          <div className="card overflow-hidden">
            <iframe
              ref={frame}
              title="Cartão"
              sandbox="allow-same-origin"
              className="w-full block"
              style={{ height }}
              srcDoc={srcdoc(view.html, card.css ?? "", dark)}
              onLoad={fit}
            />
          </div>
          {view.sounds.length > 0 && (
            <div className="flex flex-col items-center mt-4 gap-1.5">
              <button onClick={() => play(view.sounds)} title="Ouvir (R)"
                className={`w-16 h-16 rounded-full grid place-items-center text-white shadow-md transition-transform active:scale-95 ${blocked ? "animate-pulse" : ""}`}
                style={{ background: "var(--accent)" }}>
                {playingAudio ? <Volume2 size={26} /> : <Play size={28} className="ml-1" />}
              </button>
              <span className="text-xs text-muted">{blocked ? "Toque para ouvir (o navegador bloqueou o som automático)" : "R para ouvir de novo"}</span>
            </div>
          )}
          <div className="flex justify-center gap-2 mt-3">
            <label className="text-xs text-muted flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={autoplay} onChange={(e) => { setAutoplay(e.target.checked); try { localStorage.setItem("anki-autoplay", e.target.checked ? "1" : "0"); } catch {} }} />
              tocar áudio sozinho
            </label>
            {canUndo && <button className="btn btn-ghost text-xs py-1" onClick={undo} title="Desfazer última resposta (Z)"><Undo2 size={14} /> Desfazer</button>}
          </div>

          <div className="mt-auto pt-6 pb-2 sticky bottom-0 bg-bg">
            {!shown ? (
              <button className="btn btn-primary w-full justify-center py-3 text-base" onClick={reveal}>
                <Play size={16} /> Mostrar resposta <span className="opacity-70 text-xs ml-1">(Espaço)</span>
              </button>
            ) : (
              <div className={`grid gap-2 ${card.buttons.length === 4 ? "grid-cols-4" : card.buttons.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                {card.buttons.map((b, i) => (
                  <button key={b} onClick={() => answer(b)}
                    className="rounded-xl border border-line bg-surface py-3 hover:bg-surface-2 transition-colors">
                    <div className="text-xs text-muted tabular-nums">{card.nextReviews[i] ?? ""}</div>
                    <div className="font-medium" style={{ color: EASE[b]?.color }}>{EASE[b]?.label ?? b}</div>
                    <div className="text-[10px] text-faint">tecla {b}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
