/**
 * Lê a cópia da coleção do Anki (arquivo SQLite) e tira só os números: revisões e tempo por dia,
 * cartões por baralho (para revisar hoje, aprendendo, novos) e a retenção dos últimos 30 dias.
 * Funciona com o formato atual (schema 18, baralhos numa tabela) e com o antigo (schema 11, baralhos em JSON).
 */
import { DatabaseSync } from "node:sqlite";

export interface DiaAnki { day: string; reviews: number; segundos: number; criados: number; notas_criadas: number }
/** Números de um dia num baralho de cima (subbaralhos somam nele). */
export interface DiaBaralho { day: string; baralho: string; reviews: number; segundos: number; criados: number; notas_criadas: number }
export interface BaralhoAnki { id: number; nome: string; revisar: number; aprendendo: number; novos: number; total: number }
export interface ResumoAnki {
  cartoes: number;
  revisar_hoje: number;
  aprendendo: number;
  novos: number;
  retencao_30d: number | null;
  revisoes_30d: number;
  virada_hora: number;
}

/** Minutos de diferença do fuso em relação ao UTC, agora (ex.: São Paulo = −180). */
function offsetMin(tz: string, quando = new Date()): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(quando).map((x) => [x.type, x.value]));
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((local - quando.getTime()) / 60000);
}

const temTabela = (db: DatabaseSync, nome: string) =>
  !!db.prepare("select 1 from sqlite_master where type='table' and name=?").get(nome);

function lerConfig(db: DatabaseSync, chave: string): unknown {
  try {
    if (temTabela(db, "config")) {
      const r = db.prepare("select val from config where key=?").get(chave) as { val: Uint8Array | string } | undefined;
      if (r) return JSON.parse(typeof r.val === "string" ? r.val : Buffer.from(r.val).toString("utf8"));
    } else {
      const r = db.prepare("select conf from col").get() as { conf: string } | undefined;
      if (r) return (JSON.parse(r.conf) as Record<string, unknown>)[chave];
    }
  } catch {}
  return undefined;
}

function nomesDosBaralhos(db: DatabaseSync): Map<number, string> {
  const m = new Map<number, string>();
  if (temTabela(db, "decks")) {
    for (const r of db.prepare("select id, name from decks").all() as { id: number; name: string }[]) m.set(Number(r.id), r.name.replaceAll("\x1f", "::"));
  } else {
    const r = db.prepare("select decks from col").get() as { decks: string } | undefined;
    for (const d of Object.values(JSON.parse(r?.decks ?? "{}") as Record<string, { id: number; name: string }>)) m.set(Number(d.id), d.name);
  }
  return m;
}

