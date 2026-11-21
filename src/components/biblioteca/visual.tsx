"use client";
/** As peças de desenho da Biblioteca: anel de progresso, barra com marcos, selos e a etiqueta do motivo. */
import { Award, Check } from "lucide-react";
import { PERFIS, perfilDe, selosDe } from "@/lib/leitura";
import { NIVEIS_LEITURA } from "@/lib/adler";
import type { Book } from "@/lib/types";

/** Anel de progresso (0–1), com o que quiser no meio. */
export function Anel({ valor, cor = "var(--area-leitura)", tamanho = 44, espessura = 4, children, titulo }: {
  valor: number | null; cor?: string; tamanho?: number; espessura?: number; children?: React.ReactNode; titulo?: string;
}) {
  const r = (tamanho - espessura) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, valor ?? 0));
  return (
    <span className="relative inline-grid place-items-center shrink-0" style={{ width: tamanho, height: tamanho }} title={titulo}>
      <svg width={tamanho} height={tamanho} className="-rotate-90" aria-hidden>
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={espessura} />
        {valor !== null && v > 0 && (
          <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke={cor} strokeWidth={espessura} strokeLinecap="round"
            strokeDasharray={`${c * v} ${c}`} style={{ transition: "stroke-dasharray 0.4s ease" }} />
        )}
      </svg>
      <span className="absolute inset-0 grid place-items-center text-center leading-none">{children}</span>
    </span>
  );
}

/** Barra com os marcos de 25, 50 e 75% (o marco alcançado acende). */
export function BarraMarcos({ valor, cor = "var(--area-leitura)", alta = false }: { valor: number; cor?: string; alta?: boolean }) {
  return (
    <div className={`relative ${alta ? "h-2.5" : "h-1.5"} rounded-full bg-surface-2`}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(1, valor) * 100}%`, background: cor, transition: "width 0.4s ease" }} />
      {[0.25, 0.5, 0.75].map((m) => (
        <span key={m} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[3px] rounded-full"
          style={{ left: `${m * 100}%`, height: alta ? 14 : 10, background: valor >= m ? cor : "var(--border)", outline: "2px solid var(--surface)" }} />
      ))}
    </div>
  );
}

/** Etiqueta do motivo (a cor diz como o livro é medido) e, se houver, o nível. */
export function EtiquetaPerfil({ livro, curta = false }: { livro: Pick<Book, "motivo_leitura" | "nivel_leitura">; curta?: boolean }) {
  const p = perfilDe(livro);
  if (!p) return <span className="chip border border-dashed border-line bg-transparent">sem motivo</span>;
  const cor = PERFIS[p].cor;
  return (
    <span className="chip font-medium" style={{ color: cor, background: `color-mix(in srgb, ${cor} 13%, transparent)` }}
      title={`${PERFIS[p].nome}${livro.nivel_leitura ? ` · leitura ${NIVEIS_LEITURA[livro.nivel_leitura].nome.toLowerCase()}` : ""} — ${PERFIS[p].explica}`}>
      <span className="dot !w-1.5 !h-1.5" style={{ background: cor }} />
      {PERFIS[p].nome}{!curta && livro.nivel_leitura ? <span className="font-normal opacity-80">· {NIVEIS_LEITURA[livro.nivel_leitura].nome.toLowerCase()}</span> : null}
    </span>
  );
}

/** Os selos do livro: bolinhas que se enchem a cada estágio do roteiro de Adler (e a da memória). */
export function Selos({ livro, grande = false }: { livro: Pick<Book, "nivel_leitura" | "roteiro" | "motivo_leitura">; grande?: boolean }) {
  const selos = selosDe(livro);
  if (!selos.length) return null;
  const cor = PERFIS[perfilDe(livro) ?? "conhecimento"].cor;
  const ganhos = selos.filter((s) => s.ganho).length;
  if (!grande) {
    return (
      <span className="inline-flex items-center gap-[3px]" title={`Selos: ${ganhos} de ${selos.length} — ${selos.map((s) => `${s.nome} ${s.feitas}/${s.total}`).join(" · ")}`}>
        {selos.map((s) => (
          <span key={s.nome} className="w-2 h-2 rounded-full border"
            style={s.ganho ? { background: cor, borderColor: cor } : s.feitas ? { borderColor: cor, background: `color-mix(in srgb, ${cor} 30%, transparent)` } : { borderColor: "var(--border)" }} />
        ))}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {selos.map((s) => (
        <span key={s.nome} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11.5px]"
          style={s.ganho ? { borderColor: cor, color: cor, background: `color-mix(in srgb, ${cor} 10%, transparent)` } : { borderColor: "var(--border)", color: "var(--muted)" }}
          title={`${s.feitas} de ${s.total} etapas`}>
          {s.ganho ? (s.nome === "Memória" ? <Award size={12} /> : <Check size={12} strokeWidth={2.5} />) : <span className="tabular-nums text-[10px]">{s.feitas}/{s.total}</span>}
          {s.nome}
        </span>
      ))}
    </div>
  );
}
