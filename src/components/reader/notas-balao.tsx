"use client";
/**
 * Balão das notas: ao passar o mouse sobre um trecho destacado, mostra a(s) nota(s) dele — juntas, quando
 * o mesmo trecho tem mais de uma anotação ou destaques se sobrepõem. Destaque sem nota não abre balão.
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { HL_COLORS, type NotaDoLivro, type NotaHover } from "./types";
import { prepararTermos } from "./glossario";
import type { Annotation } from "@/lib/types";

export function NotasBalao({ hover, anotacoes }: { hover: NotaHover | null; anotacoes: Annotation[] }) {
  if (!hover) return null;
  const notas = hover.ids.map((id) => anotacoes.find((a) => a.id === id)).filter((a): a is Annotation => !!a && !!a.note?.trim());
  if (!notas.length) return null;
  const largura = 340;
  const meio = (hover.left + hover.right) / 2;
  const left = Math.max(12, Math.min(window.innerWidth - largura - 12, meio - largura / 2));
  // em cima do trecho; sem espaço em cima, embaixo
  const emCima = hover.top > 180;
  return (
    <div role="tooltip" className="fixed z-[70] pointer-events-none card shadow-2xl px-3.5 py-3 text-sm text-ink"
      style={{ left, width: largura, ...(emCima ? { bottom: window.innerHeight - hover.top + 8 } : { top: hover.bottom + 8 }) }}>
      {notas.length > 1 && <div className="text-[11px] text-muted mb-1.5">{notas.length} notas neste trecho</div>}
      <ul className="space-y-2.5 max-h-72 overflow-hidden">
        {notas.map((a) => (
          <li key={a.id} className="border-l-[3px] pl-2.5" style={{ borderColor: HL_COLORS[a.color] ?? HL_COLORS.amarelo }}>
            <p className="whitespace-pre-wrap leading-snug line-clamp-[8]">{a.note.trim()}</p>
            {notas.length > 1 && <p className="text-[11px] text-faint mt-0.5 line-clamp-1 font-serif">“{a.quote}”</p>}
          </li>
        ))}
      </ul>
      <div className="text-[10.5px] text-faint mt-2">clique no trecho para abrir as anotações</div>
    </div>
  );
}

/** Balão de uma nota do próprio livro (rodapé/fim): o número e o texto, junto da chamada. Também mostra o verbete
 *  de um termo do glossário (Markdown, com as etiquetas Filosófico/Literário). */
export function NotaLivroBalao({ nota, onFechar }: { nota: NotaDoLivro | null; onFechar: () => void }) {
  if (!nota) return null;
  const verbete = !!nota.verbete;
  const largura = Math.min(window.innerWidth - 24, verbete ? 460 : 380);
  const meio = (nota.left + nota.right) / 2;
  const left = Math.max(12, Math.min(window.innerWidth - largura - 12, meio - largura / 2));
  const emCima = nota.top > window.innerHeight / 2;
  const espaco = emCima ? nota.top - 24 : window.innerHeight - nota.bottom - 24;
  const posicao = { left, width: largura, ...(emCima ? { bottom: window.innerHeight - nota.top + 8 } : { top: nota.bottom + 8 }) };
  if (verbete) {
    return (
      <div role="tooltip" className={`fixed z-[70] card shadow-2xl text-sm text-ink flex flex-col ${nota.fixa ? "" : "pointer-events-none"}`}
        style={{ ...posicao, maxHeight: Math.max(160, Math.min(espaco, 26 * 16)) }}>
        <div className="flex items-start gap-2 px-4 pt-3 pb-2 border-b border-line shrink-0">
          <div className="flex-1 min-w-0">
            <div className="font-medium leading-snug">{nota.rotulo}</div>
            {nota.verbete!.tipos.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {nota.verbete!.tipos.map((t) => (
                  <span key={t} className="text-[10.5px] rounded px-1.5 py-px bg-surface-2 text-muted">{t}</span>
                ))}
              </div>
            )}
          </div>
          {nota.fixa
            ? <button className="shrink-0 -mr-1 text-muted hover:text-ink text-lg leading-none" aria-label="Fechar o verbete" onClick={onFechar}>×</button>
            : <span className="shrink-0 text-[10.5px] text-faint mt-0.5">clique para fixar</span>}
        </div>
        <div className={`verbete px-4 py-2.5 font-serif text-[14px] leading-snug ${nota.fixa ? "overflow-y-auto" : "overflow-hidden"}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
            a: ({ href, children }) => href?.startsWith("#termo-")
              ? <button type="button" className="termo-ref" onClick={() => nota.irPara?.(decodeURIComponent(href.slice(7)))}>{children}</button>
              : <span>{children}</span>,
          }}>{prepararTermos(nota.texto, new Map(TERMOS_DO_VERBETE(nota.texto)))}</ReactMarkdown>
        </div>
      </div>
    );
  }
  return (
    <div role="tooltip" className={`fixed z-[70] card shadow-2xl px-4 py-3 text-sm text-ink ${nota.fixa ? "" : "pointer-events-none"}`}
      style={posicao}>
      <div className="flex items-start gap-2.5">
        <span className="shrink-0 text-xs font-medium tabular-nums rounded px-1.5 py-0.5 bg-surface-2" title="Nota do livro">{nota.rotulo}</span>
        <p className="leading-snug max-h-72 overflow-y-auto whitespace-pre-wrap font-serif text-[14.5px]">{nota.texto}</p>
        {nota.fixa && <button className="shrink-0 -mr-1 text-muted hover:text-ink" aria-label="Fechar a nota" onClick={onFechar}>×</button>}
      </div>
    </div>
  );
}

/**
 * Dentro do verbete, [[#Outro termo]] vira um link que abre o outro termo (o leitor decide se ele existe);
 * links para outras notas ([[Glossário geral#X|X]]) ficam só como texto.
 */
function TERMOS_DO_VERBETE(md: string): [string, { titulo: string; tipos: string[]; corpo: string }][] {
  return [...md.matchAll(/\[\[#([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((m) => [m[1].normalize("NFC").trim().toLowerCase().replace(/\s+/g, " "), { titulo: m[1].trim(), tipos: [], corpo: "" }]);
}
