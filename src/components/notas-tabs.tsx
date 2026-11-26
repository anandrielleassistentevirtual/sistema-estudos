"use client";
import { Atom, BookMarked, GraduationCap, Inbox, NotebookText } from "lucide-react";
import { TabNav } from "./tab-nav";

/**
 * Abas das Notas: Inbox (kanban) · Literárias (por livro) · Atômicas · Aulas (anotações dos Estudos) · Diário (Lectio).
 * As margens são sempre as do TabNav (as abas ficam no mesmo pixel nas cinco): o className fica no tipo
 * só para não quebrar quem ainda o passa, e é ignorado.
 */
export function NotasTabs(_: { className?: string }) {
  return (
    <TabNav rotulo="Notas" abas={[
      { href: "/notas", label: "Inbox", icon: Inbox, exata: true },
      { href: "/notas/literarias", label: "Literárias", icon: BookMarked },
      { href: "/notas/atomicas", label: "Atômicas", icon: Atom },
      { href: "/notas/aulas", label: "Aulas", icon: GraduationCap },
      { href: "/notas/diario", label: "Diário", icon: NotebookText },
    ]} />
  );
}
