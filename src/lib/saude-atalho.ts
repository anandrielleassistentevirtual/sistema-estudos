/**
 * O que o atalho do iPhone (app Atalhos → "Obter Conteúdo do URL") manda, transformado em dias.
 *
 * O atalho manda listas (uma linha por item, ou listas JSON), do jeito que o Atalhos converte em texto:
 *   passos        "8.432\n10.215\n…"        (amostras de Passos agrupadas por dia: o Saúde já junta iPhone e relógio)
 *   passos_datas  "21 de nov. de 2026 00:00\n…" (início de cada dia)
 *   sono          "Essencial\nProfundo\nREM\nAcordado\nNa Cama\n…" (Análise do Sono; em inglês também)
 *   sono_inicio / sono_fim   o começo e o fim de cada amostra de sono
 * As datas chegam no formato do idioma do iPhone (pt ou en) ou ISO; sem fuso, valem as de Brasília (−03:00).
 *
 * Regras:
 *   - o dia mais antigo da janela fica de fora: ele vem cortado (os "últimos 7 dias" começam no meio dele)
 *     e não pode apagar um valor completo enviado antes;
 *   - o sono de uma noite é do dia em que se acordou; amostras de aparelhos diferentes que se sobrepõem
 *     contam uma vez só (união dos intervalos);
 *   - pedaços de sono separados por menos de 2 h são a mesma noite; deitou/acordou são os da noite mais longa.
 */

export type DiaSaude = {
  dia: string;
  passos?: number;
  sono_min?: number | null;
  na_cama_min?: number | null;
  deitou?: string;
  acordou?: string;
  profundo_min?: number | null;
  rem_min?: number | null;
  essencial_min?: number | null;
  acordado_min?: number | null;
};

const FUSO_MIN = -180; // Brasília, sem horário de verão desde 2019
const MESES: Record<string, number> = {
  jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, ago: 8, aug: 8,
  set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12,
};

/** Lista vinda do atalho: array JSON, texto com uma linha por item, ou um item só. */
export function lista(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.flatMap((x) => lista(x));
  const s = String(v).trim();
  if (!s) return [];
  if (s.startsWith("[")) { try { return lista(JSON.parse(s)); } catch {} }
  return s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
}

/** Momento (ms) de uma data em texto, em qualquer dos formatos que o Atalhos produz. null se não entender. */
export function lerData(s: string): number | null {
  const t = s.trim().replace(/ | /g, " ");
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) {
    const ms = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(t) ? t : t + "-03:00");
    return Number.isNaN(ms) ? null : ms;
  }
  let a = 0, m = 0, d = 0;
  let resto = t;
  let x: RegExpMatchArray | null;
  if ((x = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/))) { a = +x[1]; m = +x[2]; d = +x[3]; resto = x[4]; }
  else if ((x = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(.*)$/))) { d = +x[1]; m = +x[2]; a = +x[3]; resto = x[4]; }
  else if ((x = t.match(/^(\d{1,2})\s+de\s+([a-zç]+)\.?(?:\s+de)?\s+(\d{4})(.*)$/i))) { d = +x[1]; m = MESES[x[2].slice(0, 3).toLowerCase()] ?? 0; a = +x[3]; resto = x[4]; }
  else if ((x = t.match(/^(?:[a-z]+,\s*)?([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})(.*)$/i))) { m = MESES[x[1].slice(0, 3).toLowerCase()] ?? 0; d = +x[2]; a = +x[3]; resto = x[4]; }
  else if ((x = t.match(/^(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})(.*)$/i))) { d = +x[1]; m = MESES[x[2].slice(0, 3).toLowerCase()] ?? 0; a = +x[3]; resto = x[4]; }
  else return null;
  if (a < 100) a += 2000;
  if (!m || !d || m > 12 || d > 31) return null;
  let h = 0, mi = 0, se = 0;
  const hr = resto.match(/(\d{1,2})[:h](\d{2})(?::(\d{2}))?\s*(AM|PM|a\.?\s?m\.?|p\.?\s?m\.?)?/i);
  if (hr) {
    h = +hr[1]; mi = +hr[2]; se = +(hr[3] ?? 0);
    const ap = hr[4]?.toLowerCase().replace(/[.\s]/g, "");
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
  }
  const fuso = resto.match(/(?:GMT|UTC)?\s*([+-])(\d{1,2}):?(\d{2})?\s*$/);
  const off = fuso ? (fuso[1] === "-" ? -1 : 1) * (+fuso[2] * 60 + +(fuso[3] ?? 0)) : FUSO_MIN;
  return Date.UTC(a, m - 1, d, h, mi, se) - off * 60000;
}