export function lerColecao(arquivo: string, opcoes: { tz: string; desde: string; agora?: Date }) {
  const db = new DatabaseSync(arquivo, { readOnly: true });
  try {
    const agora = opcoes.agora ?? new Date();
    const agoraS = Math.floor(agora.getTime() / 1000);
    const virada = Number(lerConfig(db, "rollover") ?? 4) || 0; // o dia do Anki começa nesta hora (padrão 4h)
    const desloc = offsetMin(opcoes.tz, agora) * 60 - virada * 3600; // segundos somados ao horário UTC para cair no "dia do Anki"
    const crt = Number((db.prepare("select crt from col").get() as { crt: number }).crt);
    // "hoje" para o Anki: quantos DIAS DE CALENDÁRIO (que começam na hora da virada, 4h por padrão, no fuso local)
    // se passaram desde o dia da criação da coleção — não blocos de 24 h desde o instante da criação
    const diaLocal = (seg: number) => Math.floor((seg + desloc) / 86400);
    const hoje = diaLocal(agoraS) - diaLocal(crt);

    // revisões e tempo por dia (sem as mudanças manuais de data, que não são revisões)
    const desdeMs = (Date.parse(`${opcoes.desde}T00:00:00Z`) / 1000 - desloc) * 1000;
    const porDia = new Map<string, DiaAnki>();
    const dia = (k: string) => porDia.get(k) ?? (porDia.set(k, { day: k, reviews: 0, segundos: 0, criados: 0, notas_criadas: 0 }), porDia.get(k)!);
    for (const d of db.prepare(`
      select date(id / 1000 + ?, 'unixepoch') as day, count(*) as reviews, cast(sum(min(time, 60000)) / 1000 as integer) as segundos
      from revlog where id >= ? and ease > 0 and type < 4 group by day`).all(desloc, desdeMs) as { day: string; reviews: number; segundos: number }[]) {
      const x = dia(d.day); x.reviews = Number(d.reviews); x.segundos = Number(d.segundos);
    }
    // cartões e notas criados: o id de cada um é o instante (em milissegundos) em que foi criado
    for (const d of db.prepare(`select date(id / 1000 + ?, 'unixepoch') as day, count(*) as n from cards where id >= ? group by day`)
      .all(desloc, desdeMs) as { day: string; n: number }[]) dia(d.day).criados = Number(d.n);
    for (const d of db.prepare(`select date(id / 1000 + ?, 'unixepoch') as day, count(*) as n from notes where id >= ? group by day`)
      .all(desloc, desdeMs) as { day: string; n: number }[]) dia(d.day).notas_criadas = Number(d.n);
    const dias = [...porDia.values()].sort((a, b) => a.day.localeCompare(b.day));

    // o mesmo, separado por baralho de cima: cada idioma vê só os seus ("English" ≠ "Italiano")
    const nomesBaralho = nomesDosBaralhos(db);
    const deCima = (did: number) => (nomesBaralho.get(Number(did)) ?? "(baralho apagado)").split("::")[0];
    const porBaralhoDia = new Map<string, DiaBaralho>();
    const dB = (day: string, baralho: string) => {
      const k = `${day}|${baralho}`;
      return porBaralhoDia.get(k) ?? (porBaralhoDia.set(k, { day, baralho, reviews: 0, segundos: 0, criados: 0, notas_criadas: 0 }), porBaralhoDia.get(k)!);
    };
    for (const r of db.prepare(`
      select date(r.id / 1000 + ?, 'unixepoch') as day, c.did as did, count(*) as n, cast(sum(min(r.time, 60000)) / 1000 as integer) as s
      from revlog r left join cards c on c.id = r.cid
      where r.id >= ? and r.ease > 0 and r.type < 4 group by day, c.did`).all(desloc, desdeMs) as { day: string; did: number | null; n: number; s: number }[]) {
      const x = dB(r.day, r.did == null ? "(cartão apagado)" : deCima(r.did)); x.reviews += Number(r.n); x.segundos += Number(r.s);
    }
    for (const r of db.prepare(`select date(id / 1000 + ?, 'unixepoch') as day, did, count(*) as n, count(distinct nid) as notas
      from cards where id >= ? group by day, did`).all(desloc, desdeMs) as { day: string; did: number; n: number; notas: number }[]) {
      const x = dB(r.day, deCima(r.did)); x.criados += Number(r.n); x.notas_criadas += Number(r.notas);
    }
    const diasPorBaralho = [...porBaralhoDia.values()];

    // retenção: das revisões de cartões já aprendidos nos últimos 30 dias, quantas você acertou
    const ret = db.prepare(`select count(*) as n, sum(case when ease > 1 then 1 else 0 end) as ok
      from revlog where id >= ? and type = 1 and ease > 0`).get((agoraS - 30 * 86400) * 1000) as { n: number; ok: number };

    // cartões por baralho
    const nomes = nomesDosBaralhos(db);
    const porBaralho = db.prepare(`
      select did,
        sum(case when queue = 2 and due <= ? then 1 when queue = 3 and due <= ? then 1 else 0 end) as revisar,
        sum(case when queue = 1 and due <= ? then 1 else 0 end) as aprendendo,
        sum(case when queue = 0 then 1 else 0 end) as novos,
        count(*) as total
      from cards group by did`).all(hoje, hoje, agoraS + 20 * 60) as { did: number; revisar: number; aprendendo: number; novos: number; total: number }[];

    // soma os subbaralhos no baralho de cima (como o Anki mostra)
    const mapa = new Map<string, BaralhoAnki>();
    for (const [id, nome] of nomes) mapa.set(nome, { id, nome, revisar: 0, aprendendo: 0, novos: 0, total: 0 });
    for (const r of porBaralho) {
      const nome = nomes.get(Number(r.did)) ?? `Baralho ${r.did}`;
      const partes = nome.split("::");
      for (let i = 1; i <= partes.length; i++) {
        const n = partes.slice(0, i).join("::");
        const b = mapa.get(n) ?? { id: i === partes.length ? Number(r.did) : 0, nome: n, revisar: 0, aprendendo: 0, novos: 0, total: 0 };
        b.revisar += Number(r.revisar); b.aprendendo += Number(r.aprendendo); b.novos += Number(r.novos); b.total += Number(r.total);
        mapa.set(n, b);
      }
    }
    const baralhos = [...mapa.values()]
      // o baralho "Default" vazio não aparece (o Anki também o esconde)
      .filter((b) => b.total > 0 || b.nome !== "Default")
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));

    const topo = baralhos.filter((b) => !b.nome.includes("::"));
    const resumo: ResumoAnki = {
      cartoes: topo.reduce((n, b) => n + b.total, 0),
      revisar_hoje: topo.reduce((n, b) => n + b.revisar, 0),
      aprendendo: topo.reduce((n, b) => n + b.aprendendo, 0),
      novos: topo.reduce((n, b) => n + b.novos, 0),
      retencao_30d: Number(ret.n) ? Number(ret.ok) / Number(ret.n) : null,
      revisoes_30d: Number(ret.n),
      virada_hora: virada,
    };
    return { dias, diasPorBaralho, baralhos, resumo };
  } finally {
    db.close();
  }
}
