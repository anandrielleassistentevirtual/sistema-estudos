"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { countWords } from "@/lib/text";
import { repararCapitulo } from "./epub-reparo";
import { FONTS, HL_COLORS, ReaderHandle, ReaderProps, THEMES, semVariaveis, themeColors } from "./types";

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
      // livro convertido de PDF (uma linha por parágrafo): junta as linhas antes de montar as páginas
      r.hooks.content.register((contents: any) => { try { repararCapitulo(contents.document); } catch {} });
      for (const [k, t] of Object.entries(THEMES)) {
        r.themes.register(k, {
          body: { background: `${t.bg} !important`, color: `${t.fg} !important` },
          "p, li, blockquote, span, div": { color: `${t.fg} !important` },
          a: { color: "inherit !important", "text-decoration": "underline" },
          "::selection": { background: "rgba(128,128,128,0.3)" },
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
        cb.current.onView?.(pageWords(next), !!loc.atEnd);
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
      // margens do próprio livro fora: quem define a coluna é o leitor (centralizada, como no Markdown)
      body: { margin: "0 !important" },
      p: { orphans: "2", widows: "2" },
      "body, p, div, li, blockquote, span, td": {
        "font-family": `${semVariaveis(FONTS[p.font].css)} !important`,
        "line-height": `${p.lineHeight} !important`,
      },
      "p, div, li, blockquote": {
        "text-align": `${p.justify ? "justify" : "left"} !important`,
        hyphens: "auto",
      },
      // ilustrações: cabem inteiras na página, centralizadas, sem cortar nem esticar
      "img, svg, image, video": {
        "max-width": "100% !important",
        "max-height": "92vh !important",
        height: "auto !important",
        "object-fit": "contain",
        "break-inside": "avoid",
      },
      // título, subtítulo e separador não ficam soltos no fim da página: seguem com o texto seguinte
      "h1, h2, h3, h4, h5, h6, hr": { "break-after": "avoid !important", "page-break-after": "avoid !important", "break-inside": "avoid !important" },
      // subtítulo: parágrafo que é só itálico ou só negrito, como "(1912–1982)"
      "p:has(> em:only-child), p:has(> i:only-child), p:has(> strong:only-child), p:has(> b:only-child)": { "break-after": "avoid !important" },
      img: { display: "block", margin: "1em auto !important" },
      "figure, .figure": { margin: "1.2em auto !important", "text-align": "center !important", "break-inside": "avoid" },
      "figcaption, .caption": { "font-size": "0.85em !important", opacity: "0.75", "text-align": "center !important", "text-indent": "0 !important" },
    });
  }
  useEffect(() => {
    applyPrefs();
    // a coluna muda de largura com o zoom: o leitor refaz as páginas
    try { rendition.current?.resize?.(); } catch {}
  }, [props.prefs]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const bg = themeColors(props.prefs.theme).bg;
  return (
    <div className="relative w-full h-full" style={{ background: bg }}>
      {/* coluna de leitura centralizada (≈ 68 caracteres por linha, como no leitor de Markdown), acompanhando o zoom */}
      <div ref={el} className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-full px-3 md:px-6 py-6"
        style={{ maxWidth: Math.round(720 * (props.prefs.sizePt / 12)) }} />
      <button aria-label="Página anterior" className="absolute left-0 top-0 bottom-0 w-[8%] z-10" onClick={() => rendition.current?.prev()} />
      <button aria-label="Próxima página" className="absolute right-0 top-0 bottom-0 w-[8%] z-10" onClick={() => rendition.current?.next()} />
    </div>
  );
});
