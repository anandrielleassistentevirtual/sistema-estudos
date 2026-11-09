import type { MetadataRoute } from "next";

/** App instalável (iPhone: Safari → Compartilhar → Adicionar à Tela de Início). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sistema de Estudos",
    short_name: "Estudos",
    description: "Leitura, oração, escrita, idiomas e métricas de estudo.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#000000",
    theme_color: "#000000",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
