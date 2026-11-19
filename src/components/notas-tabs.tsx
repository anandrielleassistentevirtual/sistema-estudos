"use client";
import { Atom, BookMarked, GraduationCap, Inbox, NotebookText } from "lucide-react";
import { TabNav } from "./tab-nav";

/** Abas das Notas: Inbox (kanban) · Literárias (por livro) · Atômicas · Aulas (anotações dos Estudos) · Diário (Lectio). */
export function NotasTabs({ className = "mb-5 md:mb-6 -mt-2" }: { className?: string }) {
  return (
    <TabNav rotulo="Notas" className={className} abas={[
      { href: "/notas", label: "Inbox", icon: Inbox, exata: true },
      { href: "/notas/literarias", label: "Literárias", icon: BookMarked },
      { href: "/notas/atomicas", label: "Atômicas", icon: Atom },
      { href: "/notas/aulas", label: "Aulas", icon: GraduationCap },
      { href: "/notas/diario", label: "Diário", icon: NotebookText },
    ]} />
  );
}
