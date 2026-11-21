/**
 * Os quatro níveis de leitura de Mortimer Adler e Charles Van Doren ("Como ler livros"). São cumulativos — cada um
 * contém os anteriores:
 *  - Elementar: entender as frases (o caso de um livro em outro idioma, ou numa linguagem que ainda não domina).
 *  - Inspecional: tirar o máximo de um livro num tempo curto (pré-leitura e leitura superficial).
 *  - Analítica: a leitura lenta e completa, para entender (três estágios, quinze regras).
 *  - Sintópica: vários livros sobre o mesmo assunto, para a sua própria pergunta (pesquisa).
 * Cada etapa é um item para marcar e, quando pede, uma resposta escrita — o "roteiro" do livro.
 */

export type NivelLeitura = "elementar" | "inspecional" | "analitica" | "sintopica";
/** na leitura analítica: livro expositivo (transmite conhecimento) ou literatura imaginativa (romance, poesia, teatro) */
export type Variante = "expositivo" | "imaginativo";

export interface Etapa {
  id: string;
  texto: string;
  /** a explicação curta do que fazer */
  dica?: string;
  /** a etapa pede uma resposta escrita (o texto do campo) */
  campo?: string;
  /** a resposta é uma escolha */
  opcoes?: string[];
}
export interface Estagio { nome: string; resumo?: string; etapas: Etapa[] }
export interface Nivel { id: NivelLeitura; nome: string; curto: string; ritmo: string; pergunta: string; estagios: Estagio[] }

const ELEMENTAR: Nivel = {
  id: "elementar", nome: "Elementar", curto: "entender as frases", ritmo: "devagar · frase a frase",
  pergunta: "O que esta frase diz?",
  estagios: [
    {
      nome: "Ler", resumo: "O obstáculo é a língua: vencê-lo frase a frase.",
      etapas: [
        { id: "palavras", texto: "Anotar e procurar as palavras que não conhece", campo: "vocabulario", dica: "Uma por linha, com o sentido que tem aqui." },
        { id: "frases", texto: "Entender cada frase antes de passar à seguinte", dica: "Se uma frase resistir, destaque-a e volte depois." },
        { id: "voz", texto: "Reler em voz alta as passagens difíceis" },
      ],
    },
    {
      nome: "Conclusão",
      etapas: [
        { id: "parafrase", texto: "Dizer, com as suas palavras, o que leu", campo: "parafrase" },
        { id: "pronto", texto: "Já entende o texto sem tropeçar na língua?", opcoes: ["Sim: passar à inspecional", "Ainda não"] },
      ],
    },
  ],
};

const INSPECIONAL: Nivel = {
  id: "inspecional", nome: "Inspecional", curto: "ler por cima, com método", ritmo: "rápida · horas, não dias",
  pergunta: "Do que trata este livro? Ele merece uma leitura analítica?",
  estagios: [
    {
      nome: "Pré-leitura", resumo: "Folhear de modo sistemático, em pouco tempo.",
      etapas: [
        { id: "titulo", texto: "Ler o título e o prefácio", dica: "Repare no subtítulo e em como o autor apresenta o livro." },
        { id: "sumario", texto: "Estudar o sumário", dica: "Ele é o mapa da estrutura do livro." },
        { id: "indice", texto: "Consultar o índice remissivo", dica: "Os termos mais citados mostram os temas principais." },
        { id: "orelha", texto: "Ler a orelha e a contracapa" },
        { id: "centrais", texto: "Ler os capítulos que parecem centrais", dica: "Sobretudo os resumos no começo ou no fim deles." },
        { id: "folhear", texto: "Folhear: um parágrafo aqui, outro ali, e as últimas páginas" },
      ],
    },
    {
      nome: "Leitura superficial", resumo: "Ler do começo ao fim sem parar.",
      etapas: [
        { id: "direto", texto: "Ler de uma vez, sem parar no que não entende", dica: "Não consulte notas nem dicionário agora: o que ficar obscuro volta na leitura analítica." },
      ],
    },
    {
      nome: "Conclusão",
      etapas: [
        { id: "tipo", texto: "Que tipo de livro é?", campo: "tipo", dica: "Ficção ou expositivo? Prático ou teórico? História, ciência, filosofia…" },
        { id: "assunto", texto: "De que trata o livro como um todo?", campo: "assunto" },
        { id: "vale", texto: "Merece uma leitura analítica?", opcoes: ["Sim", "Talvez, em partes", "Não"] },
      ],
    },
  ],
};

