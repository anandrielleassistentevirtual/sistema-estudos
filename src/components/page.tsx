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
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`mx-auto px-4 md:px-8 ${denso ? "py-4 md:py-5 max-w-[1640px]" : `py-6 md:py-8 ${wide ? "max-w-7xl" : "max-w-5xl"}`}`}>
      {tabs}
      <div className={`flex flex-wrap items-end justify-between gap-3 ${denso ? "mb-4" : "mb-7"}`}>
        <div>
          <h1 className="text-[1.6rem] font-normal tracking-tight leading-tight flex items-center gap-2">{title}{titleExtra}</h1>
          {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint, cor, compacto }: { label: string; value: React.ReactNode; hint?: string; cor?: string; compacto?: boolean }) {
  return (
    <div className={`card ${compacto ? "px-3.5 py-3" : "p-4"}`}>
      <div className={`${compacto ? "text-xs" : "text-[13px]"} text-muted truncate`}>{label}</div>
      <div className={`${compacto ? "text-[1.35rem]" : "text-[1.75rem]"} font-normal tracking-tight mt-1 tabular-nums leading-none`} style={cor ? { color: cor } : undefined}>{value}</div>
      {hint && <div className={`text-xs text-faint ${compacto ? "mt-1.5 line-clamp-2 leading-snug" : "mt-2"}`} title={hint}>{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card p-8 text-center text-sm text-muted">{children}</div>;
}
