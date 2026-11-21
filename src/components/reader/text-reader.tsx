"use client";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { aoDesfazerSelecao, FONTS, HL_COLORS, ReaderHandle, ReaderProps, themeColors, TocItem } from "./types";
import { paginar } from "./paginar";

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

  const { pages, toc } = useMemo(() => (text === null ? { pages: [], toc: [] as TocItem[] } : paginar(text, props.format === "md")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text]);

  useEffect(() => {
    if (pages.length) cb.current.onToc?.(toc);
  }, [pages, toc]);

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
    cb.current.onView?.(pages[p]?.words ?? 0, p === pages.length - 1);
    const chapter = [...toc].reverse().find((t) => Number(t.location.slice(2)) <= p);
    cb.current.onLocation(`p:${p}`, before / total, `${chapter ? chapter.label + " · " : ""}Página ${p + 1} de ${pages.length}`);
    // até o começo do próximo capítulo (ou o fim do livro)
    const inicios = limitesDeCapitulo(toc);
    const proximo = inicios.filter((n) => n > p).sort((a, b) => a - b)[0] ?? pages.length;
    cb.current.onCapitulo?.(inicios.length ? Math.max(0, proximo - p - 1) : null);
  }

  function go(to: number) {
    if (to < 0 || to >= pages.length || to === page) return;
    cb.current.onTurn(pages[page].words, to === page + 1);
    setPage(to);
    report(to);
    cb.current.onNotaHover?.(null);
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

  // seleção desfeita (clique fora do trecho, toque, tecla): a barra de anotação some
  useEffect(() => aoDesfazerSelecao(document, () => cb.current.onSelect(null)), []);

  function onMouseUp() {
    const sel = window.getSelection();
    const quote = sel?.toString().trim();
    if (quote && box.current?.contains(sel!.anchorNode)) cb.current.onSelect({ location: `p:${page}`, quote });
    else cb.current.onSelect(null);
  }

  const t = themeColors(props.prefs.theme);
  const current = pages[page];
  // destaques desta página, juntos pelo trecho (o mesmo trecho destacado duas vezes vira uma marca com as duas notas)
  const marks = useMemo(() => {
    const m = new Map<string, { ids: string[]; cor: string }>();
    for (const a of props.annotations.filter((x) => x.location === `p:${page}`)) {
      const g = m.get(a.quote) ?? { ids: [], cor: HL_COLORS[a.color] ?? HL_COLORS.amarelo };
      g.ids.push(a.id);
      m.set(a.quote, g);
    }
    return [...m.entries()].map(([quote, g]) => ({ quote, ...g }));
  }, [props.annotations, page]);
  // o texto da página só é refeito quando a página ou os destaques mudam: qualquer outra atualização da tela
  // (a barra de anotação abrindo, o relógio…) reaproveita os mesmos parágrafos, sem apagar a seleção
  const corpo = useMemo(() => (
!current ? (
          <p className="opacity-60">Carregando…</p>
        ) : props.format === "md" ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.text}</ReactMarkdown>
        ) : (
          current.text.split("\n\n").map((p, i) => {
            const h = p.match(/^(#{1,3})\s+(.+?)\s*#*$/);
            if (h) {
              const Tag = (["h1", "h2", "h3"] as const)[h[1].length - 1];
              return <Tag key={i} style={{ textAlign: "left" }}>{h[2]}</Tag>;
            }
            return <p key={i} dangerouslySetInnerHTML={{ __html: highlight(escape(p), marks.map((m) => ({ ...m, quote: escape(m.quote) }))) }} />;
          })
        )
  ), [current, marks, props.format]); // eslint-disable-line react-hooks/exhaustive-deps
  const sobre = useRef("");
  /** o mouse sobre uma marca: as notas dela e das marcas por fora (trechos que se sobrepõem) */
  function hover(e: React.MouseEvent) {
    const m = (e.target as Element).closest?.("mark[data-anns]") as HTMLElement | null;
    const ids: string[] = [];
    for (let x: HTMLElement | null = m; x; x = x.parentElement?.closest("mark[data-anns]") as HTMLElement | null) ids.push(...(x.dataset.anns ?? "").split(",").filter(Boolean));
    const chave = ids.join(",");
    if (chave === sobre.current) return;
    sobre.current = chave;
    if (!m) return cb.current.onNotaHover?.(null);
    const r = m.getBoundingClientRect();
    cb.current.onNotaHover?.({ ids: [...new Set(ids)], left: r.left, right: r.right, top: r.top, bottom: r.bottom });
  }

  return (
    <div ref={box} className="w-full h-full overflow-y-auto" style={{ background: t.bg, color: t.fg }} onMouseUp={onMouseUp} onTouchEnd={onMouseUp}
      onMouseMove={hover} onMouseLeave={() => { sobre.current = ""; cb.current.onNotaHover?.(null); }}
      onScroll={() => { if (sobre.current) { sobre.current = ""; cb.current.onNotaHover?.(null); } }}
      onClick={(e) => { const m = (e.target as Element).closest?.("mark[data-anns]") as HTMLElement | null; const id = m?.dataset.anns?.split(",")[0]; if (id && !window.getSelection()?.toString().trim()) cb.current.onAnnotationClick(id); }}>
      <article
        className="reading-page prose-notes mx-auto max-w-[68ch] px-6 pt-10 pb-28" /* espaço no fim: Anterior/Próxima ficam acima do Menu e do cronômetro */
        style={{
          fontSize: `${props.prefs.sizePt}pt`,
          lineHeight: props.prefs.lineHeight,
          fontFamily: FONTS[props.prefs.font].css,
          textAlign: props.prefs.justify ? "justify" : "left",
          hyphens: "auto",
        }}
      >
        {corpo}
        {current && (
          <div className="flex justify-between items-center mt-10 text-sm opacity-70 font-sans">
            <button className="rounded-lg border border-current/20 px-3 py-1.5 hover:bg-current/5 disabled:opacity-40" onClick={() => go(page - 1)} disabled={page === 0}>← Anterior</button>
            <span>{page + 1} / {pages.length}</span>
            <button className="rounded-lg border border-current/20 px-3 py-1.5 hover:bg-current/5 disabled:opacity-40" onClick={() => go(page + 1)} disabled={page >= pages.length - 1}>Próxima →</button>
          </div>
        )}
      </article>
    </div>
  );
});

