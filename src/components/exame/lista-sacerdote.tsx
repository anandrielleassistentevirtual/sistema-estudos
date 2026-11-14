"use client";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { ATO_DE_CONTRICAO, diasDesde, listaParaConfissao, tempoDesde, type ExameDados } from "@/lib/exame";

const ZOOM_MIN = 0.8;
const ZOOM_MAX = 1.6;

/**
 * O que se leva ao confessionário: os pecados por mandamento, com a quantidade, a fórmula costumeira do fim
 * e o Ato de Contrição. A tela não apaga enquanto está aberta; dá para aumentar a letra; e cada pecado,
 * depois de dito, pode ser riscado com um toque (só nesta tela, nada é gravado).
 */
export function ListaParaSacerdote({ dados, ultima, onClose, onConfessei }: {
  dados: ExameDados; ultima: string | null; onClose: () => void; onConfessei: () => void;
}) {
  const lista = useMemo(() => listaParaConfissao(dados), [dados]);
  const [ditos, setDitos] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    try { const z = Number(localStorage.getItem("exame-lista-zoom")); if (z >= ZOOM_MIN && z <= ZOOM_MAX) setZoom(z); } catch {}
  }, []);
  const mudarZoom = (d: number) => setZoom((z) => {
    const n = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + d)) * 10) / 10;
    try { localStorage.setItem("exame-lista-zoom", String(n)); } catch {}
    return n;
  });

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);

  // a tela não apaga no meio da confissão
  useEffect(() => {
    let trava: { release: () => Promise<void> } | null = null;
    let ativo = true;
    const pedir = async () => {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (wl && ativo && document.visibilityState === "visible") trava = await wl.request("screen");
      } catch {}
    };
    void pedir();
    const voltou = () => { if (document.visibilityState === "visible") void pedir(); };
    document.addEventListener("visibilitychange", voltou);
    return () => { ativo = false; document.removeEventListener("visibilitychange", voltou); void trava?.release().catch(() => {}); };
  }, []);

  const alternar = (k: string) => setDitos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const total = lista.reduce((n, x) => n + x.pecados.length, 0);

  return (
    <div className="fixed inset-0 z-50 bg-bg overflow-y-auto pt-safe pb-safe">
      <div className="max-w-2xl mx-auto px-5 py-6" style={{ fontSize: `${zoom}rem` }}>
        <div className="sticky top-0 -mx-5 px-5 py-3 mb-4 bg-bg/95 backdrop-blur flex items-center justify-between gap-2 z-10 text-base">
          <span className="label min-w-0 truncate">Para o sacerdote</span>
          <span className="flex items-center gap-1 shrink-0">
            <button className="btn btn-ghost px-2 text-sm" onClick={() => mudarZoom(-0.1)} disabled={zoom <= ZOOM_MIN} title="Letra menor">A−</button>
            <button className="btn btn-ghost px-2 text-base" onClick={() => mudarZoom(0.1)} disabled={zoom >= ZOOM_MAX} title="Letra maior">A+</button>
            <button className="btn text-sm whitespace-nowrap" onClick={() => document.getElementById("ato-de-contricao")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
              Ato de Contrição
            </button>
            <button className="btn btn-ghost px-2" onClick={onClose} title="Fechar"><X size={18} /></button>
          </span>
        </div>

        {ultima && <p className="text-[1.15em] mb-6">Minha última confissão foi {tempoDesde(diasDesde(ultima))}.</p>}
        {!total && <p className="text-muted mb-6">Nenhum pecado marcado no exame.</p>}

        <div className="space-y-7">
          {lista.map(({ mandamento: m, pecados }) => (
            <section key={m.id}>
              <h2 className="text-[0.85em] text-muted mb-2">{m.titulo}{m.tema ? ` — ${m.tema}` : ""}</h2>
              <ul className="space-y-2.5">
                {pecados.map((p, i) => {
                  const k = `${m.id}-${i}`;
                  const dito = ditos.has(k);
                  return (
                    <li key={k}>
                      <button type="button" onClick={() => alternar(k)}
                        className={`w-full text-left text-[1.2em] leading-snug flex gap-3 transition-opacity ${dito ? "opacity-40 line-through decoration-faint" : ""}`}>
                        <span className="text-faint">•</span>
                        <span>{p.texto.replace(/\.$/, "")}{p.nota ? ` (${p.nota})` : ""} <span className="text-muted">— {p.qtd}</span>.</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <div id="ato-de-contricao" className="mt-8 rounded-xl bg-surface-2 p-5 scroll-mt-20">
          <div className="label mb-2">Ato de Contrição</div>
          <p className="font-serif text-[1.25em] leading-relaxed">{ATO_DE_CONTRICAO}</p>
        </div>
        <div className="mt-8 mb-20 flex justify-start text-base">
          <button className="btn btn-primary" onClick={onConfessei}>Fiz a confissão</button>
        </div>
      </div>
    </div>
  );
}
