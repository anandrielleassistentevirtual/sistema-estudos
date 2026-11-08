"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { countWords } from "@/lib/text";
import { FONTS, HL_COLORS, ReaderHandle, ReaderProps, THEMES } from "./types";

type Pos = { index: number; page: number; total: number };

export const EpubReader = forwardRef<ReaderHandle, ReaderProps>(function EpubReader(props, ref) {
  const el = useRef<HTMLDivElement>(null);
  const rendition = useRef<any>(null);
  const book = useRef<any>(null);
  const sectionWords = useRef<number[] | null>(null);
  const pos = useRef<Pos | null>(null);
  const drawn = useRef<Set<string>>(new Set());
  const cb = useRef(props);
  cb.current = props;

  useImperativeHandle(ref, () => ({
    goTo: (loc) => rendition.current?.display(loc),
    next: () => rendition.current?.next(),
    prev: () => rendition.current?.prev(),
  }));

  useEffect(() => {
    let cancelled = false;
    let r: any;
    let b: any;
    (async () => {
      const ePub = (await import("epubjs")).default;
      b = ePub(await props.data.arrayBuffer());
      book.current = b;
      r = b.renderTo(el.current!, { width: "100%", height: "100%", spread: "none", flow: "paginated", allowScriptedContent: false });
      rendition.current = r;
      for (const [k, t] of Object.entries(THEMES)) {
        r.themes.register(k, {
          body: { background: `${t.bg} !important`, color: `${t.fg} !important` },
          "p, li, blockquote, span, div": { color: `${t.fg} !important` },
          a: { color: "#3987e5 !important" },
          "::selection": { background: "rgba(57,135,229,0.3)" },
        });
      }
      applyPrefs();
      await b.ready;
      if (cancelled) return;

      r.on("relocated", (loc: any) => {
        const next: Pos = { index: loc.start.index, page: loc.start.displayed.page, total: loc.start.displayed.total };
        const prev = pos.current;
        if (prev) {
          const forward = next.index > prev.index || (next.index === prev.index && next.page > prev.page);
          cb.current.onTurn(pageWords(prev), forward);
        }
        pos.current = next;
        const label = b.navigation?.get?.(loc.start.href)?.label?.trim?.() ?? "";
        cb.current.onLocation(loc.start.cfi, progressOf(next), label);
      });
      r.on("selected", async (cfiRange: string) => {
        const range = await Promise.resolve(b.getRange(cfiRange));
        const quote = range?.toString().trim();
        if (quote) cb.current.onSelect({ location: cfiRange, quote });
      });
      r.on("click", () => cb.current.onSelect(null));
      r.on("keyup", onKey);

      try {
        const nav = await b.loaded.navigation;
        const flat: { label: string; location: string; level: number }[] = [];
        const walk = (items: any[], level: number) => {
          for (const it of items ?? []) {
            flat.push({ label: String(it.label ?? "").trim(), location: it.href, level });
            if (it.subitems?.length) walk(it.subitems, Math.min(3, level + 1));
          }
        };
        walk(nav?.toc ?? [], 1);
        cb.current.onToc?.(flat.filter((x) => x.label && x.location));
      } catch {}
      await r.display(props.startAt || undefined);
      drawAnnotations();
      void countSections();
    })();

    async function countSections() {
      const items: any[] = (b.spine as any).spineItems ?? [];
      const out: number[] = [];
      for (const it of items) {
        try {
          const doc = await it.load(b.load.bind(b));
          out.push(countWords(doc?.textContent ?? ""));
          it.unload();
        } catch {
          out.push(0);
        }
        if (cancelled) return;
      }
      sectionWords.current = out;
      cb.current.onWordCount(out.reduce((a, x) => a + x, 0));
      if (pos.current) cb.current.onLocation(r.currentLocation()?.start?.cfi ?? "", progressOf(pos.current), "");
    }

    return () => {
      cancelled = true;
      try { r?.destroy(); b?.destroy(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.data]);

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowRight") rendition.current?.next();
    if (e.key === "ArrowLeft") rendition.current?.prev();
  }
  useEffect(() => {
    document.addEventListener("keyup", onKey);
    return () => document.removeEventListener("keyup", onKey);
  }, []);

  function pageWords(p: Pos): number {
    const sw = sectionWords.current;
    if (!sw) return 0;
    return Math.round((sw[p.index] ?? 0) / Math.max(1, p.total));
  }
  function progressOf(p: Pos): number {
    const sw = sectionWords.current;
    if (!sw) return 0;
    const total = sw.reduce((a, x) => a + x, 0) || 1;
    const before = sw.slice(0, p.index).reduce((a, x) => a + x, 0);
    return Math.min(1, (before + (sw[p.index] ?? 0) * (p.page / Math.max(1, p.total))) / total);
  }

  function applyPrefs() {
    const r = rendition.current;
    if (!r) return;
    const p = cb.current.prefs;
    r.themes.select(p.theme);
    r.themes.fontSize(`${p.sizePt}pt`);
    r.themes.default({
      "body, p, div, li, blockquote, span, td": {
        "font-family": `${FONTS[p.font].css} !important`,
        "line-height": `${p.lineHeight} !important`,
      },
      "p, div, li, blockquote": {
        "text-align": `${p.justify ? "justify" : "left"} !important`,
        hyphens: "auto",
      },
    });
  }
  useEffect(applyPrefs, [props.prefs]);

  function drawAnnotations() {
    const r = rendition.current;
    if (!r) return;
    const ids = new Set(cb.current.annotations.map((a) => a.id));
    for (const a of cb.current.annotations) {
      if (drawn.current.has(a.id)) continue;
      try {
        r.annotations.highlight(a.location, { id: a.id }, () => cb.current.onAnnotationClick(a.id), "hl", {
          fill: HL_COLORS[a.color] ?? HL_COLORS.amarelo,
          "fill-opacity": "0.3",
          "mix-blend-mode": "multiply",
        });
        drawn.current.add(a.id);
      } catch {}
    }
    for (const id of [...drawn.current]) {
      if (!ids.has(id)) {
        const old = (r.annotations as any)._annotations;
        const entry = old && Object.values(old).find((x: any) => x.data?.id === id) as any;
        if (entry) r.annotations.remove(entry.cfiRange, "highlight");
        drawn.current.delete(id);
      }
    }
  }
  useEffect(drawAnnotations, [props.annotations]);

  const bg = THEMES[props.prefs.theme].bg;
  return (
    <div className="relative w-full h-full" style={{ background: bg }}>
      <div ref={el} className="absolute inset-0 px-2 md:px-10 py-6" />
      <button aria-label="Página anterior" className="absolute left-0 top-0 bottom-0 w-[8%] z-10" onClick={() => rendition.current?.prev()} />
      <button aria-label="Próxima página" className="absolute right-0 top-0 bottom-0 w-[8%] z-10" onClick={() => rendition.current?.next()} />
    </div>
  );
});
