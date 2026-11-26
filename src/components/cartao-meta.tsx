"use client";
/**
 * O cartão de uma meta da Season, o mesmo no Dashboard e na página da Season: a área e o selo de situação,
 * o título inteiro, o anel com o %, o número principal e a linha "precisa/dia · seu ritmo".
 * Só desenha: os números chegam prontos da previsão (lib/metas).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Anel } from "@/components/biblioteca/visual";
import { COR_ESTADO, type Previsao } from "@/lib/metas";
import type { Meta } from "@/lib/temporadas";

const XL = ["xl:grid-cols-1", "xl:grid-cols-1", "xl:grid-cols-2", "xl:grid-cols-3", "xl:grid-cols-4", "xl:grid-cols-5"];
/**
 * A grade das metas (divididas por linhas de 1px): uma coluna no celular, duas no tablet e, no computador,
 * tantas quantas metas, sem buraco no fim. No tablet, a última que sobra ocupa a linha.
 */
export const gradeDeMetas = (n: number) =>
  `grid grid-cols-1 sm:grid-cols-2 ${XL[Math.min(5, n)]} gap-px bg-line sm:[&>*:last-child:nth-child(odd)]:col-span-2 xl:[&>*:last-child:nth-child(odd)]:col-span-1`;

/** A pílula de situação da meta: a única cor de situação do cartão. */
export function SeloEstado({ p }: { p: Previsao }) {
  const cor = COR_ESTADO[p.estado];
  return (
    <span className="text-[11px] font-medium rounded-full px-2 py-0.5 whitespace-nowrap" style={{ color: cor, background: `color-mix(in srgb, ${cor} 14%, transparent)` }}>
      {p.selo}
    </span>
  );
}

export function CartaoMeta({ m, p, nomeArea, corArea, acoes, rodape, abaixo, href, onAbrir }: {
  m: Meta;
  p: Previsao;
  nomeArea: string;
  corArea: string;
  /** à direita do selo (ex.: o ⋯ com Editar e Apagar) */
  acoes?: React.ReactNode;
  /** um controle pequeno na última linha, ao lado do que falta (ex.: o +1 do Dashboard) */
  rodape?: React.ReactNode;
  /** um bloco de largura total no fim do cartão, fora da grade do anel (ex.: a régua diária da contagem) */
  abaixo?: React.ReactNode;
  /** para onde o cartão leva (Dashboard)… */
  href?: string;
  /** …ou o que ele abre (Season: o detalhamento) */
  onAbrir?: () => void;
}) {
  const router = useRouter();
  const [principal, precisa, ritmo] = p.numeros;
  const [feito, total] = principal.valor.split("/");

  // o cartão inteiro abre a meta, menos os controles de dentro (+1, régua, ⋯): o clique do menu, mesmo em portal,
  // sobe pela árvore do React até aqui. O título é o link (ou botão) de verdade, para o teclado.
  function abrir(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("button,input,select,textarea,a,label,[role=menu]")) return;
    if (href) router.push(href);
    else onAbrir?.();
  }

  const classeTitulo = "font-medium leading-snug line-clamp-2 break-words text-left hover:underline underline-offset-2";
  return (
    // o realce do hover é uma camada por cima do fundo: o fundo continua opaco e as linhas da grade não somem
    <article className="bg-surface px-4 py-3 min-w-0 flex flex-col cursor-pointer hover:[background-image:linear-gradient(var(--sel),var(--sel))]" onClick={abrir}>
      {/* celular: o anel na 1ª coluna e o texto todo na 2ª (uma linha que se lê de relance); do tablet para cima, em pé */}
      <div className="grid grid-cols-[46px_minmax(0,1fr)] gap-x-3">
        <div className="col-start-2 row-start-1 sm:col-start-1 sm:col-span-2 flex items-center justify-between gap-2 min-h-6">
          <span className="flex items-center gap-1.5 text-[11.5px] text-muted min-w-0">
            <span className="dot !w-1.5 !h-1.5" style={{ background: corArea }} aria-hidden /><span className="truncate">{nomeArea}</span>
          </span>
          <span className="flex items-center gap-1 shrink-0"><SeloEstado p={p} />{acoes}</span>
        </div>

        <div className="col-start-2 row-start-2 sm:col-start-1 sm:col-span-2 mt-1 sm:mt-1.5 min-w-0">
          {href
            ? <Link href={href} className={classeTitulo} title={p.resumo}>{m.titulo}</Link>
            : <button type="button" className={classeTitulo} title={p.resumo} onClick={onAbrir}>{m.titulo}</button>}
        </div>

        <span className="col-start-1 row-start-1 row-end-5 sm:row-start-3 sm:row-end-4 self-start mt-0.5 sm:mt-2.5">
          <Anel valor={p.pct} cor={corArea} tamanho={46} espessura={4}>
            <span className="text-[12px] font-semibold tabular-nums">{Math.round(p.pct * 100)}%</span>
          </Anel>
        </span>

        {/* o número principal: no celular numa linha só ("0/4 livros lidos"), em pé do tablet para cima */}
        <div className="col-start-2 row-start-3 self-center min-w-0 mt-1.5 sm:mt-2.5 flex flex-wrap items-baseline gap-x-1.5 sm:block">
          <div className="text-xl font-semibold tabular-nums leading-none">
            {feito}{total !== undefined && <span className="text-sm font-normal text-muted">/{total}</span>}
          </div>
          <div className="text-[11.5px] text-muted sm:mt-1">{principal.rotulo}</div>
        </div>

        {/* o que a meta pede por dia × o seu ritmo (ou os dias que restam, na contagem) */}
        <div className="col-start-2 row-start-4 sm:col-start-1 sm:col-span-2 mt-1.5 sm:mt-2.5 text-xs text-muted tabular-nums">
          {/* cada número fica inteiro; a linha quebra no "·" quando o cartão é estreito */}
          {[precisa, ritmo].filter(Boolean).map((n, i) => (
            <span key={n.rotulo}>
              {i ? " · " : ""}<span className="whitespace-nowrap"><b className="font-semibold" style={{ color: n.cor ?? "var(--text)" }}>{n.valor}</b> {n.rotulo}</span>
            </span>
          ))}
        </div>

        {(p.sub || rodape) && (
          <div className="col-start-2 row-start-5 sm:col-start-1 sm:col-span-2 pt-1.5 flex items-center gap-2 text-[11.5px] text-muted">
            {/* no celular o texto quebra em vez de cortar; do tablet para cima, corta com o texto inteiro no title */}
            {p.sub && <span className="min-w-0 sm:truncate" title={p.sub}>{p.sub}</span>}
            {rodape && <span className="ml-auto shrink-0">{rodape}</span>}
          </div>
        )}
      </div>
      {abaixo}
    </article>
  );
}
