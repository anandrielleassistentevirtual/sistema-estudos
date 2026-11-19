"use client";
import { BookHeart, ListChecks } from "lucide-react";
import { TabNav } from "./tab-nav";

/** Abas de Oração: Lectio Divina · Exame de consciência. */
export function OracaoTabs({ className = "mb-6" }: { className?: string }) {
  return (
    <TabNav rotulo="Oração" className={className} abas={[
      { href: "/lectio", label: "Lectio Divina", icon: BookHeart },
      { href: "/oracao/exame", label: "Exame de consciência", icon: ListChecks },
    ]} />
  );
}
