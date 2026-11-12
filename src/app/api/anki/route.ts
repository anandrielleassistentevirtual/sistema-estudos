/**
 * Anki pelo AnkiWeb, no servidor do sistema (o navegador não pode falar direto com o AnkiWeb).
 * POST { acao: "entrar", usuario, senha, tz }  → troca a senha por uma chave e já sincroniza (a senha não é guardada)
 * POST { acao: "sincronizar", tz }             → baixa uma cópia da coleção e atualiza os números
 * POST { acao: "sair" }                         → esquece a chave
 * Só leitura: nada é enviado para a sua coleção.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ErroAnkiWeb, baixarColecao, entrar, meta } from "@/lib/server/ankiweb";
import { lerColecao } from "@/lib/server/anki-colecao";
import { LEITOR_ANKI as LEITOR } from "@/lib/anki-versao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A contagem de revisões do Anki no sistema começa neste dia (mesma regra de src/lib/anki.ts). */
const ANKI_INICIO = "2026-11-08";

async function cliente() {
  const loja = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => loja.getAll(), setAll: () => {} },
  });
}

const fusoValido = (tz: unknown) => {
  if (typeof tz !== "string" || !tz) return "America/Sao_Paulo";
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return "America/Sao_Paulo"; }
};

function mensagem(e: unknown): { texto: string; status: number } {
  if (e instanceof ErroAnkiWeb) {
    if (e.status === 403) return { texto: "O AnkiWeb não aceitou o login. Confira o e-mail e a senha (os mesmos que você usa para sincronizar o Anki).", status: 401 };
    if (e.status === 409) return { texto: "O AnkiWeb está ocupado com outra sincronização. Tente de novo em um minuto.", status: 409 };
    if (e.status === 501 || e.status === 400) return { texto: `O AnkiWeb recusou o pedido (${e.status}): ${e.message}`, status: 502 };
    return { texto: `O AnkiWeb respondeu com erro ${e.status}. Tente de novo daqui a pouco.`, status: 502 };
  }
  const t = (e as Error)?.name === "TimeoutError" ? "O AnkiWeb demorou demais para responder. Tente de novo." : `Não consegui sincronizar: ${(e as Error)?.message ?? e}`;
  return { texto: t, status: 500 };
}

export async function POST(req: Request) {
  const sb = await cliente();
  const { data: claims } = await sb.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ erro: "Entre no sistema primeiro." }, { status: 401 });

  const corpo = (await req.json().catch(() => ({}))) as { acao?: string; usuario?: string; senha?: string; tz?: string };
  const tz = fusoValido(corpo.tz);

  try {
    if (corpo.acao === "sair") {
      await sb.from("anki_conta").delete().eq("user_id", claims.claims.sub);
      return NextResponse.json({ ok: true });
    }

    if (corpo.acao === "entrar") {
      const usuario = (corpo.usuario ?? "").trim();
      if (!usuario || !corpo.senha) return NextResponse.json({ erro: "Escreva o e-mail e a senha do AnkiWeb." }, { status: 400 });
      const hkey = await entrar(usuario, corpo.senha);
      const { error } = await sb.from("anki_conta").upsert({ user_id: claims.claims.sub, usuario, endpoint: null, colecao_mod: null, erro: null });
      if (error) throw new Error(error.message);
      // a chave fica numa tabela que ninguém lê direto: só estas funções do banco, e só para o dono
      const { error: e2 } = await sb.rpc("anki_guardar_chave", { p_hkey: hkey });
      if (e2) throw new Error(e2.message);
    } else if (corpo.acao !== "sincronizar") {
      return NextResponse.json({ erro: "Ação desconhecida." }, { status: 400 });
    }

    // ---- sincronizar ----
    const [{ data: ch }, { data: conta }] = await Promise.all([
      sb.rpc("anki_chave"),
      sb.from("anki_conta").select("sincronizado_em,resumo").eq("user_id", claims.claims.sub).maybeSingle(),
    ]);
    const chave = (ch as { hkey: string; endpoint: string | null; colecao_mod: number | null }[] | null)?.[0];
    if (!chave) return NextResponse.json({ erro: "Conecte o AnkiWeb primeiro." }, { status: 400 });

    const m = await meta(chave.hkey, chave.endpoint);
    // nada mudou no AnkiWeb desde a última vez, no mesmo dia: não precisa baixar de novo
    const diaDe = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
    const c0 = conta as { sincronizado_em: string | null; resumo: { leitor?: number } | null } | null;
    const ultima = c0?.sincronizado_em;
    if (corpo.acao === "sincronizar" && chave.colecao_mod === m.meta.mod && c0?.resumo?.leitor === LEITOR && ultima && diaDe(new Date(ultima)) === diaDe(new Date())) {
      const agora = new Date().toISOString();
      await sb.from("anki_conta").update({ endpoint: m.endpoint, sincronizado_em: agora, erro: null }).eq("user_id", claims.claims.sub);
      return NextResponse.json({ ok: true, semNovidades: true, sincronizado_em: agora });
    }
    if (m.meta.cont === false) {
      throw new Error(m.meta.msg || "O AnkiWeb pediu para não sincronizar agora.");
    }
    if (m.meta.empty) {
      await sb.from("anki_conta").update({ endpoint: m.endpoint, sincronizado_em: new Date().toISOString(), erro: null }).eq("user_id", claims.claims.sub);
      return NextResponse.json({ ok: true, vazio: true });
    }

    const dir = await mkdtemp(join(tmpdir(), "anki-"));
    try {
      const arquivo = join(dir, "colecao.anki2");
      await writeFile(arquivo, await baixarColecao(chave.hkey, m.endpoint, m.sessaoId));
      const { dias, baralhos, resumo } = lerColecao(arquivo, { tz, desde: ANKI_INICIO });

      for (let i = 0; i < dias.length; i += 500) {
        const { error } = await sb.from("anki_daily").upsert(dias.slice(i, i + 500).map((d) => ({ ...d, user_id: claims.claims.sub })));
        if (error) throw new Error(error.message);
      }
      const agora = new Date().toISOString();
      await sb.from("anki_conta").update({
        endpoint: m.endpoint, colecao_mod: m.meta.mod, baralhos, resumo: { ...resumo, servidor_mod: m.meta.mod, leitor: LEITOR }, sincronizado_em: agora, erro: null,
      }).eq("user_id", claims.claims.sub);
      return NextResponse.json({ ok: true, dias: dias.length, sincronizado_em: agora, mensagem: m.meta.msg || null });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  } catch (e) {
    const { texto, status } = mensagem(e);
    await sb.from("anki_conta").update({ erro: texto }).eq("user_id", claims.claims.sub);
    return NextResponse.json({ erro: texto }, { status });
  }
}