function escape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Marca cada trecho destacado (com os ids das anotações, para o balão das notas). Os mais longos primeiro: um trecho
 *  menor dentro de outro fica como marca dentro da marca, e o balão junta as notas dos dois. */
function highlight(html: string, marks: { quote: string; ids: string[]; cor: string }[]) {
  let out = html;
  for (const m of [...marks].sort((a, b) => b.quote.length - a.quote.length)) {
    if (!m.quote || m.quote.includes("\n")) continue;
    // só troca no texto, nunca dentro de uma etiqueta (<mark …>) já inserida
    out = out.split(/(<[^>]*>)/).map((pedaco) => (pedaco.startsWith("<") ? pedaco
      : pedaco.split(m.quote).join(`<mark data-anns="${m.ids.join(",")}" style="background: color-mix(in srgb, ${m.cor} 32%, transparent); cursor: pointer">${m.quote}</mark>`))).join("");
  }
  return out;
}

/**
 * Onde começa cada capítulo (página). "Capítulo" é o nível do sumário que divide o livro: com poucas partes
 * no nível 1 (título, "Parte 1"…) e capítulos no nível 2, são os do nível 2 (uma parte nova também fecha o capítulo);
 * senão, o nível 1. Subseções (###) não contam.
 */
export function limitesDeCapitulo(toc: TocItem[]): number[] {
  const n1 = toc.filter((t) => t.level === 1).length, n2 = toc.filter((t) => t.level === 2).length;
  const nivel = n2 > 0 && (n1 <= 3 || n2 >= n1 * 2) ? 2 : n1 > 0 ? 1 : Math.min(...toc.map((t) => t.level));
  return [...new Set(toc.filter((t) => t.level <= nivel).map((t) => Number(t.location.slice(2))).filter((n) => Number.isFinite(n)))].sort((a, b) => a - b);
}
