import { MiniBarras } from "./mini-barras";
import { AjudaDaTela } from "./ajuda-da-tela";

/** A moldura do painel, para as telas que não usam o Page (Atômicas): a mesma largura e as mesmas margens. */
export const CONTEINER = "mx-auto w-full max-w-[1440px] px-4 md:px-8";

export function Page({
  title,
  subtitle,
  actions,
  children,
  tabs,
  titleExtra,
  ajuda,
  largura = "painel",
}: {
  tabs?: React.ReactNode;
  /** algo pequeno ao lado do título (ex.: o lápis do nome) */
  titleExtra?: React.ReactNode;
  /** a explicação longa da tela: vira um (i) ao lado do título, que abre um balão */
  ajuda?: React.ReactNode;
  /** "painel" (até 1440px, todas as telas) ou "texto" (coluna de leitura centrada: Lectio e Exame) */
  largura?: "painel" | "texto";
  /** @deprecated não muda mais nada: todas as telas usam a mesma moldura (cada área apaga ao mexer na sua página) */
  denso?: boolean;
  /** @deprecated idem */
  wide?: boolean;
  title: string;
  /** a manchete: uma linha com os números do momento (quebra em vez de cortar) */
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // uma moldura só: a borda esquerda, o topo do título e as abas ficam no mesmo pixel em todas as telas
    <div className={`mx-auto w-full px-4 md:px-8 pt-5 md:pt-6 pb-24 md:pb-16 ${largura === "texto" ? "max-w-3xl" : "max-w-[1440px]"}`}>
      {tabs}
      <div className="mb-4 md:mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        {/* relative: o balão do (i) se ancora aqui, e não no botão */}
        <div className="relative min-w-0 basis-full sm:basis-auto sm:flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[1.5rem] md:text-[1.75rem] font-semibold tracking-[-0.022em] leading-tight">{title}</h1>
            {ajuda && <AjudaDaTela>{ajuda}</AjudaDaTela>}
            {titleExtra}
          </div>
          {subtitle && <p className="text-sm text-muted mt-1.5 leading-snug">{subtitle}</p>}
        </div>
        {/* os botões ficam do tamanho natural (no celular não viram barras de largura total) */}
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

const COLUNAS_FAIXA = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4", 5: "md:grid-cols-5" } as const;

/**
 * A faixa de indicadores: um cartão dividido por linhas de 1px, com um <Indicador> por célula.
 * No celular são 2 colunas; com um número ímpar, o primeiro (o herói) ocupa a linha toda e o resto fecha em pares.
 */
export function Faixa({ colunas, children, className = "" }: { colunas: keyof typeof COLUNAS_FAIXA; children: React.ReactNode; className?: string }) {
  return (
    <div className={`card grid grid-cols-2 gap-px bg-line overflow-hidden ${COLUNAS_FAIXA[colunas]} ${colunas % 2 ? "[&>*:first-child]:col-span-2 md:[&>*:first-child]:col-span-1" : ""} ${className}`}>
      {children}
    </div>
  );
}

/** Um bloco da faixa: o assunto (com a bolinha da área), o número e, embaixo, a comparação e um detalhe. */
export function Indicador({ label, value, delta, detalhe, cor, explica, children, className = "" }: {
  label: string; value: React.ReactNode; delta?: React.ReactNode; detalhe?: string;
  /** a bolinha da área (só quando a tela mistura áreas) */
  cor?: string;
  /** explicação mais longa, mostrada ao passar o mouse */
  explica?: string;
  /** um rodapé (ex.: a barra da meta) */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-surface px-4 py-3 min-w-0 ${className}`} title={explica}>
      <div className="ind-rotulo">
        {cor && <span className="dot !w-1.5 !h-1.5" style={{ background: cor }} aria-hidden />}<span className="truncate">{label}</span>
      </div>
      <div className="ind-valor mt-1.5 truncate">{value}</div>
      {(delta || detalhe) && (
        <div className="ind-nota mt-1.5 truncate">
          {delta}{delta && detalhe ? <span className="mx-1">·</span> : null}{detalhe}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Cabeçalho de cartão, o mesmo em todos: título curto (com a bolinha da área, se o cartão é de uma área só),
 * uma linha de meta em cinza e, à direita, no máximo uma ação (link .link-ir, seg ou botão).
 */
export function CardHead({ titulo, cor, meta, acao, nivel = "h2", className = "" }: {
  titulo: React.ReactNode; cor?: string; meta?: React.ReactNode; acao?: React.ReactNode; nivel?: "h2" | "h3"; className?: string;
}) {
  const Titulo = nivel;
  return (
    <div className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 mb-3 ${className}`}>
      <div className="min-w-0">
        <Titulo className="card-title flex items-center gap-2 min-w-0">
          {cor && <span className="dot" style={{ background: cor }} aria-hidden />}<span className="truncate">{titulo}</span>
        </Titulo>
        {meta && <div className="text-xs text-faint mt-0.5 truncate" title={typeof meta === "string" ? meta : undefined}>{meta}</div>}
      </div>
      {acao && <div className="shrink-0 flex items-center gap-2">{acao}</div>}
    </div>
  );
}

/** Seção com título fora de cartão (Mesas, Horizonte…): o mesmo espaço entre seções em todas as telas. */
export function Secao({ titulo, hint, acoes, children }: { titulo: React.ReactNode; hint?: React.ReactNode; acoes?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6 md:mt-8 first:mt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3">
        <div className="min-w-0">
          <h2 className="card-title">{titulo}</h2>
          {hint && <p className="text-xs text-faint mt-0.5">{hint}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      {children}
    </section>
  );
}

/** @deprecated use <Faixa> com <Indicador>; fica só até Idiomas e Saúde migrarem. */
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
