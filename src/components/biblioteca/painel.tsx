"use client";
/**
 * O cabeçalho e o painel da Biblioteca. O painel é uma faixa só: o Plano (quanto do que você decidiu ler já foi lido)
 * e uma coluna para cada motivo de leitura, cada uma com a sua medida — conhecimento pelo domínio, informação pelo
 * ritmo, entretenimento pelo avanço. Embaixo, o que pede atenção hoje (recordar, classificar).
 */
import { useMemo } from "react";
import { AlertCircle, Brain, ChevronRight } from "lucide-react";
import { Page } from "@/components/page";
import { BibliotecaTabs } from "@/components/biblioteca-tabs";
import { fmtDuration } from "@/lib/dates";
import { PERFIS, dominioDe, palavrasCurto, pct, perfilDe, recordarHoje, retencaoDe, type Perfil } from "@/lib/leitura";
import { progressoDoLivro, type Book } from "@/lib/types";
import { progressoDaMesa } from "@/lib/objetivos";
import { faltaDe, useBiblioteca } from "./dados";
import { Anel, BarraMarcos } from "./visual";

export function BibliotecaPagina({ actions, children }: { actions?: React.ReactNode; children: React.ReactNode }) {
  const { livros, ppm, lugar, carregado } = useBiblioteca();
  const lendo = livros.filter((b) => b.status === "lendo").length;
  const noPlano = livros.filter((b) => lugar.has(b.id) && b.status !== "lido").length;
  const falta = livros.filter((b) => lugar.has(b.id)).reduce((a, b) => a + faltaDe(b), 0);
  return (
    <Page wide tabs={<BibliotecaTabs />} title="Biblioteca" actions={actions}
      subtitle={carregado ? `${lendo} ${lendo === 1 ? "livro" : "livros"} em leitura · ${noPlano} no plano · ≈ ${fmtDuration((falta / ppm) * 60)} de leitura pela frente a ${ppm} ppm` : " "}>
      {children}
    </Page>
  );
}

