import { semAcento } from "@/lib/text";
/**
 * Selo da plataforma onde se assiste/ouve (Netflix, Prime Video, YouTube…), reconhecida pelo texto "onde".
 * Desenhos simples, só para identificar de relance.
 */
export type Plataforma = "netflix" | "prime" | "youtube" | "max" | "disney" | "apple" | "spotify" | "globoplay" | "paramount" | "kindle";

export const PLATAFORMAS: { id: Plataforma; nome: string }[] = [
  { id: "netflix", nome: "Netflix" },
  { id: "prime", nome: "Prime Video" },
  { id: "youtube", nome: "YouTube" },
  { id: "max", nome: "Max" },
  { id: "disney", nome: "Disney+" },
  { id: "apple", nome: "Apple TV+" },
  { id: "spotify", nome: "Spotify" },
  { id: "globoplay", nome: "Globoplay" },
  { id: "paramount", nome: "Paramount+" },
  { id: "kindle", nome: "Kindle" },
];

export function plataformaDe(onde: string): Plataforma | null {
  const o = semAcento(onde);
  if (o.includes("netflix")) return "netflix";
  if (o.includes("prime") || o.includes("amazon")) return "prime";
  if (o.includes("youtube") || o === "yt") return "youtube";
  if (/\bmax\b|hbo/.test(o)) return "max";
  if (o.includes("disney")) return "disney";
  if (o.includes("apple")) return "apple";
  if (o.includes("spotify")) return "spotify";
  if (o.includes("globo")) return "globoplay";
  if (o.includes("paramount")) return "paramount";
  if (o.includes("kindle")) return "kindle";
  return null;
}

export function PlataformaIcone({ onde, tamanho = 20 }: { onde: string; tamanho?: number }) {
  const p = plataformaDe(onde);
  if (!p) return null;
  const s = tamanho;
  const caixa = (bg: string, filho: React.ReactNode, titulo: string) => (
    <svg width={s} height={s} viewBox="0 0 20 20" role="img" aria-label={titulo} className="shrink-0 rounded-[5px]">
      <title>{titulo}</title>
      <rect width="20" height="20" rx="5" fill={bg} />
      {filho}
    </svg>
  );
  const letra = (t: string, cor = "#fff", tam = 11) => (
    <text x="10" y="10.5" textAnchor="middle" dominantBaseline="central" fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fontSize={tam} fill={cor}>{t}</text>
  );
  switch (p) {
    case "netflix":
      return caixa("#000", <path d="M6.5 4h2.4l2.6 7.4V4h2.4v12c-.8-.1-1.6-.1-2.4 0L8.9 8.6V16c-.8 0-1.6 0-2.4.1z" fill="#E50914" />, "Netflix");
    case "prime":
      return caixa("#00A8E1", <>
        {letra("prime", "#fff", 6.2)}
        <path d="M5 13.6c3 1.6 7 1.6 10 0" stroke="#fff" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      </>, "Prime Video");
    case "youtube":
      return caixa("#FF0000", <path d="M8 6.3v7.4l6-3.7z" fill="#fff" />, "YouTube");
    case "max":
      return caixa("#002BE7", letra("max", "#fff", 7.5), "Max");
    case "disney":
      return caixa("#0E2B63", letra("D+", "#fff", 8.5), "Disney+");
    case "apple":
      return caixa("#000", letra("tv", "#fff", 9), "Apple TV+");
    case "spotify":
      return caixa("#1DB954", <g stroke="#000" strokeWidth="1.4" fill="none" strokeLinecap="round">
        <path d="M5.2 8c3.3-1 6.8-.7 9.6.8" /><path d="M5.8 10.7c2.7-.8 5.5-.5 7.8.7" /><path d="M6.4 13.2c2.1-.6 4.2-.4 6 .5" />
      </g>, "Spotify");
    case "globoplay":
      return caixa("#FB0234", <circle cx="10" cy="10" r="4.2" fill="none" stroke="#fff" strokeWidth="2" />, "Globoplay");
    case "paramount":
      return caixa("#0064FF", letra("P+", "#fff", 8.5), "Paramount+");
    case "kindle":
      return caixa("#232F3E", letra("K", "#fff", 10), "Kindle");
  }
}
