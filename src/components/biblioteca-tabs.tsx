"use client";
import { Library, Network, Rows3 } from "lucide-react";
import { TabNav } from "./tab-nav";

/** Abas da Biblioteca: o Plano (o que ler, em que ordem, e como está indo), a Estante (as pastas CDD) e os Temas (leitura sintópica). */
export function BibliotecaTabs() {
  return (
    <TabNav rotulo="Biblioteca" abas={[
      { href: "/biblioteca", label: "Plano de leitura", icon: Rows3, exata: true },
      { href: "/biblioteca/estante", label: "Estante", icon: Library },
      { href: "/biblioteca/temas", label: "Temas", icon: Network },
    ]} />
  );
}
