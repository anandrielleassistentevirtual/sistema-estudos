"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
export function RowMenu({ items, label = "Mais ações", botaoClass = "p-2 sm:p-1.5" }: {
  items: MenuItem[]; label?: string;
  /** espaçamento do botão (área de toque): padrão "p-2 sm:p-1.5" */
  botaoClass?: string;
}) {
  const [pos, setPos] = useState<{ right: number; top?: number; bottom?: number; maxHeight?: number } | null>(null);
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
    // rolar (fora do menu) ou mudar o tamanho da tela fecha o menu (ele ficaria longe do botão)
    const fechar = (e?: Event) => { if (e?.type === "scroll" && menu.current?.contains(e.target as Node)) return; setPos(null); };
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

  // menu comprido: não sai da tela (encosta na borda e rola por dentro)
  useLayoutEffect(() => {
    const el = menu.current;
    if (!pos || !el || pos.maxHeight !== undefined) return;
    const h = el.offsetHeight, H = window.innerHeight;
    if (pos.top !== undefined && pos.top + h > H - 8) {
      const r = botao.current?.getBoundingClientRect();
      const cima = r ? r.top - 4 : 0, baixo = H - pos.top;
      if (r && cima > baixo) setPos({ right: pos.right, bottom: H - r.top + 4, maxHeight: Math.max(120, cima - 8) });
      else setPos({ ...pos, maxHeight: Math.max(120, baixo - 8) });
    } else if (pos.bottom !== undefined && H - pos.bottom - h < 8) {
      setPos({ ...pos, maxHeight: Math.max(120, H - pos.bottom - 8) });
    }
  }, [pos]);

  return (
    <div className="relative">
      <button ref={botao} type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={aberto}
        className={`${botaoClass} rounded-full transition-colors ${aberto ? "bg-sel text-ink" : "text-muted hover:text-ink hover:bg-sel"}`}
        onClick={abrir}>
        <MoreHorizontal size={17} />
      </button>
      {pos && createPortal(
        <div ref={menu} role="menu" className="fixed z-[80] w-max min-w-60 sm:min-w-56 max-w-[min(22rem,calc(100vw-2rem))] card py-1 shadow-xl overflow-y-auto overscroll-contain"
          style={{ right: pos.right, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}>
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
