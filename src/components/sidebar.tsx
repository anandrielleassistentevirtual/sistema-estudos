"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookHeart, Feather, GraduationCap, HardDrive, Languages, LayoutDashboard, Library,
  LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, NotebookPen, Sun, Timer, X,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useTimer } from "./timer-context";
import { fmtClock } from "@/lib/dates";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/timer", label: "Timer", icon: Timer },
  { sep: true },
  { href: "/lectio", label: "Oração", icon: BookHeart },
  { href: "/biblioteca", label: "Biblioteca", icon: Library },
  { href: "/estudos", label: "Estudos", icon: GraduationCap },
  { href: "/idiomas", label: "Idiomas", icon: Languages },
  { href: "/escrita", label: "Escrita", icon: Feather },
  { sep: true },
  { href: "/notas", label: "Notas", icon: NotebookPen },
] as const;

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setDark(t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  return (
    <button
      className="btn btn-ghost w-full justify-start text-muted"
      onClick={() => {
        const next = dark ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem("tema", next); } catch {}
        setDark(!dark);
      }}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />} {dark ? "Tema claro" : "Tema escuro"}
    </button>
  );
}

export function Sidebar() {
  const path = usePathname();
  const timer = useTimer();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try { setHidden(localStorage.getItem("menu-oculto") === "1"); } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.dataset.menu = hidden ? "oculto" : "";
    try { localStorage.setItem("menu-oculto", hidden ? "1" : "0"); } catch {}
  }, [hidden]);
  // Ctrl + \ : modo foco (esconde/mostra o menu e a lista de aulas/notas juntos)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "\\") {
        e.preventDefault();
        setHidden((h) => {
          window.dispatchEvent(new CustomEvent("modo-foco", { detail: { oculto: !h } }));
          return !h;
        });
      }
    };
    document.addEventListener("keydown", k);
    // o timer (ou outra tela) pode pedir o modo foco
    const f = (e: Event) => setHidden((e as CustomEvent<{ oculto: boolean }>).detail.oculto);
    window.addEventListener("modo-foco", f);
    return () => { document.removeEventListener("keydown", k); window.removeEventListener("modo-foco", f); };
  }, []);

  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/lectio" && path.startsWith("/oracao")));
  const showTimer = timer.running || timer.seconds > 0;
  // leitor e sala de escrita ocupam a tela toda e têm o próprio cabeçalho
  const telaCheia = /^\/(ler|escrita|estudos)\/[^/]+/.test(path);
  // nos leitores, o botão do menu sobe para cima da barra de progresso (como o cronômetro)
  const leitor = /^\/(ler|estudos)\/[^/]+/.test(path);

  const nav = (
    <nav className="flex flex-col h-full p-3 gap-0.5">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 min-w-0 flex items-center gap-2 px-1 py-1.5">
          {/* o mesmo ícone do app na tela de início */}
          <img src="/icons/icon-192.png" alt="" width={28} height={28} className="w-7 h-7 shrink-0 rounded-[7px] ring-1 ring-black/10 dark:ring-white/10" />
          <div className="min-w-0">
            <div className="text-[14px] font-semibold tracking-tight truncate leading-tight">Sistema de Estudos</div>
            <div className="text-[10.5px] text-faint truncate leading-tight mt-0.5">studium · lectio · memoria</div>
          </div>
        </div>
        <button className="hidden md:block p-1 text-faint hover:text-ink rounded-md hover:bg-surface-2" title="Recolher o menu (Ctrl + \)"
          onClick={() => setHidden(true)}>
          <PanelLeftClose size={16} />
        </button>
      </div>
      {NAV.map((item, i) =>
        "sep" in item ? (
          <div key={`sep${i}`} className="my-2 mx-2 border-t border-line" />
        ) : (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-sm border transition-colors ${
              active(item.href) ? "bg-sel border-transparent text-ink font-medium" : "border-transparent text-ink/80 hover:bg-sel"
            }`}
          >
            <item.icon size={16} strokeWidth={1.8} className="text-icon" />
            {item.label}
          </Link>
        ),
      )}
      <div className="mt-auto pt-3 space-y-0.5">
        <Link href="/armazenamento" className={`btn btn-ghost w-full justify-start ${active("/armazenamento") ? "text-ink bg-sel" : "text-muted"}`}>
          <HardDrive size={16} /> Armazenamento
        </Link>
        <ThemeToggle />
        <button
          className="btn btn-ghost w-full justify-start text-muted"
          onClick={async () => {
            await supabase().auth.signOut();
            window.location.href = "/login";
          }}
        >
          <LogOut size={16} /> Sair
        </button>
      </div>
    </nav>
  );

  return (
    <>
      {!telaCheia && <header className="md:hidden sticky top-0 z-30 pt-safe border-b border-line bg-bg/85 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 h-12">
        <button className="btn btn-ghost px-2" onClick={() => setOpen(true)} aria-label="Abrir menu">
          <Menu size={18} />
        </button>
        <span className="font-medium text-sm">Sistema de Estudos</span>
        <span className="w-8 text-xs font-mono tabular-nums text-muted">
          {showTimer ? fmtClock(timer.mode === "pomodoro" ? timer.remaining : timer.seconds) : ""}
        </span>
        </div>
      </header>}
      {!hidden && <aside className="hidden md:block fixed inset-y-0 left-0 w-60 border-r border-line bg-sidebar backdrop-blur-xl">{nav}</aside>}
      {hidden && (
        <button style={{ bottom: leitor ? "calc(48px + env(safe-area-inset-bottom))" : undefined }}
          className="hidden md:flex fixed left-3 bottom-4 z-30 items-center gap-1.5 rounded-full border border-line bg-surface/90 backdrop-blur px-3 py-2 text-xs text-muted hover:text-ink shadow-sm"
          title="Mostrar o menu (Ctrl + \)" onClick={() => setHidden(false)}>
          <PanelLeftOpen size={15} /> Menu
        </button>
      )}
      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-surface border-r border-line pt-safe pb-safe">
            <button className="btn btn-ghost absolute right-2 top-2 px-2" onClick={() => setOpen(false)} aria-label="Fechar">
              <X size={18} />
            </button>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
