/**
 * "Como ler livros", de Mortimer Adler e Charles Van Doren — como o resume o artigo da Brasil Paralelo
 * (brasilparalelo.com.br/artigos/como-ler-livros). Duas classificações para cada livro:
 *  - o MOTIVO de leitura (por que se lê): entretenimento, informação ou conhecimento;
 *  - o NÍVEL de leitura (como se lê): elementar, inspecional, analítico ou sintópico — cumulativos.
 * Para cada nível, as etapas do método (as 11 regras no analítico), para marcar e responder enquanto lê.
 */

export type NivelLeitura = "elementar" | "inspecional" | "analitica" | "sintopica";
/** Regra 1: que tipo de livro é — expositivo teórico ou prático, imaginativo (ficção, poesia, teatro) ou de história */
export type Variante = "teorico" | "pratico" | "imaginativo" | "historia";

export interface Etapa {
  id: string;
  texto: string;
  /** a explicação curta do que fazer */
  dica?: string;
  /** a etapa pede uma resposta escrita (o texto do campo) */
  campo?: string;
  /** a resposta é uma escolha */
  opcoes?: string[];
  /** escolhas extras (várias), mostradas quando a resposta for esta opção: as formas de discordar */
  extras?: { quando: string; id: string; opcoes: string[] };
}
export interface Estagio { nome: string; resumo?: string; etapas: Etapa[] }
export interface Nivel { id: NivelLeitura; nome: string; curto: string; descricao: string; pergunta: string; estagios: Estagio[] }

const ELEMENTAR: Nivel = {
  id: "elementar", nome: "Elementar", curto: "o que diz a frase?",
  descricao: "É a alfabetização, a decodificação das frases para saber o que está sendo dito. Neste nível, o leitor deve ser capaz de responder à seguinte pergunta: O que diz a frase?",
  pergunta: "O que diz a frase?",
  estagios: [
    {
      nome: "Prontidão para a leitura",
      etapas: [
        { id: "fisica", texto: "Prontidão física", dica: "Estar descansado, com boa luz e sem distrações." },
        { id: "intelectual", texto: "Prontidão intelectual" },
        { id: "linguistica", texto: "Prontidão linguística", dica: "Domínio da língua do texto (num livro em outro idioma, é aqui que está o trabalho)." },
      ],
    },
    {
      nome: "Vocabulário e contexto",
      etapas: [
        { id: "palavras", texto: "Dominar o vocabulário: anotar e procurar as palavras que não conhece", campo: "vocabulario", dica: "Uma por linha, com o sentido que tem aqui." },
        { id: "frase", texto: "O que diz a frase? Dizer com as suas palavras o que leu", campo: "parafrase" },
      ],
    },
  ],
};

const INSPECIONAL: Nivel = {
  id: "inspecional", nome: "Inspecional", curto: "o máximo em pouco tempo",
  descricao: "É a extração do máximo do livro em um curto espaço de tempo. É preciso folheá-lo sistematicamente para saber qual é seu tema principal.",
  pergunta: "Nenhum livro deve ser lido mais lentamente do que merece, e nenhum livro deve ser lido mais rapidamente do que seu aproveitamento e compreensão exigirem.",
  estagios: [
    {
      nome: "Pré-leitura ou sondagem sistemática", resumo: "Descobrir o conteúdo, o tipo e a intenção do autor.",
      etapas: [
        { id: "rosto", texto: "Examinar a folha de rosto, o prefácio e o sumário" },
        { id: "indice", texto: "Consultar o índice remissivo" },
        { id: "capa", texto: "Ler a contracapa e a sobrecapa" },
        { id: "centrais", texto: "Examinar os capítulos que pareçam conter o argumento principal" },
        { id: "folhear", texto: "Folhear o livro" },
        { id: "finais", texto: "Ler duas ou três páginas finais e o epílogo" },
      ],
    },
    {
      nome: "Leitura superficial",
      etapas: [
        { id: "direto", texto: "Ler sem parar, sem se deter nos trechos mais espinhosos", dica: "Sem refletir nos pontos que ainda permanecem incompreensíveis: isso permite uma compreensão maior na segunda leitura." },
      ],
    },
    {
      nome: "Ler como um detetive", resumo: "No final, saber onde na estante o livro deve ficar.",
      etapas: [
        { id: "tipo", texto: "Que tipo de livro é?", campo: "tipo" },
        { id: "assunto", texto: "O livro fala sobre o quê?", campo: "assunto" },
        { id: "vale", texto: "Merece uma leitura analítica?", opcoes: ["Sim", "Em partes", "Não"] },
      ],
    },
  ],
};

