/**
 * Instalação com um toque do script de Listening. O endereço termina em ".user.js": o Tampermonkey
 * (Chrome/Firefox) e o Userscripts (Safari do iPhone) reconhecem e mostram "Instalar".
 * Não pede login (a extensão baixa sozinha); quem protege é o código, que vale 30 minutos.
 */
import { createClient } from "@supabase/supabase-js";
import { scriptListening } from "@/lib/listening-script";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const cabecalho = { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" };
  if (!/^[0-9a-f]{32}$/.test(codigo)) return new Response("// endereço inválido\n", { status: 404, headers: cabecalho });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data } = await sb.rpc("pegar_instalacao_listening", { p_codigo: codigo });
  const d = data as { chave: string; idioma: string; aparelho: string } | null;
  if (!d) {
    return new Response("// Este link de instalação expirou (vale 30 minutos).\n// Volte ao Sistema de Estudos → Idiomas → Listening e toque em “Instalar neste aparelho” de novo.\n", { status: 410, headers: cabecalho });
  }
  return new Response(scriptListening(d.chave, d.idioma, d.aparelho), { headers: cabecalho });
}
