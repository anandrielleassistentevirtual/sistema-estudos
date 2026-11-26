"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";

/** Aba que é um link (uma rota da seção) ou um botão (troca de visão na mesma tela, ex.: o idioma). */
export type Aba =
  | {
    href: string;
    label: string;
    icon: LucideIcon;
    /** só fica marcada na rota exata (a aba "principal" de uma seção) */
    exata?: boolean;
  }
  | {
    id: string;
    label: string;
    icone?: React.ReactNode;
    ativa: boolean;
    onClick: () => void;
    /** aba ainda sem conteúdo (ex.: idioma sem cartões): em cinza */
    fantasma?: boolean;
    /** o que o botão faz, quando o rótulo é curto (ex.: "+ Idioma" cadastra um idioma) */
    title?: string;
  };

/**
 * Abas de uma seção (Biblioteca, Estudos, Notas, Oração, Idiomas): o mesmo desenho e as mesmas margens em todas,
 * para a faixa ficar no mesmo pixel em todas as telas. O className só acrescenta classes que não sejam de margem.
 * No celular, quando não cabem, rolam para o lado e a aba aberta vem para o meio da faixa.
 */
export function TabNav({ abas, className = "", rotulo }: { abas: Aba[]; className?: string; rotulo?: string }) {
  const path = usePathname();
  const nav = useRef<HTMLElement>(null);
  // a aba-botão marcada (as abas-link seguem a rota): trocar de aba também traz a nova para o meio
  const botaoAtivo = abas.find((a): a is Extract<Aba, { id: string }> => "id" in a && a.ativa)?.id;
  useEffect(() => {
    const el = nav.current;
    const ativa = el?.querySelector<HTMLElement>("[aria-current=page]");
    if (el && ativa && el.scrollWidth > el.clientWidth) el.scrollLeft = ativa.offsetLeft - (el.clientWidth - ativa.offsetWidth) / 2;
  }, [path, botaoAtivo]);
  return (
    <nav ref={nav} aria-label={rotulo} className={`tabs -mx-4 px-4 md:mx-0 md:px-0 mb-4 md:mb-5 -mt-1 ${className}`}>
      {abas.map((a) => {
        if ("id" in a) {
          return (
            <button key={a.id} type="button" onClick={a.onClick} title={a.title} aria-current={a.ativa ? "page" : undefined} className={`tab ${a.fantasma && !a.ativa ? "text-faint" : ""}`}>
              {a.icone}{a.label}
            </button>
          );
        }
        const { href, label, icon: Icon, exata } = a;
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