const ANALITICA_EXPOSITIVO: Estagio[] = [
  {
    nome: "1 · Do que trata o livro", resumo: "A estrutura.",
    etapas: [
      { id: "classificar", texto: "Classificar o livro pelo tipo e pelo assunto", campo: "classificacao", dica: "Prático (o que fazer) ou teórico (o que é)? História, ciência, filosofia, ciência social…" },
      { id: "unidade", texto: "Dizer do que trata o livro inteiro, com a maior brevidade possível", campo: "unidade", dica: "Uma ou duas frases." },
      { id: "partes", texto: "Enumerar as partes principais e como elas se organizam", campo: "partes", dica: "O esboço: como cada parte desenvolve a unidade." },
      { id: "problemas", texto: "Definir os problemas que o autor procura resolver", campo: "problemas", dica: "As perguntas que ele tenta responder." },
    ],
  },
  {
    nome: "2 · Interpretar o conteúdo", resumo: "Entender o que o autor diz.",
    etapas: [
      { id: "termos", texto: "Chegar a um acordo com o autor: as palavras-chave e o que significam", campo: "termos" },
      { id: "proposicoes", texto: "Apreender as proposições principais (as frases mais importantes)", campo: "proposicoes" },
      { id: "argumentos", texto: "Conhecer os argumentos que sustentam as proposições", campo: "argumentos" },
      { id: "resolvidos", texto: "Determinar quais problemas o autor resolveu e quais não", campo: "resolvidos" },
    ],
  },
  {
    nome: "3 · Criticar", resumo: "Só depois de entender.",
    etapas: [
      { id: "entendo", texto: "Poder dizer “entendo” antes de concordar ou discordar", dica: "Não comece a criticar antes de terminar o esboço e a interpretação." },
      { id: "juizo", texto: "Concordar, discordar ou suspender o juízo", opcoes: ["Concordo", "Discordo", "Suspendo o juízo"] },
      { id: "razoes", texto: "Dar as razões (conhecimento, não opinião pessoal)", campo: "critica", dica: "Se discordar, mostre onde o autor está desinformado, mal informado, é ilógico ou deixou a análise incompleta." },
    ],
  },
];

const ANALITICA_IMAGINATIVO: Estagio[] = [
  {
    nome: "1 · A estrutura da obra",
    etapas: [
      { id: "classificar", texto: "Classificar a obra: romance, conto, poesia, teatro…", campo: "classificacao" },
      { id: "unidade", texto: "Apreender a unidade: o enredo em uma ou duas frases", campo: "unidade" },
      { id: "partes", texto: "Os episódios principais e como se encadeiam", campo: "partes" },
    ],
  },
  {
    nome: "2 · Interpretar", resumo: "Entrar no mundo da obra.",
    etapas: [
      { id: "termos", texto: "Os personagens e os acontecimentos (os “termos” da ficção)", campo: "termos" },
      { id: "proposicoes", texto: "O mundo da obra: o que é verossímil dentro dela", campo: "proposicoes" },
      { id: "argumentos", texto: "O movimento da história: de onde parte e aonde chega", campo: "argumentos" },
    ],
  },
  {
    nome: "3 · Criticar", resumo: "Só depois de apreciar.",
    etapas: [
      { id: "entendo", texto: "Apreciar a obra por inteiro antes de julgar", dica: "Deixe a obra agir sobre você; não procure argumentos nela." },
      { id: "juizo", texto: "Gostei ou não gostei?", opcoes: ["Gostei", "Não gostei", "Em parte"] },
      { id: "razoes", texto: "Por quê? O que achou belo, verdadeiro, falho", campo: "critica" },
    ],
  },
];

