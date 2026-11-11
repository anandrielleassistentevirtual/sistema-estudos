/**
 * Oração › Exame de consciência (texto: "Exame de consciência para a Confissão").
 * Cada linha do folheto que juntava pecados diferentes foi separada; quando a segunda pergunta é só uma
 * circunstância da primeira ("Sozinho ou acompanhado?"), ela fica como lembrete (`obs`) do mesmo item.
 * `a` é a forma de acusação, usada na lista que se leva ao sacerdote.
 * Os ids são fixos: as marcações salvas dependem deles.
 */

export interface ItemExame { id: string; q: string; a: string; obs?: string }
export interface Mandamento { id: string; titulo: string; tema: string; itens: ItemExame[] }

export const MANDAMENTOS: Mandamento[] = [
  {
    id: "cp", titulo: "Confissão precedente", tema: "",
    itens: [
      { id: "cp-01", q: "Escondi algum pecado mortal por vergonha?", a: "Escondi pecado mortal por vergonha na confissão." },
    ],
  },
  {
    id: "m1", titulo: "1º Mandamento", tema: "Amar a Deus sobre todas as coisas",
    itens: [
      { id: "m1-01", q: "Tenho posto em dúvida alguma verdade de fé?", a: "Pus em dúvida verdades de fé." },
      { id: "m1-02", q: "Critiquei algum ensinamento da Igreja?", a: "Critiquei ensinamentos da Igreja." },
      { id: "m1-03", q: "Rezo diariamente?", a: "Deixei de rezar diariamente." },
      { id: "m1-04", q: "Distraio-me voluntariamente nas orações?", a: "Distraí-me voluntariamente nas orações." },
      { id: "m1-05", q: "Deixei-me levar pelo desânimo?", a: "Deixei-me levar pelo desânimo." },
      { id: "m1-06", q: "Revoltei-me contra Deus?", a: "Revoltei-me contra Deus." },
      { id: "m1-07", q: "Frequentei lugares ou cultos contrários à fé católica?", a: "Frequentei lugares ou cultos contrários à fé católica." },
      { id: "m1-08", q: "Fiz coisas supersticiosas?", a: "Fiz coisas supersticiosas." },
      { id: "m1-09", q: "Consultei “videntes”, feiticeiros, benzedores, cartomantes, etc.?", a: "Consultei videntes, feiticeiros, benzedores ou cartomantes." },
      { id: "m1-10", q: "Tenho sido orgulhoso ou vaidoso?", a: "Fui orgulhoso ou vaidoso." },
      { id: "m1-11", q: "Sou teimoso, arrogante ou malcriado?", a: "Fui teimoso, arrogante ou malcriado." },
      { id: "m1-12", q: "Sou invejoso?", a: "Fui invejoso." },
      { id: "m1-13", q: "Sou avarento, passando o dia inteiro a pensar em dinheiro ou em obter coisas?", a: "Fui avarento, pensando o dia inteiro em dinheiro ou em obter coisas." },
      { id: "m1-14", q: "Tenho-me demorado em pensamentos sobre mim, exagerando as minhas qualidades?", a: "Demorei-me em pensamentos sobre mim, exagerando as minhas qualidades." },
    ],
  },
  {
    id: "m2", titulo: "2º Mandamento", tema: "Não invocar o Santo Nome de Deus em vão",
    itens: [
      { id: "m2-01", q: "Tenho pronunciado sem respeito o nome de Deus ou dos Santos?", a: "Pronunciei sem respeito o nome de Deus ou dos Santos." },
      { id: "m2-02", q: "Falei sem respeito das coisas sagradas, da Igreja ou de sacerdotes?", a: "Falei sem respeito das coisas sagradas, da Igreja ou de sacerdotes." },
      { id: "m2-03", q: "Permiti que outros falassem sem respeito das coisas sagradas na minha presença?", a: "Permiti que outros falassem sem respeito das coisas sagradas na minha presença." },
      { id: "m2-04", q: "Ridicularizei padres, freiras, religiosos, catequistas, etc.?", a: "Ridicularizei padres, freiras, religiosos ou catequistas." },
      { id: "m2-05", q: "Tenho jurado à toa?", a: "Jurei à toa." },
      { id: "m2-06", q: "Jurei falso?", a: "Jurei falso." },
      { id: "m2-07", q: "Deixei de cumprir alguma promessa que fiz?", a: "Deixei de cumprir promessa que fiz." },
    ],
  },
  {
    id: "m3", titulo: "3º Mandamento", tema: "Santificar os domingos e festas de guarda",
    itens: [
      { id: "m3-01", q: "Faltei à Missa em algum domingo ou dia santo?", a: "Faltei à Missa em domingo ou dia santo." },
      { id: "m3-02", q: "Impedi que alguém que dependesse de mim assistisse à Missa?", a: "Impedi que alguém que depende de mim fosse à Missa." },
      { id: "m3-03", q: "Cheguei atrasado à Eucaristia por culpa própria?", a: "Cheguei atrasado à Missa por culpa própria." },
      { id: "m3-04", q: "Cumpri o preceito do descanso nos domingos e festas de guarda?", a: "Deixei de cumprir o descanso dos domingos e festas de guarda." },
      { id: "m3-05", q: "Obriguei outros a trabalharem nos domingos e festas de guarda?", a: "Obriguei outros a trabalhar nos domingos e festas de guarda." },
      { id: "m3-06", q: "Tenho deixado de me confessar?", a: "Deixei de me confessar." },
      { id: "m3-07", q: "Escondi algum pecado na Confissão?", a: "Escondi pecado na Confissão." },
      { id: "m3-08", q: "Cumpri o preceito de receber a Comunhão pelo menos uma vez ao ano, no período da Páscoa?", a: "Deixei de comungar ao menos uma vez ao ano, no tempo da Páscoa." },
      { id: "m3-09", q: "Comunguei alguma vez consciente de um pecado mortal não confessado?", a: "Comunguei consciente de pecado mortal não confessado." },
      { id: "m3-10", q: "Tenho-me apresentado para a Sagrada Comunhão com espírito frio e pouco recolhido?", a: "Recebi a Comunhão com espírito frio e pouco recolhido." },
      { id: "m3-11", q: "Contribuo para as necessidades da Igreja segundo as minhas possibilidades?", a: "Deixei de contribuir para as necessidades da Igreja segundo as minhas possibilidades." },
      { id: "m3-12", q: "Guardei a abstinência de carne nas sextas-feiras?", a: "Não guardei a abstinência de carne às sextas-feiras." },
      { id: "m3-13", q: "Jejuei na Quarta-feira de Cinzas e na Sexta-feira Santa?", a: "Não jejuei na Quarta-feira de Cinzas ou na Sexta-feira Santa." },
    ],
  },
  {
    id: "m4", titulo: "4º Mandamento", tema: "Honrar pai, mãe e legítimos superiores",
    itens: [
      { id: "m4-01", q: "Faltei à obediência aos meus pais e superiores?", a: "Desobedeci aos meus pais e superiores." },
      { id: "m4-02", q: "Faltei ao respeito com os meus pais e superiores?", a: "Faltei ao respeito com os meus pais e superiores." },
      { id: "m4-03", q: "Deixei de manifestar aos meus pais o devido amor?", a: "Deixei de manifestar o devido amor aos meus pais." },
      { id: "m4-04", q: "Deixei de ajudar os meus pais espiritual e materialmente?", a: "Deixei de ajudar os meus pais espiritual e materialmente." },
      { id: "m4-05", q: "Zanguei-me com a minha esposa (com o meu marido)?", a: "Zanguei-me com a minha esposa." },
      { id: "m4-06", q: "Tratei-a(o) mal por palavras ou ações?", a: "Tratei mal a minha esposa por palavras ou ações." },
      { id: "m4-07", q: "Dei mau exemplo aos meus filhos ou subordinados, não cumprindo os meus deveres religiosos, familiares, sociais ou profissionais?", a: "Dei mau exemplo aos meus filhos ou subordinados, descuidando dos meus deveres religiosos, familiares, sociais ou profissionais." },
      { id: "m4-08", q: "Ao corrigir os meus filhos, deixo-me dominar pela ira?", a: "Ao corrigir os meus filhos, deixei-me dominar pela ira." },
      { id: "m4-09", q: "Omito repreensões ou advertências que sei serem necessárias para a formação deles?", a: "Omiti repreensões ou advertências necessárias à formação dos meus filhos." },
      { id: "m4-10", q: "Regulei o uso que fazem da televisão, internet, celular, revistas e outros meios que podem pôr em risco a sua formação moral?", a: "Descuidei de regular o uso que os meus filhos fazem da televisão, internet, celular e revistas." },
      { id: "m4-11", q: "Descuidei-me de dar aos filhos a formação religiosa?", a: "Descuidei-me de dar formação religiosa aos meus filhos." },
      { id: "m4-12", q: "Atrasei o Batismo ou a Primeira Comunhão deles por negligência?", a: "Atrasei por negligência o Batismo ou a Primeira Comunhão dos meus filhos." },
      { id: "m4-13", q: "Deixei de ajudar, dentro das minhas possibilidades, os meus familiares nas suas necessidades espirituais ou materiais?", a: "Deixei de ajudar os meus familiares nas suas necessidades espirituais ou materiais." },
    ],
  },
  {
    id: "m5", titulo: "5º Mandamento", tema: "Não matar, nem causar, a si ou ao próximo, dano ao corpo ou à alma",
    itens: [
      { id: "m5-01", q: "Tive inimizade, ódio ou rancor contra alguém?", a: "Tive inimizade, ódio ou rancor contra alguém.", obs: "Era meu familiar?" },
      { id: "m5-02", q: "Fiz ou desejei mal a alguém?", a: "Fiz ou desejei mal a alguém." },
      { id: "m5-03", q: "Aconselhei alguém a fazer mal a outro?", a: "Aconselhei alguém a fazer mal a outro." },
      { id: "m5-04", q: "Insultei alguém?", a: "Insultei alguém." },
      { id: "m5-05", q: "Alegrei-me com as desgraças alheias?", a: "Alegrei-me com as desgraças alheias." },
      { id: "m5-06", q: "Tive inveja de alguém?", a: "Tive inveja de alguém." },
      { id: "m5-07", q: "Deixei de perdoar as ofensas que recebi?", a: "Deixei de perdoar as ofensas que recebi." },
      { id: "m5-08", q: "Desleixei-me quanto à minha saúde?", a: "Desleixei-me quanto à minha saúde." },
      { id: "m5-09", q: "Atentei contra a minha vida?", a: "Atentei contra a minha vida." },
      { id: "m5-10", q: "Desejei morrer?", a: "Desejei morrer." },
      { id: "m5-11", q: "Fiz, aconselhei ou facilitei a alguém a prática do aborto ou da eutanásia?", a: "Fiz, aconselhei ou facilitei aborto ou eutanásia." },
      { id: "m5-12", q: "Prejudiquei a minha saúde embriagando-me?", a: "Embriaguei-me, prejudicando a minha saúde." },
      { id: "m5-13", q: "Prejudiquei a minha saúde comendo em excesso?", a: "Comi em excesso, prejudicando a minha saúde." },
      { id: "m5-14", q: "Fiz uso de drogas?", a: "Fiz uso de drogas." },
      { id: "m5-15", q: "Cheguei a ferir ou tirar a vida do próximo?", a: "Feri ou tirei a vida do próximo." },
      { id: "m5-16", q: "Fui imprudente ao dirigir automóveis?", a: "Fui imprudente ao dirigir." },
      { id: "m5-17", q: "Preocupei-me com o próximo, advertindo-o de algum grave perigo material ou espiritual?", a: "Deixei de advertir o próximo de grave perigo material ou espiritual." },
      { id: "m5-18", q: "Tive mau convívio, por culpa própria, com os meus familiares, amigos ou conhecidos?", a: "Tive mau convívio, por culpa própria, com familiares, amigos ou conhecidos." },
      { id: "m5-19", q: "Disse palavrões?", a: "Disse palavrões." },
      { id: "m5-20", q: "Dei escândalo?", a: "Dei escândalo." },
      { id: "m5-21", q: "Por preguiça, deixei de me levantar à hora devida?", a: "Por preguiça, deixei de me levantar à hora devida." },
    ],
  },
  {
    id: "m6", titulo: "6º e 9º Mandamentos", tema: "Guardar a castidade nas palavras, obras, pensamentos e desejos",
    itens: [
      { id: "m6-01", q: "Vi coisas indecentes? (na rua, na internet, no celular, na TV, em revistas ou em filmes)", a: "Vi coisas indecentes.", obs: "Onde? (internet, celular, TV, filmes…)" },
      { id: "m6-02", q: "Tenho pensado ou desejado coisas impuras?", a: "Pensei ou desejei coisas impuras." },
      { id: "m6-03", q: "Pratiquei ações impuras?", a: "Pratiquei ações impuras.", obs: "Sozinho ou acompanhado?" },
      { id: "m6-04", q: "Havia alguma circunstância na ação impura – de parentesco, pessoa casada, consagrada a Deus ou menor de idade – que tornou mais grave aquela ação?", a: "Houve circunstância agravante na ação impura.", obs: "Qual? (parentesco, pessoa casada, consagrada a Deus, menor de idade)" },
      { id: "m6-05", q: "Olhei para alguém com intenção de obter um prazer impuro?", a: "Olhei para alguém com intenção de obter prazer impuro." },
      { id: "m6-06", q: "Tive liberdades no namoro?", a: "Tive liberdades no namoro." },
      { id: "m6-07", q: "Faltei à fidelidade conjugal por pensamentos ou ações?", a: "Faltei à fidelidade conjugal por pensamentos ou ações." },
      { id: "m6-08", q: "Dei atenção a conversas imorais ou participei delas?", a: "Dei atenção a conversas imorais ou participei delas." },
      { id: "m6-09", q: "Mantenho amizades que me levam ao pecado?", a: "Mantenho amizades que me levam ao pecado.", obs: "Estou disposto a abandoná-las?" },
      { id: "m6-10", q: "Tenho faltado ao pudor, despindo-me levianamente à vista de outra pessoa?", a: "Faltei ao pudor, despindo-me levianamente à vista de outra pessoa." },
      { id: "m6-11", q: "Visto-me com modéstia, ou utilizo roupas que realçam algumas partes do corpo?", a: "Usei roupas imodestas, que realçam partes do corpo." },
      { id: "m6-12", q: "Assisti a espetáculos, li revistas, livros ou mensagens que me colocaram em ocasião próxima de pecar?", a: "Pus-me em ocasião próxima de pecado com espetáculos, revistas, livros ou mensagens." },
    ],
  },
  {
    id: "m7", titulo: "7º e 10º Mandamentos", tema: "Não furtar, nem reter injustamente ou danificar os bens do próximo. Não cobiçar as coisas alheias",
    itens: [
      { id: "m7-01", q: "Roubei algum objeto ou alguma quantia em dinheiro?", a: "Roubei objeto ou dinheiro.", obs: "O quê, ou quanto?" },
      { id: "m7-02", q: "Ajudei alguém a roubar?", a: "Ajudei alguém a roubar." },
      { id: "m7-03", q: "Tive inveja dos outros, dos seus bens, das suas qualidades pessoais?", a: "Tive inveja dos bens ou das qualidades dos outros." },
      { id: "m7-04", q: "Paguei o justo salário aos empregados?", a: "Deixei de pagar o justo salário aos empregados." },
      { id: "m7-05", q: "Retenho ou atraso indevidamente o pagamento de bens e serviços?", a: "Retive ou atrasei indevidamente pagamentos de bens e serviços." },
      { id: "m7-06", q: "Lesei alguém nos seus direitos?", a: "Lesei alguém nos seus direitos." },
      { id: "m7-07", q: "Reparei os prejuízos causados ou restituí as coisas roubadas, na medida das minhas possibilidades?", a: "Deixei de reparar prejuízos ou de restituir o que foi roubado, podendo fazê-lo." },
      { id: "m7-08", q: "Trabalhei com empenho as horas que devia, ou desperdicei tempo no meu trabalho?", a: "Desperdicei tempo no trabalho, sem me empenhar nas horas devidas." },
      { id: "m7-09", q: "Prejudiquei alguém com enganos, coações, etc., nos contratos ou relações comerciais?", a: "Prejudiquei alguém com enganos ou coações em contratos ou negócios." },
      { id: "m7-10", q: "Gastei mais do que permitem as minhas possibilidades?", a: "Gastei mais do que as minhas possibilidades permitem." },
      { id: "m7-11", q: "Tenho o vício do jogo?", a: "Joguei por vício." },
    ],
  },
  {
    id: "m8", titulo: "8º Mandamento", tema: "Não mentir. Não levantar falsos testemunhos, nem difamar o próximo",
    itens: [
      { id: "m8-01", q: "Menti?", a: "Menti." },
      { id: "m8-02", q: "Reparei os prejuízos que as minhas mentiras possam ter causado?", a: "Deixei de reparar os prejuízos das minhas mentiras." },
      { id: "m8-03", q: "Minto habitualmente, com a desculpa de que são mentiras que não prejudicam ninguém?", a: "Menti habitualmente, com a desculpa de que não prejudica ninguém." },
      { id: "m8-04", q: "Prestei falso juramento ou dei falso testemunho?", a: "Prestei falso juramento ou dei falso testemunho." },
      { id: "m8-05", q: "Difamei, revelando sem motivo justo os defeitos alheios?", a: "Difamei, revelando sem motivo justo os defeitos alheios." },
      { id: "m8-06", q: "Caluniei, atribuindo ao próximo defeitos falsos?", a: "Caluniei, atribuindo ao próximo defeitos falsos." },
      { id: "m8-07", q: "Exagerei os defeitos do próximo?", a: "Exagerei os defeitos do próximo." },
      { id: "m8-08", q: "Disse mal dos outros, baseando-me apenas em boatos?", a: "Disse mal dos outros com base em boatos." },
      { id: "m8-09", q: "Fiz juízos falsos ou temerários?", a: "Fiz juízos falsos ou temerários." },
      { id: "m8-10", q: "Semeei discórdias e inimizades com as minhas palavras?", a: "Semeei discórdias e inimizades com as minhas palavras." },
      { id: "m8-11", q: "Permiti que outros falassem mal do próximo?", a: "Permiti que outros falassem mal do próximo." },
      { id: "m8-12", q: "Escutei com gosto conversas em que se falava mal do próximo?", a: "Escutei com gosto conversas contra o próximo." },
      { id: "m8-13", q: "Procurei reparar os prejuízos causados pelas minhas palavras (calúnia, difamação, etc.), por exemplo, falando dos aspectos positivos dessa pessoa?", a: "Deixei de reparar os prejuízos causados pelas minhas palavras." },
      { id: "m8-14", q: "Enganei o próximo, assegurando-lhe que uma coisa, na realidade proibida, era boa ou lícita?", a: "Enganei o próximo, dizendo lícito o que é proibido." },
    ],
  },
];

