"use client";
/** As peças de desenho da Biblioteca: anel de progresso, barra com marcos, selos e a bolinha e a etiqueta do motivo. */
import { Award, Check } from "lucide-react";
import { PERFIS, perfilDe, selosDe, type Perfil } from "@/lib/leitura";
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

/**
 * Barra com os marcos de 25, 50 e 75%: quatro segmentos, cada um um quarto do caminho.
 * O vão entre eles é o marco (sem traço por cima, que some no tema claro); um segmento cheio é um marco alcançado.
 */
export function BarraMarcos({ valor, cor = "var(--area-leitura)", alta = false }: { valor: number; cor?: string; alta?: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-[3px]" role="img" aria-label={`${Math.round(Math.min(1, Math.max(0, valor)) * 100)}%`}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`${alta ? "h-2.5" : "h-1.5"} rounded-full bg-surface-2 overflow-hidden`}>
          <span className="block h-full rounded-full"
            style={{ width: `${Math.min(1, Math.max(0, (valor - i * 0.25) / 0.25)) * 100}%`, background: cor, transition: "width 0.4s ease" }} />
        </span>
      ))}
    </div>
  );
}

/** A bolinha do motivo: a cor é a da Leitura; a forma (cheia, meia, vazada) diz qual motivo é. */
export function MarcaMotivo({ perfil, className = "" }: { perfil: Perfil; className?: string }) {
  const { cor, marca } = PERFIS[perfil];
  return (
    <span aria-hidden className={`dot ${marca === "meia" ? "dot-meia" : marca === "vazada" ? "dot-vazada" : ""} ${className}`}
      style={{ color: cor, background: marca === "cheia" ? cor : undefined }} />
  );
}

/** Etiqueta do motivo (o nome e a forma da bolinha dizem como o livro é medido) e, se houver, o nível. */
export function EtiquetaPerfil({ livro, curta = false }: { livro: Pick<Book, "motivo_leitura" | "nivel_leitura">; curta?: boolean }) {
  const p = perfilDe(livro);
  // nas linhas (curta) o "sem motivo" não se repete: ele já é contado no painel, no filtro da Estante e na ficha
  if (!p) return curta ? null : <span className="chip border border-dashed border-line bg-transparent">sem motivo</span>;
  const cor = PERFIS[p].cor;
  return (
    <span className="chip font-medium" style={{ color: cor, background: `color-mix(in srgb, ${cor} 13%, transparent)` }}
      title={`${PERFIS[p].nome}${livro.nivel_leitura ? ` · leitura ${NIVEIS_LEITURA[livro.nivel_leitura].nome.toLowerCase()}` : ""} — ${PERFIS[p].explica}`}>
      <MarcaMotivo perfil={p} className="!w-[7px] !h-[7px]" />
      {PERFIS[p].nome}{!curta && livro.nivel_leitura ? <span className="font-normal opacity-80">· {NIVEIS_LEITURA[livro.nivel_leitura].nome.toLowerCase()}</span> : null}
    </span>
  );
}

/** Os selos do livro: bolinhas que se enchem a cada estágio do roteiro de Adler (e a da memória). */
export function Selos({ livro, grande = false }: { livro: Pick<Book, "nivel_leitura" | "roteiro">; grande?: boolean }) {
  const selos = selosDe(livro);
  if (!selos.length) return null;
  // a forma das bolinhas aqui é o progresso de cada selo (cheia, parcial, vazia), não o motivo: só a cor é a da Leitura
  const cor = "var(--area-leitura)";
  const ganhos = selos.filter((s) => s.ganho).length;
  if (!grande) {
    // nas linhas e cartões, selos ainda sem nenhuma etapa feita são só ruído: aparecem quando houver progresso
    if (!selos.some((s) => s.feitas > 0)) return null;
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
