"use client";
/**
 * Recordar: para cada livro, as perguntas que você já respondeu no roteiro, sem a resposta. Você tenta lembrar,
 * confere, e diz como foi. Lembrou → a próxima vem mais tarde (1, 3, 7, 21, 60, 150 dias); esqueceu → volta para amanhã.
 * É daqui que sai a retenção.
 */
import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { Cover } from "@/components/cover";
import { INTERVALOS, NOTAS_RECORDAR, perguntasDe, recordarDe, recordarHoje, registrar } from "@/lib/leitura";
import type { Roteiro } from "@/lib/adler";
import { useBiblioteca } from "./dados";
import { Janela } from "./janelas";

export function Recordacao({ inicial, onClose }: { inicial?: string; onClose: () => void }) {
  const d = useBiblioteca();
  // a fila é montada ao abrir (não muda enquanto você recorda)
  const [fila] = useState(() => {
    const devidos = d.livros.filter((b) => recordarHoje(b)).map((b) => b.id);
    return inicial ? [inicial, ...devidos.filter((x) => x !== inicial)] : devidos;
  });
  const [i, setI] = useState(0);
  const [vistas, setVistas] = useState<Set<number>>(new Set());
  const [feitas, setFeitas] = useState<(0 | 1 | 2)[]>([]);
  const b = fila[i] ? d.porId.get(fila[i]) : undefined;
  const perguntas = useMemo(() => (b ? perguntasDe(b) : []), [b]);

  if (!fila.length) {
    return (
      <Janela titulo="Recordar" onClose={onClose}>
        <p className="text-sm text-muted leading-relaxed">Nada para recordar hoje. Os livros entram aqui quando você responde perguntas do roteiro de Adler (na ficha do livro) e a data da recordação chega.</p>
        <div className="flex justify-end"><button className="btn" onClick={onClose}>Fechar</button></div>
      </Janela>
    );
  }
  if (!b) {
    const media = feitas.length ? feitas.reduce<number>((a, x) => a + x, 0) / (feitas.length * 2) : 0;
    return (
      <Janela titulo="Recordação feita" onClose={onClose}>
        <p className="text-sm text-muted">{feitas.length} {feitas.length === 1 ? "livro recordado" : "livros recordados"} hoje · você lembrou de <b className="text-ink">{Math.round(media * 100)}%</b>.</p>
        <div className="flex gap-1">{feitas.map((n, k) => <span key={k} className="h-2 flex-1 rounded-full" style={{ background: NOTAS_RECORDAR[n].cor }} />)}</div>
        <div className="flex justify-end"><button className="btn btn-primary" onClick={onClose}>Fechar</button></div>
      </Janela>
    );
  }

  const r = recordarDe(b);
  async function avaliar(nota: 0 | 1 | 2) {
    if (!b) return;
    const roteiro = { ...((b.roteiro ?? {}) as Roteiro), recordar: registrar(r, nota) };
    await d.atualizar(b, { roteiro });
    setFeitas((f) => [...f, nota]);
    setVistas(new Set());
    setI((x) => x + 1);
  }
  const proximoEm = (nota: 0 | 1 | 2) => {
    const n = registrar(r, nota).nivel;
    const dias = INTERVALOS[n];
    return dias === 1 ? "amanhã" : `em ${dias} dias`;
  };

  return (
    <Janela titulo={<span className="flex items-center gap-2">Recordar <span className="text-sm font-normal text-muted tabular-nums">{i + 1} de {fila.length}</span></span>}
      onClose={onClose} largura="max-w-2xl"
      sub="Responda de cabeça (em voz alta ou num papel) antes de ver o que você escreveu.">
      <div className="flex items-center gap-3">
        <Cover book={b} url={d.capas[b.id]} className="w-9 h-[52px]" />
        <div className="min-w-0">
          <div className="font-medium leading-snug">{b.title}</div>
          <div className="text-xs text-muted">{b.author}</div>
        </div>
      </div>
      <ol className="space-y-2.5">
        {perguntas.map((q, k) => (
          <li key={k} className="rounded-xl border border-line p-3">
            <div className="text-sm font-medium leading-snug">{q.pergunta}</div>
            {vistas.has(k) ? (
              <p className="mt-2 text-sm text-muted whitespace-pre-wrap leading-relaxed font-serif">{q.resposta}</p>
            ) : (
              <button className="mt-2 text-xs link inline-flex items-center gap-1" onClick={() => setVistas((v) => new Set(v).add(k))}><Eye size={13} /> Ver a minha resposta</button>
            )}
          </li>
        ))}
      </ol>
      <div>
        <div className="text-xs text-muted mb-2">Como foi?</div>
        <div className="grid grid-cols-3 gap-2">
          {NOTAS_RECORDAR.map((n) => (
            <button key={n.nota} className="rounded-xl border px-3 py-2.5 text-left hover:bg-surface-2 transition-colors"
              style={{ borderColor: `color-mix(in srgb, ${n.cor} 45%, var(--border))` }} onClick={() => void avaliar(n.nota)}>
              <span className="block text-sm font-medium" style={{ color: n.cor }}>{n.nome}</span>
              <span className="block text-[11px] text-faint">volta {proximoEm(n.nota)}</span>
            </button>
          ))}
        </div>
      </div>
    </Janela>
  );
}
