"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";

export interface Aba {
  href: string;
  label: string;
  icon: LucideIcon;
  /** só fica marcada na rota exata (a aba "principal" de uma seção) */
  exata?: boolean;
}

/**
 * Abas de uma seção (Biblioteca, Estudos, Notas, Oração): o mesmo desenho em todas.
 * No celular, quando não cabem, rolam para o lado e a aba aberta vem para o meio da faixa.
 */
export function TabNav({ abas, className = "mb-5 md:mb-6 -mt-2", rotulo }: { abas: Aba[]; className?: string; rotulo?: string }) {
  const path = usePathname();
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = nav.current;
    const ativa = el?.querySelector<HTMLElement>("[aria-current=page]");
    if (el && ativa && el.scrollWidth > el.clientWidth) el.scrollLeft = ativa.offsetLeft - (el.clientWidth - ativa.offsetWidth) / 2;
  }, [path]);
  return (
    <nav ref={nav} aria-label={rotulo} className={`tabs -mx-4 px-4 md:mx-0 md:px-0 ${className}`}>
      {abas.map(({ href, label, icon: Icon, exata }) => {
        const ativa = exata ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={ativa ? "page" : undefined} className="tab">
            <Icon size={15} strokeWidth={1.9} /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
