import { supabase } from "./supabase/client";

/** Data (aaaa-mm-dd) da última confissão registrada, ou null. */
export async function ultimaConfissao(): Promise<string | null> {
  const { data } = await supabase().from("confissoes").select("feita_em").order("feita_em", { ascending: false }).limit(1);
  return (data as { feita_em: string }[] | null)?.[0]?.feita_em ?? null;
}

/** Há um exame em andamento (cifrado) esperando a confissão? Não precisa da senha: só vê se existe. */
export async function haExamePendente(): Promise<boolean> {
  const { data } = await supabase().from("exame_cofre").select("conteudo").maybeSingle();
  return !!(data as { conteudo: string | null } | null)?.conteudo;
}

/**
 * Registra a confissão e apaga para sempre os pecados marcados no exame.
 * Fica guardada só a data; a senha continua a mesma para o próximo exame.
 */
export async function registrarConfissao(feitaEm: string) {
  const sb = supabase();
  const [a, b] = await Promise.all([
    sb.from("confissoes").insert({ feita_em: feitaEm }),
    sb.from("exame_cofre").update({ conteudo: null, atualizado_em: new Date().toISOString() }).not("user_id", "is", null),
  ]);
  if (a.error) throw new Error(a.error.message);
  if (b.error) throw new Error(b.error.message);
}

/** Corrige a data da última confissão (quando foi registrada errada), sem mexer no exame. */
export async function corrigirUltimaConfissao(feitaEm: string) {
  const sb = supabase();
  const { data } = await sb.from("confissoes").select("id").order("feita_em", { ascending: false }).limit(1);
  const id = (data as { id: string }[] | null)?.[0]?.id;
  if (id) await sb.from("confissoes").update({ feita_em: feitaEm }).eq("id", id);
  else await sb.from("confissoes").insert({ feita_em: feitaEm });
}

export const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const dataBr = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
