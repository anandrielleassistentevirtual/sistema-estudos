"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";

/**
 * O (i) ao lado do título: a explicação longa da tela fica aqui, fora do caminho.
 * O balão se ancora no bloco do título (o pai com `relative`), não no botão, para não sair da tela no celular.
 * Arquivo próprio com "use client" para o Page continuar sem hooks (há páginas servidor que o usam).
 */
export function AjudaDaTela({ children }: { children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const balao = useRef<HTMLDivElement>(null);
  const id = useId();

  // fecha com Esc (o foco volta ao botão) e com clique fora
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setAberto(false); botao.current?.focus(); }
    };
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (!botao.current?.contains(alvo) && !balao.current?.contains(alvo)) setAberto(false);
    };
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fora);
    return () => { document.removeEventListener("keydown", tecla); document.removeEventListener("pointerdown", fora); };
  }, [aberto]);

  return (
    <>
      <button ref={botao} type="button" className="text-faint hover:text-ink p-1 -m-1 rounded-md" aria-label="Sobre esta tela" title="Sobre esta tela"
        aria-expanded={aberto} aria-controls={id} onClick={() => setAberto((a) => !a)}>
        <Info size={16} />
      </button>
      {aberto && (
        <div ref={balao} id={id} role="dialog" aria-label="Sobre esta tela"
          className="popover absolute left-0 top-full mt-2 z-40 w-[min(24rem,calc(100vw-2rem))] p-3 text-sm font-normal tracking-normal text-muted leading-relaxed">
          {children}
        </div>
      )}
    </>
  );
}
