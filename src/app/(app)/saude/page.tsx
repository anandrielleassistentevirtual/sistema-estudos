"use client";
/**
 * Saúde: passos e sono do app Saúde do iPhone, que um atalho (app Atalhos) manda sozinho todo dia.
 * Cabe numa tela: Movimento | Descanso espelhados (os números em cima do gráfico de cada um) e, embaixo, as consequências
 * (sono × estudo e a última noite contra a média). O estado do envio do iPhone fica no subtítulo.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, HeartPulse, KeyRound, Settings2, X } from "lucide-react";
import { CardHead, Empty, Faixa, Indicador, Page } from "@/components/page";
import { BarChart } from "@/components/bar-chart";
import { FiltroPeriodo } from "@/components/filtro-periodo";
import { Variacao } from "@/components/variacao";
import { usePeriodo } from "@/lib/periodo";
import { addDays, dayKey, MESES, nf, parseDay, weekStart } from "@/lib/dates";
import { inicio12Meses, loadDaily, metricValue, type DayStats } from "@/lib/stats";
import {
  carregarSaude, chaveSaude, ENDERECO_SAUDE, fmtHora, fmtSono, gerarChaveSaude, horaMediaAcordar, horaMediaDeitar,
  lerMetas, METAS_PADRAO, salvarMetas, sonoDe, type ChaveSaude, type DiaSaude, type MetasSaude,
} from "@/lib/saude";

const COR_PASSOS = "var(--area-exercicio)";
const COR_SONO = "var(--area-sono)";

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export default function SaudePage() {
  const [periodo, setPeriodo] = usePeriodo();
  const [dias, setDias] = useState<DiaSaude[] | null>(null);
  const [estudo, setEstudo] = useState<Map<string, DayStats>>(new Map());
  const [chave, setChave] = useState<ChaveSaude | null | undefined>(undefined);
  const [metas, setMetas] = useState<MetasSaude>(METAS_PADRAO);
  const [modal, setModal] = useState<null | "conectar" | "metas">(null);

  const carregar = () => {
    const desde = inicio12Meses();
    void carregarSaude(desde < periodo.antDe ? desde : periodo.antDe).then(setDias).catch(() => setDias([]));
    void chaveSaude().then(setChave).catch(() => setChave(null));
  };
  useEffect(carregar, [periodo.antDe]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadDaily(inicio12Meses()).then(setEstudo); void lerMetas().then(setMetas); }, []);

  const porDia = useMemo(() => new Map((dias ?? []).map((d) => [d.dia, d])), [dias]);
  const doPeriodo = (de: string, ate: string) => (dias ?? []).filter((d) => d.dia >= de && d.dia <= ate);
  const atual = doPeriodo(periodo.de, periodo.ate);
  const anterior = doPeriodo(periodo.antDe, periodo.antAte);
  const hoje = dayKey();
  // passos de hoje ainda estão contando: a média usa os dias completos (hoje só entra se for o único)
  const passosDe = (xs: DiaSaude[]) => {
    const cheios = xs.filter((d) => d.passos != null && d.dia !== hoje);
    return (cheios.length ? cheios : xs.filter((d) => d.passos != null)).map((d) => d.passos!);
  };
  const sonosDe = (xs: DiaSaude[]) => xs.map(sonoDe).filter((v): v is number => v != null);
  const pAtual = passosDe(atual), pAnt = passosDe(anterior);
  const sAtual = sonosDe(atual), sAnt = sonosDe(anterior);
  const mediaPassos = Math.round(media(pAtual)), mediaPassosAnt = Math.round(media(pAnt));
  const mediaSono = Math.round(media(sAtual)), mediaSonoAnt = Math.round(media(sAnt));
  const naMetaPassos = pAtual.filter((v) => v >= metas.passos).length;
  const naMetaSono = sAtual.filter((v) => v >= metas.sonoMin).length;
  const ultima = [...(dias ?? [])].reverse().find((d) => sonoDe(d) != null);
  const deitar = horaMediaDeitar(atual.map((d) => d.deitou).filter((x): x is string => !!x));
  const acordar = horaMediaAcordar(atual.map((d) => d.acordou).filter((x): x is string => !!x));
  const temFases = atual.some((d) => d.profundo_min != null);
  const fundoRem = Math.round(media(atual.filter((d) => d.sono_min && d.profundo_min != null).map((d) => ((d.profundo_min ?? 0) + (d.rem_min ?? 0)) / d.sono_min!)) * 100);

  // barras: por dia (até ~5 semanas), por semana (até ~6 meses) ou por mês — média por dia em cada barra
  const porQue = periodo.dias <= 35 ? "dia" : periodo.dias <= 190 ? "semana" : "mês";
  const grupos = useMemo(() => {
    const out: { label: string; detail: string; dias: string[] }[] = [];
    for (let d = parseDay(periodo.de); dayKey(d) <= periodo.ate; d = addDays(d, 1)) {
      const k = dayKey(d);
      const chaveG = porQue === "dia" ? k : porQue === "semana" ? dayKey(weekStart(d)) : k.slice(0, 7);
      const ult = out[out.length - 1];
      if (ult && ult.label === chaveG) { ult.dias.push(k); continue; }
      out.push({ label: chaveG, detail: "", dias: [k] });
    }
    return out.map((g) => {
      const [, m, dd] = g.dias[0].split("-");
      const label = porQue === "dia" ? `${+dd}/${+m}` : porQue === "semana" ? `${+dd}/${+m}` : MESES[+m - 1];
      return { ...g, label, detail: porQue === "dia" ? `${+dd}/${+m}` : porQue === "semana" ? `semana de ${+dd}/${+m}` : `${MESES[+m - 1]} ${g.dias[0].slice(0, 4)}` };
    });
  }, [periodo.de, periodo.ate, porQue]);
  const barrasPassos = grupos.map((g) => {
    const xs = g.dias.map((k) => porDia.get(k)?.passos).filter((v): v is number => v != null);
    return { label: g.label, value: Math.round(media(xs)), detail: `${g.detail}${porQue !== "dia" ? " · média por dia" : ""}${g.dias.includes(hoje) && porQue === "dia" ? " · até agora" : ""}` };
  });
  const barrasSono = grupos.map((g) => {
    const ds = g.dias.map((k) => porDia.get(k)).filter((d): d is DiaSaude => !!d && sonoDe(d) != null);
    const v = media(ds.map((d) => sonoDe(d)!));
    const fr = ds.filter((d) => d.profundo_min != null);
    const parte = fr.length ? media(fr.map((d) => (d.profundo_min ?? 0) + (d.rem_min ?? 0))) : undefined;
    return { label: g.label, value: Math.round(v) / 60, parte: parte != null ? Math.round(parte) / 60 : undefined, detail: `${g.detail} · ${fmtSono(v || null)}${parte != null ? ` (profundo + REM ${fmtSono(parte)})` : ""}${porQue !== "dia" ? " · média por noite" : ""}` };
  });

  // sono × estudo: o tempo de estudo do dia depois de cada noite (todo o histórico carregado)
  const faixas = useMemo(() => {
    const F = [
      { nome: "menos de 6h", ate: 360 }, { nome: "6h a 7h", ate: 420 }, { nome: "7h a 8h", ate: 480 }, { nome: "8h ou mais", ate: Infinity },
    ].map((f) => ({ ...f, dias: 0, min: 0 }));
    for (const d of dias ?? []) {
      const s = sonoDe(d);
      if (s == null || d.dia === hoje) continue;
      const f = F.find((x) => s < x.ate)!;
      f.dias++;
      f.min += metricValue(estudo.get(d.dia), "tempo");
    }
    return F.map((f) => ({ ...f, media: f.dias ? f.min / f.dias : 0 }));
  }, [dias, estudo, hoje]);
  const maxFaixa = Math.max(1, ...faixas.map((f) => f.media));
  const noitesComEstudo = faixas.reduce((a, f) => a + f.dias, 0);

  // a conclusão (e a barra em destaque) só quando uma faixa ganha sozinha, pelo que se lê na tela (minutos inteiros)
  const topoFaixa = Math.max(0, ...faixas.filter((f) => f.dias > 0).map((f) => Math.round(f.media)));
  const lideres = faixas.filter((f) => f.dias > 0 && Math.round(f.media) === topoFaixa);
  const campea = topoFaixa > 0 && lideres.length === 1 ? lideres[0] : null;

  const semDados = dias !== null && dias.length === 0;

  return (
    <Page
      title="Saúde"
      ajuda="Passos e sono do app Saúde do iPhone — o atalho manda sozinho todo dia."
      // a manchete é a origem dos dados: quando o iPhone mandou pela última vez (o resto está nos números);
      // enquanto carrega, um espaço segura a linha para a página não pular
      subtitle={chave === undefined ? "\u00a0" : <LinhaDoEnvio chave={chave} onAbrir={() => setModal("conectar")} />}
      actions={
        <>
          {/* botões antes, filtro por último: a borda direita do filtro fica no mesmo x do Dashboard e de Idiomas */}
          <button className="btn btn-ghost max-sm:px-2.5" onClick={() => setModal("metas")} title="Metas" aria-label="Metas">
            <Settings2 size={15} /><span className="hidden sm:inline">Metas</span>
          </button>
          <FiltroPeriodo periodo={periodo} onMudar={setPeriodo} />
        </>
      }
    >
      {semDados && chave === null && (
        <Empty icone={HeartPulse}>
          Conecte o iPhone para ver aqui os seus passos e o seu sono. Um atalho do app Atalhos lê o app Saúde e manda os dados
          todo dia, sozinho. <button className="underline underline-offset-2 hover:text-ink" onClick={() => setModal("conectar")}>Conectar o iPhone</button>
        </Empty>
      )}
      {semDados && chave && (
        <Empty icone={HeartPulse}>
          A chave está pronta, mas o atalho ainda não mandou nada. Rode o atalho uma vez no iPhone e permita o acesso a Passos e Sono.{" "}
          <button className="underline underline-offset-2 hover:text-ink" onClick={() => setModal("conectar")}>Ver o passo a passo</button>
        </Empty>
      )}

      {dias && dias.length > 0 && (
        // dois blocos espelhados (Movimento | Descanso), cada par de números em cima do seu gráfico; embaixo, as consequências
        // a partir de lg: entre 768 e 1023px, com o menu aberto, cada coluna ficaria com ~240px e as linhas de baixo não caberiam
        <div className="flex flex-col gap-3 md:gap-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
            <div className="flex flex-col gap-3 md:gap-4 min-w-0">
              <Faixa colunas={2}>
                <Indicador label="Passos por dia" cor={COR_PASSOS} value={pAtual.length ? nf.format(mediaPassos) : "—"}
                  delta={<Variacao atual={mediaPassos} base={mediaPassosAnt} vs={periodo.vs} />}
                  explica={`Média de passos por dia — ${periodo.nome.toLowerCase()} (dias completos). Período anterior: ${nf.format(mediaPassosAnt)}.`} />
                <Indicador label="Dias na meta" cor={COR_PASSOS}
                  value={pAtual.length ? <>{naMetaPassos}<span className="text-sm font-normal text-muted"> de {pAtual.length}</span></> : "—"}
                  detalhe={`meta ${nf.format(metas.passos)}`} explica="Dias completos do período (hoje ainda está contando) com a meta de passos cumprida." />
              </Faixa>
              <section className="card p-4 min-w-0 flex flex-col flex-1">
                {/* "média por dia" só quando cada barra junta vários dias (por semana, por mês) */}
                <CardHead nivel="h3" titulo={`Passos por ${porQue}`}
                  acao={porQue !== "dia" && <span className="text-xs text-faint">média por dia</span>} />
                <div className="mt-auto">
                  <GraficoQueOcupa>{(h) => <BarChart data={barrasPassos} unit="passos" height={h} alturaExata meta={metas.passos} cor={COR_PASSOS} />}</GraficoQueOcupa>
                </div>
              </section>
            </div>
            <div className="flex flex-col gap-3 md:gap-4 min-w-0">
              <Faixa colunas={2}>
                <Indicador label="Sono por noite" cor={COR_SONO} value={fmtSono(sAtual.length ? mediaSono : null)}
                  delta={<Variacao atual={mediaSono} base={mediaSonoAnt} vs={periodo.vs} />}
                  explica={`Tempo dormindo por noite, em média — ${periodo.nome.toLowerCase()}. Período anterior: ${fmtSono(mediaSonoAnt || null)}.${temFases ? ` Sono profundo + REM: ${fundoRem}% do sono.` : ""}`} />
                <Indicador label="Noites na meta" cor={COR_SONO}
                  value={sAtual.length ? <>{naMetaSono}<span className="text-sm font-normal text-muted"> de {sAtual.length}</span></> : "—"}
                  detalhe={`meta ${fmtSono(metas.sonoMin)}`} explica="Noites do período com a meta de sono cumprida." />
              </Faixa>
              <section className="card p-4 min-w-0 flex flex-col flex-1">
                <CardHead nivel="h3" titulo={`Sono por ${porQue === "dia" ? "noite" : porQue}`}
                  acao={temFases && <span className="text-xs text-faint"><span style={{ color: COR_SONO }}>■</span> profundo + REM</span>} />
                <div className="mt-auto">
                  <GraficoQueOcupa>{(h) => <BarChart data={barrasSono} unit="h" height={h} alturaExata meta={metas.sonoMin / 60} fmtValor={(v) => fmtSono(v * 60)}
                    cor={COR_SONO} corParte={COR_SONO} rotuloParte="profundo + REM" />}</GraficoQueOcupa>
                </div>
              </section>
            </div>
          </div>

          {/* as consequências, no mesmo molde de colunas: o sono no estudo do dia seguinte | a última noite contra a média */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
            <section className="card p-4 min-w-0">
              <CardHead nivel="h3" titulo="Sono × estudo" meta={`${noitesComEstudo} ${noitesComEstudo === 1 ? "noite registrada" : "noites registradas"}`} />
              {noitesComEstudo < 5 ? (
                <p className="text-sm text-muted">Com mais algumas noites registradas, aparece aqui quanto você estuda depois de dormir pouco e depois de dormir bem.</p>
              ) : (
                <>
                  <p className="text-xs text-faint mb-2.5" title="Tempo médio de estudo no dia seguinte a cada noite, pelas horas dormidas (todo o histórico)">
                    {campea ? <>Você estuda mais depois de noites de <span className="text-ink font-medium">{campea.nome}</span>.</> : "estudo no dia seguinte, por horas dormidas"}
                  </p>
                  <ul className="space-y-2">
                    {faixas.map((f) => (
                      <li key={f.nome} className="grid grid-cols-[6.5rem_minmax(0,1fr)_7.5rem] items-center gap-3 text-sm">
                        <span className="text-muted">{f.nome}</span>
                        {/* sem noites, nada de trilha: uma trilha vazia parece um dado */}
                        {f.dias > 0 ? (
                          <span className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                            <span className="block h-full rounded-full" style={{
                              width: `${(f.media / maxFaixa) * 100}%`,
                              background: f === campea ? "var(--area-estudos)" : "color-mix(in srgb, var(--chart) 55%, transparent)",
                            }} />
                          </span>
                        ) : <span className="text-xs text-faint">sem noites</span>}
                        <span className="tabular-nums text-right whitespace-nowrap">
                          {f.dias > 0 && <>{fmtMin(f.media)}<span className="text-faint text-xs"> · {f.dias} {f.dias === 1 ? "noite" : "noites"}</span></>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
            <section className="card p-4 min-w-0 @container">
              <CardHead nivel="h3" titulo="Última noite" meta={ultima ? `noite que terminou em ${fmtDiaCurto(ultima.dia)}` : undefined} />
              {!ultima ? (
                <p className="text-sm text-muted">Nenhuma noite registrada ainda.</p>
              ) : (
                <>
                  {/* a última noite ao lado da média do período: melhor ou pior que o normal */}
                  <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm tabular-nums items-baseline">
                    <span />
                    <span className="text-xs text-faint">última noite</span>
                    <span className="text-xs text-faint">média<span className="hidden @[22rem]:inline"> do período</span></span>
                    <span className="text-muted">Dormiu</span>
                    <span className="font-medium" title={ultima.sono_min == null ? "Sem relógio: o tempo na cama" : undefined}>
                      {fmtSono(sonoDe(ultima))}{ultima.sono_min == null && <span className="text-xs text-faint font-normal"> · na cama</span>}
                    </span>
                    <span>{fmtSono(sAtual.length ? mediaSono : null)}</span>
                    <span className="text-muted">Deitou</span>
                    <span className="font-medium">{ultima.deitou ? fmtHora(minutoLocal(ultima.deitou)) : "—"}</span>
                    <span>{fmtHora(deitar)}</span>
                    <span className="text-muted">Acordou</span>
                    <span className="font-medium">{ultima.acordou ? fmtHora(minutoLocal(ultima.acordou)) : "—"}</span>
                    <span>{fmtHora(acordar)}</span>
                  </div>
                  {ultima.profundo_min != null && (
                    // cada fase inteira numa linha: no celular a quebra cai nos pontos, não no meio de "acordado 0h20"
                    <p className="text-xs text-faint mt-3 tabular-nums flex flex-wrap gap-x-1">
                      {([["profundo", ultima.profundo_min], ["REM", ultima.rem_min], ["essencial", ultima.essencial_min],
                        ...(ultima.acordado_min ? [["acordado", ultima.acordado_min]] : [])] as [string, number | null][])
                        .map(([nome, v], i) => <span key={nome} className="whitespace-nowrap">{i > 0 && "· "}{nome} {fmtSono(v)}</span>)}
                    </p>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      )}

      {modal === "conectar" && <Conectar chave={chave ?? null} onFechar={() => { setModal(null); carregar(); }} />}
      {modal === "metas" && <Metas metas={metas} onFechar={() => setModal(null)} onSalvar={async (m) => { await salvarMetas(m); setMetas(m); setModal(null); }} />}
    </Page>
  );
}

const minutoLocal = (iso: string) => { const d = new Date(new Date(iso).getTime() - 3 * 3600000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const fmtDiaCurto = (k: string) => { const [, m, d] = k.split("-"); return `${+d}/${+m}`; };
const fmtMin = (min: number) => (min < 60 ? `${Math.round(min)} min` : fmtSono(min));

function quando(iso: string) {
  const d = new Date(iso);
  const dia = dayKey(d) === dayKey() ? "hoje" : dayKey(d) === dayKey(addDays(new Date(), -1)) ? "ontem" : d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
  return `${dia} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

// mais de um dia e meio sem envio (ou nenhum ainda): o ponto fica âmbar
const envioAtrasado = (c: ChaveSaude) => !c.ultimo_uso || Date.now() - new Date(c.ultimo_uso).getTime() > 36 * 3600000;
const AVISO_ATRASO = "Mais de um dia sem envio: o iPhone só lê o Saúde desbloqueado. O próximo envio cobre os dias que faltaram (manda sempre os últimos 7 dias).";

/** A manchete da tela: de onde vêm os dados e quando chegaram pela última vez, com a saída para o passo a passo. */
function LinhaDoEnvio({ chave, onAbrir }: { chave: ChaveSaude | null; onAbrir: () => void }) {
  const atrasado = !!chave && envioAtrasado(chave);
  return (
    <span title={atrasado && chave?.ultimo_uso ? AVISO_ATRASO : undefined}>
      <span className="dot mr-1.5 align-[0.05em]" style={{ background: !chave ? "var(--faint)" : atrasado ? "var(--warn)" : "var(--good)" }} aria-hidden />
      {!chave ? "iPhone não conectado" : chave.ultimo_uso ? `último envio do iPhone: ${quando(chave.ultimo_uso)}` : "chave criada; o atalho ainda não mandou nada"}
      {" · "}
      <button className="underline underline-offset-2 hover:text-ink" onClick={onAbrir}>{chave ? "passo a passo" : "Conectar o iPhone"}</button>
    </span>
  );
}

/** O estado do envio por extenso (o resumo do último envio e o aviso de atraso), no topo da janela do passo a passo. */
function EstadoDoEnvio({ chave }: { chave: ChaveSaude | null }) {
  if (!chave) return <p className="text-sm text-muted">iPhone não conectado.</p>;
  const atrasado = envioAtrasado(chave);
  return (
    <div className="text-sm space-y-1">
      <p>
        <span className="dot !w-2 !h-2 mr-2 align-middle" style={{ background: atrasado ? "var(--warn)" : "var(--good)" }} aria-hidden />
        {chave.ultimo_uso ? <>Último envio: <b className="font-medium">{quando(chave.ultimo_uso)}</b></> : "Chave criada; o atalho ainda não mandou nada."}
      </p>
      {chave.ultimo_resumo && <p className="text-muted">{chave.ultimo_resumo}</p>}
      {atrasado && chave.ultimo_uso && <p className="text-xs text-faint">{AVISO_ATRASO}</p>}
    </div>
  );
}

function Copiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 min-w-0 truncate rounded-md bg-sel px-2 py-1.5 text-xs select-all" title={texto}>{texto}</code>
      <button className="btn btn-ghost text-xs py-1 px-2 shrink-0" aria-label={`Copiar ${rotulo}`}
        onClick={() => { void navigator.clipboard?.writeText(texto).then(() => { setOk(true); setTimeout(() => setOk(false), 1600); }); }}>
        {ok ? <Check size={14} /> : <Copy size={14} />} {ok ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

function Conectar({ chave, onFechar }: { chave: ChaveSaude | null; onFechar: () => void }) {
  const [nova, setNova] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [gerando, setGerando] = useState(false);
  const gerar = async () => {
    if (chave && !confirm("Gerar uma chave nova? A antiga para de funcionar: depois, troque a chave no atalho do iPhone.")) return;
    setGerando(true); setErro("");
    try { setNova(await gerarChaveSaude()); } catch (e) { setErro((e as Error).message); } finally { setGerando(false); }
  };
  return (
    <Modal title="Conectar o iPhone" onClose={onFechar} largo>
      <div className="rounded-lg bg-surface-2 px-3 py-2.5"><EstadoDoEnvio chave={chave} /></div>
      <ol className="space-y-4 text-sm leading-relaxed">
        <li>
          <h3 className="font-medium mb-1">1. A chave</h3>
          {nova ? (
            <div className="space-y-2">
              <p className="text-muted">Copie agora: ela não aparece de novo (se perder, é só gerar outra).</p>
              <Copiar texto={nova} rotulo="a chave" />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn" onClick={gerar} disabled={gerando}><KeyRound size={15} /> {chave ? "Gerar chave nova" : "Gerar a chave"}</button>
              <span className="text-muted">{chave ? `Já existe uma chave (criada ${quando(chave.created_at)}). Ela só aparece na hora em que é gerada.` : "Ela só serve para gravar passos e sono."}</span>
            </div>
          )}
          {erro && <p className="text-sm" style={{ color: "var(--critical)" }}>{erro}</p>}
          <div className="mt-2"><p className="text-muted mb-1">O endereço:</p><Copiar texto={ENDERECO_SAUDE} rotulo="o endereço" /></div>
          <p className="text-xs text-faint mt-1">Dica: abra esta página no iPhone para copiar e colar direto no atalho.</p>
        </li>
        <li>
          <h3 className="font-medium mb-1">2. O atalho (uma vez só)</h3>
          <p className="text-muted mb-1.5">No iPhone, app <b className="text-ink">Atalhos</b> → <b className="text-ink">+</b> → dê o nome <b className="text-ink">Enviar Saúde</b> e adicione estas ações, nesta ordem:</p>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li><b>Buscar Amostras de Saúde</b>: Tipo → <b>Passos</b>; filtro <b>Data de Início</b> · <b>está nos últimos</b> · <b>7 dias</b>; <b>Agrupar por</b> → <b>Dia</b>.</li>
            <li><b>Obter Detalhes das Amostras de Saúde</b> → <b>Valor</b>.</li>
            <li><b>Obter Detalhes das Amostras de Saúde</b> → <b>Data de Início</b>. Toque na entrada (em azul) e escolha as amostras da ação 1.</li>
            <li><b>Buscar Amostras de Saúde</b>: Tipo → <b>Análise do Sono</b>; filtro <b>Data de Início</b> · <b>está nos últimos</b> · <b>7 dias</b>; sem limite.</li>
            <li>Três vezes <b>Obter Detalhes das Amostras de Saúde</b>, sempre com a entrada nas amostras da ação 4: <b>Valor</b>, <b>Data de Início</b> e <b>Data de Término</b>.</li>
            <li>
              <b>Obter Conteúdo do URL</b>: cole o endereço; em <b>Mostrar Mais</b>: Método <b>POST</b>, Corpo da Solicitação <b>JSON</b>, com 6 campos do tipo <b>Texto</b>:
              <ul className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[13px]">
                <code>chave</code><span className="text-muted">a chave (colada)</span>
                <code>passos</code><span className="text-muted">o resultado da ação 2 (Valor)</span>
                <code>passos_datas</code><span className="text-muted">o resultado da ação 3 (Data de Início)</span>
                <code>sono</code><span className="text-muted">o Valor das amostras de sono (ação 5)</span>
                <code>sono_inicio</code><span className="text-muted">a Data de Início das amostras de sono</span>
                <code>sono_fim</code><span className="text-muted">a Data de Término das amostras de sono</span>
              </ul>
              <span className="text-xs text-faint">Para pôr o resultado de uma ação num campo: toque no campo → <b>Selecionar Variável</b> → toque na saída da ação.</span>
            </li>
            <li><b>Mostrar Resultado</b> (opcional): ao rodar à mão, aparece “Recebido: passos de 6 dias e 6 noites de sono…”.</li>
          </ol>
          <p className="text-muted mt-1.5">Rode o atalho uma vez (▶︎): o iPhone pede para ler <b className="text-ink">Passos</b> e <b className="text-ink">Sono</b> — permita. O último envio aparece embaixo do título desta página (e no topo desta janela).</p>
        </li>
        <li>
          <h3 className="font-medium mb-1">3. Todo dia, sozinho</h3>
          <p className="text-muted">Atalhos → <b className="text-ink">Automação</b> → <b className="text-ink">+</b> → <b className="text-ink">Hora do Dia</b>: 10:00, <b className="text-ink">Diariamente</b> → <b className="text-ink">Executar Imediatamente</b> → escolha <b className="text-ink">Enviar Saúde</b>.</p>
          <p className="text-xs text-faint mt-1">O iPhone só lê o Saúde desbloqueado: escolha uma hora em que você costuma usar o celular. Se um dia falhar, o envio seguinte cobre — ele manda sempre os últimos 7 dias.</p>
        </li>
      </ol>
    </Modal>
  );
}

function Metas({ metas, onFechar, onSalvar }: { metas: MetasSaude; onFechar: () => void; onSalvar: (m: MetasSaude) => Promise<void> }) {
  const [passos, setPassos] = useState(String(metas.passos));
  const [h, setH] = useState(String(Math.floor(metas.sonoMin / 60)));
  const [m, setM] = useState(String(metas.sonoMin % 60));
  const [salvando, setSalvando] = useState(false);
  return (
    <Modal title="Metas" onClose={onFechar}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        const p = Math.max(500, Math.min(50000, Math.round(Number(passos) || METAS_PADRAO.passos)));
        const s = Math.max(180, Math.min(720, (Number(h) || 0) * 60 + (Number(m) || 0)));
        setSalvando(true);
        try { await onSalvar({ passos: p, sonoMin: s }); } finally { setSalvando(false); }
      }}>
        <label className="block text-sm">Passos por dia
          <input className="input mt-1 w-full" inputMode="numeric" value={passos} onChange={(e) => setPassos(e.target.value.replace(/\D/g, ""))} />
        </label>
        <div className="text-sm">Sono por noite
          <div className="flex items-center gap-2 mt-1">
            <input className="input w-20" inputMode="numeric" aria-label="horas" value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, ""))} /> h
            <input className="input w-20" inputMode="numeric" aria-label="minutos" value={m} onChange={(e) => setM(e.target.value.replace(/\D/g, ""))} /> min
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-ghost" onClick={onFechar}>Cancelar</button>
          <button className="btn" disabled={salvando}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

function GraficoQueOcupa({ children, minimo = 96 }: { children: (altura: number) => React.ReactNode; minimo?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setH(Math.round(e.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const altura = Math.max(minimo, h - 32);
  return (
    // a altura que sobra na tela (sem rolar) entre os números e a linha de baixo
    <div ref={ref} className="relative min-w-0" style={{ height: `clamp(${minimo + 32}px, calc(100vh - 36.5rem), 24rem)` }}>
      <div className="absolute inset-x-0 bottom-0">{children(altura)}</div>
    </div>
  );
}

function Modal({ title, onClose, children, largo }: { title: string; onClose: () => void; children: React.ReactNode; largo?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal fixed inset-0 z-[62] grid place-items-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`card w-full ${largo ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto p-5 space-y-3`}>
        <div className="flex justify-between items-center gap-3">
          <h2 className="modal-title">{title}</h2>
          <button type="button" className="p-1 -m-1 rounded-md text-muted hover:text-ink hover:bg-sel" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
