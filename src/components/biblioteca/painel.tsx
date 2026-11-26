"use client";
/**
 * O cabeçalho e o painel da Biblioteca. O painel é um cartão só: o Plano (quanto do que você decidiu ler já foi lido)
 * e uma coluna para cada motivo de leitura, cada uma com a sua medida — conhecimento pelo domínio, informação pelo
 * ritmo, entretenimento pelo avanço. As quatro colunas têm os mesmos andares (nome, número, legenda, rodapé), e no pé
 * do cartão fica só o que pede ação hoje (recordar, classificar).
 */
import { useMemo } from "react";
import { AlertCircle, Brain, ChevronRight } from "lucide-react";
import { Page } from "@/components/page";
import { BibliotecaTabs } from "@/components/biblioteca-tabs";
import { fmtDuration } from "@/lib/dates";
import { PERFIS, dominioDe, faixaDe, palavrasCurto, pct, perfilDe, recordarHoje, retencaoDe, type Perfil } from "@/lib/leitura";
import { progressoDoLivro, type Book } from "@/lib/types";
import { progressoDaMesa } from "@/lib/objetivos";
import { faltaDe, useBiblioteca } from "./dados";
import { BarraMarcos, MarcaMotivo } from "./visual";

export function BibliotecaPagina({ actions, children }: { actions?: React.ReactNode; children: React.ReactNode }) {
  const { livros, ppm, lugar, carregado } = useBiblioteca();
  const lendo = livros.filter((b) => b.status === "lendo").length;
  const noPlano = livros.filter((b) => lugar.has(b.id) && b.status !== "lido").length;
  const falta = livros.filter((b) => lugar.has(b.id)).reduce((a, b) => a + faltaDe(b), 0);
  return (
    <Page tabs={<BibliotecaTabs />} title="Biblioteca" actions={actions}
      subtitle={carregado ? `${lendo} ${lendo === 1 ? "livro" : "livros"} em leitura · ${noPlano} por ler no plano · ≈ ${fmtDuration((falta / ppm) * 60)} de leitura pela frente a ${ppm} ppm` : " "}>
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
    return { ritmo, falta, porTerminar: grupos.informacao.filter((b) => faltaDe(b) > 0).length };
  }, [grupos, uso]);

  const ent = grupos.entretenimento;
  const entLendo = ent.filter((b) => b.status === "lendo");
  const entLidos = ent.filter((b) => b.status === "lido").length;

  const n = (k: number) => <b className="text-ink font-medium tabular-nums">{k}</b>;
  const parte = (nome: string, v: number | null) => (
    <span className="min-w-0" title={`${nome[0].toUpperCase()}${nome.slice(1)}: média dos livros de conhecimento começados`}>
      <span className="block truncate">{nome}</span>
      <b className="block text-ink font-medium tabular-nums">{v === null ? "—" : `${Math.round(v * 100)}%`}</b>
    </span>
  );

  return (
    // as divisórias são o fundo aparecendo entre as células (1px): ficam certas em qualquer largura.
    // Cada coluna ocupa 4 linhas da grade (subgrid): nome, número, legenda e rodapé ficam na mesma altura nas quatro.
    <div className="card grid grid-cols-2 xl:grid-cols-4 gap-px bg-line overflow-hidden mb-6 md:mb-8">
      {/* o plano */}
      <Coluna marca={<span className="dot" style={{ background: "var(--accent)" }} aria-hidden />} nome="Plano de leitura" livros={plano.livros}
        className="col-span-2 md:col-span-1"
        valor={pct(plano.pct)} unidade="lido"
        nota={<>em palavras · {palavrasCurto(plano.lidas)} de {palavrasCurto(plano.total)} · {plano.livrosLidos} {plano.livrosLidos === 1 ? "livro lido" : "livros lidos"}</>}>
        <BarraMarcos valor={plano.pct} cor="var(--accent)" />
        {/* o que vem a seguir, em linhas "rótulo · número à direita" */}
        <div className="mt-2 space-y-0.5">
          {marco && plano.total > 0 && (
            <Linha rotulo={<>Próximo marco <b className="text-ink font-medium tabular-nums">{Math.round(marco * 100)}%</b></>} titulo={`Faltam ${palavrasCurto(faltaMarco)} palavras para o marco de ${Math.round(marco * 100)}%`}>
              {palavrasCurto(faltaMarco)} · ≈ <b className="text-ink font-medium">{fmtDuration((faltaMarco / ppm) * 60)}</b>
            </Linha>
          )}
          {/* a conta do plano (mesas, com média para livros sem contagem de palavras): não é a mesma da manchete */}
          <Linha rotulo="Até o fim do plano" titulo="Pelas mesas: livros sem contagem de palavras entram com a média dos outros">
            ≈ <b className="text-ink font-medium">{fmtDuration((plano.faltam / ppm) * 60)}</b>
          </Linha>
        </div>
      </Coluna>

      {/* conhecimento: domínio */}
      <Coluna perfil="conhecimento" livros={grupos.conhecimento.length} className="col-span-2 md:col-span-1"
        valor={conh.comecados && conh.total !== null ? `${Math.round(conh.total * 100)}%` : null}
        nota={conh.comecados && conh.total !== null
          ? <>domínio médio · {faixaDe(conh.total).nome} · {conh.comecados} {conh.comecados === 1 ? "começado" : "começados"}</>
          : conh.comecados ? <>domínio médio · {conh.comecados} {conh.comecados === 1 ? "começado" : "começados"}</>
          : "começa quando você ler"}>
        {/* as três partes do domínio lado a lado: nome em cima, valor embaixo (duas linhas, como os outros rodapés).
            Distribuídas na largura (até 16rem), para "compreensão" caber inteira também na coluna de 1280px */}
        <div className="flex justify-between gap-x-2 max-w-64">
          {parte("compreensão", conh.compreensao)}{parte("retenção", conh.retencao)}{parte("diálogo", conh.dialogo)}
        </div>
      </Coluna>

      {/* informação: ritmo */}
      <Coluna perfil="informacao" livros={grupos.informacao.length}
        valor={String(info.ritmo ?? ppm)} unidade="ppm"
        nota={info.ritmo ? "ritmo nos livros de informação" : "seu ritmo geral · ainda sem leitura de informação"}>
        <p>{info.falta
          ? <>≈ <b className="text-ink font-medium tabular-nums">{fmtDuration((info.falta / (info.ritmo ?? ppm)) * 60)}</b> para terminar {info.porTerminar} {info.porTerminar === 1 ? "livro" : "livros"}</>
          : "nada pela frente"}</p>
      </Coluna>

      {/* entretenimento: avanço */}
      <Coluna perfil="entretenimento" livros={ent.length}
        valor={String(entLidos)} nota={entLidos === 1 ? "livro lido" : "livros lidos"}>
        <p>{entLendo.length
          ? <>{n(entLendo.length)} em leitura · <b className="text-ink font-medium tabular-nums">{Math.round((entLendo.reduce((a, b) => a + progressoDoLivro(b), 0) / entLendo.length) * 100)}%</b> em média</>
          : "nenhum em leitura"}</p>
      </Coluna>

      {/* o que pede atenção hoje: a última linha do mesmo cartão (só o ícone e a ação levam cor) */}
      {(paraRecordar > 0 || semMotivo > 0 || retencao !== null) && (
        // uma linha por pedido; lado a lado só quando o painel tem as 4 colunas (e cabe sem quebrar)
        <div className="col-span-full bg-surface px-4 sm:px-5 py-2 flex flex-col xl:flex-row xl:items-center xl:divide-x divide-line">
          {(paraRecordar > 0 || retencao !== null) && (
            <Pedido icone={<Brain size={15} />} cor="var(--area-leitura)"
              acao={paraRecordar > 0 ? { nome: "Recordar", onClick: () => d.abrir({ tipo: "recordar" }) } : undefined}
              texto={<>
                {paraRecordar > 0 && <>{n(paraRecordar)} {paraRecordar === 1 ? "livro para recordar" : "livros para recordar"} hoje</>}
                {paraRecordar > 0 && retencao !== null && <span className="text-faint"> · </span>}
                {retencao !== null && <>{paraRecordar > 0 ? "retenção" : "Retenção"} média <b className="text-ink font-medium tabular-nums">{Math.round(retencao * 100)}%</b></>}
              </>} />
          )}
          {semMotivo > 0 && (
            <Pedido icone={<AlertCircle size={15} />} cor="var(--warn)" titulo="Sem o motivo não dá para medir o livro"
              acao={{ nome: "Classificar", onClick: () => d.abrir({ tipo: "triagem" }) }}
              texto={<>{n(semMotivo)} {semMotivo === 1 ? "livro sem motivo de leitura" : "livros sem motivo de leitura"}</>} />
          )}
        </div>
      )}
    </div>
  );
}

