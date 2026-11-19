"use client";
/**
 * Idiomas: cada idioma na sua seção. O tempo (Timer e registros), as revisões e os cartões criados no Anki
 * aparecem só no idioma dono dos baralhos (Inglês ← "English"), nunca misturados.
 */
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Clock, Layers, Play, Plus, Settings2, Trash2, X } from "lucide-react";
import { Empty, Page, Stat } from "@/components/page";
import { AnkiNoComputador, AnkiWebBarra, Conectar } from "@/components/anki-conta";
import { ListeningPainel } from "@/components/listening-painel";
import { ROTULO_LISTENING } from "@/lib/listening";
import { contaComoEstudo, ehMar } from "@/lib/tempo";
import { BarChart } from "@/components/bar-chart";
import { Heatmap } from "@/components/heatmap";
import { Bandeira, BANDEIRAS, bandeiraDoIdioma } from "@/components/bandeira";
import { Language, loadLanguages, ONDE, palpiteDeBaralhos, SUGESTOES } from "@/lib/languages";
import { ankiOnline, contaAnki, sincronizarAnkiSeAntigo, type BaralhoAnki, type ContaAnki } from "@/lib/anki";
import { addDays, dayKey, fmtDuration, nf, parseDay, weekStart } from "@/lib/dates";
import { emptyDay, type DayStats } from "@/lib/stats";
import { supabase } from "@/lib/supabase/client";
import { todas } from "@/lib/supabase/todas";
import { FiltroPeriodo } from "@/components/filtro-periodo";
import { MarPainel, type PatchTempo } from "@/components/mar-painel";
import { useTimerEstado } from "@/components/timer-context";
import { COR_MAR } from "@/lib/mar";
import { Variacao } from "@/components/variacao";
import { semanasDoPeriodo, usePeriodo } from "@/lib/periodo";

interface Sess { id: string; day: string; started_at: string | null; seconds: number; language: string | null; label: string; mar_titulo_id: string | null }
const COLUNAS_SESS = "id,day,started_at,seconds,language,label,mar_titulo_id";
interface DiaBaralho { day: string; baralho: string; reviews: number; segundos: number; criados: number; notas_criadas: number }


