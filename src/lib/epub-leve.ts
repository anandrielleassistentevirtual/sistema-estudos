/**
 * Livros muito ilustrados: o EPUB costuma trazer as imagens em resolução de impressão (125 MB, 200 MB…),
 * muito acima do que uma tela mostra e do limite de 50 MB por arquivo do armazenamento.
 * Aqui, no próprio navegador, antes de enviar:
 *  - cada ilustração é reduzida para um tamanho de leitura e regravada num formato leve (WebP; JPEG
 *    onde o navegador não grava WebP; PNG só quando a imagem tem transparência);
 *  - o texto, a ordem e o lugar de cada imagem não mudam: as referências (capítulos, sumário, CSS, OPF)
 *    são corrigidas para o nome novo do arquivo;
 *  - se ainda passar do limite, tenta de novo com um pouco menos de resolução.
 * O arquivo original fica intacto no seu computador.
 */

export const LIMITE_ENVIO = 45 * 1024 * 1024; // folga sob os 50 MB do plano gratuito
export const COMPRIMIR_ACIMA = 8 * 1024 * 1024;

const NIVEIS = [
  { lado: 1600, q: 0.8 },
  { lado: 1300, q: 0.72 },
  { lado: 1050, q: 0.65 },
];
const IMAGEM = /\.(jpe?g|png|webp|bmp|tiff?)$/i;
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

export interface Resultado { arquivo: File; antes: number; depois: number; imagens: number }

export async function aliviarEpub(file: File, avisar: (msg: string) => void = () => {}): Promise<Resultado> {
  const JSZip = (await import("jszip")).default;
  avisar("Abrindo o livro…");
  const zip = await JSZip.loadAsync(file);
  const imagens = Object.values(zip.files).filter((f) => !f.dir && IMAGEM.test(f.name));
  if (!imagens.length) return { arquivo: file, antes: file.size, depois: file.size, imagens: 0 };
  const webp = await gravaWebp();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  let ultimo: Blob = file;
  for (const [n, nivel] of NIVEIS.entries()) {
    const novo = await JSZip.loadAsync(file); // sempre a partir do original
    const renomes = new Map<string, string>(); // caminho antigo → caminho novo
    for (const [k, img] of imagens.entries()) {
      avisar(`Comprimindo as ilustrações: ${k + 1} de ${imagens.length}${n ? " (mais leve)" : ""}…`);
      const blob = await img.async("blob");
      const bmp = await createImageBitmap(blob).catch(() => null);
      if (!bmp) continue; // formato que o navegador não abre: fica como está
      const escala = Math.min(1, nivel.lado / Math.max(bmp.width, bmp.height));
      if (escala === 1 && blob.size < 150_000) { bmp.close(); continue; }
      const w = Math.max(1, Math.round(bmp.width * escala));
      const h = Math.max(1, Math.round(bmp.height * escala));
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(bmp, 0, 0, w, h);
      bmp.close();
      const podeTerAlfa = !/\.jpe?g$/i.test(img.name);
      const alfa = podeTerAlfa && temTransparencia(ctx, w, h);
      const tipo = webp ? "image/webp" : alfa ? "image/png" : "image/jpeg";
      const saida = await new Promise<Blob | null>((r) => canvas.toBlob(r, tipo, nivel.q));
      if (!saida || saida.size >= blob.size) continue; // não compensou: mantém a original
      const ext = EXT[saida.type] ?? "jpg";
      const nome = img.name.replace(/\.[^./]+$/, `.${ext}`);
      if (nome !== img.name) { novo.remove(img.name); renomes.set(img.name, nome); }
      novo.file(nome, saida);
      // devolve o controle ao navegador de vez em quando (a tela não congela)
      if (k % 8 === 7) await new Promise((r) => setTimeout(r, 0));
    }

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
        if (/\.opf$/i.test(f.name)) t = acertarTipos(t);
        if (t !== original) novo.file(f.name, t);
      }
    }

    novo.file("mimetype", "application/epub+zip", { compression: "STORE" });
    ultimo = await novo.generateAsync(
      { type: "blob", mimeType: "application/epub+zip", compression: "DEFLATE", compressionOptions: { level: 6 } },
      (m) => avisar(`Montando o livro… ${Math.round(m.percent)}%`),
    );
    if (ultimo.size <= LIMITE_ENVIO) break;
    if (n < NIVEIS.length - 1) avisar(`Ficou com ${mb(ultimo.size)}; comprimindo um pouco mais…`);
  }
  return {
    arquivo: new File([ultimo], file.name, { type: "application/epub+zip" }),
    antes: file.size, depois: ultimo.size, imagens: imagens.length,
  };
}

/** No manifesto (OPF), o media-type de cada imagem acompanha a extensão nova. */
function acertarTipos(opf: string) {
  return opf.replace(/<item\b[^>]*>/g, (tag) => {
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/)?.[1] ?? "";
    const ext = href.split(".").pop()?.toLowerCase();
    const tipo = ext === "webp" ? "image/webp" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "png" ? "image/png" : null;
    if (!tipo) return tag;
    return /media-type\s*=/.test(tag) ? tag.replace(/media-type\s*=\s*["'][^"']*["']/, `media-type="${tipo}"`) : tag;
  });
}
