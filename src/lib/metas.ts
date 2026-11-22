"use client";
/**
 * A previsão de cada meta da Season: o que já foi feito, o que falta e se cabe — com o seu ritmo real, comparado ao que a
 * meta pede por dia. A mesma conta na página da Season e no Dashboard (os números nunca divergem).
 */
import { addDays, dayKey, fmtDuration, nf, parseDay } from "./dates";
import { faltam, subarvore, arvoreDePastas, type PastaEstudo } from "./estudos";
import { progressoDoLivro, type BookStatus } from "./types";
import { supabase } from "./supabase/client";
import { todas } from "./supabase/todas";
import { ppmDosLivros } from "./books";
import { ppmMedio, porOrdem } from "./estudos";
import { contaAnki } from "./anki";
import {
  AREAS, diasEntre, feitoEm, rendimento, ritmoPorArea, semanasDa, unidadeDe,
  type Area, type Meta, type Registros, type Temporada, type Unidade,
} from "./temporadas";

export interface Livro { id: string; title: string; author: string | null; word_count: number | null; progress: number; status: BookStatus; format: string }
export interface AulaT { id: string; title: string; pasta_id: string | null; palavras: number; progresso: number; situacao: "pendente" | "lendo" | "concluida"; ordem?: number | null }
export interface BaralhoT { nome: string; total: number }
export interface AnkiDia { day: string; baralho: string; reviews: number; criados: number }
export interface ItemDaMeta { id: string; titulo: string; total: number; falta: number; feito: boolean; quando?: string; ok?: boolean }

export const fmtData = (k: string) => parseDay(k).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
/** Arredonda um plano para um número redondo na unidade. */
export const redondo = (v: number, u: Unidade) =>
  u === "min" ? Math.round(v / 5) * 5 : u === "cartoes" ? Math.max(1, Math.round(v)) : v >= 2000 ? Math.round(v / 500) * 500 : Math.round(v / 100) * 100;
/** "11.200 palavras", "10 novos" (cartões novos do Anki), "1 h 20" */
export const fmtQ = (v: number, u: Unidade, curto = false) =>
  u === "min" ? (curto ? `${Math.round(v)} min` : fmtDuration(v * 60))
    : `${nf.format(u === "cartoes" && v < 10 && v % 1 ? Math.round(v * 10) / 10 : Math.round(v))} ${u === "palavras" ? (curto ? "pal." : "palavras") : curto ? "novos" : "cartões novos"}`;

export type Estado = "ok" | "risco" | "fora" | "feita";
export type Linha = { texto: string; ok: boolean; quando?: string };
export type Numero = { valor: string; rotulo: string; cor?: string };
export type Previsao = {
  linhas: Linha[]; resumo: string; estado: Estado; pct: number; mais?: number;
  /** o cartão: os números grandes, a etiqueta de situação e a linha embaixo da barra */
  numeros: Numero[]; selo: string; sub?: string;
  /** o que falta, na unidade `un`, e se entra na meta total da área */
  falta: number; un: Unidade; noTotal: boolean;
  /** para o detalhamento: os itens (livros/aulas) e o que precisa por dia × o seu ritmo */
  itens?: ItemDaMeta[]; precisaN?: number; ritmoN?: number;
};
export const COR_ESTADO: Record<Estado, string> = { ok: "var(--good)", feita: "var(--good)", risco: "var(--warn)", fora: "var(--critical)" };
const COR = COR_ESTADO;
const SELO: Record<Estado, string> = { ok: "no ritmo", feita: "concluída", risco: "em risco", fora: "não cabe" };

/** O que a previsão precisa saber, além da Season e dos registros. */
export interface DadosDasMetas { livros: Livro[]; aulas: AulaT[]; pastas: PastaEstudo[]; ankiDias: AnkiDia[]; baralhos: BaralhoT[]; ppm: { livros: number; estudos: number } }

