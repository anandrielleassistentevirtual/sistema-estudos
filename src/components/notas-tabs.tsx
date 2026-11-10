"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Atom, BookMarked, GraduationCap, Inbox, NotebookText } from "lucide-react";

const TABS = [
  { href: "/notas", label: "Inbox", icon: Inbox },
  { href: "/notas/literarias", label: "Literárias", icon: BookMarked },
  { href: "/notas/atomicas", label: "Atômicas", icon: Atom },
  { href: "/notas/aulas", label: "Aulas", icon: GraduationCap },
  { href: "/notas/diario", label: "Diário", icon: NotebookText },
];

/** Abas das Notas: Inbox (kanban) · Literárias (por livro) · Atômicas · Aulas (anotações dos Estudos) · Diário (Lectio). */
export function NotasTabs({ className = "mb-6 -mt-2" }: { className?: string }) {
  const path = usePathname();
  return (
    <nav className={`flex gap-1 border-b border-line overflow-x-auto ${className}`}>
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = href === "/notas" ? path === "/notas" : path.startsWith(href);
        return (
          <Link key={href} href={href}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              active ? "border-accent text-ink font-medium" : "border-transparent text-muted hover:text-ink"}`}>
            <Icon size={15} /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
