"use client";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { countWords } from "@/lib/text";
import { ReaderHandle, ReaderProps, THEMES } from "./types";

const WORDS_PER_PAGE = 320;

/** Leitor paginado para TXT e Markdown: páginas de ~320 palavras, quebrando em parágrafos. */
export const TextReader = forwardRef<ReaderHandle, ReaderProps>(function TextReader(props, ref) {
  const [text, setText] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(props);
  cb.current = props;

  useEffect(() => {
    void props.data.text().then(setText);
  }, [props.data]);

  const pages = useMemo(() => {
    if (text === null) return [];
    const paras = text.replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const out: { text: string; words: number }[] = [];
    let cur: string[] = [];
    let n = 0;
    for (const p of paras) {
      const w = countWords(p);
      if (n > 0 && n + w > WORDS_PER_PAGE * 1.15) {
        out.push({ text: cur.join("\n\n"), words: n });
        cur = [];
        n = 0;
      }
      cur.push(p);
      n += w;
    }
    if (cur.length) out.push({ text: cur.join("\n\n"), words: n });
    return out;
  }, [text]);

  // posição inicial
  useEffect(() => {
    if (!pages.length) return;
    const total = pages.reduce((a, p) => a + p.words, 0);
    cb.current.onWordCount(total);
    const m = props.startAt?.match(/^p:(\d+)$/);
    const start = m ? Math.min(pages.length - 1, Number(m[1])) : 0;
    setPage(start);
    report(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  function report(p: number) {
    const total = pages.reduce((a, x) => a + x.words, 0) || 1;
    const before = pages.slice(0, p + 1).reduce((a, x) => a + x.words, 0);
    cb.current.onLocation(`p:${p}`, before / total, `Página ${p + 1} de ${pages.length}`);
  }

  function go(to: number) {
    if (to < 0 || to >= pages.length || to === page) return;
    cb.current.onTurn(pages[page].words, to === page + 1);
    setPage(to);
    report(to);
    cb.current.onSelect(null);
    box.current?.scrollTo({ top: 0 });
  }

  useImperativeHandle(ref, () => ({
    goTo: (loc) => {
      const m = loc.match(/^p:(\d+)$/);
      if (m) go(Number(m[1]));
    },
    next: () => go(page + 1),
    prev: () => go(page - 1),
  }));

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      if (e.key === "ArrowRight") go(page + 1);
      if (e.key === "ArrowLeft") go(page - 1);
    };
    document.addEventListener("keyup", k);
    return () => document.removeEventListener("keyup", k);
  });

  function onMouseUp() {
    const sel = window.getSelection();
    const quote = sel?.toString().trim();
    if (quote && box.current?.contains(sel!.anchorNode)) cb.current.onSelect({ location: `p:${page}`, quote });
  }

  const t = THEMES[props.prefs.theme];
  const current = pages[page];
  const marks = props.annotations.filter((a) => a.location === `p:${page}`).map((a) => a.quote);

  return (
    <div ref={box} className="w-full h-full overflow-y-auto" style={{ background: t.bg, color: t.fg }} onMouseUp={onMouseUp} onTouchEnd={onMouseUp}>
      <article
        className="reading-page prose-notes mx-auto max-w-[68ch] px-6 py-10"
        style={{ fontSize: `${(props.prefs.fontSize / 100) * 1.12}rem`, lineHeight: 1.75, fontFamily: props.prefs.serif ? undefined : "var(--font-sans)" }}
      >
        {!current ? (
          <p className="opacity-60">Carregando…</p>
        ) : props.format === "md" ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.text}</ReactMarkdown>
        ) : (
          current.text.split("\n\n").map((p, i) => <p key={i} dangerouslySetInnerHTML={{ __html: highlight(escape(p), marks.map(escape)) }} />)
        )}
        {current && (
          <div className="flex justify-between items-center mt-10 text-sm opacity-70 font-sans">
            <button className="btn" onClick={() => go(page - 1)} disabled={page === 0}>← Anterior</button>
            <span>{page + 1} / {pages.length}</span>
            <button className="btn" onClick={() => go(page + 1)} disabled={page >= pages.length - 1}>Próxima →</button>
          </div>
        )}
      </article>
    </div>
  );
});

function escape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlight(html: string, quotes: string[]) {
  let out = html;
  for (const q of quotes) {
    if (!q || q.includes("\n")) continue;
    out = out.split(q).join(`<mark>${q}</mark>`);
  }
  return out;
}