/** Carrega os livros, as aulas, os baralhos e o ritmo (o que as metas usam). */
export async function carregarDadosDasMetas(desde: string): Promise<DadosDasMetas> {
  const sb = supabase();
  const [b, a, p, ak, conta, pl, pe] = await Promise.all([
    todas<Livro>((de, ate) => sb.from("books").select("id,title,author,word_count,progress,status,format").order("title").order("id").range(de, ate)),
    todas<AulaT>((de, ate) => sb.from("notes").select("id,title,pasta_id,palavras,progresso,situacao,ordem").eq("kind", "estudo").order("id").range(de, ate)),
    sb.from("estudo_pastas").select("id,parent_id,nome,posicao"),
    todas<AnkiDia>((de, ate) => sb.from("anki_baralho_dia").select("day,baralho,reviews,criados").gte("day", desde).order("day").order("baralho").range(de, ate)).catch(() => []),
    contaAnki().catch(() => null),
    ppmDosLivros(),
    ppmMedio(),
  ]);
  return {
    livros: b, aulas: a.sort(porOrdem), pastas: (p.data as PastaEstudo[]) ?? [], ankiDias: ak,
    baralhos: (conta?.baralhos ?? []).filter((x) => !x.nome.includes("::")).map((x) => ({ nome: x.nome, total: x.total })),
    ppm: { livros: pl || 220, estudos: pe.ppm || 220 },
  };
}

/** O plano de cada área: o que você escolheu; sem escolha, o seu ritmo real arredondado. */
export function planoCompletoDe(t: Temporada, reg: Registros): Record<Area, number> {
  const ritmo = ritmoPorArea(reg, (a) => unidadeDe(t, a));
  return Object.fromEntries(AREAS.map((a) => [a.id, t.plano[a.id] ?? redondo(ritmo[a.id], unidadeDe(t, a.id))])) as Record<Area, number>;
}

/** As contas das metas de uma Season. */
export function calculoDasMetas(t: Temporada, reg: Registros, planoCompleto: Record<Area, number>, d: DadosDasMetas) {
  const { livros, aulas, pastas, ankiDias, baralhos, ppm } = d;
  const hoje = dayKey();
  const u = (a: Area) => unidadeDe(t, a);
  const plano = (a: Area) => planoCompleto[a];
  const { execucao } = semanasDa(t);
  const fimExecucao = execucao[execucao.length - 1]?.ate ?? t.fim;
  const passada = t.fim < hoje;
  const desdeHoje = hoje > t.comeca_em ? hoje : t.comeca_em;
  const diasRestantes = passada ? 0 : diasEntre(desdeHoje > hoje ? desdeHoje : hoje, fimExecucao);
  const ritmoMin = ritmoPorArea(reg);
  const rend = rendimento(reg);

  const ateHoje = hoje < t.fim ? hoje : t.fim;
  const feitoNaTemporada = (a: Area, un: Unidade = u(a)) => feitoEm(reg, a, un, t.comeca_em, ateHoje);
  /** unidade natural de cada área quando se fala de quantidade */
  const natural = (a: Area): Unidade => (a === "idiomas" ? "cartoes" : a === "pesquisa" || a === "exercicio" ? "min" : "palavras");
  const ritmoNat = ritmoPorArea(reg, natural);
  /** palavras (ou cartões) por minuto de cada área */
  const porMinuto = (a: Area) => (a === "leitura" ? ppm.livros : a === "estudos" ? ppm.estudos : rend[a] || 1);
  /** converte uma quantidade de uma unidade para outra, numa área */
  const converte = (v: number, de: Unidade, para: Unidade, a: Area) =>
    de === para ? v : de === "min" ? v * porMinuto(a) : para === "min" ? v / porMinuto(a) : v;
  const ritmoEm = (a: Area, un: Unidade) => (un === "min" ? ritmoMin[a] : converte(ritmoNat[a], natural(a), un, a));
  const planoEm = (a: Area, un: Unidade) => converte(plano(a), u(a), un, a);

  /** número curto: 4.276 · 9,9 · 2 */
  const N = (v: number) => (!isFinite(v) ? "—" : nf.format(v > 0 && v < 10 && v % 1 ? Math.round(v * 10) / 10 : Math.round(v)));
  /** compara o que falta com o seu ritmo e com o plano: no ritmo, em risco (só seguindo o plano) ou fora do alcance */
  function avalia(a: Area, falta: number, un: Unidade, real = ritmoEm(a, un), noPlano = planoEm(a, un), nome?: string) {
    const precisa = falta <= 0.5 ? 0 : diasRestantes ? falta / diasRestantes : Infinity;
    const base = { precisa, real, noPlano };
    if (falta <= 0.5) return { ...base, estado: "feita" as Estado, texto: "concluída" };
    const q = (v: number) => (nome ? `${nf.format(Math.round(v))} ${nome}` : fmtQ(v, un, un !== "cartoes"));
    if (!isFinite(precisa)) return { ...base, estado: "fora" as Estado, texto: `a season acabou; faltaram ${q(falta)}` };
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

  return { previsao, contagem, converte, feitoNaTemporada, ateHoje, fimExecucao, diasRestantes, hoje };
}
