"use client";
/**
 * Modo foco (o mesmo da Escrita): tela cheia, sem menus — só o texto. A barra de baixo fica apagada
 * (aparece ao passar o mouse) com o tempo da sessão e "sair do foco". Atalhos: Ctrl + Shift + F ou F11; Esc sai.
 */
import { useCallback, useEffect, useState, type RefObject } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

const DICA = "escrita-dica-nao-perturbe"; // a mesma da Escrita: "não mostrar de novo" vale para todas

export function useModoFoco(raiz: RefObject<HTMLElement | null>) {
  const [foco, setFoco] = useState(false);
  const [dica, setDica] = useState(false);

  const entrar = useCallback(async () => {
    setFoco(true);
    try { await raiz.current?.requestFullscreen?.(); } catch {}
    try { if (!localStorage.getItem(DICA)) setDica(true); } catch {}
  }, [raiz]);
  const sair = useCallback(() => {
    setFoco(false);
    setDica(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    // sair da tela cheia pelo navegador (Esc, F11) também sai do foco
    const fs = () => { if (!document.fullscreenElement) { setFoco(false); setDica(false); } };
    const k = (e: KeyboardEvent) => {
      if (e.key === "F11" || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f")) {
        e.preventDefault();
        if (foco) sair(); else void entrar();
      }
      if (e.key === "Escape" && foco) sair();
    };
    document.addEventListener("fullscreenchange", fs);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("fullscreenchange", fs); document.removeEventListener("keydown", k); };
  }, [foco, entrar, sair]);

  // ao sair da página, nada fica em tela cheia
  useEffect(() => () => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); }, []);

  const fecharDica = (naoMostrar: boolean) => {
    setDica(false);
    if (naoMostrar) try { localStorage.setItem(DICA, "1"); } catch {}
  };
  return { foco, entrar, sair, dica, fecharDica };
}

export function BotaoFoco({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs opacity-80 hover:opacity-100 ${className}`}
      style={{ borderColor: "color-mix(in srgb, currentColor 22%, transparent)" }}
      title="Modo foco: tela cheia, sem distrações (Ctrl + Shift + F)" onClick={onClick}>
      <Maximize2 size={14} /> <span className="hidden sm:inline">Foco</span>
    </button>
  );
}

export function SairDoFoco({ onClick }: { onClick: () => void }) {
  return (
    <button className="flex items-center gap-1 whitespace-nowrap hover:opacity-100" onClick={onClick} title="Sair do modo foco (Esc)">
      <Minimize2 size={12} /> <span className="hidden sm:inline">sair do foco (Esc)</span><span className="sm:hidden">sair</span>
    </button>
  );
}

export function DicaNaoPerturbe({ onFechar }: { onFechar: (naoMostrar: boolean) => void }) {
  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-4 z-40 card p-4 w-[min(24rem,calc(100%-2rem))] shadow-2xl text-sm text-ink">
      <p className="mb-1">Para silenciar também as notificações do computador:</p>
      <p className="text-muted">No Windows, aperte <b className="text-ink">Win + N</b> e ligue <b className="text-ink">Não perturbe</b>. No celular, use o modo Foco / Não perturbe.</p>
      <div className="flex justify-end gap-2 mt-3">
        <button className="btn btn-ghost text-xs" onClick={() => onFechar(false)}>Fechar</button>
        <button className="btn text-xs" onClick={() => onFechar(true)}>Não mostrar de novo</button>
      </div>
    </div>
  );
}