export const QUANTIDADES = ["1 vez", "2 vezes", "3 vezes", "algumas vezes", "várias vezes", "inúmeras vezes", "habitualmente"];

/** O que fica cifrado: as marcações (id → quantidade/observação) e os pecados escritos à mão. */
export interface ExameDados {
  marcas: Record<string, { qtd: string }>;
  outros: { id: string; mand: string; texto: string; qtd: string }[];
}
export const exameVazio = (): ExameDados => ({ marcas: {}, outros: [] });
export const exameTemAlgo = (d: ExameDados) => Object.keys(d.marcas).length > 0 || d.outros.some((o) => o.texto.trim());

/** Lista para o sacerdote, na ordem dos mandamentos. */
export function listaParaConfissao(d: ExameDados) {
  return MANDAMENTOS.map((m) => ({
    mandamento: m,
    pecados: [
      ...m.itens.filter((i) => d.marcas[i.id]).map((i) => ({ texto: i.a, qtd: d.marcas[i.id].qtd.trim() })),
      ...d.outros.filter((o) => o.mand === m.id && o.texto.trim()).map((o) => ({ texto: o.texto.trim(), qtd: o.qtd.trim() })),
    ],
  })).filter((x) => x.pecados.length);
}

// ---------- textos de oração (do folheto) ----------

