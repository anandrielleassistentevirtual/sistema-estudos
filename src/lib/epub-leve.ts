/**
 * Livros muito ilustrados: o EPUB costuma trazer as imagens em resolução de impressão (125 MB, 200 MB…),
 * muito acima do que uma tela mostra e do limite de 50 MB por arquivo do armazenamento.
 * Aqui, no próprio navegador, antes de enviar:
 *  - cada ilustração é reduzida para um tamanho de leitura e regravada num formato leve (WebP; JPEG
 *    onde o navegador não grava WebP; PNG só quando a imagem tem transparência);
 *  - o texto, a ordem e o lugar de cada imagem não mudam: as referências (capítulos, sumário, CSS, OPF)
 *    são corrigidas para o nome novo do arquivo;
 *  - se ainda passar do limite, mede quanto sobrou e calcula a resolução que cabe (a maior possível);
 *    as fontes embutidas saem (o leitor usa as próprias fontes).
 * O arquivo original fica intacto no seu computador.
 */

export const LIMITE_ENVIO = 46 * 1024 * 1024; // folga sob os 50 MB do plano gratuito
export const COMPRIMIR_ACIMA = 8 * 1024 * 1024;

const LADO_MAX = 1600;
const LADO_MIN = 720; // abaixo disso as pranchas perdem demais; melhor avisar
const IMAGEM = /\.(jpe?g|png|webp|gif|bmp)$/i;
const FONTE = /\.(otf|ttf|woff2?|eot)$/i;
const TEXTO = /\.(x?html?|opf|ncx|css|xml|svg)$/i;
const EXT: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const nomeBase = (p: string) => p.slice(p.lastIndexOf("/") + 1);
export const mb = (n: number) => `${(n / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

let webpOk: boolean | null = null;
async function gravaWebp() {
  if (webpOk !== null) return webpOk;
  const c = document.createElement("canvas");
  c.width = c.height = 2;
  const b = await new Promise<Blob | null>((r) => c.toBlob(r, "image/webp", 0.8));
  return (webpOk = b?.type === "image/webp");
}

function temTransparencia(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const d = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}

export interface Resultado { arquivo: File; antes: number; depois: number; imagens: number; detalhe?: string }

export async function aliviarEpub(file: File, avisar: (msg: string) => void = () => {}): Promise<Resultado> {
  const JSZip = (await import("jszip")).default;
  avisar("Abrindo o livro…");
  const zip = await JSZip.loadAsync(file);
  const imagens = Object.values(zip.files).filter((f) => !f.dir && IMAGEM.test(f.name));
  if (!imagens.length) return { arquivo: file, antes: file.size, depois: file.size, imagens: 0 };
  const webp = await gravaWebp();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  /** Uma passada completa: todas as imagens com no máximo `lado` px e qualidade `q`. */
  async function passada(lado: number, q: number, semFontes: boolean, rotulo: string) {
    const novo = await JSZip.loadAsync(file); // sempre a partir do original
    const renomes = new Map<string, string>(); // caminho antigo → caminho novo
    let bytesImagens = 0;
    for (const [k, img] of imagens.entries()) {
      avisar(`Comprimindo as ilustrações${rotulo}: ${k + 1} de ${imagens.length}…`);
      const blob = await img.async("blob");
      const bmp = await createImageBitmap(blob).catch(() => null);
      if (!bmp) { bytesImagens += blob.size; continue; } // formato que o navegador não abre: fica como está
      const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
      if (escala === 1 && blob.size < 120_000) { bmp.close(); bytesImagens += blob.size; continue; }
      const w = Math.max(1, Math.round(bmp.width * escala));
      const h = Math.max(1, Math.round(bmp.height * escala));
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(bmp, 0, 0, w, h);
      bmp.close();
      const alfa = !/\.jpe?g$/i.test(img.name) && temTransparencia(ctx, w, h);
      const tipo = webp ? "image/webp" : alfa ? "image/png" : "image/jpeg";
      const saida = await new Promise<Blob | null>((r) => canvas.toBlob(r, tipo, q));
      if (!saida || saida.size >= blob.size) { bytesImagens += blob.size; continue; } // não compensou
      bytesImagens += saida.size;
      const nome = img.name.replace(/\.[^./]+$/, `.${EXT[saida.type] ?? "jpg"}`);
      if (nome !== img.name) { novo.remove(img.name); renomes.set(img.name, nome); }
      novo.file(nome, saida);
      if (k % 8 === 7) await new Promise((r) => setTimeout(r, 0)); // a tela não congela
    }
    if (semFontes) for (const f of Object.values(novo.files)) if (!f.dir && FONTE.test(f.name)) novo.remove(f.name);

    // corrige as referências às imagens que mudaram de nome
    if (renomes.size) {
      avisar("Ajustando as referências das imagens no texto…");
      const trocas = [...renomes].map(([a, b]) => ({
        de: nomeBase(a), para: nomeBase(b),
        re: new RegExp(`(^|[/"'(\\s=])${esc(nomeBase(a))}(?=["')\\s#?]|$)`, "g"),
      }));
      for (const f of Object.values(novo.files)) {
        if (f.dir || !TEXTO.test(f.name)) continue;
        let t = await f.async("string");
        const original = t;
        for (const x of trocas) if (t.includes(x.de)) t = t.replace(x.re, `$1${x.para}`);
        if (/\.opf$/i.test(f.name)) t = acertarTipos(t, semFontes);
        if (t !== original) novo.file(f.name, t);
      }
    } else if (semFontes) {
      for (const f of Object.values(novo.files)) {
        if (f.dir || !/\.opf$/i.test(f.name)) continue;
        novo.file(f.name, acertarTipos(await f.async("string"), true));
      }
    }

    novo.file("mimetype", "application/epub+zip", { compression: "STORE" });
    const blob = await novo.generateAsync(
      { type: "blob", mimeType: "application/epub+zip", compression: "DEFLATE", compressionOptions: { level: 6 } },
      (m) => avisar(`Montando o livro… ${Math.round(m.percent)}%`),
    );
    return { blob, bytesImagens, bytesOutros: Math.max(0, blob.size - bytesImagens) };
  }

  // 1ª passada com a qualidade ideal; se não couber, calcula a resolução que cabe (o peso cai ~ com a área)
  let lado = LADO_MAX, q = 0.8, semFontes = false;
  let r = await passada(lado, q, semFontes, "");
  for (let tentativa = 1; r.blob.size > LIMITE_ENVIO && tentativa <= 3; tentativa++) {
    semFontes = true;
    const alvo = LIMITE_ENVIO * 0.93 - r.bytesOutros;
    if (alvo <= 0 || lado <= LADO_MIN) break;
    const fator = Math.sqrt(alvo / Math.max(1, r.bytesImagens));
    lado = Math.max(LADO_MIN, Math.min(lado * 0.92, Math.floor(lado * fator)));
    q = Math.max(0.62, q - 0.04);
    avisar(`Ficou com ${mb(r.blob.size)}; ajustando para caber (imagens até ${lado} px)…`);
    r = await passada(lado, q, semFontes, ` (ajuste ${tentativa})`);
  }

  let detalhe = `Imagens até ${lado} px.`;
  if (r.blob.size > LIMITE_ENVIO) {
    // os maiores arquivos que não são imagens comprimíveis (para saber o que está pesando)
    const tam = (f: { _data?: { compressedSize?: number } }) => f._data?.compressedSize ?? 0;
    const maiores = Object.values(zip.files)
      .filter((f) => !f.dir && !IMAGEM.test(f.name))
      .map((f) => ({ nome: nomeBase(f.name), b: tam(f as unknown as { _data?: { compressedSize?: number } }) }))
      .sort((a, b) => b.b - a.b).slice(0, 3).filter((x) => x.b > 512 * 1024);
    detalhe = `Imagens: ${mb(r.bytesImagens)} em ${imagens.length} arquivos, já em ${lado} px; o resto do livro: ${mb(r.bytesOutros)}.`
      + (maiores.length ? ` Maiores arquivos fora as imagens: ${maiores.map((x) => `${x.nome} (${mb(x.b)})`).join(", ")}.` : "");
  }
  return {
    arquivo: new File([r.blob], file.name, { type: "application/epub+zip" }),
    antes: file.size, depois: r.blob.size, imagens: imagens.length, detalhe,
  };
}

/** No manifesto (OPF): o media-type de cada imagem acompanha a extensão nova; fontes removidas saem do manifesto. */
function acertarTipos(opf: string, semFontes: boolean) {
  return opf.replace(/<item\b[^>]*>/g, (tag) => {
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/)?.[1] ?? "";
    if (semFontes && FONTE.test(href)) return "";
    const ext = href.split(".").pop()?.toLowerCase();
    const tipo = ext === "webp" ? "image/webp" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "png" ? "image/png" : null;
    if (!tipo) return tag;
    return /media-type\s*=/.test(tag) ? tag.replace(/media-type\s*=\s*["'][^"']*["']/, `media-type="${tipo}"`) : tag;
  });
}
