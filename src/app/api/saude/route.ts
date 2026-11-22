/**
 * Recebe passos e sono do atalho do iPhone (app Atalhos → "Obter Conteúdo do URL", método POST, corpo JSON).
 * Não pede login: quem protege é a chave pessoal (Saúde → Conectar o iPhone), que só grava passos e sono.
 * A resposta é um texto curto, para aparecer no iPhone quando o atalho é rodado à mão.
 */
import { createClient } from "@supabase/supabase-js";
import { lerEnvio } from "@/lib/saude-atalho";

export const dynamic = "force-dynamic";

const texto = (s: string, status = 200) =>
  new Response(s + "\n", { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });

export async function POST(req: Request) {
  let corpo: Record<string, unknown> = {};
  try {
    const tipo = req.headers.get("content-type") ?? "";
    if (tipo.includes("application/json")) corpo = await req.json();
    else if (tipo.includes("form")) corpo = Object.fromEntries((await req.formData()).entries());
    else { const t = await req.text(); corpo = t.trim().startsWith("{") ? JSON.parse(t) : {}; }
  } catch {
    return texto("Não consegui ler o que o atalho mandou. Confira se o corpo da solicitação é JSON.", 400);
  }
  if (req.headers.get("content-length") && Number(req.headers.get("content-length")) > 2_000_000) return texto("Envio grande demais.", 413);
  const chave = String(corpo.chave ?? "").trim();
  if (!/^[0-9a-f]{48}$/.test(chave)) return texto("Chave ausente ou incompleta. Copie de novo a chave em Saúde → Conectar o iPhone.", 401);

  const { dias, resumo, avisos } = lerEnvio(corpo);
  if (!dias.length) {
    return texto(`Nada para gravar: o atalho não mandou passos nem sono que eu entendesse.${avisos.length ? "\n" + avisos.slice(0, 5).join("\n") : ""}`, 422);
  }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error } = await sb.rpc("registrar_saude", { p_chave: chave, p_dias: dias, p_resumo: resumo });
  if (error) {
    if (/chave inválida/.test(error.message)) return texto("Chave inválida (talvez você gerou uma nova). Copie a chave atual em Saúde → Conectar o iPhone.", 401);
    return texto("Não consegui gravar agora. Tente de novo mais tarde.", 500);
  }
  return texto(resumo + (avisos.length ? `\n(${avisos.length} ${avisos.length === 1 ? "item ignorado" : "itens ignorados"})` : ""));
}

export function GET() {
  return texto("Este endereço recebe passos e sono do atalho do iPhone (método POST). Veja Saúde → Conectar o iPhone.");
}
