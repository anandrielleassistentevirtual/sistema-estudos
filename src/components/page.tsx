import { MiniBarras } from "./mini-barras";

export function Page({
  title,
  subtitle,
  actions,
  children,
  wide,
  tabs,
  titleExtra,
  denso,
}: {
  tabs?: React.ReactNode;
  /** algo pequeno ao lado do título (ex.: botão de ajuda) */
  titleExtra?: React.ReactNode;
  /** painel para bater o olho: mais largo e com menos espaço no cabeçalho (cabe numa tela, sem rolar) */
  denso?: boolean;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    // espaço no fim para o botão flutuante do Timer não cobrir o último item (no celular e no computador)
    <div className={`mx-auto px-4 md:px-8 pb-24 md:pb-20 ${denso ? "pt-4 md:pt-5 max-w-[1640px]" : `pt-5 md:pt-8 ${wide ? "max-w-7xl" : "max-w-5xl"}`}`}>
      {tabs}
      <div className={`flex flex-wrap items-end justify-between gap-3 ${denso ? "mb-3 md:mb-4" : "mb-5 md:mb-7"}`}>
        <div className="min-w-0">
          <h1 className="text-[1.5rem] md:text-[1.75rem] font-semibold tracking-[-0.022em] leading-tight flex items-center gap-2">{title}{titleExtra}</h1>
          {subtitle && <p className="text-sm text-muted mt-1.5 leading-snug">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2 w-full sm:w-auto [&>.btn]:flex-auto [&>.btn]:justify-center sm:[&>.btn]:flex-none">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint, cor, serie, compacto, explica, className = "" }: {
  label: string; value: React.ReactNode; hint?: React.ReactNode; compacto?: boolean; className?: string;
  /** cor da área do número (bolinha ao lado do nome e o mini-gráfico); o número continua na cor do texto */
  cor?: string;
  /** a dinâmica no período (um valor por dia ou por semana): vira um mini-gráfico ao lado do número */
  serie?: number[];
  /** explicação mais longa, mostrada ao passar o mouse */
  explica?: string;
}) {
  return (
    <div className={`card min-w-0 @container ${compacto ? "px-3.5 py-3" : "px-3.5 py-3 sm:p-4"} ${className}`} title={explica}>
      <div className={`${compacto ? "text-xs" : "text-[12.5px] sm:text-[13px]"} text-muted truncate flex items-center gap-1.5`}>
        {cor && <span className="dot !w-1.5 !h-1.5" style={{ background: cor }} aria-hidden />}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2 mt-1">
        <div className={`${compacto ? "text-[1.35rem]" : "text-[1.4rem] sm:text-[1.75rem]"} font-medium tracking-[-0.02em] tabular-nums leading-none whitespace-nowrap`}>{value}</div>
        {/* o mini-gráfico só aparece quando o cartão tem largura para ele (o número nunca é cortado) */}
        {serie && serie.length > 1 && (
          <div className="hidden @[8.5rem]:flex flex-1 min-w-0 max-w-[60px] justify-end mb-px">
            <MiniBarras valores={serie} cor={cor} altura={compacto ? 18 : 22} fluido />
          </div>
        )}
      </div>
      {hint && <div className={`text-xs text-faint ${compacto ? "mt-1.5 truncate" : "mt-2"}`} title={explica || typeof hint !== "string" ? undefined : hint}>{hint}</div>}
    </div>
  );
}

/** Lugar vazio: borda tracejada (é um espaço à espera de conteúdo), texto curto e, se quiser, um ícone. */
export function Empty({ children, icone: Icone }: { children: React.ReactNode; icone?: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }> }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface/40 px-6 py-10 text-center text-sm text-muted leading-relaxed">
      {Icone && <Icone size={22} strokeWidth={1.6} className="mx-auto mb-3 text-faint" />}
      <div className="max-w-md mx-auto">{children}</div>
    </div>
  );
}