export function Painel() {
  const d = useBiblioteca();
  const { livros, itens, porId, marcas, uso, ppm } = d;

  const plano = useMemo(() => {
    // cada livro do plano uma vez só (mesmo que esteja em duas mesas)
    const vistos = new Set<string>();
    const unicos = itens.filter((i) => { const k = i.book_id ?? i.id; if (vistos.has(k)) return false; vistos.add(k); return true; });
    return progressoDaMesa(unicos, porId);
  }, [itens, porId]);
  const marco = [0.25, 0.5, 0.75, 1].find((m) => plano.pct < m);
  const faltaMarco = marco ? marco * plano.total - plano.lidas : 0;

  const grupos = useMemo(() => {
    const g: Record<Perfil, Book[]> = { conhecimento: [], informacao: [], entretenimento: [] };
    for (const b of livros) { const p = perfilDe(b); if (p) g[p].push(b); }
    return g;
  }, [livros]);
  const semMotivo = livros.filter((b) => !b.motivo_leitura && b.status !== "lido").length;
  const paraRecordar = livros.filter((b) => recordarHoje(b)).length;
  const retencoes = livros.map((b) => retencaoDe(b)).filter((x): x is number => x !== null);
  const retencao = retencoes.length ? retencoes.reduce((a, x) => a + x, 0) / retencoes.length : null;

  // conhecimento: o domínio médio dos livros já começados, e as três partes dele
  const conh = useMemo(() => {
    const doms = grupos.conhecimento.filter((b) => b.status !== "aguardando").map((b) => dominioDe(b, marcas.get(b.id) ?? 0));
    const media = (k: "total" | "compreensao" | "retencao" | "dialogo") => {
      const v = doms.map((x) => x[k]).filter((x): x is number => x !== null);
      return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null;
    };
    return { comecados: doms.length, total: media("total"), compreensao: media("compreensao"), retencao: media("retencao"), dialogo: media("dialogo") };
  }, [grupos, marcas]);

  // informação: o ritmo nos livros de informação (senão, o seu ritmo geral)
  const info = useMemo(() => {
    let seg = 0, pal = 0;
    for (const b of grupos.informacao) { const u = uso.get(b.id); if (u) { seg += u.segundos; pal += u.palavras; } }
    const ritmo = seg > 120 ? Math.round(pal / (seg / 60)) : null;
    const falta = grupos.informacao.reduce((a, b) => a + faltaDe(b), 0);
    return { ritmo, falta };
  }, [grupos, uso]);

  const ent = grupos.entretenimento;
  const entLendo = ent.filter((b) => b.status === "lendo");

  return (
    <div className="space-y-3 mb-6 md:mb-8">
      {/* as divisórias são o fundo aparecendo entre as colunas (1px): ficam certas em qualquer largura */}
      <div className="card grid grid-cols-2 xl:grid-cols-[1.35fr_1.15fr_1fr_1fr] gap-px bg-line overflow-hidden">
        {/* o plano */}
        <Coluna className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-4">
            <Anel valor={plano.pct} cor="var(--accent)" tamanho={88} espessura={7}>
              <span className="text-[1.15rem] font-semibold tabular-nums tracking-tight">{pct(plano.pct)}</span>
            </Anel>
            <div className="min-w-0">
              <div className="eyebrow">Plano de leitura</div>
              <div className="text-sm mt-1"><b className="font-semibold tabular-nums">{plano.livrosLidos}</b> de <span className="tabular-nums">{plano.livros}</span> livros lidos</div>
              <div className="text-xs text-muted tabular-nums mt-0.5">{palavrasCurto(plano.lidas)} de {palavrasCurto(plano.total)} palavras</div>
              <div className="text-xs text-muted tabular-nums">≈ {fmtDuration((plano.faltam / ppm) * 60)} pela frente</div>
            </div>
          </div>
          <div className="mt-4"><BarraMarcos valor={plano.pct} cor="var(--accent)" /></div>
          {marco && plano.total > 0 && (
            <p className="text-[11.5px] text-muted mt-2">Próximo marco, <b className="text-ink font-medium">{pct(marco)}</b>: faltam {palavrasCurto(faltaMarco)} palavras (≈ {fmtDuration((faltaMarco / ppm) * 60)})</p>
          )}
        </Coluna>

        {/* conhecimento: domínio */}
        <Coluna perfil="conhecimento" n={grupos.conhecimento.length} className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-3">
            <Anel valor={conh.total} cor={PERFIS.conhecimento.cor} tamanho={56} espessura={5}>
              <span className="text-sm font-semibold tabular-nums">{conh.total === null ? "—" : `${Math.round(conh.total * 100)}%`}</span>
            </Anel>
            <div className="text-xs text-muted leading-snug">domínio médio<br />{conh.comecados ? `em ${conh.comecados} ${conh.comecados === 1 ? "livro começado" : "livros começados"}` : "começa quando você ler"}</div>
          </div>
          <div className="mt-3 space-y-1.5">
            <Mini nome="Compreensão" v={conh.compreensao} cor={PERFIS.conhecimento.cor} />
            <Mini nome="Retenção" v={conh.retencao} cor={PERFIS.conhecimento.cor} />
            <Mini nome="Diálogo" v={conh.dialogo} cor={PERFIS.conhecimento.cor} />
          </div>
        </Coluna>

        {/* informação: ritmo */}
        <Coluna perfil="informacao" n={grupos.informacao.length}>
          <div className="text-[1.75rem] font-semibold tracking-tight tabular-nums leading-none">{info.ritmo ?? ppm}<span className="text-sm font-normal text-muted ml-1">ppm</span></div>
          <div className="text-xs text-muted mt-1">{info.ritmo ? "nos livros de informação" : "seu ritmo geral (ainda sem leitura de informação)"}</div>
          <div className="text-xs text-muted mt-3">{info.falta ? <>≈ <b className="text-ink font-medium tabular-nums">{fmtDuration((info.falta / (info.ritmo ?? ppm)) * 60)}</b> para terminar todos</> : "nada pela frente"}</div>
        </Coluna>

        {/* entretenimento: avanço */}
        <Coluna perfil="entretenimento" n={ent.length}>
          <div className="text-[1.75rem] font-semibold tracking-tight tabular-nums leading-none">{ent.filter((b) => b.status === "lido").length}<span className="text-sm font-normal text-muted ml-1">lidos</span></div>
          <div className="text-xs text-muted mt-1">{entLendo.length ? `${entLendo.length} em leitura · ${Math.round((entLendo.reduce((a, b) => a + progressoDoLivro(b), 0) / entLendo.length) * 100)}% em média` : "nenhum em leitura"}</div>
        </Coluna>
      </div>

      {/* o que pede atenção hoje */}
      {(paraRecordar > 0 || semMotivo > 0 || retencao !== null) && (
        <div className="flex flex-wrap gap-2">
          {paraRecordar > 0 && (
            <Pedido icone={<Brain size={15} />} cor={PERFIS.conhecimento.cor} onClick={() => d.abrir({ tipo: "recordar" })}
              texto={<><b className="font-medium">{paraRecordar}</b> {paraRecordar === 1 ? "livro para recordar" : "livros para recordar"} hoje</>} acao="Recordar" />
          )}
          {semMotivo > 0 && (
            <Pedido icone={<AlertCircle size={15} />} cor="var(--warn)" onClick={() => d.abrir({ tipo: "triagem" })}
              texto={<><b className="font-medium">{semMotivo}</b> {semMotivo === 1 ? "livro sem motivo de leitura" : "livros sem motivo de leitura"} — sem ele não dá para medir</>} acao="Classificar" />
          )}
          {retencao !== null && (
            <span className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm text-muted">
              Retenção média <b className="text-ink font-medium tabular-nums">{Math.round(retencao * 100)}%</b>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Coluna({ perfil, n, children, className = "" }: { perfil?: Perfil; n?: number; children: React.ReactNode; className?: string }) {
  const p = perfil ? PERFIS[perfil] : null;
  return (
    <section className={`bg-surface p-4 sm:p-5 min-w-0 ${className}`}>
      {p && (
        <div className="flex items-center justify-between gap-2 mb-3" title={p.explica}>
          <span className="flex items-center gap-1.5 text-[13px] font-semibold min-w-0"><span className="dot" style={{ background: p.cor }} /><span className="truncate">{p.nome}</span></span>
          <span className="text-[11px] text-muted tabular-nums whitespace-nowrap">{n}<span className="hidden sm:inline"> · {p.mede}</span></span>
        </div>
      )}
      {children}
    </section>
  );
}

function Mini({ nome, v, cor }: { nome: string; v: number | null; cor: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.25rem] items-center gap-2 text-[11.5px]">
      <span className="text-muted">{nome}</span>
      <span className="h-1 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(v ?? 0) * 100}%`, background: cor }} /></span>
      <span className="text-right tabular-nums">{v === null ? "—" : `${Math.round(v * 100)}%`}</span>
    </div>
  );
}

function Pedido({ icone, cor, texto, acao, onClick }: { icone: React.ReactNode; cor: string; texto: React.ReactNode; acao: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm hover:bg-surface-2 transition-colors text-left"
      style={{ borderColor: `color-mix(in srgb, ${cor} 45%, var(--border))`, background: `color-mix(in srgb, ${cor} 7%, transparent)` }}>
      <span style={{ color: cor }}>{icone}</span>
      <span>{texto}</span>
      <span className="inline-flex items-center font-medium" style={{ color: cor }}>{acao}<ChevronRight size={14} /></span>
    </button>
  );
}