export const ANTES_DO_EXAME = {
  introducao: [
    "Será difícil, se não impossível, apresentar um questionário que contenha todos os pecados e faltas existentes. Segue um questionário que se ocupa dos pecados mais comuns.",
    "Como as consciências são diferentes entre si, e sendo impossível proporcionar a cada uma um questionário adequado ao seu estado, o penitente utilize os pontos abaixo como auxílio para realizar o exame de consciência pessoal.",
  ],
  citacao: { texto: "Se queres entrar para a vida eterna, guarda os Mandamentos.", ref: "Mt 19, 16-17" },
  convite: "Examinemos cuidadosamente a nossa consciência, sem ansiedade nem escrúpulo, procurando conhecer a espécie (natureza) e o número dos pecados cometidos.",
  oracao: "Meu Deus e Senhor, eu me preparo para receber o santo Sacramento da Penitência. Iluminai o meu espírito, a fim de que eu conheça claramente o número e a gravidade dos meus pecados, deles me arrependa, e os confesse ao sacerdote com verdadeira dor e firme propósito de nunca mais Vos tornar a ofender. Amém.",
  passos: [
    ["Exame de consciência", "para descobrir os meus pecados."],
    ["Arrependimento", "dor sincera dos pecados cometidos."],
    ["Propósito", "vontade de não querer pecar mais."],
    ["Confissão", "contar meus pecados ao padre."],
    ["Satisfação", "rezar ou cumprir alguma penitência que o padre mandar."],
  ] as [string, string][],
};