/** As quatro perguntas da leitura exigente (valem para todo livro lido de verdade) */
const QUATRO_PERGUNTAS: Estagio = {
  nome: "As quatro perguntas", resumo: "A técnica da leitura exigente.",
  etapas: [
    { id: "q1", texto: "O livro fala sobre o quê?", campo: "q_sobre" },
    { id: "q2", texto: "O que exatamente está sendo dito, e como?", campo: "q_dito" },
    { id: "q3", texto: "O livro é verdadeiro? Em todo ou em parte?", campo: "q_verdade" },
    { id: "q4", texto: "E daí?", campo: "q_edai", dica: "Qual a diferença que o livro fez na sua vida: o que a leitura acrescentou." },
  ],
};

/** Regra 1 depende do tipo; as regras 2 a 11 valem para os livros expositivos (teóricos e práticos) */
const REGRAS_EXPOSITIVO = (pratico: boolean): Estagio[] => [
  {
    nome: "Estrutura", resumo: "Regras 1 a 4: radiografar o livro.",
    etapas: [
      { id: "r1", texto: "Regra 1 · Saber que tipo de livro está lendo antes mesmo de começar", campo: "classificacao",
        dica: pratico ? "Prático: conhecimento orientado para a ação, “como fazer”." : "Teórico: ensina algo (história, filosofia, ciência…). Classifique pelo título e pelo assunto." },
      { id: "r2", texto: "Regra 2 · Expressar a unidade do livro em uma única frase ou em algumas poucas", campo: "unidade", dica: "Sobre o que é o livro? O tema central, o ponto principal." },
      { id: "r3", texto: "Regra 3 · Expor as partes principais e como estão ordenadas em relação ao todo", campo: "partes", dica: "As partes em ordem, em relação ao fio condutor do começo ao fim." },
      { id: "r4", texto: "Regra 4 · Descobrir quais foram os problemas do autor", campo: "problemas", dica: "A principal pergunta que o próprio autor tentou responder." },
    ],
  },
  {
    nome: "Interpretação", resumo: "Regras 5 a 8: entender o que o autor diz.",
    etapas: [
      { id: "r5", texto: "Regra 5 · Encontrar as palavras importantes e, por elas, entrar em acordo com o autor", campo: "termos", dica: "As palavras que o autor enfatiza e repete: quantos sentidos têm? Uma por linha." },
      { id: "r6", texto: "Regra 6 · Marcar as frases mais importantes e descobrir as proposições que contêm", campo: "proposicoes", dica: "Muitas vezes as mais difíceis, ou as que o autor passa mais tempo explicando. Explique-as com as suas palavras." },
      { id: "r7", texto: "Regra 7 · Localizar ou formular os argumentos básicos, pelas conexões entre as frases", campo: "argumentos", dica: "Qual é a suposição e o que precisa ser provado? Dedutivo ou indutivo?" },
      { id: "r8", texto: "Regra 8 · Descobrir as soluções do autor: ele conseguiu resolver o que propôs?", campo: "resolvidos" },
    ],
  },
  {
    nome: "Crítica", resumo: "Regras 9 a 11: a crítica é uma resposta ao autor.",
    etapas: [
      { id: "r9", texto: "Regra 9 · Dizer “eu entendo” antes de dizer “concordo”, “discordo” ou “suspendo meu julgamento”",
        opcoes: ["Concordo", "Discordo", "Suspendo meu julgamento"],
        extras: { quando: "Discordo", id: "formas", opcoes: ["Desinformado (qual conhecimento falta?)", "Mal informado (o que não é verdadeiro?)", "Ilógico (falácia)", "Análise incompleta (problema não resolvido)"] } },
      { id: "r10", texto: "Regra 10 · Quando discordar, fazê-lo de maneira sensata, sem gerar disputas", dica: "O mais importante é conhecer a verdade, não vencer o debate." },
      { id: "r11", texto: "Regra 11 · Respeitar a diferença entre conhecimento e opinião, dando as razões do julgamento", campo: "critica",
        dica: pratico ? "No livro prático: as regras funcionam? Elas cumprem o que propõem? O que o autor quer que façamos?" : "Deixe as emoções de lado, explique as premissas e seja imparcial." },
    ],
  },
];