/** Número de passos em texto: "8.432", "8,432", "8432 passos", "8432.0". */
export function lerNumero(s: string): number | null {
  const n = s.trim().match(/-?\d[\d.,\s]*/)?.[0].replace(/\s/g, "");
  if (!n) return null;
  if (/^\d{1,3}([.,]\d{3})+$/.test(n)) return Number(n.replace(/[.,]/g, ""));
  const v = Number(n.replace(",", "."));
  return Number.isFinite(v) ? Math.round(v) : null;
}

type Fase = "cama" | "dormindo" | "essencial" | "profundo" | "rem" | "acordado";
export function lerFase(s: string): Fase | null {
  const t = s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (/acordad|awake|desperto/.test(t)) return "acordado";
  if (/cama|in ?bed/.test(t)) return "cama";
  if (/profund|deep/.test(t)) return "profundo";
  if (/\brem\b/.test(t)) return "rem";
  if (/essencial|core|principal|leve|light/.test(t)) return "essencial";
  if (/dorm|asleep|sono|sleep|nao especificado|unspecified/.test(t)) return "dormindo";
  return null;
}

/** Dia (AAAA-MM-DD) de um momento, no horário de Brasília. */
export const diaDe = (ms: number) => new Date(ms + FUSO_MIN * 60000).toISOString().slice(0, 10);

type Intervalo = [number, number];
function unir(xs: Intervalo[]): Intervalo[] {
  const s = [...xs].sort((a, b) => a[0] - b[0]);
  const out: Intervalo[] = [];
  for (const x of s) {
    const u = out[out.length - 1];
    if (u && x[0] <= u[1]) u[1] = Math.max(u[1], x[1]);
    else out.push([x[0], x[1]]);
  }
  return out;
}
const minutos = (xs: Intervalo[]) => Math.round(xs.reduce((a, x) => a + (x[1] - x[0]), 0) / 60000);
/** a parte de `xs` dentro de [ini, fim] */
const dentro = (xs: Intervalo[], ini: number, fim: number) =>
  xs.map(([a, b]) => [Math.max(a, ini), Math.min(b, fim)] as Intervalo).filter(([a, b]) => b > a);

export type Resultado = { dias: DiaSaude[]; resumo: string; avisos: string[] };