export const ATO_DE_CONTRICAO =
  "Meu Pai e meu Deus, reconheço com muita dor que pequei! Eu vos ofendi, ó meu Redentor, e mereci os vossos castigos. Por Maria, minha e vossa Mãe, declaro que não quero pecar mais. Por Ela, eu Vos peço perdão.";

export const CONTRICAO_PERFEITA: { titulo?: string; paragrafos: string[] }[] = [
  { paragrafos: [
    "Na impossibilidade de obter a Confissão Sacramental, é oportuno lembrar aos fiéis a importância da Contrição.",
    "Quem tiver a infelicidade de cometer um pecado, e estiver impossibilitado de confessar-se logo, terá sempre este precioso recurso para reconciliar-se sem demora com Deus. Esta graça está sempre ao alcance de todos os fiéis, sem qualquer exceção.",
    "A contrição – ou arrependimento – é a dor de alma que a pessoa sente por haver pecado; essa dor só é verdadeira quando o pecador detesta a má ação praticada e tem o propósito de não mais pecar.",
    "Deve também ser geral, isto é, abranger ao menos todos os pecados mortais. É necessário, por fim, que ela seja sobrenatural, quer dizer, que tenha por base alguma verdade da Fé: o temor de Deus que tem o direito de ser obedecido, o amor de Deus que nos ama, o desejo do Céu, o medo do inferno, etc.",
  ] },
  { titulo: "Como obtê-la?", paragrafos: [
    "Para obtê-la, basta manifestar a Deus com sinceridade de alma o seu pesar por tê-Lo ofendido e o firme propósito de não tornar a pecar.",
  ] },
  { titulo: "Contrição perfeita e confissão", paragrafos: [
    "Que pela contrição perfeita o pecador obtém o perdão dos seus pecados antes mesmo de confessar-se é doutrina afirmada no Concílio de Trento (14ª sessão, cap. 4).",
    "Entretanto, adverte o mesmo Concílio, ela não dispensa o pecador da necessidade de acusar-se de todos os seus pecados mortais no Sacramento da Confissão e de receber a absolvição do ministro de Deus (Padre). De modo que no próprio ato de contrição perfeita deve estar incluído o propósito de confessar-se.",
    "Quanto tempo depois? É pelo menos muitíssimo aconselhável confessar-se logo que possível.",
    "“Mas é tão difícil ter contrição perfeita!” – poderá alguém pensar. Puro engano! Para dar-nos essa graça, Deus exige de nós uma atitude bem ao nosso alcance: desejá-la realmente e pedi-la com insistência.",
  ] },
  { titulo: "Efeitos da contrição perfeita", paragrafos: [
    "São maravilhosos os efeitos e benefícios que a contrição perfeita nos obtém. A quem é pecador, ela perdoa imediatamente os pecados cometidos, devolvendo-lhe a graça santificante pela qual ele volta a ser filho de Deus, livrando-o das penas do inferno e restituindo-lhe os méritos perdidos.",
  ] },
];