/** Uma coluna do painel: nome (com a bolinha) e quantos livros, o número, o que ele é e, no rodapé, o que vem a seguir. */
function Coluna({ perfil, marca, nome, livros, valor, unidade, nota, children, className = "" }: {
  perfil?: Perfil; marca?: React.ReactNode; nome?: string; livros: number;
  /** null = ainda não há o que medir (aparece "—") */
  valor: string | null; unidade?: string; nota: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  const p = perfil ? PERFIS[perfil] : null;
  const vazio = livros === 0 && !!perfil;
  return (
    // grid-cols-1 (minmax(0, 1fr)): sem ele a coluna interna cresce até o texto mais largo e vaza para a vizinha em 1280px
    <section className={`bg-surface px-4 py-3.5 sm:px-5 sm:py-4 min-w-0 grid grid-cols-1 grid-rows-subgrid row-span-4 gap-y-0 ${className}`} title={p?.explica}>
      {/* @container no cabeçalho, e não na coluna: a contenção de layout desligaria o subgrid */}
      <div className="ind-rotulo @container">
        {perfil ? <MarcaMotivo perfil={perfil} /> : marca}
        <span className="truncate text-ink font-medium">{p?.nome ?? nome}</span>
        {/* numa coluna estreita (meia largura no celular) fica só o número, para o nome não ser cortado */}
        <span className="ml-auto tabular-nums" title={`${livros} ${livros === 1 ? "livro" : "livros"}`}>
          {livros}<span className="hidden @min-[11rem]:inline"> {livros === 1 ? "livro" : "livros"}</span>
        </span>
      </div>
      <div className={`ind-valor mt-2.5 ${vazio || valor === null ? "text-faint" : ""}`}>
        {vazio || valor === null ? "—" : <>{valor}{unidade && <span className="text-xs font-normal text-muted ml-1 tracking-normal">{unidade}</span>}</>}
      </div>
      <div className="ind-nota mt-1.5 leading-snug">{vazio ? "nenhum livro com este motivo" : nota}</div>
      {/* sem livros no grupo, o rodapé não tem o que dizer */}
      <div className="mt-3 text-xs text-muted leading-relaxed">{vazio ? null : children}</div>
    </section>
  );
}

/** Uma linha do pé do painel: ícone, o que pede atenção e, se houver, a ação. */
function Pedido({ icone, cor, texto, acao, titulo }: {
  icone: React.ReactNode; cor: string; texto: React.ReactNode; titulo?: string;
  acao?: { nome: string; onClick: () => void };
}) {
  const corpo = (
    <>
      <span className="shrink-0" style={{ color: cor }}>{icone}</span>
      <span className="min-w-0 text-muted leading-snug group-hover:text-ink transition-colors">{texto}</span>
      {acao && <span className="ml-auto xl:ml-1 shrink-0 inline-flex items-center font-medium" style={{ color: cor }}>{acao.nome}<ChevronRight size={14} /></span>}
    </>
  );
  const cls = "flex items-center gap-2 py-1.5 text-sm text-left min-w-0 xl:px-4 xl:first:pl-0";
  return acao
    ? <button onClick={acao.onClick} title={titulo} className={`group ${cls}`}>{corpo}</button>
    : <div title={titulo} className={cls}>{corpo}</div>;
}

/** Uma linha do rodapé: o rótulo à esquerda e o número à direita. */
function Linha({ rotulo, titulo, children }: { rotulo: React.ReactNode; titulo?: string; children: React.ReactNode }) {
  return (
    // numa coluna estreita o número desce para a linha de baixo (à direita), em vez de cortar o rótulo
    <div className="flex flex-wrap items-baseline justify-between gap-x-2" title={titulo}>
      <span className="min-w-0">{rotulo}</span>
      <span className="ml-auto tabular-nums whitespace-nowrap">{children}</span>
    </div>
  );
}
