"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
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
  // celular: as abas não cabem todas; a aba aberta vem para o meio da faixa (senão "Aulas" e "Diário" ficam cortadas)
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = nav.current;
    const ativa = el?.querySelector<HTMLElement>("[aria-current=page]");
    if (el && ativa && el.scrollWidth > el.clientWidth) el.scrollLeft = ativa.offsetLeft - (el.clientWidth - ativa.offsetWidth) / 2;
  }, [path]);
  return (
    <nav ref={nav} className={`relative flex gap-1 border-b border-line overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 ${className}`}>
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = href === "/notas" ? path === "/notas" : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              active ? "border-accent text-ink font-medium" : "border-transparent text-muted hover:text-ink"}`}>
            <Icon size={15} /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
