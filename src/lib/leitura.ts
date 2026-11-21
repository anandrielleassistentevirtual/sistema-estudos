/**
 * Como medir cada leitura, pelo MOTIVO (Adler): um livro de entretenimento se mede pelo quanto avançou;
 * um de informação, pelo ritmo (ppm); um de conhecimento — denso, lido devagar — pelo DOMÍNIO:
 *  - compreensão: as etapas do roteiro de Adler cumpridas (as regras, as quatro perguntas);
 *  - diálogo: destaques e notas feitos ao longo do que já foi lido;
 *  - retenção: o que você ainda lembra, nas recordações espaçadas (1, 3, 7, 21, 60, 150 dias).
 * A recordação fica no próprio roteiro do livro (roteiro.recordar): nada novo no banco.
 */
import { addDays, dayKey, parseDay } from "./dates";
import { estagiosDe, etapaFeita, type MotivoLeitura, type NivelLeitura, type Roteiro, type Variante } from "./adler";
import { progressoDoLivro, type Book } from "./types";

export type Perfil = MotivoLeitura;

/** O motivo do livro; sem motivo escolhido, o que o nível indica (analítico → conhecimento…). */
export function perfilDe(b: Pick<Book, "motivo_leitura" | "nivel_leitura">): Perfil | null {
  if (b.motivo_leitura) return b.motivo_leitura;
  if (b.nivel_leitura === "analitica" || b.nivel_leitura === "sintopica") return "conhecimento";
  if (b.nivel_leitura === "inspecional") return "informacao";
  if (b.nivel_leitura === "elementar") return "entretenimento";
  return null;
}

export const PERFIS: Record<Perfil, { nome: string; cor: string; mede: string; explica: string }> = {
  conhecimento: {
    nome: "Conhecimento", cor: "var(--area-estudos)", mede: "domínio",
    explica: "Livros densos, lidos devagar: medidos pelo domínio (roteiro de Adler, destaques e notas, e o que você ainda lembra).",
  },
  informacao: {
    nome: "Informação", cor: "var(--area-leitura)", mede: "ritmo",
    explica: "Ler para saber: medidos pelo ritmo (palavras por minuto) e pelo quanto falta.",
  },
  entretenimento: {
    nome: "Entretenimento", cor: "var(--area-escrita)", mede: "avanço",
    explica: "Ler por prazer: só o avanço conta.",
  },
};
export const ORDEM_PERFIS: Perfil[] = ["conhecimento", "informacao", "entretenimento"];

/* ───────────── Recordação espaçada ───────────── */

export interface Recordar {
  /** degrau atual da escada de intervalos */
  nivel: number;
  /** próxima recordação (AAAA-MM-DD) */
  proxima: string;
  /** 0 = esqueci, 1 = lembrei em parte, 2 = lembrei */
  historico: { dia: string; nota: 0 | 1 | 2 }[];
}
export const INTERVALOS = [1, 3, 7, 21, 60, 150];
export const NOTAS_RECORDAR = [
  { nota: 0 as const, nome: "Esqueci", cor: "var(--critical)" },
  { nota: 1 as const, nome: "Em parte", cor: "var(--warn)" },
  { nota: 2 as const, nome: "Lembrei", cor: "var(--good)" },
];

const roteiroDe = (b: Pick<Book, "roteiro">) => ((b.roteiro ?? {}) as Roteiro & { recordar?: Recordar });

/** As perguntas que você já respondeu no roteiro: é sobre elas que se recorda (sem olhar a resposta). */
export function perguntasDe(b: Pick<Book, "nivel_leitura" | "roteiro">): { pergunta: string; resposta: string }[] {
  if (!b.nivel_leitura) return [];
  const r = roteiroDe(b);
  return estagiosDe(b.nivel_leitura, r.variante).flatMap((s) => s.etapas)
    .filter((e) => e.campo && r.campos?.[e.campo]?.trim())
    .map((e) => ({ pergunta: e.texto.replace(/^Regra \d+ · /, ""), resposta: r.campos![e.campo!].trim() }));
}

export function recordarDe(b: Pick<Book, "roteiro">): Recordar | null {
  return roteiroDe(b).recordar ?? null;
}

/** Está na hora de recordar: há respostas e a data chegou (a primeira vez, assim que houver respostas). */
export function recordarHoje(b: Pick<Book, "nivel_leitura" | "roteiro" | "status">, hoje = dayKey()): boolean {
  if (b.status === "aguardando") return false;
  if (!perguntasDe(b).length) return false;
  const r = recordarDe(b);
  return !r || r.proxima <= hoje;
}

/** Registra uma recordação: lembrou → sobe um degrau; em parte → fica; esqueceu → volta ao começo. */
export function registrar(r: Recordar | null, nota: 0 | 1 | 2, hoje = dayKey()): Recordar {
  const nivelAtual = r?.nivel ?? -1;
  const nivel = nota === 2 ? Math.min(INTERVALOS.length - 1, nivelAtual + 1) : nota === 1 ? Math.max(0, nivelAtual) : 0;
  return {
    nivel,
    proxima: dayKey(addDays(parseDay(hoje), INTERVALOS[nivel])),
    historico: [...(r?.historico ?? []), { dia: hoje, nota }].slice(-20),
  };
}

