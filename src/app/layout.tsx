import type { Metadata, Viewport } from "next";
import { Inter, Literata, Tinos } from "next/font/google";
import "./globals.css";

// fontes servidas pelo próprio site (sem esperar o Google Fonts para desenhar a página)
const inter = Inter({ subsets: ["latin"], axes: ["opsz"], variable: "--font-inter", display: "swap" });
const literata = Literata({ subsets: ["latin"], axes: ["opsz"], style: ["normal", "italic"], variable: "--font-literata", display: "swap" });
const tinos = Tinos({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--font-tinos", display: "swap" });

export const metadata: Metadata = {
  title: "Sistema de Estudos",
  description: "Leitura, notas, idiomas e métricas de estudo num só lugar.",
  applicationName: "Estudos",
  appleWebApp: { capable: true, title: "Estudos", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
  ],
};

const themeScript = `try{var t=localStorage.getItem("tema");document.documentElement.dataset.theme=t||"dark"}catch(e){document.documentElement.dataset.theme="dark"}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${inter.variable} ${literata.variable} ${tinos.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
