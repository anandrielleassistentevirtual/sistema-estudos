"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Library, Target } from "lucide-react";

const TABS = [
  { href: "/biblioteca", label: "Livros", icon: Library },
  { href: "/biblioteca/objetivos", label: "Mesas de objetivos", icon: Target },
];

/** Abas da Biblioteca: os livros (pastas CDD e fila) e as mesas de objetivos. */
export function BibliotecaTabs() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 border-b border-line mb-5 md:mb-6 -mt-2 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto no-scrollbar">
      {TABS.map(({ href, label, icon: Icon }) => {
        const ativo = href === "/biblioteca" ? path === "/biblioteca" : path.startsWith(href);
        return (
          <Link key={href} href={href}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              ativo ? "border-accent text-ink font-medium" : "border-transparent text-muted hover:text-ink"}`}>
            <Icon size={15} /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
