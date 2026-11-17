"use client";
/**
 * Temporadas: o ano de 12 semanas no ritmo das estações. Uma tela só: a temporada, o plano por área
 * (com o seu ritmo real ao lado), as metas com a previsão e a execução de cada semana.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Page } from "@/components/page";
import { EstacaoIcone } from "@/components/estacao-icone";
import { supabase } from "@/lib/supabase/client";
import { todas } from "@/lib/supabase/todas";
import { addDays, dayKey, fmtDuration, nf, parseDay } from "@/lib/dates";
import { ppmDosLivros } from "@/lib/books";
import { faltam, ppmMedio, porOrdem, subarvore, arvoreDePastas, type PastaEstudo } from "@/lib/estudos";
import { progressoDoLivro } from "@/lib/types";
import { contaAnki } from "@/lib/anki";
import { loadLanguages } from "@/lib/languages";
import {
  AREAS, ESTACOES, NOME_UNIDADE, UNIDADES, carregarTemporadas, detalheDaSemana, diasEntre, enfase, estacaoDe, execucaoDaSemana, feitoEm, limites, nomeDaTemporada,
  rendimento, ritmoPorArea, salvarTemporada, semanasDa, tempoPorArea, unidadeDe, vizinha,
  type Area, type Estacao, type Meta, type Registros, type Temporada, type Unidade,
} from "@/lib/temporadas";
import { NovaMeta, type Livro, type AulaT, type BaralhoT } from "./nova-meta";
import { DetalheDaMeta, type ItemDaMeta } from "./detalhe-meta";

const fmtData = (k: string) => parseDay(k).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
/** Arredonda um plano para um número redondo na unidade. */
const redondo = (v: number, u: Unidade) =>
  u === "min" ? Math.round(v / 5) * 5 : u === "cartoes" ? Math.max(1, Math.round(v)) : v >= 2000 ? Math.round(v / 500) * 500 : Math.round(v / 100) * 100;
/** "11.200 palavras", "10 novos" (cartões novos do Anki), "1 h 20" */
const fmtQ = (v: number, u: Unidade, curto = false) =>
  u === "min" ? (curto ? `${Math.round(v)} min` : fmtDuration(v * 60))
    : `${nf.format(u === "cartoes" && v < 10 && v % 1 ? Math.round(v * 10) / 10 : Math.round(v))} ${u === "palavras" ? (curto ? "pal." : "palavras") : curto ? "novos" : "cartões novos"}`;
interface AnkiDia { day: string; baralho: string; reviews: number; criados: number }
const corExecucao = (v: number) => (v >= 0.85 ? "var(--good)" : v >= 0.6 ? "#c98a1a" : "var(--critical)");

