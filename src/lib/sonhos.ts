"use client";
/**
 * Quadro dos sonhos: uma colagem de imagens (o nome do sonho é opcional e não aparece no quadro).
 * As imagens ficam no armazenamento do sistema (reduzidas, como as capas) ou são o link de uma imagem da internet.
 */
import { supabase, userId } from "./supabase/client";
import { isLink, shrink } from "./covers";

export interface Sonho {
  id: string;
  titulo: string;
  frase: string;
  area: string;
  imagem: string | null;
  posicao: number;
  realizado_em: string | null;
  created_at: string;
}

export async function carregarSonhos(): Promise<Sonho[]> {
  const { data, error } = await supabase().from("sonhos").select("*").order("posicao").order("created_at");
  if (error) throw new Error(error.message);
  return (data as Sonho[]) ?? [];
}

/** Links para mostrar as imagens (as guardadas no sistema precisam de um link assinado, válido por 12 h). */
export async function imagensDosSonhos(sonhos: Sonho[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const s of sonhos) if (s.imagem && isLink(s.imagem)) out[s.id] = s.imagem;
  const guardadas = sonhos.filter((s) => s.imagem && !isLink(s.imagem));
  if (!guardadas.length) return out;
  const { data } = await supabase().storage.from("livros").createSignedUrls(guardadas.map((s) => s.imagem!), 60 * 60 * 12);
  (Array.isArray(data) ? data : []).forEach((d, i) => { if (d.signedUrl) out[guardadas[i].id] = d.signedUrl; });
  return out;
}

/** Guarda uma imagem (arquivo ou colada) reduzida a 1200px no maior lado; devolve o caminho. */
export async function guardarImagem(img: Blob): Promise<string> {
  const uid = await userId();
  const leve = await shrink(img, 1200, "maior");
  const path = `${uid}/sonhos/${crypto.randomUUID()}.${leve.type === "image/webp" ? "webp" : "jpg"}`;
  const up = await supabase().storage.from("livros").upload(path, leve, { contentType: leve.type });
  if (up.error) throw new Error(up.error.message);
  return path;
}

/** Uma imagem pelo link: tenta guardar uma cópia; se o site não deixar, usa o próprio link. */
export async function imagemDoLink(link: string): Promise<string> {
  const url = link.trim();
  if (!isLink(url)) throw new Error("Cole um link que comece com http:// ou https://");
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    if (res.ok && blob.type.startsWith("image/")) return await guardarImagem(blob);
  } catch { /* o site não deixa copiar: fica o link */ }
  await new Promise<void>((ok, falha) => {
    const img = new Image();
    img.onload = () => ok();
    img.onerror = () => falha(new Error("Não consegui abrir essa imagem. Confira se o link é de uma imagem (.jpg, .png…)."));
    img.src = url;
  });
  return url;
}

/** Apaga a imagem guardada (links da internet não precisam). */
export async function apagarImagem(imagem: string | null) {
  if (imagem && !isLink(imagem)) await supabase().storage.from("livros").remove([imagem]);
}
