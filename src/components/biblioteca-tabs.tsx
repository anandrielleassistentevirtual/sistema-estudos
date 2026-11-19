"use client";
import { Library, Target } from "lucide-react";
import { TabNav } from "./tab-nav";

/** Abas da Biblioteca: os livros (pastas CDD e fila) e as mesas de objetivos. */
export function BibliotecaTabs() {
  return (
    <TabNav rotulo="Biblioteca" abas={[
      { href: "/biblioteca", label: "Livros", icon: Library, exata: true },
      { href: "/biblioteca/objetivos", label: "Mesas de objetivos", icon: Target },
    ]} />
  );
}
