"use client";
/** Saúde: passos e sono que o atalho do iPhone manda todo dia (ver /api/saude e lib/saude-atalho). */
import { supabase } from "./supabase/client";
import { todas } from "./supabase/todas";

export interface DiaSaude {
  dia: string;
  passos: number | null;
  sono_min: number | null;
  na_cama_min: number | null;
  deitou: string | null;
  acordou: string | null;
  profundo_min: number | null;
  rem_min: number | null;
  essencial_min: number | null;
  acordado_min: number | null;
}

export interface ChaveSaude { created_at: string; ultimo_uso: string | null; ultimo_resumo: string | null }

export const ENDERECO_SAUDE = "https://sistema-estudos-silk.vercel.app/api/saude";

export async function carregarSaude(desde: string): Promise<DiaSaude[]> {
  return todas<DiaSaude>((de, ate) => supabase().from("saude_dias")
    .select("dia,passos,sono_min,na_cama_min,deitou,acordou,profundo_min,rem_min,essencial_min,acordado_min")
    .gte("dia", desde).order("dia").range(de, ate));
}

export async function chaveSaude(): Promise<ChaveSaude | null> {
  const { data } = await supabase().from("saude_chave").select("created_at,ultimo_uso,ultimo_resumo").maybeSingle();
  return (data as ChaveSaude | null) ?? null;
}

/** Gera a chave (ou troca a antiga, que para de funcionar). O texto só existe agora: no banco fica o hash. */
export async function gerarChaveSaude(): Promise<string> {
  const { data, error } = await supabase().rpc("criar_chave_saude");
  if (error) throw new Error(error.message);
  return data as string;
}

/** O sono da noite: o tempo dormindo; sem relógio (só "na cama"), o tempo na cama. */
export const sonoDe = (d: DiaSaude) => d.sono_min ?? d.na_cama_min ?? null;

export const fmtSono = (min: number | null | undefined) => {
  if (min == null) return "—";
  const m = Math.round(min);
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
};

/** Minutos desde a meia-noite, no horário de Brasília. */
export const minutoDoDia = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 3 * 3600000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
export const fmtHora = (min: number | null) => {
  if (min == null) return "—";
  const t = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/** Horário médio de deitar: 23:30 e 00:30 dão 00:00 (não 12:00) — as horas da madrugada contam como “depois da meia-noite”. */
export function horaMediaDeitar(isos: string[]): number | null {
  if (!isos.length) return null;
  const ms = isos.map(minutoDoDia).map((m) => (m < 15 * 60 ? m + 1440 : m));
  return Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) % 1440;
}
export function horaMediaAcordar(isos: string[]): number | null {
  if (!isos.length) return null;
  const ms = isos.map(minutoDoDia);
  return Math.round(ms.reduce((a, b) => a + b, 0) / ms.length);
}

export interface MetasSaude { passos: number; sonoMin: number }
export const METAS_PADRAO: MetasSaude = { passos: 8000, sonoMin: 450 };

export async function lerMetas(): Promise<MetasSaude> {
  const { data } = await supabase().auth.getUser();
  const m = data.user?.user_metadata ?? {};
  return { passos: Number(m.saude_meta_passos) || METAS_PADRAO.passos, sonoMin: Number(m.saude_meta_sono_min) || METAS_PADRAO.sonoMin };
}
export async function salvarMetas(m: MetasSaude) {
  const { error } = await supabase().auth.updateUser({ data: { saude_meta_passos: m.passos, saude_meta_sono_min: m.sonoMin } });
  if (error) throw new Error(error.message);
}
