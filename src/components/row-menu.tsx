"use client";
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** linha divisória antes deste item */
  separar?: boolean;
}

/** Botão "•••" com as ações secundárias de uma linha (como nos apps da Apple). */
export function RowMenu({ items, label = "Mais ações" }: { items: MenuItem[]; label?: string }) {
  const [aberto, setAberto] = useState(false);
  const [paraCima, setParaCima] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { setAberto(false); botao.current?.focus(); } };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", tecla); };
  }, [aberto]);

  function abrir() {
    const r = botao.current?.getBoundingClientRect();
    setParaCima(!!r && window.innerHeight - r.bottom < 46 * items.length + 24);
    setAberto((a) => !a);
  }

  return (
    <div ref={caixa} className="relative">
      <button ref={botao} type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={aberto}
        className={`p-2 sm:p-1.5 rounded-full transition-colors ${aberto ? "bg-sel text-ink" : "text-muted hover:text-ink hover:bg-sel"}`}
        onClick={abrir}>
        <MoreHorizontal size={17} />
      </button>
      {aberto && (
        <div role="menu" className={`absolute right-0 z-40 w-60 sm:w-56 max-w-[calc(100vw-2rem)] card py-1 shadow-xl ${paraCima ? "bottom-full mb-1" : "top-full mt-1"}`}>
          {items.map((it, i) => (
            <div key={i}>
              {it.separar && <div className="my-1 border-t border-line" />}
              <button type="button" role="menuitem" disabled={it.disabled}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-[7px] text-[15px] sm:text-[13px] text-left disabled:opacity-40 hover:bg-sel ${it.danger ? "text-critical" : "text-ink"}`}
                onClick={() => { setAberto(false); it.onClick(); }}>
                {it.icon && <it.icon size={15} className={it.danger ? "" : "text-muted"} />}
                {it.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
