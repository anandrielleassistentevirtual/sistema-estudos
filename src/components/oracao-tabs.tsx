"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookHeart, ListChecks } from "lucide-react";

const TABS = [
  { href: "/lectio", label: "Lectio Divina", icon: BookHeart },
  { href: "/oracao/exame", label: "Exame de consciência", icon: ListChecks },
];

/** Abas de Oração: Lectio Divina · Exame de consciência. */
export function OracaoTabs({ className = "mb-6" }: { className?: string }) {
  const path = usePathname();
  return (
    <nav className={`flex gap-1 border-b border-line overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 ${className}`}>
      {TABS.map(({ href, label, icon: Icon }) => {
        const ativo = path.startsWith(href);
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
