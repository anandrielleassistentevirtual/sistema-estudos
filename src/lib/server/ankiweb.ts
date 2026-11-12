/**
 * Cliente mínimo do protocolo de sincronização do AnkiWeb (versão 11), só para LEITURA:
 * entrar (troca e-mail e senha por uma chave, como o próprio Anki faz), consultar o estado da coleção
 * e baixar uma cópia dela. Nunca envia nada que altere os seus baralhos.
 * Referência: rslib/src/sync no código aberto do Anki.
 */
import { zstdCompressSync, zstdDecompressSync } from "node:zlib";

const BASE = process.env.ANKIWEB_URL || "https://sync.ankiweb.net/"; // ANKIWEB_URL: só para testes
const VERSAO_SYNC = 11;
/** "versão,build,plataforma": a versão do Anki atual e a identificação deste sistema no lugar do build. */
const CLIENTE = "26.09.4,sistema-estudos,linux";

export class ErroAnkiWeb extends Error {
  constructor(public status: number, mensagem: string, public local?: string) { super(mensagem); }
}

function sessao() {
  const t = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let n = Math.floor(Math.random() * 2 ** 32), s = "";
  do { s = t[n % t.length] + s; n = Math.floor(n / t.length); } while (n > 0);
  return s;
}

async function pedido(endpoint: string, metodo: string, hkey: string, corpo: unknown, sessaoId: string): Promise<Buffer> {
  const url = new URL(`sync/${metodo}`, endpoint || BASE);
  const r = await fetch(url, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/octet-stream",
      "anki-sync": JSON.stringify({ v: VERSAO_SYNC, k: hkey, c: CLIENTE, s: sessaoId }),
    },
    body: new Uint8Array(zstdCompressSync(Buffer.from(JSON.stringify(corpo)))),
    signal: AbortSignal.timeout(50_000),
  });
  if (r.status === 308) throw new ErroAnkiWeb(308, "redirecionado", r.headers.get("location") ?? undefined);
  const buf = Buffer.from(await r.arrayBuffer());
  if (!r.ok) {
    let texto = "";
    try { texto = zstdDecompressSync(buf).toString("utf8"); } catch { texto = buf.toString("utf8"); }
    throw new ErroAnkiWeb(r.status, texto.slice(0, 300) || `HTTP ${r.status}`);
  }
  return zstdDecompressSync(buf, { maxOutputLength: 2 ** 31 - 1 });
}

/** Troca e-mail e senha por uma chave de acesso (a senha não é guardada). */
export async function entrar(usuario: string, senha: string): Promise<string> {
  const r = JSON.parse((await pedido(BASE, "hostKey", "", { u: usuario, p: senha }, sessao())).toString("utf8"));
  if (!r?.key) throw new ErroAnkiWeb(500, "O AnkiWeb não devolveu a chave de acesso.");
  return r.key as string;
}

export interface MetaAnkiWeb { mod: number; scm: number; usn: number; ts: number; msg: string; cont: boolean; empty?: boolean }

/** Estado da coleção no AnkiWeb (segue o redirecionamento para outro servidor, se houver). */
export async function meta(hkey: string, endpoint: string | null): Promise<{ meta: MetaAnkiWeb; endpoint: string; sessaoId: string }> {
  const sessaoId = sessao();
  let ep = endpoint || BASE;
  const corpo = { v: VERSAO_SYNC, cv: `anki,26.09.4 (sistema-estudos),linux` };
  let buf: Buffer;
  try {
    buf = await pedido(ep, "meta", hkey, corpo, sessaoId);
  } catch (e) {
    if (e instanceof ErroAnkiWeb && e.status === 308 && e.local) { ep = e.local; buf = await pedido(ep, "meta", hkey, corpo, sessaoId); }
    else throw e;
  }
  return { meta: JSON.parse(buf.toString("utf8")), endpoint: ep, sessaoId };
}

/** Baixa uma cópia da coleção (arquivo SQLite do Anki). */
export async function baixarColecao(hkey: string, endpoint: string, sessaoId: string): Promise<Buffer> {
  return pedido(endpoint, "download", hkey, { _pad: null }, sessaoId);
}