export default function Temporadas() {
  const atual = estacaoDe();
  const [sel, setSel] = useState<{ estacao: Estacao; ano: number }>({ estacao: atual.estacao, ano: atual.ano });
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [reg, setReg] = useState<Registros>({ seg: new Map(), qtd: new Map(), segQ: new Map() });
  const [baralhos, setBaralhos] = useState<BaralhoT[]>([]);
  const [ankiDias, setAnkiDias] = useState<AnkiDia[]>([]);
  const [livros, setLivros] = useState<Livro[]>([]);
  const [aulas, setAulas] = useState<AulaT[]>([]);
  const [pastas, setPastas] = useState<PastaEstudo[]>([]);
  const [ppm, setPpm] = useState({ livros: 220, estudos: 220 });
  const [novaMeta, setNovaMeta] = useState(false);
  const [editando, setEditando] = useState<Meta | null>(null);
  const [semanaSel, setSemanaSel] = useState<number | null>(null);
  /** metas com a lista de livros/aulas aberta */
  /** a meta aberta no detalhamento */
  const [metaAberta, setMetaAberta] = useState<string | null>(null);
  const [idiomas, setIdiomas] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    const sb = supabase();
    const desde = dayKey(addDays(new Date(), -400));
    const [t, m, b, a, p, ak, conta, pl, pe] = await Promise.all([
      carregarTemporadas(),
      tempoPorArea(desde),
      todas<Livro>((de, ate) => sb.from("books").select("id,title,author,word_count,progress,status,format").order("title").order("id").range(de, ate)),
      todas<AulaT>((de, ate) => sb.from("notes").select("id,title,pasta_id,palavras,progresso,situacao,ordem").eq("kind", "estudo").order("id").range(de, ate)),
      sb.from("estudo_pastas").select("id,parent_id,nome,posicao"),
      todas<AnkiDia>((de, ate) => sb.from("anki_baralho_dia").select("day,baralho,reviews,criados").gte("day", desde).order("day").order("baralho").range(de, ate)).catch(() => []),
      contaAnki().catch(() => null),
      ppmDosLivros(),
      ppmMedio(),
    ]);
    setTemporadas(t.temporadas);
    setMetas(t.metas);
    setReg(m);
    setLivros(b);
    setAulas(a.sort(porOrdem));
    setPastas((p.data as PastaEstudo[]) ?? []);
    setAnkiDias(ak);
    setBaralhos((conta?.baralhos ?? []).filter((x) => !x.nome.includes("::")).map((x) => ({ nome: x.nome, total: x.total })));
    setPpm({ livros: pl || 220, estudos: pe.ppm || 220 });
    setCarregando(false);
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { void loadLanguages().then((l) => setIdiomas(l.map((x) => x.name))).catch(() => {}); }, []);

  const lim = limites(sel.estacao, sel.ano);
  const registro = temporadas.find((t) => t.estacao === sel.estacao && t.ano === sel.ano);
  const ehAtual = sel.estacao === atual.estacao && sel.ano === atual.ano;
  const hoje = dayKey();
  const futura = lim.inicio > hoje;
  const passada = lim.fim < hoje;
  // ainda não planejada: mostra como seria, com o seu ritmo atual (a partir desta semana, se for a atual)
  const t: Temporada = registro ?? {
    ano: sel.ano, estacao: sel.estacao, inicio: lim.inicio, fim: lim.fim,
    comeca_em: ehAtual ? dayKey(addDays(new Date(), -((new Date().getDay() + 6) % 7))) : lim.inicio, plano: {},
  };
  const u = (a: Area) => unidadeDe(t, a);
  const unidadesCompletas = Object.fromEntries(AREAS.map((a) => [a.id, u(a.id)])) as Record<Area, Unidade>;
  const ritmo = useMemo(() => ritmoPorArea(reg, (a) => unidadesCompletas[a]), [reg, JSON.stringify(unidadesCompletas)]); // eslint-disable-line react-hooks/exhaustive-deps
  const ritmoMin = useMemo(() => ritmoPorArea(reg), [reg]);
  const rend = useMemo(() => rendimento(reg), [reg]);
  const plano = (a: Area) => t.plano[a] ?? redondo(ritmo[a], u(a));
  const planoCompleto = Object.fromEntries(AREAS.map((a) => [a.id, plano(a.id)])) as Record<Area, number>;
  /** o plano em minutos por dia (para a ênfase e para metas de horas) */
  const planoMin = (a: Area) => (u(a) === "min" ? plano(a) : plano(a) / (rend[a] || 1));
  /** o plano em palavras (ou cartões) por dia; em minutos, convertido pelo seu ritmo de leitura */
  const planoQtd = (a: Area) => (u(a) !== "min" ? plano(a) : plano(a) * (a === "leitura" ? ppm.livros : a === "estudos" ? ppm.estudos : rend[a]));
  const { execucao, revisao } = semanasDa(t);
  const fimExecucao = execucao[execucao.length - 1]?.ate ?? t.fim;
  const desdeHoje = hoje > t.comeca_em ? hoje : t.comeca_em;
  const diasRestantes = passada ? 0 : diasEntre(desdeHoje > hoje ? desdeHoje : hoje, fimExecucao);
  const semanaAtual = execucao.findIndex((w) => hoje >= w.de && hoje <= w.ate);
  const notas = execucao.map((w) => (w.de > hoje ? null : execucaoDaSemana(reg, t, planoCompleto, w.de, w.ate > hoje ? hoje : w.ate, rend)));
  const feitas = notas.filter((n): n is number => n !== null);
  const mediaExec = feitas.length ? feitas.reduce((a, b) => a + b, 0) / feitas.length : null;
  // a semana aberta no detalhe (a atual, se nada for escolhido)
  const iSel = semanaSel !== null && semanaSel < execucao.length && notas[semanaSel] !== null ? semanaSel : semanaAtual >= 0 ? semanaAtual : notas.findLastIndex((n) => n !== null);
  const wSel = iSel >= 0 ? execucao[iSel] : null;
  const detalhe = wSel ? detalheDaSemana(reg, t, planoCompleto, wSel.de, wSel.ate > hoje ? hoje : wSel.ate, rend) : null;

  async function mudar(campos: Partial<Temporada>) {
    const novo = await salvarTemporada({
      ...t, ...campos, plano: { ...planoCompleto, ...(campos.plano ?? {}) }, unidades: { ...unidadesCompletas, ...(campos.unidades ?? {}) },
    });
    setTemporadas((l) => [...l.filter((x) => x.id !== novo.id), novo]);
  }

  // ---- previsão de cada meta: com o seu ritmo real, comparado ao que a meta pede por dia ----
  const ateHoje = hoje < t.fim ? hoje : t.fim;
  const feitoNaTemporada = (a: Area, un: Unidade = u(a)) => feitoEm(reg, a, un, t.comeca_em, ateHoje);
  /** unidade natural de cada área quando se fala de quantidade */
  const natural = (a: Area): Unidade => (a === "idiomas" ? "cartoes" : a === "pesquisa" || a === "exercicio" ? "min" : "palavras");
  const ritmoNat = useMemo(() => ritmoPorArea(reg, natural), [reg]);
  /** palavras (ou cartões) por minuto de cada área */
  const porMinuto = (a: Area) => (a === "leitura" ? ppm.livros : a === "estudos" ? ppm.estudos : rend[a] || 1);
  /** converte uma quantidade de uma unidade para outra, numa área */
  const converte = (v: number, de: Unidade, para: Unidade, a: Area) =>
    de === para ? v : de === "min" ? v * porMinuto(a) : para === "min" ? v / porMinuto(a) : v;
  const ritmoEm = (a: Area, un: Unidade) => (un === "min" ? ritmoMin[a] : converte(ritmoNat[a], natural(a), un, a));
  const planoEm = (a: Area, un: Unidade) => converte(plano(a), u(a), un, a);

  type Estado = "ok" | "risco" | "fora" | "feita";
  type Linha = { texto: string; ok: boolean; quando?: string };
  type Numero = { valor: string; rotulo: string; cor?: string };
  type Previsao = {
    linhas: Linha[]; resumo: string; estado: Estado; pct: number; mais?: number;
    /** o cartão: os números grandes, a etiqueta de situação e a linha embaixo da barra */
    numeros: Numero[]; selo: string; sub?: string;
    /** o que falta, na unidade `un`, e se entra na meta total da área */
    falta: number; un: Unidade; noTotal: boolean;
    /** para o detalhamento: os itens (livros/aulas) e o que precisa por dia × o seu ritmo */
    itens?: ItemDaMeta[]; precisaN?: number; ritmoN?: number;
  };
  const COR: Record<Estado, string> = { ok: "var(--good)", feita: "var(--good)", risco: "#c98a1a", fora: "var(--critical)" };
  const SELO: Record<Estado, string> = { ok: "no ritmo", feita: "concluída", risco: "em risco", fora: "não cabe" };
  /** número curto: 4.276 · 9,9 · 2 */
  const N = (v: number) => (!isFinite(v) ? "—" : nf.format(v > 0 && v < 10 && v % 1 ? Math.round(v * 10) / 10 : Math.round(v)));
  /** compara o que falta com o seu ritmo e com o plano: no ritmo, em risco (só seguindo o plano) ou fora do alcance */
  function avalia(a: Area, falta: number, un: Unidade, real = ritmoEm(a, un), noPlano = planoEm(a, un), nome?: string) {
    const precisa = falta <= 0.5 ? 0 : diasRestantes ? falta / diasRestantes : Infinity;
    const base = { precisa, real, noPlano };
    if (falta <= 0.5) return { ...base, estado: "feita" as Estado, texto: "concluída" };
    const q = (v: number) => (nome ? `${nf.format(Math.round(v))} ${nome}` : fmtQ(v, un, un !== "cartoes"));
    if (!isFinite(precisa)) return { ...base, estado: "fora" as Estado, texto: `a temporada acabou; faltaram ${q(falta)}` };
    if (precisa <= real) return { ...base, estado: "ok" as Estado, texto: `no seu ritmo: precisa ${q(precisa)}/dia, você faz ${q(real)}` };
    if (precisa <= noPlano) return { ...base, estado: "risco" as Estado, texto: `em risco: precisa ${q(precisa)}/dia, você faz ${q(real)} (o plano cobre)` };
    return { ...base, estado: "fora" as Estado, texto: `não cabe: precisa ${q(precisa)}/dia, você faz ${q(real)}, plano ${q(noPlano)}` };
  }
  /** itens lidos em sequência (livros ou aulas): quando termina cada um, no seu ritmo real */
  function emSequencia(a: Area, itens: { titulo: string; total: number; falta: number; feito: boolean }[]) {
    const porDia = ritmoNat[a] || planoEm(a, "palavras");
    let acum = 0;
    const linhas = itens.map((i) => {
      acum += i.falta;
      const fim = i.feito ? null : porDia > 0 ? dayKey(addDays(parseDay(desdeHoje), Math.ceil(acum / porDia) - 1)) : null;
      return { texto: i.titulo, ok: i.feito || (!!fim && fim <= fimExecucao), quando: i.feito ? "✓" : fim ? `termina ${fmtData(fim)}` : "sem ritmo ainda" };
    });
    const total = itens.reduce((n, i) => n + i.total, 0);
    return { linhas, falta: acum, pct: total ? 1 - acum / total : 0 };
  }
  /** meta de contagem: cada item feito é uma data em refs */
  function contagem(m: Meta) {
    const ini = m.created_at ? dayKey(new Date(m.created_at)) : hoje;
    const prazo = m.prazo ?? fimExecucao;
    const feitos = m.refs.length;
    const diasTot = Math.max(1, diasEntre(ini, prazo));
    const porDia = m.alvo / diasTot;
    const restantes = hoje > prazo ? 0 : diasEntre(hoje, prazo);
    const falta = Math.max(0, m.alvo - feitos);
    // até ontem o plano já pedia isto (o dia de hoje ainda está em aberto)
    const esperadoOntem = porDia * Math.max(0, diasEntre(ini, hoje) - 1);
    const esperadoHoje = porDia * diasEntre(ini, hoje);
    return { ini, prazo, feitos, porDia, restantes, falta, precisa: restantes ? falta / restantes : falta, atraso: esperadoOntem - feitos, esperadoHoje };
  }
  async function marcarContagem(m: Meta, delta: 1 | -1) {
    let refs = [...m.refs];
    if (delta > 0) refs.push(hoje);
    else { const i = refs.lastIndexOf(hoje); if (i >= 0) refs.splice(i, 1); else refs = refs.slice(0, -1); }
    setMetas((l) => l.map((x) => (x.id === m.id ? { ...x, refs } : x)));
    await supabase().from("temporada_metas").update({ refs }).eq("id", m.id!);
  }

  /** meta de contagem: um quadrado por dia, do começo ao prazo (quantos foram feitos em cada dia), com +1 e −1 */
  function reguaDaContagem(m: Meta) {
    const c = contagem(m);
    const meta = Math.ceil(c.porDia);
    const dias: string[] = [];
    for (let d = parseDay(c.ini); dayKey(d) <= c.prazo && dias.length < 60; d = addDays(d, 1)) dias.push(dayKey(d));
    const noDia = (k: string) => m.refs.filter((x) => x === k).length;
    const un = m.unidade || "itens";
    return (
      <div className="mt-2.5 flex items-center gap-3">
        <div className="flex-1 min-w-0 flex gap-[3px]">
          {dias.map((k) => {
            const n = noDia(k);
            const futuro = k > hoje;
            const cor = n >= meta ? "var(--good)" : n > 0 ? "#c98a1a" : futuro || k === hoje ? "var(--surface-2)" : "color-mix(in srgb, var(--critical) 35%, var(--surface-2))";
            return (
              <span key={k} className={`flex-1 h-5 rounded-[4px] grid place-items-center text-[10px] tabular-nums ${k === hoje ? "ring-1 ring-[var(--muted)]" : ""}`}
                style={{ background: cor, color: n >= meta ? "#fff" : "var(--muted)" }}
                title={`${fmtData(k)}: ${n} ${un}${futuro ? "" : ` (meta do dia: ${meta})`}`}>{n || ""}</span>
            );
          })}
        </div>
        {c.falta > 0 && hoje <= c.prazo && (
          <span className="flex items-center gap-1 shrink-0">
            <button className="btn btn-ghost px-1.5 py-0.5 text-xs" title="Desfazer a última" disabled={!m.refs.length} onClick={() => void marcarContagem(m, -1)}>−1</button>
            <button className="btn px-2 py-0.5 text-xs" title={`Marcar 1 ${un.replace(/s$/, "")} feita hoje`} onClick={() => void marcarContagem(m, 1)}><Plus size={12} /> 1</button>
          </span>
        )}
      </div>
    );
  }

  function previsao(m: Meta): Previsao {
    if (m.tipo === "livros" || m.tipo === "aulas" || m.tipo === "curso") {
      const a: Area = m.tipo === "livros" ? "leitura" : "estudos";
      const itens = m.tipo === "livros"
        ? m.refs.map((id) => livros.find((b) => b.id === id)).filter((b): b is Livro => !!b).map((b) => {
            const total = b.word_count ?? 0, lido = b.status === "lido";
            return { id: b.id, titulo: b.title, total, falta: lido ? 0 : total * (1 - progressoDoLivro(b)), feito: lido };
          })
        : (m.tipo === "aulas"
            ? m.refs.map((id) => aulas.find((x) => x.id === id)).filter((x): x is AulaT => !!x)
            : aulas.filter((x) => x.pasta_id && subarvore(m.refs[0] ?? "", arvoreDePastas(pastas).filhos).has(x.pasta_id))
          ).map((x) => ({ id: x.id, titulo: x.title, total: x.palavras || 0, falta: faltam(x), feito: x.situacao === "concluida" }));
      const seq = emSequencia(a, itens);
      const av = avalia(a, seq.falta, "palavras");
      const feitos = itens.filter((i) => i.feito).length;
      const nome = m.tipo === "livros" ? "lidos" : "feitas";
      const pend = seq.linhas.filter((l) => l.quando !== "✓");
      const muitas = m.tipo !== "livros" && pend.length > 3;
      return {
        linhas: muitas ? pend.slice(0, 3) : seq.linhas, mais: muitas ? pend.length - 3 : 0, pct: seq.pct, estado: av.estado,
        falta: seq.falta, un: "palavras", noTotal: true, selo: SELO[av.estado], precisaN: av.precisa, ritmoN: av.real,
        itens: itens.map((i, k) => ({ ...i, quando: seq.linhas[k]?.quando, ok: seq.linhas[k]?.ok })),
        numeros: [
          { valor: `${feitos}/${itens.length}`, rotulo: m.tipo === "livros" ? "livros lidos" : "aulas feitas" },
          { valor: N(av.precisa), rotulo: "precisa/dia", cor: COR[av.estado] },
          { valor: N(av.real), rotulo: "seu ritmo/dia" },
        ],
        sub: seq.falta > 0 ? `faltam ${nf.format(Math.round(seq.falta))} palavras` : "tudo feito",
        resumo: `${feitos} de ${itens.length} ${nome} · faltam ${nf.format(Math.round(seq.falta))} palavras · ${av.texto}`,
      };
    }
    if (m.tipo === "anki") {
      const decks = new Set(m.refs);
      const dias = ankiDias.filter((d) => decks.has(d.baralho));
      const medida = m.medida ?? "total";
      const campo = medida === "revisoes" ? "reviews" : "criados";
      const soma = (de: string, ate: string) => dias.filter((d) => d.day >= de && d.day <= ate).reduce((n, d) => n + d[campo], 0);
      const ini28 = dayKey(addDays(new Date(), -27));
      const primeiro = dias.map((d) => d.day).sort()[0] ?? hoje;
      const de = primeiro > ini28 ? primeiro : ini28;
      const ritmoDia = soma(de, hoje) / Math.max(1, diasEntre(de, hoje));
      const naTemporada = soma(t.comeca_em, ateHoje);
      const atual = medida === "total" ? baralhos.filter((b) => decks.has(b.nome)).reduce((n, b) => n + b.total, 0) : naTemporada;
      const falta = Math.max(0, m.alvo - atual);
      // o plano do Idiomas é de cartões novos: vale para "total no baralho" e "cartões novos"; revisões seguem o seu ritmo
      const av = medida === "revisoes"
        ? avalia("idiomas", falta, "cartoes", ritmoDia, ritmoDia, "revisões")
        : avalia("idiomas", falta, "cartoes", ritmoDia, planoEm("idiomas", "cartoes"));
      const nomeM = medida === "revisoes" ? "revisões" : medida === "criados" ? "cartões novos" : "cartões no baralho";
      const porDiaNome = medida === "revisoes" ? "revisões" : "novos";
      return { linhas: [], estado: av.estado, pct: m.alvo ? Math.min(1, atual / m.alvo) : 0, falta, un: "cartoes", noTotal: medida !== "revisoes",
        selo: SELO[av.estado], sub: falta > 0 ? `faltam ${nf.format(falta)} ${medida === "revisoes" ? "revisões" : "cartões"}` : "meta batida",
        precisaN: av.precisa, ritmoN: av.real,
        numeros: [
          { valor: `${N(atual)}/${N(m.alvo)}`, rotulo: nomeM },
          { valor: N(av.precisa), rotulo: "precisa/dia", cor: COR[av.estado] },
          { valor: N(av.real), rotulo: "seu ritmo/dia" },
        ],
        resumo: `${nf.format(atual)} de ${nf.format(m.alvo)} ${nomeM} · ${av.texto}` };
    }
    if (m.tipo === "contagem") {
      const c = contagem(m);
      const un = m.unidade || "itens";
      const q = (v: number) => nf.format(Math.round(v * 10) / 10);
      const estado: Estado = c.falta <= 0 ? "feita" : c.restantes === 0 ? "fora"
        : c.precisa <= c.porDia + 0.01 ? "ok" : c.precisa <= c.porDia * 1.5 ? "risco" : "fora";
      const atrasadas = Math.floor(c.atraso);
      return { linhas: [], estado, pct: m.alvo ? Math.min(1, c.feitos / m.alvo) : 0, falta: 0, un: "min", noTotal: false,
        selo: c.falta <= 0 ? "concluída" : atrasadas >= 1 ? `${atrasadas} atrasada${atrasadas > 1 ? "s" : ""}` : c.feitos > c.esperadoHoje ? "adiantado" : "em dia",
        sub: c.falta > 0 ? `faltam ${c.falta} ${un} · meta: ${N(c.porDia)} por dia até ${fmtData(c.prazo)}` : "tudo feito",
        precisaN: c.falta > 0 ? c.precisa : 0, ritmoN: c.feitos / Math.max(1, diasEntre(c.ini, hoje)),
        numeros: [
          { valor: `${c.feitos}/${m.alvo}`, rotulo: un },
          { valor: c.falta > 0 ? N(c.precisa) : "—", rotulo: "precisa/dia", cor: COR[estado] },
          { valor: String(c.restantes), rotulo: c.restantes === 1 ? "dia restante" : "dias restantes" },
        ],
        resumo: c.falta <= 0 ? `${c.feitos} de ${m.alvo} ${un} · concluída`
          : `${c.feitos} de ${m.alvo} ${un} · faltam ${c.falta} em ${c.restantes} ${c.restantes === 1 ? "dia" : "dias"} → ${q(c.precisa)}/dia`
            + (c.atraso >= 1 ? ` · ${Math.floor(c.atraso)} atrasada${Math.floor(c.atraso) > 1 ? "s" : ""}` : c.feitos > c.esperadoHoje ? " · adiantado" : " · em dia") };
    }
    if (m.tipo === "palavras") {
      const feito = feitoNaTemporada("escrita", "palavras");
      const falta = Math.max(0, m.alvo - feito);
      const av = avalia("escrita", falta, "palavras");
      return { linhas: [], estado: av.estado, pct: m.alvo ? Math.min(1, feito / m.alvo) : 0, falta, un: "palavras", noTotal: true,
        selo: SELO[av.estado], sub: falta > 0 ? `faltam ${nf.format(falta)} palavras` : "meta batida", precisaN: av.precisa, ritmoN: av.real,
        numeros: [
          { valor: `${N(feito)}/${N(m.alvo)}`, rotulo: "palavras escritas" },
          { valor: N(av.precisa), rotulo: "precisa/dia", cor: COR[av.estado] },
          { valor: N(av.real), rotulo: "seu ritmo/dia" },
        ],
        resumo: `${nf.format(feito)} de ${nf.format(m.alvo)} palavras · ${av.texto}` };
    }
    // horas numa área
    const feito = feitoNaTemporada(m.area, "min");
    const falta = Math.max(0, m.alvo * 60 - feito);
    const av = avalia(m.area, falta, "min");
    return { linhas: [], estado: av.estado, pct: m.alvo ? Math.min(1, feito / 60 / m.alvo) : 0, falta, un: "min", noTotal: true,
      selo: SELO[av.estado], sub: falta > 0 ? `faltam ${fmtDuration(falta * 60)}` : "meta batida", precisaN: av.precisa, ritmoN: av.real,
      numeros: [
        { valor: fmtDuration(feito * 60), rotulo: `de ${m.alvo} h` },
        { valor: `${N(av.precisa)} min`, rotulo: "precisa/dia", cor: COR[av.estado] },
        { valor: `${N(av.real)} min`, rotulo: "seu ritmo/dia" },
      ],
      resumo: `${fmtDuration(feito * 60)} de ${m.alvo} h · ${av.texto}` };
  }
  const minhasMetas = metas.filter((m) => registro && m.temporada_id === registro.id);
  const previsoes = new Map(minhasMetas.map((m) => [m.id!, previsao(m)]));
  // as metas de cada área, na ordem das áreas; Idiomas leva o nome do idioma quando há um só (Inglês)
  const grupos = AREAS.filter((a) => minhasMetas.some((m) => m.area === a.id)).map((a) => ({
    area: a,
    nome: a.id === "idiomas" && idiomas.length === 1 ? idiomas[0] : a.nome,
    metas: minhasMetas.filter((m) => m.area === a.id),
  }));
  // até 3 metas da temporada, mais até 2 retas curtas de contagem (ex.: 28 aulas em 14 dias)
  const retas = minhasMetas.filter((m) => m.tipo === "contagem").length;
  const grandes = minhasMetas.length - retas;
  const diasDaTemporada = diasEntre(t.comeca_em, fimExecucao);
  function metaTotal(a: Area): { total: number; daMeta: boolean } {
    const feito = feitoNaTemporada(a);
    const dasMetas = minhasMetas.filter((m) => m.area === a).map((m) => previsoes.get(m.id!)!).filter((p) => p.noTotal);
    if (dasMetas.length) return { total: feito + dasMetas.reduce((n, p) => n + converte(p.falta, p.un, u(a), a), 0), daMeta: true };
    return { total: plano(a) * diasDaTemporada, daMeta: false };
  }

  return (
    <Page denso title="Temporadas" subtitle="O ano em 12 semanas, no ritmo das estações: planeje cada temporada com o seu ritmo real.">
      {/* estações: anterior · esta · seguinte */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button className="btn btn-ghost px-2" title="Temporada anterior" onClick={() => setSel(vizinha(sel.estacao, sel.ano, -1))}><ChevronLeft size={16} /></button>
        <div className="card px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 flex-1 min-w-0">
          <span className="text-lg font-medium"><EstacaoIcone estacao={sel.estacao} size={18} className="mr-1.5" />{nomeDaTemporada(sel.estacao, sel.ano)}</span>
          <span className="text-sm text-muted">{fmtData(t.inicio)} a {fmtData(t.fim)}</span>
          {ehAtual && <span className="text-xs rounded-full px-2 py-0.5 bg-accent-soft text-ink">agora</span>}
          {!passada && execucao.length > 0 && (
            <span className="text-sm text-muted">
              {semanaAtual >= 0 ? <>semana <b className="text-ink">{semanaAtual + 1}</b> de {execucao.length}</> : futura ? `${execucao.length} semanas` : "temporada encerrada"}
              {diasRestantes > 0 && ` · faltam ${diasRestantes} dias`}
              {revisao.length > 0 && ` · revisão a partir de ${fmtData(revisao[0].de)}`}
            </span>
          )}
          <label className="ml-auto text-xs text-muted flex items-center gap-1.5">começou em
            <input type="date" className="input w-auto py-0.5 text-xs" value={t.comeca_em} min={t.inicio} max={t.fim}
              onChange={(e) => e.target.value && void mudar({ comeca_em: e.target.value })} />
          </label>
        </div>
        <button className="btn btn-ghost px-2" title="Próxima temporada" onClick={() => setSel(vizinha(sel.estacao, sel.ano, 1))}><ChevronRight size={16} /></button>
      </div>

      {/* plano por área: o ritmo real, o que a meta pede por dia, o plano e o que já foi feito */}
      <section className="card px-4 py-3 min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-1">
          <h2 className="font-medium">Plano da temporada</h2>
          <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
            <span>Ritmo diário:</span>
            <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-full" style={{ background: "var(--good)" }} />seu ritmo dá conta</span>
            <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-full" style={{ background: "#c98a1a" }} />só seguindo o plano</span>
            <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-full" style={{ background: "var(--critical)" }} />nem o plano dá conta</span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-faint [&>th]:font-normal [&>th]:pt-1 [&>th]:px-3">
                <th />
                <th colSpan={4} className="text-center"><span className="block border-b border-line pb-1">por dia</span></th>
                <th colSpan={2} className="text-center !pr-0"><span className="block border-b border-line pb-1">na temporada</span></th>
              </tr>
              <tr className="text-xs text-muted [&>th]:font-normal [&>th]:py-1.5 [&>th]:px-3 [&>th]:text-right">
                <th className="!text-left !pl-0">Área</th>
                <th title="Média por dia nos últimos 28 dias">Seu ritmo</th>
                <th title="Quanto precisa por dia, daqui ao fim da temporada, para chegar à meta total">Ritmo diário</th>
                <th className="!text-center">Plano</th>
                <th title="O que já fez hoje e quanto isso é do plano do dia">Feito hoje</th>
                <th>Feito</th>
                <th className="!pr-0" title="Das metas: o que já fez + o que falta nos livros, aulas… Sem meta: o plano × os dias da temporada">Meta</th>
              </tr>
            </thead>
            <tbody>
              {AREAS.map((a) => {
                const p = plano(a.id);
                const un = u(a.id);
                const feito = feitoNaTemporada(a.id);
                const hojeFeito = feitoEm(reg, a.id, un, hoje, hoje);
                const pctHoje = p > 0 ? hojeFeito / p : null;
                const mt = metaTotal(a.id);
                const precisa = passada ? 0 : Math.max(0, mt.total - feito) / Math.max(1, diasRestantes);
                const corPrecisa = precisa <= 0 ? "var(--muted)" : precisa <= ritmo[a.id] ? "var(--good)" : precisa <= p ? "#c98a1a" : "var(--critical)";
                const vazio = p === 0 && feito < 1 && !mt.daMeta;
                // por dia: só o número (a unidade está na caixa do plano); totais em minutos viram horas
                const dia = (v: number) => (v >= 0.5 ? nf.format(un === "cartoes" && v < 10 && v % 1 ? Math.round(v * 10) / 10 : Math.round(v)) : "—");
                const tot = (v: number) => (v < 1 ? "—" : un === "min" ? fmtDuration(v * 60) : nf.format(Math.round(v)));
                return (
                  <tr key={a.id} className={`border-t border-line tabular-nums [&>td]:py-1 [&>td]:px-3 [&>td]:text-right [&>td]:whitespace-nowrap ${vazio ? "text-faint" : ""}`}>
                    <td className="!text-left !pl-0"><span className="inline-block w-2 h-2 rounded-full mr-2 align-middle" style={{ background: a.cor }} /><span className={vazio ? "" : "text-ink"}>{a.nome}</span>
                      <span className="ml-1.5 text-xs text-faint">{un === "palavras" ? "palavras" : un === "cartoes" ? "cartões novos" : "minutos"}</span></td>
                    <td className="text-muted" title={un === "min" ? undefined : `≈ ${Math.round(ritmoMin[a.id])} min/dia`}>{dia(ritmo[a.id])}</td>
                    <td style={{ color: corPrecisa }}
                      title={precisa > 0 ? (precisa <= ritmo[a.id] ? "Seu ritmo dá conta" : precisa <= p ? "Seu ritmo não dá conta; seguindo o plano, dá" : "Nem o plano dá conta: aumente o plano ou reveja a meta") : undefined}>
                      {precisa > 0 ? dia(precisa) : "—"}
                    </td>
                    <td className="!text-center">
                      <span className="inline-flex items-center rounded-lg border border-line bg-surface focus-within:border-ink/40">
                        <input type="number" min={0} step={un === "palavras" ? 500 : un === "cartoes" ? 1 : 5} aria-label={`Plano de ${a.nome} (${NOME_UNIDADE[un]}/dia)`}
                          className="w-[4.6rem] bg-transparent py-0.5 pl-2 text-right tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" value={p}
                          onChange={(ev) => void mudar({ plano: { ...t.plano, [a.id]: Math.max(0, Number(ev.target.value) || 0) } })} />
                        {UNIDADES[a.id].length > 1 ? (
                          <select aria-label={`Unidade de ${a.nome}`} className="w-[3.9rem] bg-transparent pl-1.5 pr-1 py-0.5 text-xs text-muted hover:text-ink outline-none cursor-pointer" value={un}
                            title="Mudar a unidade (o plano é convertido pelo seu ritmo)"
                            onChange={(ev) => {
                              const nova = ev.target.value as Unidade;
                              const emMin = un === "min" ? p : p / (rend[a.id] || 1);
                              const v = nova === "min" ? emMin : emMin * (rend[a.id] || 1);
                              const valor = nova === "min" ? Math.round(v) : nova === "cartoes" ? Math.round(v) : Math.round(v / 100) * 100;
                              void mudar({ plano: { ...t.plano, [a.id]: valor }, unidades: { ...unidadesCompletas, [a.id]: nova } });
                            }}>
                            {UNIDADES[a.id].map((x) => <option key={x} value={x}>{x === "palavras" ? "pal." : x === "cartoes" ? "novos" : "min"}</option>)}
                          </select>
                        ) : <span className="w-[3.9rem] pl-2.5 text-left text-xs text-muted">min</span>}
                      </span>
                    </td>
                    <td>
                      {pctHoje === null ? "—" : (
                        <>
                          {hojeFeito >= 0.5 && <span className={vazio ? "" : "text-ink"}>{dia(hojeFeito)}</span>}
                          <span className="ml-2 inline-block min-w-[2.6rem] rounded-full px-1.5 py-px text-[11px] text-center"
                            style={{ background: pctHoje >= 1 ? "color-mix(in srgb, var(--good) 18%, transparent)" : "var(--surface-2)", color: pctHoje >= 1 ? "var(--good)" : "var(--muted)" }}>
                            {Math.round(pctHoje * 100)}%
                          </span>
                        </>
                      )}
                    </td>
                    <td className={vazio ? "" : "text-ink"}>{tot(feito)}</td>
                    <td className="!pr-0" style={{ color: mt.daMeta ? undefined : "var(--muted)" }}
                      title={mt.daMeta ? "Vem das metas desta área" : "Sem meta nesta área: o plano × os dias da temporada"}>
                      {tot(mt.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-faint mt-2">
          {registro ? "O plano é salvo ao mudar." : "Ainda não planejada: os números são o seu ritmo atual. Mude qualquer valor para guardar o plano."}
          {" "}Cada linha está na unidade da área (ao lado do nome); cartões novos são os criados no Anki.
        </p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-3 md:gap-4 mt-3">
        {/* metas com previsão */}
        <section className="card p-4 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium">Metas <span className="text-xs text-muted font-normal">· 1 a 3 por temporada</span></h2>
            {(grandes < 3 || retas < 2) && !passada && (
              <button className="btn text-xs py-1" onClick={async () => { if (!registro) await mudar({}); setNovaMeta(true); }}><Plus size={13} /> Meta</button>
            )}
          </div>
          {minhasMetas.length === 0 ? (
            <p className="text-sm text-muted">
              {carregando ? "…" : "Escolha o que esta temporada precisa entregar: livros para ler, aulas para fazer, um baralho do Anki, palavras para escrever ou horas numa área. O sistema projeta com o seu plano e diz se cabe."}
            </p>
          ) : (
            // agrupadas por área: Leitura, Estudos, Inglês…
            <div className="grid grid-cols-1 gap-3 items-start md:[grid-template-columns:var(--cols)]"
              style={{ ["--cols" as string]: `repeat(${grupos.length}, minmax(0, 1fr))` }}>
            {grupos.map((g) => (
            <div key={g.area.id} className="min-w-0">
              <h3 className="text-[11px] uppercase tracking-wider text-muted mb-1.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: g.area.cor }} />{g.nome}
              </h3>
            <ul className="space-y-3">
              {g.metas.map((m) => {
                const p = previsoes.get(m.id!)!;
                const area = AREAS.find((a) => a.id === m.area)!;
                return (
                  <li key={m.id} className="group rounded-xl border border-line px-3.5 py-2.5 cursor-pointer hover:border-[var(--muted)] transition-colors"
                    title="Ver o detalhamento" onClick={(e) => { if (!(e.target as HTMLElement).closest("button,input,a")) setMetaAberta(m.id!); }}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate flex-1 min-w-0">{m.titulo}</span>
                      <span className="text-[11px] font-medium rounded-full px-2 py-0.5 shrink-0 whitespace-nowrap"
                        style={{ color: COR[p.estado], background: `color-mix(in srgb, ${COR[p.estado]} 14%, transparent)` }}>{p.selo}</span>
                      <span className="flex sm:hidden sm:group-hover:flex sm:group-focus-within:flex items-center gap-1.5 shrink-0">
                        <button className="text-faint hover:text-ink" title="Editar a meta" onClick={() => setEditando(m)}><Pencil size={13} /></button>
                        <button className="text-faint hover:text-critical" title="Apagar a meta" onClick={async () => {
                          if (!confirm(`Apagar a meta “${m.titulo}”?`)) return;
                          await supabase().from("temporada_metas").delete().eq("id", m.id!);
                          setMetas((l) => l.filter((x) => x.id !== m.id));
                        }}><Trash2 size={13} /></button>
                      </span>
                    </div>
                    {/* os números, como nos outros indicadores */}
                    <div className="grid grid-cols-3 gap-2 mt-2.5" title={p.resumo}>
                      {p.numeros.map((n, i) => (
                        <div key={i} className="min-w-0">
                          <div className="text-xl font-medium tabular-nums leading-none truncate" style={{ color: n.cor }}>{n.valor}</div>
                          <div className="text-[11px] text-muted mt-1 leading-tight">{n.rotulo}</div>
                        </div>
                      ))}
                    </div>
                    {m.tipo === "contagem" ? reguaDaContagem(m) : (
                      <div className="mt-2.5 h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${p.pct * 100}%`, background: area.cor }} /></div>
                    )}
                    <div className="mt-1 flex justify-between gap-2 text-[11px] text-muted tabular-nums">
                      <span className="truncate">
                        {p.sub}
                        <button className="ml-1.5 hover:text-ink underline-offset-2 hover:underline" onClick={() => setMetaAberta(m.id!)}>· detalhes ›</button>
                      </span>
                      <span>{Math.round(p.pct * 100)}%</span>
                    </div>


                  </li>
                );
              })}
            </ul>
            </div>
            ))}
            </div>
          )}
        </section>

      {/* execução semanal (o placar do método das 12 semanas) */}
      <section className="card p-4 min-w-0 flex flex-col">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 mb-3">
          <h2 className="font-medium">Execução semanal</h2>
          <span className="text-xs text-muted">
            o plano de cada área × os dias da semana · 85% ou mais é bem executada
            {mediaExec !== null && <> · média <b style={{ color: corExecucao(mediaExec) }}>{Math.round(mediaExec * 100)}%</b></>}
          </span>
        </div>
        <div className="flex items-end gap-1.5">
          {execucao.map((w, i) => {
            const n = notas[i];
            const sel = i === iSel;
            return (
              <button key={w.de} type="button" disabled={n === null} onClick={() => setSemanaSel(i)}
                className={`flex-1 min-w-0 flex flex-col items-center gap-1 rounded-md pt-0.5 ${n === null ? "cursor-default" : "hover:bg-surface-2/60"}`}
                title={`Semana ${i + 1} (${fmtData(w.de)} a ${fmtData(w.ate)})${n !== null ? `: ${Math.round(n * 100)}% · clique para ver por área` : ""}`}>
                <span className="text-[10px] tabular-nums text-muted">{n !== null ? `${Math.round(n * 100)}%` : ""}</span>
                <div className={`w-full rounded-md bg-surface-2 relative overflow-hidden ${sel ? "ring-2 ring-offset-1 ring-offset-[var(--surface)]" : ""}`}
                  style={{ height: 44, ...(sel ? { ["--tw-ring-color" as string]: "var(--muted)" } : {}) }}>
                  {n !== null && <div className="absolute bottom-0 left-0 right-0" style={{ height: `${Math.max(4, n * 100)}%`, background: corExecucao(n), opacity: i === semanaAtual ? 0.75 : 1 }} />}
                </div>
                <span className={`text-[10px] tabular-nums ${sel ? "text-ink font-medium" : "text-faint"}`}>S{i + 1}</span>
              </button>
            );
          })}
        </div>

        {/* o detalhe da semana: onde está dando certo e onde está dando errado */}
        {detalhe && wSel && (
          <div className="mt-3 pt-3 border-t border-line">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs mb-1.5">
              <span className="text-muted">
                Semana {iSel + 1} · {fmtData(wSel.de)} a {fmtData(wSel.ate > hoje ? hoje : wSel.ate)}{wSel.ate > hoje ? " (até hoje)" : ""}
              </span>
              {(() => {
                const pior = [...detalhe.areas].sort((a, b) => b.perde - a.perde)[0];
                return pior && pior.perde >= 0.01
                  ? <span className="text-muted">quem mais puxou para baixo: <b className="font-medium text-ink">{AREAS.find((x) => x.id === pior.area)!.nome}</b> (−{Math.round(pior.perde * 100)} pontos)</span>
                  : detalhe.areas.length ? <span style={{ color: "var(--good)" }}>todas as áreas no plano</span> : null;
              })()}
            </div>
            {detalhe.areas.length === 0 ? (
              <p className="text-xs text-muted">Sem plano nesta temporada: defina quanto por dia em cada área.</p>
            ) : (
              <ul className="space-y-1">
                {detalhe.areas.map((x) => {
                  const a = AREAS.find((y) => y.id === x.area)!;
                  const nome = x.un === "palavras" ? "pal." : x.un === "cartoes" ? "novos" : "min";
                  const n = (v: number) => (x.un === "min" ? fmtDuration(v * 60) : `${nf.format(Math.round(v))} ${nome}`);
                  return (
                    <li key={x.area} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto_2.6rem] items-center gap-x-2.5 text-xs"
                      title={`${a.nome}: feito ${n(x.feito)} de ${n(x.plano)} planejados (${detalhe.dias} ${detalhe.dias === 1 ? "dia" : "dias"} × o plano diário). Pesa ${Math.round((x.peso / detalhe.areas.reduce((s, y) => s + y.peso, 0)) * 100)}% da nota.`}>
                      <span className="truncate"><span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: a.cor }} />{a.nome}</span>
                      <span className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${x.pct * 100}%`, background: corExecucao(x.pct) }} /></span>
                      <span className="tabular-nums text-muted whitespace-nowrap">{n(x.feito)} de {n(x.plano)}</span>
                      <span className="tabular-nums text-right font-medium" style={{ color: corExecucao(x.pct) }}>{Math.round(x.pct * 100)}%</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>
      </div>

      {metaAberta && (() => {
        const m = minhasMetas.find((x) => x.id === metaAberta);
        const p = m && previsoes.get(m.id!);
        if (!m || !p) return null;
        const g = grupos.find((x) => x.area.id === m.area);
        return (
          <DetalheDaMeta meta={m} cor={g?.area.cor ?? "var(--accent)"} area={g?.nome ?? ""} comecaEm={t.comeca_em} hoje={ateHoje} ankiDias={ankiDias}
            minutosPorDia={(d) => feitoEm(reg, m.area, "min", d, d)} onClose={() => setMetaAberta(null)}
            resumo={{ numeros: p.numeros, selo: p.selo, corSelo: COR[p.estado], sub: p.sub, pct: p.pct, itens: p.itens, precisa: p.precisaN, ritmo: p.ritmoN }} />
        );
      })()}
      {editando && registro && (
        <NovaMeta temporadaId={registro.id!} livros={livros} pastas={pastas} aulas={aulas} baralhos={baralhos} posicao={editando.posicao ?? 0} editar={editando} fimPadrao={dayKey(addDays(new Date(), 13))}
          onClose={() => setEditando(null)} onSalva={(m) => { setMetas((l) => l.map((x) => (x.id === m.id ? m : x))); setEditando(null); }} />
      )}
      {novaMeta && registro && (
        <NovaMeta temporadaId={registro.id!} livros={livros} pastas={pastas} aulas={aulas} baralhos={baralhos} posicao={minhasMetas.length}
          soContagem={grandes >= 3} fimPadrao={dayKey(addDays(new Date(), 13))}
          onClose={() => setNovaMeta(false)} onSalva={(m) => { setMetas((l) => [...l, m]); setNovaMeta(false); }} />
      )}
    </Page>
  );
}