export function lerEnvio(corpo: Record<string, unknown>): Resultado {
  const avisos: string[] = [];
  const porDia = new Map<string, DiaSaude>();
  const dia = (d: string) => { if (!porDia.has(d)) porDia.set(d, { dia: d }); return porDia.get(d)!; };

  // ── passos: um valor por dia (o Saúde já agrupou)
  const pv = lista(corpo.passos), pd = lista(corpo.passos_datas);
  const passos = new Map<string, number>();
  let cortado: string | null = null;
  if (pv.length && pv.length !== pd.length) avisos.push(`passos: ${pv.length} valores e ${pd.length} datas`);
  for (let i = 0; i < Math.min(pv.length, pd.length); i++) {
    const v = lerNumero(pv[i]), t = lerData(pd[i]);
    if (v === null || t === null) { avisos.push(`passos: não entendi "${pv[i]}" / "${pd[i]}"`); continue; }
    // o Atalhos às vezes marca o começo do dia como 23:59 da véspera em outro fuso: arredonda para o dia mais próximo
    const d = diaDe(t + 3 * 3600000);
    passos.set(d, (passos.get(d) ?? 0) + v);
    // o primeiro grupo começa na hora em que a janela começa ("últimos 7 dias" a partir de agora): dia cortado
    const hora = new Date(t + FUSO_MIN * 60000);
    if (i === 0 && (hora.getUTCHours() > 0 && hora.getUTCHours() < 21 || hora.getUTCMinutes() > 1 && hora.getUTCHours() === 0)) cortado = d;
  }
  if (cortado && passos.size > 1) passos.delete(cortado);
  for (const [d, v] of passos) dia(d).passos = v;

  // ── sono: amostras com fase, começo e fim
  const sv = lista(corpo.sono), si = lista(corpo.sono_inicio), sf = lista(corpo.sono_fim);
  if (sv.length && (sv.length !== si.length || sv.length !== sf.length)) avisos.push(`sono: ${sv.length} fases, ${si.length} começos, ${sf.length} fins`);
  const fases: Record<Fase, Intervalo[]> = { cama: [], dormindo: [], essencial: [], profundo: [], rem: [], acordado: [] };
  for (let i = 0; i < Math.min(sv.length, si.length, sf.length); i++) {
    const f = lerFase(sv[i]), a = lerData(si[i]), b = lerData(sf[i]);
    if (!f || a === null || b === null || b <= a || b - a > 24 * 3600000) { avisos.push(`sono: não entendi "${sv[i]}" ${si[i]} → ${sf[i]}`); continue; }
    fases[f].push([a, b]);
  }
  const dormindo = unir([...fases.dormindo, ...fases.essencial, ...fases.profundo, ...fases.rem]);
  const tudo = unir([...dormindo, ...fases.cama, ...fases.acordado]);
  // noites: pedaços separados por menos de 2 h
  const noites: Intervalo[] = [];
  for (const x of tudo) {
    const u = noites[noites.length - 1];
    if (u && x[0] - u[1] < 2 * 3600000) u[1] = Math.max(u[1], x[1]);
    else noites.push([x[0], x[1]]);
  }
  const noitesPorDia = new Map<string, Intervalo[]>();
  for (const n of noites) {
    // a primeira noite da janela pode estar cortada (as amostras de antes do começo da janela ficaram de fora):
    // se ela "começa" de madrugada ou de manhã (3h–14h), é o pedaço final de uma noite — fica de fora
    const h = new Date(n[0] + FUSO_MIN * 60000).getUTCHours();
    if (n === noites[0] && noites.length > 1 && h >= 3 && h < 14) continue;
    const d = diaDe(n[1]);
    if (!noitesPorDia.has(d)) noitesPorDia.set(d, []);
    noitesPorDia.get(d)!.push(n);
  }
  const fasesU = { essencial: unir(fases.essencial), profundo: unir(fases.profundo), rem: unir(fases.rem), acordado: unir(fases.acordado), cama: unir(fases.cama) };
  const temFases = fases.essencial.length + fases.profundo.length + fases.rem.length > 0;
  for (const [d, ns] of noitesPorDia) {
    const sonoMin = ns.reduce((a, [i, f]) => a + minutos(dentro(dormindo, i, f)), 0);
    const camaMin = ns.reduce((a, [i, f]) => a + minutos(dentro(unir([...fasesU.cama, ...dormindo, ...fasesU.acordado]), i, f)), 0);
    const soma = (xs: Intervalo[]) => ns.reduce((a, [i, f]) => a + minutos(dentro(xs, i, f)), 0);
    const principal = ns.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
    if (sonoMin < 20 && camaMin < 20) continue; // um cochilo registrado por engano
    const r = dia(d);
    r.sono_min = sonoMin || null;
    r.na_cama_min = camaMin || null;
    r.deitou = new Date(principal[0]).toISOString();
    r.acordou = new Date(principal[1]).toISOString();
    r.profundo_min = temFases ? soma(fasesU.profundo) : null;
    r.rem_min = temFases ? soma(fasesU.rem) : null;
    r.essencial_min = temFases ? soma(fasesU.essencial) : null;
    r.acordado_min = soma(fasesU.acordado) || null;
  }

  const dias = [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia));
  const nPassos = dias.filter((d) => d.passos !== undefined).length;
  const nSono = dias.filter((d) => d.sono_min !== undefined).length;
  const ultima = [...dias].reverse().find((d) => d.sono_min !== undefined);
  const hm = (m: number) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
  const partes = [
    nPassos ? `passos de ${nPassos} ${nPassos === 1 ? "dia" : "dias"}` : "nenhum dia de passos",
    nSono ? `${nSono} ${nSono === 1 ? "noite" : "noites"} de sono` : "nenhuma noite de sono",
  ];
  const resumo = `Recebido: ${partes.join(" e ")}${ultima ? ` (última noite: ${hm(ultima.sono_min ?? ultima.na_cama_min ?? 0)})` : ""}.`;
  return { dias, resumo, avisos };
}
