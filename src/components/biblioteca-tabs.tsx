"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Library, ListOrdered } from "lucide-react";

const TABS = [
  { href: "/biblioteca", label: "Biblioteca", icon: Library },
  { href: "/biblioteca/fila", label: "Fila de leitura", icon: ListOrdered },
];

/** Abas do Mapa da Ignorância: biblioteca e fila de leitura. */
export function BibliotecaTabs() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 border-b border-line mb-6 -mt-2 overflow-x-auto">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = href === "/biblioteca" ? path === "/biblioteca" : path.startsWith(href);
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