// ---------- confissões (só as datas) ----------

export const PRAZO_CONFISSAO = 30; // dias

export function diasDesde(dataIso: string) {
  const [y, m, d] = dataIso.split("-").map(Number);
  const ini = new Date(y, m - 1, d).getTime();
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.round((hoje.getTime() - ini) / 86_400_000);
}

export function tempoDesde(dias: number) {
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 14) return `há ${dias} dias`;
  if (dias < 60) return `há ${Math.round(dias / 7)} semanas`;
  if (dias < 730) return `há ${Math.round(dias / 30.4)} meses`;
  return `há ${Math.round(dias / 365)} anos`;
}

// ---------- cifra (Web Crypto: PBKDF2 → AES-GCM 256) ----------

export const ITERACOES = 310_000;
const VERIFICADOR = "exame-de-consciencia:ok";
const te = new TextEncoder();
const td = new TextDecoder();
const b64 = (u: Uint8Array) => {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function novoSal() { return b64(crypto.getRandomValues(new Uint8Array(16))); }

export async function derivarChave(senha: string, sal: string, iteracoes = ITERACOES): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", te.encode(senha), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: deB64(sal), iterations: iteracoes },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export async function cifrar(chave: CryptoKey, texto: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, te.encode(texto)));
  return `${b64(iv)}:${b64(c)}`;
}

export async function decifrar(chave: CryptoKey, pacote: string): Promise<string> {
  const [iv, c] = pacote.split(":");
  const p = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(iv) }, chave, deB64(c));
  return td.decode(p);
}

export const verificadorNovo = (chave: CryptoKey) => cifrar(chave, VERIFICADOR);
export async function senhaConfere(chave: CryptoKey, verificador: string) {
  try { return (await decifrar(chave, verificador)) === VERIFICADOR; } catch { return false; }
}
