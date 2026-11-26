"use client";
import { BookHeart, ListChecks } from "lucide-react";
import { TabNav } from "./tab-nav";

/**
 * Abas de Oração: Lectio Divina · Exame de consciência.
 * As margens são sempre as do TabNav (as abas ficam no mesmo pixel nas duas telas): o className fica no tipo
 * só para não quebrar quem ainda o passa, e é ignorado.
 */
export function OracaoTabs(_: { className?: string }) {
  return (
    <TabNav rotulo="Oração" abas={[
      { href: "/lectio", label: "Lectio Divina", icon: BookHeart },
      { href: "/oracao/exame", label: "Exame de consciência", icon: ListChecks },
    ]} />
  );
}
