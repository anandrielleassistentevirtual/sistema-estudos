"use client";
import { STATUS_LABEL, type BookStatus } from "@/lib/types";

export interface OpcaoStatus<T extends string> { value: T; label: string; cor: string }

/** Status como etiqueta colorida (livros e aulas); clicando abre a lista de status do próprio aparelho. */
export function StatusPill<T extends string>({ value, options, onChange, label = "Status" }: {
  value: T; options: OpcaoStatus<T>[]; onChange: (v: T) => void; label?: string;
}) {
  const cor = options.find((o) => o.value === value)?.cor ?? "var(--muted)";
  return (
    <span className="relative shrink-0">
      <select aria-label={label} title="Mudar o status" value={value} onChange={(e) => onChange(e.target.value as T)}
        className="appearance-none cursor-pointer rounded-full pl-5 pr-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        style={{ color: cor, background: `color-mix(in srgb, ${cor} 14%, transparent)` }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style={{ background: cor }} />
    </span>
  );
}

/** Status das aulas (Estudos). */
export type SituacaoAula = "pendente" | "lendo" | "concluida";
export const SITUACOES_AULA: OpcaoStatus<SituacaoAula>[] = [
  { value: "pendente", label: "Pendente", cor: "var(--muted)" },
  { value: "lendo", label: "Lendo", cor: "var(--accent)" },
  { value: "concluida", label: "Concluída", cor: "var(--good)" },
];

/** Status dos livros (biblioteca e mesas). */
export const OPCOES_LIVRO: OpcaoStatus<BookStatus>[] = [
  { value: "aguardando", label: STATUS_LABEL.aguardando, cor: "var(--muted)" },
  { value: "lendo", label: STATUS_LABEL.lendo, cor: "var(--accent)" },
  { value: "pausado", label: STATUS_LABEL.pausado, cor: "#c98a1a" },
  { value: "lido", label: STATUS_LABEL.lido, cor: "var(--good)" },
  { value: "consulta", label: STATUS_LABEL.consulta, cor: "#8e6fd6" },
];
