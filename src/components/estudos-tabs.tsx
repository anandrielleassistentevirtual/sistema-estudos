"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, ListChecks } from "lucide-react";

const TABS = [
  { href: "/estudos", label: "Aulas", icon: GraduationCap },
  { href: "/estudos/tarefas", label: "Tarefas", icon: ListChecks },
];

/** Abas dos Estudos: as aulas (transcrições) e as tarefas. */
export function EstudosTabs() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 border-b border-line mb-6 -mt-2 overflow-x-auto">
      {TABS.map(({ href, label, icon: Icon }) => {
        const ativo = href === "/estudos" ? path === "/estudos" : path.startsWith(href);
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