const HISTORIA: Estagio[] = [
  ...REGRAS_EXPOSITIVO(false),
  {
    nome: "Livro de história",
    etapas: [
      { id: "relatos", texto: "Ler mais de um relato sobre o acontecimento ou o período", campo: "relatos" },
      { id: "pratica", texto: "O evento em estudo possui importância prática? O que ensina sobre como os homens agem?", campo: "importancia" },
    ],
  },
];

const IMAGINATIVO: Estagio[] = [
  {
    nome: "Regras estruturais",
    etapas: [
      { id: "i1", texto: "Classificar: teatro, romance, novela, poema, epopeia…", campo: "classificacao" },
      { id: "i2", texto: "Descobrir a unidade narrativa: o enredo", campo: "unidade" },
      { id: "i3", texto: "Descobrir como o todo é composto das suas partes", campo: "partes" },
    ],
  },
  {
    nome: "Regras interpretativas", resumo: "Abrir-se às impressões que a obra deseja causar.",
    etapas: [
      { id: "i4", texto: "Criar familiaridade com os personagens e viver com eles os eventos", campo: "termos" },
      { id: "i5", texto: "Familiarizar-se com o mundo em que vivem (a “verdade” da ficção é a verossimilhança)", campo: "proposicoes" },
      { id: "i6", texto: "Segui-los nas suas aventuras", dica: "Narrativas: ler rapidamente. Peças: imaginar a representação no palco. Poesia lírica: até o fim sem parar, depois de novo em voz alta." },
    ],
  },
  {
    nome: "Regras críticas",
    etapas: [
      { id: "i7", texto: "Não criticar antes de ter vivido e apreciado a experiência que o autor desejava" },
      { id: "i8", texto: "Gostei ou não gostei?", opcoes: ["Gostei", "Não gostei", "Em parte"] },
      { id: "i9", texto: "Por quê? (a beleza está no prazer de conhecer bem a obra)", campo: "critica" },
    ],
  },
];

const ANALITICO: Nivel = {
  id: "analitica", nome: "Analítico", curto: "completa, intensa e ativa",
  descricao: "É a leitura completa, intensa e ativa. O livro é “mastigado e digerido”.",
  pergunta: "Ler é conversar com o autor.",
  estagios: REGRAS_EXPOSITIVO(false),
};

const SINTOPICO: Nivel = {
  id: "sintopica", nome: "Sintópico", curto: "muitos livros, um assunto",
  descricao: "É a leitura de muitos livros, ordenando-os em relação ao assunto principal abordado em todos. A comparação entre eles é feita e, a partir dela, pode surgir uma análise que não está em nenhum deles.",
  pergunta: "A conversa com vários autores sobre o mesmo assunto.",
  estagios: [
    {
      nome: "Primeira parte · Inspeção de campo preparatória",
      etapas: [
        { id: "bibliografia", texto: "Preparar a bibliografia provisória", dica: "Consultando orientadores, bibliotecas, bibliografias, dicionários, enciclopédias. Dê o mesmo assunto a cada livro (acima)." },
        { id: "inspecionar", texto: "Inspecionar os livros da bibliografia provisória", dica: "Para ter certeza — ou não — de que abordam o que precisamos." },
      ],
    },
    {
      nome: "Segunda parte · Como proceder",
      etapas: [
        { id: "passagens", texto: "Encontrar passagens relevantes", campo: "passagens", dica: "Os destaques nos livros ajudam." },
        { id: "acordo", texto: "Fazer os autores entrarem em acordo", campo: "terminologia", dica: "Termos seus, que valham para todos os autores." },
        { id: "questoes", texto: "Esclarecer questões", campo: "perguntas" },
        { id: "divergencias", texto: "Definir divergências", campo: "questoes" },
        { id: "analise", texto: "Analisar a discussão", campo: "analise" },
      ],
    },
  ],
};

