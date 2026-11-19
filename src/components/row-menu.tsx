"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

/**
 * Botão "•••" com as ações secundárias de uma linha (como nos apps da Apple).
 * O menu abre por cima de tudo (fora da linha), para não ser cortado por listas com rolagem ou cartões.
 */
export function RowMenu({ items, label = "Mais ações" }: { items: MenuItem[]; label?: string }) {
  const [pos, setPos] = useState<{ right: number; top?: number; bottom?: number } | null>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const aberto = !!pos;

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (!menu.current?.contains(alvo) && !botao.current?.contains(alvo)) setPos(null);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { setPos(null); botao.current?.focus(); } };
    // rolar ou mudar o tamanho da tela fecha o menu (ele ficaria longe do botão)
    const fechar = () => setPos(null);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
    };
  }, [aberto]);

  function abrir() {
    if (aberto) return setPos(null);
    const r = botao.current?.getBoundingClientRect();
    if (!r) return;
    const paraCima = window.innerHeight - r.bottom < 46 * items.length + 24;
    const right = Math.max(8, window.innerWidth - r.right);
    setPos(paraCima ? { right, bottom: window.innerHeight - r.top + 4 } : { right, top: r.bottom + 4 });
  }

  return (
    <div className="relative">
      <button ref={botao} type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={aberto}
        className={`p-2 sm:p-1.5 rounded-full transition-colors ${aberto ? "bg-sel text-ink" : "text-muted hover:text-ink hover:bg-sel"}`}
        onClick={abrir}>
        <MoreHorizontal size={17} />
      </button>
      {pos && createPortal(
        <div ref={menu} role="menu" className="fixed z-[80] w-60 sm:w-56 max-w-[calc(100vw-2rem)] popover py-1"
          style={{ right: pos.right, top: pos.top, bottom: pos.bottom }}>
          {items.map((it, i) => (
            <div key={i}>
              {it.separar && <div className="my-1 border-t border-line" />}
              <button type="button" role="menuitem" disabled={it.disabled}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-[7px] text-[15px] sm:text-[13px] text-left disabled:opacity-40 hover:bg-sel ${it.danger ? "text-critical" : "text-ink"}`}
                onClick={() => { setPos(null); it.onClick(); }}>
                {it.icon && <it.icon size={15} className={it.danger ? "" : "text-muted"} />}
                {it.label}
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
