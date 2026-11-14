export function Page({
  title,
  subtitle,
  actions,
  children,
  wide,
  tabs,
  titleExtra,
}: {
  tabs?: React.ReactNode;
  /** algo pequeno ao lado do título (ex.: botão de ajuda) */
  titleExtra?: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`mx-auto px-4 md:px-8 pt-5 pb-24 md:py-8 ${wide ? "max-w-7xl" : "max-w-5xl"}`}>
      {tabs}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5 md:mb-7">
        <div className="min-w-0">
          <h1 className="text-[1.5rem] md:text-[1.6rem] font-normal tracking-tight leading-tight flex items-center gap-2">{title}{titleExtra}</h1>
          {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint, cor }: { label: string; value: React.ReactNode; hint?: string; cor?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="text-[1.75rem] font-normal tracking-tight mt-1 tabular-nums leading-none" style={cor ? { color: cor } : undefined}>{value}</div>
      {hint && <div className="text-xs text-faint mt-2">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card p-8 text-center text-sm text-muted">{children}</div>;
}