export const NIVEIS_LEITURA: Record<NivelLeitura, Nivel> = {
  elementar: ELEMENTAR,
  inspecional: INSPECIONAL,
  analitica: ANALITICO,
  sintopica: SINTOPICO,
};

/** Os motivos de leitura: por que se lê o livro. */
export type MotivoLeitura = "entretenimento" | "informacao" | "conhecimento";
export const MOTIVOS_LEITURA: Record<MotivoLeitura, { nome: string; descricao: string; niveis: NivelLeitura[] }> = {
  entretenimento: { nome: "Entretenimento", descricao: "Ler por prazer.", niveis: ["elementar", "inspecional"] },
  informacao: { nome: "Informação", descricao: "Ler para saber: o livro diz algo que eu não sabia.", niveis: ["inspecional"] },
  conhecimento: { nome: "Conhecimento", descricao: "Entender um conteúdo é passar de um entendimento inferior para um superior. “Ao terminar a leitura, o ideal é saber mais do que antes dela.”", niveis: ["analitica", "sintopica"] },
};
export const ORDEM_MOTIVOS: MotivoLeitura[] = ["entretenimento", "informacao", "conhecimento"];

export const ORDEM_NIVEIS: NivelLeitura[] = ["elementar", "inspecional", "analitica", "sintopica"];
export const COR_NIVEL: Record<NivelLeitura, string> = {
  elementar: "var(--area-idiomas)",
  inspecional: "var(--area-pesquisa)",
  analitica: "var(--area-leitura)",
  sintopica: "var(--area-estudos)",
};

/** Tipos de livro (regra 1), na leitura analítica */
export const VARIANTES: { id: Variante; nome: string }[] = [
  { id: "teorico", nome: "Teórico" },
  { id: "pratico", nome: "Prático" },
  { id: "imaginativo", nome: "Imaginativo" },
  { id: "historia", nome: "História" },
];

/** As respostas de um livro. */
export interface Roteiro {
  /** etapas marcadas */
  feitas?: string[];
  /** respostas escritas, pelo id do campo */
  campos?: Record<string, string>;
  /** respostas de escolha, pelo id da etapa (e as escolhas extras, pelo id delas, separadas por "|") */
  escolhas?: Record<string, string>;
  /** leitura analítica: o tipo de livro */
  variante?: Variante | "expositivo";
}

const tipoDe = (v?: Roteiro["variante"]): Variante => (v === "expositivo" || !v ? "teorico" : v);
export const varianteDe = tipoDe;

export function estagiosDe(nivel: NivelLeitura, variante?: Roteiro["variante"]): Estagio[] {
  if (nivel === "analitica") {
    const v = tipoDe(variante);
    const base = v === "imaginativo" ? IMAGINATIVO : v === "historia" ? HISTORIA : REGRAS_EXPOSITIVO(v === "pratico");
    return [...base, QUATRO_PERGUNTAS];
  }
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

/** Os três tipos de anotação (para o leitor lembrar enquanto destaca) */
export const TIPOS_DE_ANOTACAO = [
  { nome: "Estruturais", texto: "Qual o tipo do livro? O que ele diz? Qual a estrutura e os conceitos do argumento? (de preferência no sumário)" },
  { nome: "Conceituais", texto: "As ideias que você tem durante a leitura, anotadas ao longo do livro." },
  { nome: "Sobre o perfil do debate", texto: "Dialéticas, normalmente em papéis à parte." },
];