/** Retenção (0–1): a média das três últimas recordações. null = nunca recordou. */
export function retencaoDe(b: Pick<Book, "roteiro">): number | null {
  const h = recordarDe(b)?.historico ?? [];
  if (!h.length) return null;
  const ult = h.slice(-3);
  return ult.reduce((a, x) => a + x.nota, 0) / (ult.length * 2);
}

/* ───────────── Domínio (livros de conhecimento) ───────────── */

/** Uma marca (destaque ou nota) a cada 3 mil palavras lidas conta como diálogo completo com o autor. */
const PALAVRAS_POR_MARCA = 3000;

export interface Dominio {
  compreensao: number | null;
  dialogo: number | null;
  retencao: number | null;
  /** 0–1: a média ponderada do que existe (compreensão 50%, retenção 30%, diálogo 20%) */
  total: number | null;
}

export function dominioDe(b: Book, marcas: number): Dominio {
  const r = roteiroDe(b);
  let compreensao: number | null = null;
  if (b.nivel_leitura) {
    const etapas = estagiosDe(b.nivel_leitura, r.variante).flatMap((s) => s.etapas);
    compreensao = etapas.length ? etapas.filter((e) => etapaFeita(e, r)).length / etapas.length : null;
  }
  const lidas = (b.word_count ?? 0) * progressoDoLivro(b);
  const dialogo = lidas > 500 ? Math.min(1, marcas / Math.max(1, lidas / PALAVRAS_POR_MARCA)) : null;
  const retencao = retencaoDe(b);
  const partes: [number | null, number][] = [[compreensao, 0.5], [retencao, 0.3], [dialogo, 0.2]];
  const peso = partes.reduce((a, [v, p]) => a + (v === null ? 0 : p), 0);
  const total = peso ? partes.reduce((a, [v, p]) => a + (v ?? 0) * p, 0) / peso : null;
  return { compreensao, dialogo, retencao, total };
}

/** Faixas do domínio (o lado "jogo"): cada uma pede um pouco mais do método. */
export const FAIXAS = [
  { min: 0, nome: "Iniciado" },
  { min: 0.25, nome: "Aprendiz" },
  { min: 0.5, nome: "Conhecedor" },
  { min: 0.75, nome: "Mestre" },
];
export const faixaDe = (p: number) => [...FAIXAS].reverse().find((f) => p >= f.min)!;

/** Selos: um por estágio do roteiro (Estrutura, Interpretação, Crítica…) e o de memória (3 recordações seguidas). */
export function selosDe(b: Pick<Book, "nivel_leitura" | "roteiro">): { nome: string; feitas: number; total: number; ganho: boolean }[] {
  if (!b.nivel_leitura) return [];
  const r = roteiroDe(b);
  const selos = estagiosDe(b.nivel_leitura, r.variante).map((s) => {
    const feitas = s.etapas.filter((e) => etapaFeita(e, r)).length;
    return { nome: s.nome.replace(/^(Primeira|Segunda) parte · /, ""), feitas, total: s.etapas.length, ganho: feitas === s.etapas.length };
  });
  if (perguntasDe(b).length) {
    const nivel = r.recordar?.nivel ?? -1;
    selos.push({ nome: "Memória", feitas: Math.max(0, Math.min(3, nivel + 1)), total: 3, ganho: nivel >= 2 });
  }
  return selos;
}

/* ───────────── Triagem: sugerir motivo e nível pela CDD ───────────── */

export interface Sugestao { motivo: MotivoLeitura; nivel: NivelLeitura; variante?: Variante; porque: string }

/**
 * Um palpite para quem ainda não classificou: a classe da CDD diz muito sobre o livro.
 * (É só sugestão: um clique troca.)
 */
export function sugerir(codigo: string | null | undefined): Sugestao | null {
  if (!codigo) return null;
  const n = parseFloat(codigo);
  if (Number.isNaN(n)) return null;
  const c = codigo.trim();
  if (c.startsWith("920") || /^\d{3}\.92/.test(c)) return { motivo: "informacao", nivel: "inspecional", porque: "biografia" };
  if (n >= 600 && n < 700) return { motivo: "informacao", nivel: "inspecional", variante: "pratico", porque: "técnica e prática (600)" };
  if (n >= 800 && n < 900) {
    const teoria = c.startsWith("801") || c.startsWith("808") || c.startsWith("809");
    return teoria
      ? { motivo: "conhecimento", nivel: "analitica", variante: "teorico", porque: "teoria e técnica literária" }
      : { motivo: "conhecimento", nivel: "analitica", variante: "imaginativo", porque: "literatura (imaginativo)" };
  }
  if (n >= 900) return { motivo: "conhecimento", nivel: "analitica", variante: "historia", porque: "história (900)" };
  const classe = ["generalidades", "filosofia", "religião", "ciências sociais", "linguagem", "ciências", "", "artes"][Math.floor(n / 100)] ?? "";
  return { motivo: "conhecimento", nivel: "analitica", variante: "teorico", porque: classe ? `${classe} (${Math.floor(n / 100)}00)` : "obra teórica" };
}

/* ───────────── Números para mostrar ───────────── */

/** 118000 → "118 mil"; 1250000 → "1,25 mi" */
export function palavrasCurto(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString("pt-BR")} mil`;
  return String(Math.round(n));
}

/** 0.034 → "3,4%"; 0.42 → "42%" (com uma casa enquanto é pequeno, para o avanço aparecer) */
export const pct = (p: number) => `${(p * 100).toLocaleString("pt-BR", { maximumFractionDigits: p > 0 && p < 0.1 ? 1 : 0 })}%`;