const SINTOPICA: Nivel = {
  id: "sintopica", nome: "Sintópica", curto: "vários livros, uma pergunta", ritmo: "pesquisa · o tema manda, não o livro",
  pergunta: "O que os autores dizem sobre a minha pergunta?",
  estagios: [
    {
      nome: "Preparar",
      etapas: [
        { id: "bibliografia", texto: "Montar a bibliografia: os livros do tema", dica: "Dê o mesmo tema a cada livro (acima). Faça uma leitura inspecional de cada um." },
      ],
    },
    {
      nome: "Os cinco passos",
      etapas: [
        { id: "passagens", texto: "Encontrar as passagens relevantes para a sua pergunta", campo: "passagens", dica: "Não o livro inteiro: os trechos que importam ao tema (os destaques ajudam)." },
        { id: "terminologia", texto: "Levar os autores a um acordo: uma terminologia neutra", campo: "terminologia", dica: "Os seus termos, que valem para todos os autores." },
        { id: "perguntas", texto: "Formular proposições neutras: as perguntas", campo: "perguntas" },
        { id: "questoes", texto: "Definir as questões: onde os autores respondem de modo diferente", campo: "questoes" },
        { id: "analise", texto: "Analisar a discussão, sem tomar partido", campo: "analise" },
      ],
    },
  ],
};

export const NIVEIS_LEITURA: Record<NivelLeitura, Nivel> = {
  elementar: ELEMENTAR,
  inspecional: INSPECIONAL,
  analitica: {
    id: "analitica", nome: "Analítica", curto: "lenta, para entender", ritmo: "lenta · qualitativa",
    pergunta: "O que o livro diz, como diz, é verdade? E daí?",
    estagios: ANALITICA_EXPOSITIVO,
  },
  sintopica: SINTOPICA,
};
export const ORDEM_NIVEIS: NivelLeitura[] = ["elementar", "inspecional", "analitica", "sintopica"];
export const COR_NIVEL: Record<NivelLeitura, string> = {
  elementar: "var(--area-idiomas)",
  inspecional: "var(--area-pesquisa)",
  analitica: "var(--area-leitura)",
  sintopica: "var(--area-estudos)",
};

/** As respostas do roteiro de um livro. */
export interface Roteiro {
  /** etapas marcadas */
  feitas?: string[];
  /** respostas escritas, pelo id do campo */
  campos?: Record<string, string>;
  /** respostas de escolha, pelo id da etapa */
  escolhas?: Record<string, string>;
  /** leitura analítica: livro expositivo ou literatura imaginativa */
  variante?: Variante;
}

export function estagiosDe(nivel: NivelLeitura, variante: Variante = "expositivo"): Estagio[] {
  if (nivel === "analitica") return variante === "imaginativo" ? ANALITICA_IMAGINATIVO : ANALITICA_EXPOSITIVO;
  return NIVEIS_LEITURA[nivel].estagios;
}

/** Etapa cumprida: marcada, respondida (campo com texto) ou escolhida. */
export function etapaFeita(e: Etapa, r: Roteiro): boolean {
  if (e.campo) return !!r.campos?.[e.campo]?.trim();
  if (e.opcoes) return !!r.escolhas?.[e.id];
  return !!r.feitas?.includes(e.id);
}

export function progressoDoRoteiro(nivel: NivelLeitura, r: Roteiro): { feitas: number; total: number } {
  const etapas = estagiosDe(nivel, r.variante).flatMap((s) => s.etapas);
  return { feitas: etapas.filter((e) => etapaFeita(e, r)).length, total: etapas.length };
}
