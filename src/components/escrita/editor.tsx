"use client";
import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { destacar, type Classe } from "@/lib/escrita";

export interface EditorHandle {
  focus: () => void;
  /** posição do cursor no texto */
  cursor: () => number;
  /** põe o cursor na posição e foca */
  irPara: (pos: number) => void;
}

const COR: Record<Classe, string | undefined> = {
  "": undefined,
  fala: "var(--dialogo)",
  marca: "var(--faint)",
  comentario: "var(--faint)",
};

/**
 * Editor de produção: um <textarea> de verdade (digitação, desfazer, corretor do navegador)
 * com o texto transparente, e por baixo um "espelho" com o mesmo texto colorido:
 * falas destacadas, marcas de formatação apagadas, parágrafo atual em foco.
 * O espelho também diz onde está o cursor, para o modo máquina de escrever (linha no meio).
 */
export const Editor = forwardRef<EditorHandle, {
  value: string;
  onChange: (v: string) => void;
  fonte: string;
  tamanhoPt: number;
  entrelinha: number;
  focoParagrafo: boolean;
  maquina: boolean;
  destacarFalas: boolean;
  placeholder?: string;
}>(function Editor(p, ref) {
  const scroller = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState(0);
  const digitou = useRef(false);

  const ultimoCursor = useRef(0);
  useImperativeHandle(ref, () => ({
    focus: () => ta.current?.focus(),
    cursor: () => (document.activeElement === ta.current ? ta.current?.selectionEnd : ultimoCursor.current) ?? 0,
    irPara: (pos: number) => {
      const t = ta.current;
      if (!t) return;
      t.focus();
      t.selectionStart = t.selectionEnd = pos;
      ultimoCursor.current = pos;
      setCaret(pos);
    },
  }));

  const linhaAtual = useMemo(() => p.value.slice(0, caret).split("\n").length - 1, [p.value, caret]);

  // altura do textarea = altura do conteúdo (quem rola é o contêiner)
  useLayoutEffect(() => {
    const t = ta.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight}px`;
  }, [p.value, p.tamanhoPt, p.entrelinha, p.fonte]);

  // máquina de escrever: mantém a linha do cursor perto do meio da tela
  useLayoutEffect(() => {
    if (!p.maquina || !digitou.current) return;
    const s = scroller.current;
    const m = mirror.current?.querySelector("[data-cursor]") as HTMLElement | null;
    if (!s || !m) return;
    const box = s.getBoundingClientRect();
    const r = m.getBoundingClientRect();
    const delta = r.top - (box.top + box.height * 0.45);
    if (Math.abs(delta) > 2) s.scrollTop += delta;
  }, [caret, p.value, p.maquina]);

  const sync = () => {
    const t = ta.current;
    if (t) { setCaret(t.selectionEnd); ultimoCursor.current = t.selectionEnd; }
  };

  function envolver(marca: string) {
    const t = ta.current;
    if (!t) return;
    const { selectionStart: a, selectionEnd: b, value } = t;
    const novo = value.slice(0, a) + marca + value.slice(a, b) + marca + value.slice(b);
    p.onChange(novo);
    requestAnimationFrame(() => {
      t.selectionStart = a + marca.length;
      t.selectionEnd = b + marca.length;
      sync();
    });
  }

  const linhas = p.value.split("\n");
  let cursorLinha = linhaAtual;
  let cursorCol = caret - (p.value.lastIndexOf("\n", caret - 1) + 1);
  if (cursorLinha >= linhas.length) { cursorLinha = linhas.length - 1; cursorCol = linhas[cursorLinha].length; }

  const estilo: React.CSSProperties = {
    fontFamily: p.fonte,
    fontSize: `${p.tamanhoPt}pt`,
    lineHeight: p.entrelinha,
    letterSpacing: "normal",
    tabSize: 4,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    wordBreak: "normal",
    padding: 0,
    margin: 0,
    border: 0,
  };

  return (
    <div ref={scroller} className="h-full overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) ta.current?.focus(); }}>
      <div className="relative mx-auto w-full max-w-[42rem] px-6"
        style={{ paddingTop: p.maquina ? "45vh" : "4rem", paddingBottom: p.maquina ? "50vh" : "40vh" }}>
        <div className="relative">
          <div ref={mirror} aria-hidden className="absolute inset-0 pointer-events-none select-none" style={{ ...estilo, color: "var(--text)" }}>
            {linhas.map((l, i) => {
              const apagada = p.focoParagrafo && i !== linhaAtual;
              const trechos = p.destacarFalas ? destacar(l) : [{ t: l, c: "" as Classe }];
              let pos = 0;
              return (
                <span key={i} style={{ opacity: apagada ? 0.28 : 1, transition: "opacity .25s" }}>
                  {trechos.map((tr, k) => {
                    const ini = pos;
                    pos += tr.t.length;
                    const cor = COR[tr.c];
                    if (i === cursorLinha && cursorCol >= ini && cursorCol < pos) {
                      const a = cursorCol - ini;
                      return (
                        <span key={k} style={{ color: cor }}>
                          {tr.t.slice(0, a)}<span data-cursor />{tr.t.slice(a)}
                        </span>
                      );
                    }
                    return <span key={k} style={{ color: cor }}>{tr.t}</span>;
                  })}
                  {i === cursorLinha && cursorCol >= pos && <span data-cursor />}
                  {i < linhas.length - 1 ? "\n" : "​"}
                </span>
              );
            })}
          </div>
          <textarea
            ref={ta}
            value={p.value}
            spellCheck
            lang="pt-BR"
            placeholder={p.placeholder}
            onChange={(e) => { digitou.current = true; p.onChange(e.target.value); setCaret(e.target.selectionEnd); ultimoCursor.current = e.target.selectionEnd; }}
            onSelect={sync}
            onKeyUp={sync}
            onClick={() => { digitou.current = true; sync(); }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") { e.preventDefault(); envolver("**"); }
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") { e.preventDefault(); envolver("_"); }
            }}
            className="relative block w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-faint"
            style={{ ...estilo, color: "transparent", caretColor: "var(--text)" }}
          />
        </div>
      </div>
    </div>
  );
});