export default function Idiomas() {
  const [langs, setLangs] = useState<Language[] | null>(null);
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [ankiDias, setAnkiDias] = useState<DiaBaralho[]>([]);
  const [conta, setConta] = useState<ContaAnki | null | undefined>(undefined); // null = AnkiWeb não conectado
  const baralhos: BaralhoAnki[] | null = conta ? conta.baralhos ?? [] : null;
  const [noComputador, setNoComputador] = useState(false); // Anki aberto neste computador (AnkiConnect)
  useEffect(() => { void ankiOnline().then(setNoComputador); }, []);
  const [selId, setSelId] = useState<string | null>(null);
  // revisões e cartões criados dividem o mesmo quadro (um calendário de cada vez)
  const [verAnki, setVerAnki] = useState<"revisoes" | "criados">("revisoes");
  const [modal, setModal] = useState<null | "idioma" | "tempo" | { edit: Language }>(null);
  const [periodo, setPeriodo] = usePeriodo();
  const padraoDesde = dayKey(addDays(weekStart(new Date()), -52 * 7));
  // período (ou o anterior, para comparar) mais antigo que um ano: busca o Anki desde ele
  const ankiDesde = periodo.antDe < padraoDesde ? periodo.antDe : padraoDesde;

  const buscarSessoes = useCallback(() => {
    const sb = supabase();
    return todas<Sess>((de, ate) => sb.from("study_sessions").select(COLUNAS_SESS).eq("category", "Idiomas").order("id").range(de, ate))
      .then((l) => l.map((x) => ({ ...x, label: x.label ?? "", mar_titulo_id: x.mar_titulo_id ?? null })));
  }, []);
  const load = useCallback(async () => {
    const sb = supabase();
    const desde = ankiDesde;
    const [st, lg, ad, conta] = await Promise.all([
      buscarSessoes(),
      loadLanguages(),
      todas<DiaBaralho>((de, ate) => sb.from("anki_baralho_dia").select("day,baralho,reviews,segundos,criados,notas_criadas").gte("day", desde).order("day").order("baralho").range(de, ate)).catch(() => [] as DiaBaralho[]),
      contaAnki(),
    ]);
    setSessions(st);
    setLangs(lg);
    setAnkiDias(ad);
    setConta(conta);
    setSelId((cur) => {
      if (cur && lg.some((l) => l.id === cur)) return cur;
      let salvo: string | null = null;
      try { salvo = localStorage.getItem("idioma-atual"); } catch {}
      return lg.find((l) => l.id === salvo)?.id ?? lg[0]?.id ?? null;
    });
  }, [ankiDesde, buscarSessoes]);
  useEffect(() => {
    void load();
    // números do Anki velhos: busca no AnkiWeb em segundo plano e atualiza
    void sincronizarAnkiSeAntigo(0.5).then((ok) => { if (ok) void load(); });
  }, [load]);
  useEffect(() => { if (selId) try { localStorage.setItem("idioma-atual", selId); } catch {} }, [selId]);

  // o tempo mudou (MAR, Timer): recarrega só as sessões, não o Anki
  const recarregarSessoes = useCallback(() => { void buscarSessoes().then(setSessions).catch(() => {}); }, [buscarSessoes]);
  const recarga = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTempo = useCallback((patch: PatchTempo) => {
    if (patch.add?.length || patch.remove?.length) {
      const fora = new Set(patch.remove ?? []);
      const novas = (patch.add ?? []).map((x) => ({ ...x, label: x.label ?? "", mar_titulo_id: x.mar_titulo_id ?? null }));
      setSessions((l) => [...l.filter((x) => !fora.has(x.id) && !novas.some((n) => n.id === x.id)), ...novas]);
    }
    if (patch.recarregar) {
      if (recarga.current) clearTimeout(recarga.current);
      recarga.current = setTimeout(recarregarSessoes, 1500);
    }
  }, [recarregarSessoes]);
  useEffect(() => () => { if (recarga.current) clearTimeout(recarga.current); }, []);
  const { lastSaved } = useTimerEstado();
  const salvoAntes = useRef(lastSaved);
  useEffect(() => {
    if (lastSaved === salvoAntes.current) return;
    salvoAntes.current = lastSaved;
    recarregarSessoes();
  }, [lastSaved, recarregarSessoes]);

  const sel = langs?.find((l) => l.id === selId) ?? null;
  const decksDoIdioma = useMemo(() => new Set(sel?.anki_baralhos ?? []), [sel]);
  const meusDias = useMemo(() => ankiDias.filter((d) => decksDoIdioma.has(d.baralho)), [ankiDias, decksDoIdioma]);
  // a revisão feita aqui no sistema ("Anki · 12 cartões") já está no histórico do Anki: com baralhos ligados, não conta duas vezes
  const minhasSessoes = useMemo(() => sessions.filter((s) => s.language === sel?.name && contaComoEstudo(s.label, !!conta)), [sessions, sel, conta]);
  // MAR: as sessões ligadas a um título ou com o rótulo "MAR · …" (a fonte única do tempo do MAR)
  const sessoesMar = useMemo(() => minhasSessoes.filter((s) => ehMar(s.label, s.mar_titulo_id)), [minhasSessoes]);

  // por dia: revisões (azul), criados (amarelo) e segundos no Anki
  const { revisoes, criados } = useMemo(() => {
    const revisoes = new Map<string, DayStats>(), criados = new Map<string, DayStats>();
    for (const d of meusDias) {
      if (d.reviews) revisoes.set(d.day, { ...emptyDay(), anki: (revisoes.get(d.day)?.anki ?? 0) + d.reviews });
      if (d.criados) criados.set(d.day, { ...emptyDay(), anki: (criados.get(d.day)?.anki ?? 0) + d.criados });
    }
    return { revisoes, criados };
  }, [meusDias]);

  // tudo no período do filtro (e no período anterior equivalente, para comparar)
  const { de, ate, antDe, antAte } = periodo;
  const soma = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
  const noP = <T extends { day: string }>(xs: T[], a = de, z = ate) => xs.filter((x) => x.day >= a && x.day <= z);
  const timerP = soma(noP(minhasSessoes), (s) => s.seconds), timerA = soma(noP(minhasSessoes, antDe, antAte), (s) => s.seconds);
  const ankiP = soma(noP(meusDias), (d) => d.segundos), ankiA = soma(noP(meusDias, antDe, antAte), (d) => d.segundos);
  const revP = soma(noP(meusDias), (d) => d.reviews), revA = soma(noP(meusDias, antDe, antAte), (d) => d.reviews);
  const criadosP = soma(noP(meusDias), (d) => d.criados), criadosA = soma(noP(meusDias, antDe, antAte), (d) => d.criados);
  const notasP = soma(noP(meusDias), (d) => d.notas_criadas);
  const tabela = (baralhos ?? []).filter((b) => decksDoIdioma.has(b.nome.split("::")[0]));
  const paraHoje = soma(tabela.filter((b) => !b.nome.includes("::")), (b) => b.revisar + b.aprendendo);
  const meta = sel?.weekly_goal_min ? sel.weekly_goal_min * 60 : 0;
  // Listening (script do curso) e aulas em vídeo do curso
  const escuta = minhasSessoes.filter((s) => s.label === ROTULO_LISTENING);
  const escutaP = soma(noP(escuta), (s) => s.seconds), escutaA = soma(noP(escuta, antDe, antAte), (s) => s.seconds);
  const aulasP = soma(noP(minhasSessoes.filter((s) => s.label === "Aulas")), (s) => s.seconds);
  const marP = soma(noP(sessoesMar), (s) => s.seconds);
  // o "Timer" é o resto: o que não é Listening, Aulas nem MAR
  const restoTimerP = timerP - escutaP - aulasP - marP;
  // meta semanal proporcional ao período (ex.: 5 h por semana → 10 h em duas semanas)
  const metaP = meta ? (meta * periodo.dias) / 7 : 0;

  // barras do período: por dia (até ~1 mês), por semana (até ~6 meses) ou por mês
  const barras = useMemo(() => {
    const ini = parseDay(de), fim = parseDay(ate);
    const dias = periodo.dias;
    const grupos: { a: Date; z: Date; rotulo: string; detalhe: string }[] = [];
    if (dias <= 35) {
      for (let d = ini; d <= fim; d = addDays(d, 1))
        grupos.push({ a: d, z: d, rotulo: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), detalhe: d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }) });
    } else if (dias <= 190) {
      for (let w = weekStart(ini); w <= fim; w = addDays(w, 7))
        grupos.push({ a: w < ini ? ini : w, z: addDays(w, 6) > fim ? fim : addDays(w, 6), rotulo: w.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), detalhe: `semana de ${w.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}` });
    } else {
      for (let m = new Date(ini.getFullYear(), ini.getMonth(), 1); m <= fim; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
        const z = new Date(m.getFullYear(), m.getMonth() + 1, 0);
        grupos.push({ a: m < ini ? ini : m, z: z > fim ? fim : z, rotulo: m.toLocaleDateString("pt-BR", { month: "short" }), detalhe: m.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) });
      }
    }
    return grupos.map((g) => {
      const a = dayKey(g.a), z = dayKey(g.z);
      const t = soma(noP(minhasSessoes, a, z), (s) => s.seconds), k = soma(noP(meusDias, a, z), (d) => d.segundos);
      const mar = soma(noP(sessoesMar, a, z), (s) => s.seconds);
      const partes = [mar ? `MAR ${fmtDuration(mar)}` : null, k ? `Anki ${fmtDuration(k)}` : null].filter(Boolean).join(" · ");
      return { label: g.rotulo, detail: `${g.detalhe} · ${fmtDuration(t + k)}${partes ? ` (${partes})` : ""}`, value: Math.round((t + k) / 60), parte: Math.round(mar / 60) };
    });
  }, [minhasSessoes, sessoesMar, meusDias, de, ate, periodo.dias]); // eslint-disable-line react-hooks/exhaustive-deps
  const porQue = periodo.dias <= 35 ? "dia" : periodo.dias <= 190 ? "semana" : "mês";

  const ondeFoi = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of minhasSessoes) {
      if (s.day < de || s.day > ate || !s.seconds) continue;
      const k = ehMar(s.label, s.mar_titulo_id) ? "MAR" : s.label.startsWith("Lição") ? "Lições" : s.label.startsWith("Anki") ? "Anki" : s.label.startsWith("Listening") ? "Listening" : s.label || "Timer";
      m.set(k, (m.get(k) ?? 0) + s.seconds);
    }
    const anki = soma(meusDias.filter((d) => d.day >= de && d.day <= ate), (d) => d.segundos);
    if (anki) m.set("Anki", (m.get("Anki") ?? 0) + anki);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [minhasSessoes, meusDias, de, ate]); // eslint-disable-line react-hooks/exhaustive-deps


  const temAnki = !!sel?.anki_baralhos.length;
  const linhaMar = useRef<HTMLDivElement>(null);
  const alturaMar = useAlturaQueSobra(linhaMar, !!sel);
  const maxOnde = Math.max(1, ...ondeFoi.map(([, v]) => v));
  const totalOnde = ondeFoi.reduce((a, [, v]) => a + v, 0);

  return (
    <Page
      denso
      title="Idiomas"
      subtitle="Cada idioma com o seu tempo, as suas revisões e os seus cartões do Anki."
      // no topo, só o período; os botões de cada idioma ficam junto dos idiomas
      actions={
        <>
          <FiltroPeriodo periodo={periodo} onMudar={setPeriodo} />
          {langs && langs.length === 0 && <button className="btn" onClick={() => setModal("idioma")}><Plus size={15} /> Cadastrar idioma</button>}
        </>
      }
    >
      {langs && langs.length === 0 && <Empty>Cadastre os idiomas que você estuda: cada um ganha a sua seção, com o tempo e os baralhos do Anki dele.</Empty>}

      {/* com um idioma só, o "+ Idioma" vai para a linha do idioma (sobra altura para o resto caber na tela) */}
      {langs && langs.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {langs.length > 1 && langs.map((l) => (
            <button key={l.id} onClick={() => setSelId(l.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${l.id === selId ? "border-ink font-medium" : "border-line text-muted hover:text-ink"}`}>
              <Bandeira codigo={l.bandeira} tamanho={14} /> {l.name}
            </button>
          ))}
          <button onClick={() => setModal("idioma")} title="Cadastrar idioma"
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-3 py-1.5 text-sm text-muted hover:text-ink hover:border-ink">
            <Plus size={14} /> Idioma
          </button>
        </div>
      )}

      {sel && (
        // um só ritmo vertical entre os blocos (o mesmo vão das grades)
        <div className="flex flex-col gap-3 md:gap-4">
          {/* o idioma, as ações dele e a linha do AnkiWeb */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 -mb-1">
            <Bandeira codigo={sel.bandeira} tamanho={22} />
            <h2 className="text-lg font-medium">{sel.name}</h2>
            <div className="flex items-center gap-1">
              <button className="btn btn-ghost text-xs py-1 px-2" onClick={() => setModal("tempo")}><Clock size={14} /> Registrar tempo</button>
              <button className="btn btn-ghost text-xs py-1 px-2" onClick={() => setModal({ edit: sel })}><Settings2 size={14} /> Configurar</button>
              {langs?.length === 1 && (
                <button className="btn btn-ghost text-xs py-1 px-2" onClick={() => setModal("idioma")} title="Cadastrar outro idioma"><Plus size={14} /> Idioma</button>
              )}
            </div>
            {conta && <div className="w-full sm:w-auto sm:ml-auto"><AnkiWebBarra conta={conta} onMudou={load} /></div>}
          </div>

          {/* celular: 2 por linha (o último ocupa a linha); tablet: 2 + 3; computador: os 5 numa linha */}
          <div className="grid grid-cols-2 md:grid-cols-6 xl:grid-cols-5 gap-3 md:gap-4">
            <Stat compacto className="md:col-span-3 xl:col-span-1" label="Tempo" value={fmtDuration(timerP + ankiP)} hint={<Variacao atual={timerP + ankiP} base={timerA + ankiA} vs={periodo.vs} />}
              explica={`${periodo.nome}: ${[
                escutaP ? `Listening ${fmtDuration(escutaP)}` : null, aulasP ? `Aulas ${fmtDuration(aulasP)}` : null,
                ankiP ? `Anki ${fmtDuration(ankiP)}` : null, marP ? `MAR ${fmtDuration(marP)}` : null,
                restoTimerP > 0 ? `Timer ${fmtDuration(restoTimerP)}` : null,
                metaP ? `meta ${fmtDuration(metaP)} (${Math.round(Math.min(1, (timerP + ankiP) / metaP) * 100)}%)` : null,
                `período anterior ${fmtDuration(timerA + ankiA)}`].filter(Boolean).join(" · ")}`} />
            <Stat compacto className="md:col-span-3 xl:col-span-1" label="Para revisar hoje" value={baralhos ? nf.format(paraHoje) : "—"} hint={baralhos ? "fila de hoje no Anki" : "conecte o AnkiWeb (no fim da página)"}
              explica="O que o Anki mostra para revisar hoje nos baralhos deste idioma (não depende do período)." />
            <Stat compacto className="md:col-span-2 xl:col-span-1" label="Listening" value={fmtDuration(escutaP)} hint={<Variacao atual={escutaP} base={escutaA} vs={periodo.vs} />}
              explica={`Áudios do curso (script) — ${periodo.nome.toLowerCase()}. Período anterior: ${fmtDuration(escutaA)}.`} />
            <Stat compacto className="md:col-span-2 xl:col-span-1" label="Revisões" value={nf.format(revP)} hint={<Variacao atual={revP} base={revA} vs={periodo.vs} />}
              explica={`Revisões no Anki nos baralhos deste idioma — ${periodo.nome.toLowerCase()}. Período anterior: ${nf.format(revA)}.`} />
            <Stat compacto className="col-span-2 xl:col-span-1" label="Cartões criados" value={nf.format(criadosP)} hint={<Variacao atual={criadosP} base={criadosA} vs={periodo.vs} />}
              explica={`Cartões criados — ${periodo.nome.toLowerCase()}${notasP && notasP !== criadosP ? `, em ${nf.format(notasP)} notas` : ""}. Período anterior: ${nf.format(criadosA)}.`} />
          </div>

          {!temAnki && (
            <p className="text-sm text-muted -mt-1">
              Nenhum baralho do Anki ligado a {sel.name}. <button className="underline underline-offset-2 hover:text-ink" onClick={() => setModal({ edit: sel })}>Escolher os baralhos</button>
              {conta === null && <> · antes, conecte o AnkiWeb (abaixo)</>}.
            </p>
          )}

          {/* linha do tempo: minutos, Anki e onde foi o tempo — os cartões da linha têm a mesma altura */}
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 ${temAnki ? "xl:grid-cols-3" : ""}`}>
            <section className={`card p-4 min-w-0 flex flex-col ${temAnki ? "md:col-span-2 xl:col-span-1" : ""}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 mb-2">
                <h3 className="font-medium">Minutos por {porQue}</h3>
                <span className="text-xs text-muted">
                  {periodo.nome.toLowerCase()} · Timer + Anki · <span className="whitespace-nowrap" title="A parte de cada barra que foi MAR (séries, filmes, vídeos)"><span style={{ color: COR_MAR }}>■</span> MAR</span>
                </span>
              </div>
              <GraficoQueOcupa>{(h) => <BarChart data={barras} unit="min" height={h} alturaExata />}</GraficoQueOcupa>
            </section>
            {temAnki && (
              <section className="card p-4 min-w-0 flex flex-col">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <h3 className="font-medium">Anki</h3>
                  <div className="inline-flex rounded-lg bg-surface-2 p-0.5 text-xs">
                    {([["revisoes", "Revisões"], ["criados", "Cartões criados"]] as const).map(([k, l]) => (
                      <button key={k} onClick={() => setVerAnki(k)}
                        className={`px-2.5 py-1 rounded-md ${verAnki === k ? "bg-seg shadow-sm font-medium" : "text-muted"}`}>{l}</button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 flex flex-col justify-center min-w-0">
                  {verAnki === "revisoes"
                    ? <Heatmap data={revisoes} metric="anki" weeks={semanasDoPeriodo(periodo)} end={parseDay(ate)} inicio={de} fim={ate} />
                    : <Heatmap data={criados} metric="anki" unidade="cartões criados" paleta="ama" weeks={semanasDoPeriodo(periodo)} end={parseDay(ate)} inicio={de} fim={ate} />}
                </div>
              </section>
            )}
            <section className="card p-4 min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 mb-3">
                <h3 className="font-medium">Onde foi o tempo</h3>
                <span className="text-xs text-muted">{periodo.nome.toLowerCase()}</span>
              </div>
              {ondeFoi.length === 0 ? (
                <p className="text-sm text-muted">Nada ainda. Use o Timer (categoria Idiomas → {sel.name}) ou “Registrar tempo”.</p>
              ) : (
                // o mesmo desenho do "Onde está indo seu tempo" do Dashboard: nome e valor numa linha, barra embaixo
                <ul className="space-y-1.5 text-sm">
                  {ondeFoi.map(([k, v]) => (
                    <li key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5">
                      <span className="truncate" title={k}>{k}</span>
                      <span className="tabular-nums text-right whitespace-nowrap flex items-baseline justify-end">
                        <span className="font-medium">{fmtDuration(v)}</span>
                        <span className="text-xs text-muted ml-1.5 w-8 inline-block">{Math.round((v / totalOnde) * 100)}%</span>
                      </span>
                      <span className="col-span-2 h-1 rounded-full bg-surface-2 overflow-hidden">
                        <span className="block h-full rounded-full" style={{ width: `${(v / maxOnde) * 100}%`, background: k === "MAR" ? COR_MAR : "var(--chart)" }} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* MAR (o mais rico, na coluna larga) e os baralhos, lado a lado e da mesma altura */}
          {/* altura fixa só no computador grande: a lista do MAR e a dos baralhos rolam por dentro, e a página cabe na tela */}
          <div ref={linhaMar} className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-3 md:gap-4 xl:h-[23rem]"
            style={alturaMar ? { height: alturaMar } : undefined}>
            {/* MAR: inglês de verdade (filmes, séries, canais, podcasts) */}
            <MarPainel idioma={sel.name} periodo={periodo} compacto className={tabela.length ? "" : "xl:col-span-2"}
              sessoesMar={sessoesMar} sessoesIdioma={minhasSessoes} meta={sel.mar_meta_min} inicio={sel.mar_inicio}
              onTempo={onTempo} onConfigurar={() => setModal({ edit: sel })} />

            {tabela.length > 0 && (
              <section className="card p-4 min-w-0 flex flex-col min-h-0">
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <h3 className="font-medium flex items-center gap-1.5"><Layers size={15} className="text-icon" /> Baralhos</h3>
                  <span className="text-xs text-muted tabular-nums">{nf.format(paraHoje)} para revisar hoje</span>
                </div>
                {/* cada baralho: o nome inteiro, o que há para revisar hoje e, embaixo, novos e total */}
                <ul className="divide-y divide-line -mx-1 xl:flex-1 xl:min-h-0 xl:overflow-y-auto">
                  {tabela.map((d) => {
                    const nivel = d.nome.split("::").length - 1;
                    const nome = d.nome.split("::").pop()!;
                    return (
                      <li key={d.nome} className="px-1 py-2 flex items-start gap-3" title={`${d.nome}: ${nf.format(d.aprendendo)} aprendendo`}
                        style={{ paddingLeft: 4 + nivel * 12 }}>
                        <div className="min-w-0 flex-1">
                          <div className={`text-sm leading-snug ${nivel ? "text-muted" : "font-medium"}`}>{nivel ? "↳ " : ""}{nome}</div>
                          <div className="text-[11px] text-faint tabular-nums mt-0.5">{nf.format(d.novos)} novos · {nf.format(d.total)} cartões</div>
                        </div>
                        <div className="text-right shrink-0 w-14">
                          <div className={`tabular-nums leading-none ${d.revisar ? "text-lg" : "text-lg text-faint"}`} style={d.revisar ? { color: "var(--accent)" } : undefined}>{nf.format(d.revisar)}</div>
                          <div className="text-[10px] text-muted mt-0.5">revisar</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {noComputador && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {tabela.filter((d) => !d.nome.includes("::")).map((d) => (
                      <Link key={d.nome} className="btn btn-primary text-xs py-1" href={`/idiomas/anki/revisar?deck=${encodeURIComponent(d.nome)}`}><Play size={12} /> Revisar {d.nome}</Link>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      )}

      {conta === null && (
        <div className="mt-4"><Conectar onConectado={async () => { await load(); }} /></div>
      )}
      {/* configurações: etiquetas pequenas numa linha só (abrem em largura total) */}
      <div className="flex flex-wrap items-center gap-2 mt-3 md:mt-4">
        {sel && <ListeningPainel idioma={sel.name} pequeno className="!rounded-full open:!rounded-xl open:basis-full" />}
        <AnkiNoComputador conectado={noComputador} setConectado={setNoComputador} pequeno className="!rounded-full open:!rounded-xl open:basis-full" />
        {conta && (
          <span className="text-xs text-faint ml-auto">
            AnkiWeb: {conta.usuario} ·{" "}
            <button className="underline underline-offset-2 hover:text-ink" onClick={async () => {
              if (!confirm("Desligar o AnkiWeb deste sistema? O histórico que já está aqui continua.")) return;
              const { ankiWeb } = await import("@/lib/anki");
              await ankiWeb("sair").catch(() => {});
              await load();
            }}>desligar</button>
          </span>
        )}
      </div>

      {(modal === "idioma" || (modal && typeof modal === "object")) && (
        <LanguageModal edit={typeof modal === "object" ? modal.edit : null} existing={(langs ?? []).map((l) => l.name)}
          // baralhos vazios (0 cartões) não aparecem para escolher, a não ser que já estejam ligados
          baralhos={(baralhos ?? []).filter((b) => !b.nome.includes("::") && (b.total > 0 || (langs ?? []).some((l) => l.anki_baralhos.includes(b.nome))))}
          usados={new Map((langs ?? []).flatMap((l) => l.anki_baralhos.map((b) => [b, l.name] as [string, string])))}
          onClose={() => setModal(null)} onSaved={(id) => { setModal(null); if (id) setSelId(id); void load(); }} />
      )}
      {modal === "tempo" && (
        <TimeModal langs={(langs ?? []).map((l) => l.name)} defaultLang={sel?.name ?? langs?.[0]?.name ?? ""}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} />
      )}
    </Page>
  );
}

/**
 * Computador (xl): a linha MAR | Baralhos fica com a altura que sobra na tela, para a página caber sem rolar
 * (o filtro Mês ou Ano deixa o calendário do Anki mais alto e empurraria o resto). Mínimo de 18rem; as listas
 * rolam por dentro. Abaixo do xl, nada fixo (a página rola). Antes de medir, vale o xl:h-[23rem] da classe.
 */
function useAlturaQueSobra(ref: React.RefObject<HTMLDivElement | null>, ativo: boolean): number | null {
  const [h, setH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!ativo || !el) return;
    const pagina = (el.closest(".mx-auto") as HTMLElement | null) ?? el.parentElement!;
    const calc = () => {
      if (window.innerWidth < 1280) { setH(null); return; }
      const r = el.getBoundingClientRect(), pg = pagina.getBoundingClientRect();
      const abaixo = pg.bottom - r.bottom; // etiquetas e o espaço do fim da página
      const livre = Math.floor(window.innerHeight - (r.top + window.scrollY) - abaixo);
      setH(Math.max(288, Math.min(640, livre)));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(pagina);
    window.addEventListener("resize", calc);
    return () => { ro.disconnect(); window.removeEventListener("resize", calc); };
  }, [ref, ativo]);
  return h;
}

/**
 * O gráfico ocupa a altura que sobra no cartão (a linha tem a altura do vizinho mais alto, como o calendário do mês).
 * O gráfico fica por cima (absoluto), então não empurra a altura da linha: sem crescer em laço.
 */
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
  // 22 px ficam para as datas embaixo das barras e 10 px de folga para o rótulo do topo não encostar no título
  const altura = Math.max(minimo, h - 32);
  return (
    <div ref={ref} className="relative flex-1 min-w-0" style={{ minHeight: minimo + 32 }}>
      <div className="absolute inset-x-0 bottom-0">{children(altura)}</div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-medium">{title}</h2>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LanguageModal({ edit, existing, baralhos, usados, onClose, onSaved }: {
  edit: Language | null; existing: string[]; baralhos: BaralhoAnki[]; usados: Map<string, string>;
  onClose: () => void; onSaved: (id: string | null) => void;
}) {
  const [name, setName] = useState(edit?.name ?? "");
  const [goalH, setGoalH] = useState(edit?.weekly_goal_min ? String(edit.weekly_goal_min / 60) : "");
  const [bandeira, setBandeira] = useState<string | null>(edit?.bandeira ?? null);
  const [decks, setDecks] = useState<string[]>(edit?.anki_baralhos ?? []);
  const [marMeta, setMarMeta] = useState(String(edit?.mar_meta_min ?? 60));
  const [marInicio, setMarInicio] = useState(edit?.mar_inicio ?? "");
  const [tocouBandeira, setTocouBandeira] = useState(!!edit?.bandeira);
  const [tocouDecks, setTocouDecks] = useState(!!edit);
  const [err, setErr] = useState<string | null>(null);

  // idioma novo: sugere a bandeira e os baralhos pelo nome (dá para mudar)
  useEffect(() => {
    if (!tocouBandeira) setBandeira(bandeiraDoIdioma(name));
    if (!tocouDecks) setDecks(palpiteDeBaralhos(name, baralhos.map((b) => b.nome)).filter((b) => !usados.has(b)));
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const weekly_goal_min = goalH ? Math.round(Number(goalH.replace(",", ".")) * 60) : null;
    const meta = Math.round(Number(marMeta.replace(",", ".")));
    if (!Number.isFinite(meta) || meta < 0 || meta > 600) return setErr("A meta do MAR vai de 0 a 600 minutos por dia (0 = sem meta).");
    const campos = { name: n, weekly_goal_min, bandeira, anki_baralhos: decks, mar_meta_min: meta, mar_inicio: marInicio || null };
    const sb = supabase();
    const { data, error } = edit
      ? await sb.from("languages").update(campos).eq("id", edit.id).select("id").single()
      : await sb.from("languages").insert({ ...campos, position: existing.length }).select("id").single();
    if (error) return setErr(error.code === "23505" ? "Esse idioma já está cadastrado." : error.message);
    if (edit && n !== edit.name) {
      // o tempo e a lista do MAR vão junto com o nome novo
      await Promise.all([
        sb.from("study_sessions").update({ language: n }).eq("language", edit.name),
        sb.from("mar_titulos").update({ idioma: n }).eq("idioma", edit.name),
      ]);
    }
    onSaved((data as { id: string }).id);
  }

  async function remove() {
    if (!edit || !confirm(`Remover “${edit.name}”? O tempo já registrado continua salvo, e os baralhos continuam no seu Anki.`)) return;
    await supabase().from("languages").delete().eq("id", edit.id);
    onSaved(null);
  }

  return (
    <Modal title={edit ? `Configurar ${edit.name}` : "Cadastrar idioma"} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <label className="block space-y-1">
          <span className="label">Idioma</span>
          <input className="input" list="sugestoes-idiomas" required autoFocus={!edit} value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Inglês" />
          <datalist id="sugestoes-idiomas">{SUGESTOES.filter((s) => !existing.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <div>
          <span className="label">Bandeira</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {BANDEIRAS.map((b) => (
              <button key={b.id} type="button" title={b.nome} onClick={() => { setBandeira(b.id); setTocouBandeira(true); }}
                className={`rounded-md p-1.5 border ${bandeira === b.id ? "border-ink bg-surface-2" : "border-transparent hover:border-line"}`}>
                <Bandeira codigo={b.id} tamanho={16} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Baralhos do Anki deste idioma</span>
          {baralhos.length === 0 ? (
            <p className="text-xs text-muted mt-1">Conecte o AnkiWeb na aba Anki para escolher os baralhos.</p>
          ) : (
            <div className="mt-1.5 space-y-1">
              {baralhos.map((b) => {
                const dono = usados.get(b.nome);
                const deOutro = dono && dono !== edit?.name;
                return (
                  <label key={b.nome} className={`flex items-center justify-between gap-2 text-sm rounded-md px-2 py-1.5 hover:bg-surface-2 ${deOutro ? "opacity-50" : "cursor-pointer"}`}>
                    <span className="flex items-center gap-2">
                      <input type="checkbox" disabled={!!deOutro} checked={decks.includes(b.nome)}
                        onChange={(e) => { setTocouDecks(true); setDecks((d) => (e.target.checked ? [...d, b.nome] : d.filter((x) => x !== b.nome))); }} />
                      {b.nome}
                    </span>
                    <span className="text-xs text-muted">{deOutro ? `de ${dono}` : `${nf.format(b.total)} cartões`}</span>
                  </label>
                );
              })}
              <p className="text-xs text-faint pt-1">Os subbaralhos entram junto. Só os baralhos marcados contam neste idioma.</p>
            </div>
          )}
        </div>
        <label className="block space-y-1">
          <span className="label">Meta semanal (horas, opcional)</span>
          <input className="input" inputMode="decimal" value={goalH} onChange={(e) => setGoalH(e.target.value)} placeholder="ex.: 5" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1" title="O Mairo recomenda no mínimo 1 h de MAR por dia. 0 = sem meta.">
            <span className="label">MAR · meta por dia (min)</span>
            <input className="input tabular-nums" type="number" min={0} max={600} step={5} inputMode="numeric" value={marMeta} onChange={(e) => setMarMeta(e.target.value)} />
          </label>
          <label className="block space-y-1" title="Vazio = desde o 1º registro. O “No MAR” conta a partir desta data.">
            <span className="label">MAR · começou em</span>
            <input className="input" type="date" value={marInicio} onChange={(e) => setMarInicio(e.target.value)} />
          </label>
        </div>
        {err && <p className="text-sm text-critical">{err}</p>}
        <div className="flex justify-between gap-2 pt-1">
          {edit ? <button type="button" className="btn btn-ghost hover:text-critical" onClick={remove}><Trash2 size={14} /> Remover</button> : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary">Salvar</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function TimeModal({ langs, defaultLang, onClose, onSaved }: { langs: string[]; defaultLang: string; onClose: () => void; onSaved: () => void }) {
  const [language, setLanguage] = useState(defaultLang);
  const [day, setDay] = useState(dayKey());
  const [h, setH] = useState("");
  const [m, setM] = useState("30");
  const [onde, setOnde] = useState(ONDE[0]);
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const seconds = (Number(h || 0) * 60 + Number(m || 0)) * 60;
    if (seconds <= 0) return setErr("Informe quanto tempo você estudou.");
    setBusy(true);
    const label = nota.trim() ? `${onde} · ${nota.trim()}` : onde;
    const { error } = await supabase().from("study_sessions").insert({
      day, started_at: new Date(`${day}T12:00:00`).toISOString(), seconds, category: "Idiomas", language, label,
    });
    if (error) { setErr(error.message); setBusy(false); return; }
    onSaved();
  }

  return (
    <Modal title="Registrar tempo de idioma" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1"><span className="label">Idioma</span>
            <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {langs.map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
          <label className="space-y-1"><span className="label">Dia</span>
            <input className="input" type="date" value={day} max={dayKey()} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="space-y-1"><span className="label">Horas</span>
            <input className="input" type="number" min={0} max={23} value={h} placeholder="0" onChange={(e) => setH(e.target.value)} />
          </label>
          <label className="space-y-1"><span className="label">Minutos</span>
            <input className="input" type="number" min={0} max={59} value={m} onChange={(e) => setM(e.target.value)} />
          </label>
        </div>
        <label className="block space-y-1"><span className="label">Onde</span>
          <select className="input" value={onde} onChange={(e) => setOnde(e.target.value)}>
            {ONDE.map((o) => <option key={o}>{o}</option>)}
          </select>
          {onde === "Série / filme" && (
            <span className="block text-xs pt-1" style={{ color: COR_MAR }}>No MAR, cada episódio já soma a minutagem — não registre de novo aqui.</span>
          )}
        </label>
        <label className="block space-y-1"><span className="label">Observação (opcional)</span>
          <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="ex.: Lição 14, revisão de frases" />
        </label>
        {err && <p className="text-sm text-critical">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Salvando…" : "Registrar"}</button>
        </div>
      </form>
    </Modal>
  );
}
