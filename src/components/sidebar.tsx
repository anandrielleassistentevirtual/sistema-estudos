"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  GraduationCap, Languages, LayoutDashboard, Library,
  LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, NotebookPen, Sun, Timer, X,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useTimer } from "./timer-context";
import { fmtClock } from "@/lib/dates";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/timer", label: "Timer", icon: Timer },
  { href: "/biblioteca", label: "Mapa da Ignorância", icon: Library },
  { href: "/estudos", label: "Estudos", icon: GraduationCap },
  { href: "/idiomas", label: "Idiomas", icon: Languages },
  { href: "/notas", label: "Notas", icon: NotebookPen },
];

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

  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const showTimer = timer.running || timer.seconds > 0;

  const nav = (
    <nav className="flex flex-col h-full p-3 gap-0.5">
      <div className="px-3 pt-2 pb-4 flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold tracking-tight">Sistema de Estudos</div>
          <div className="text-xs text-faint">studium · lectio · memoria</div>
        </div>
        <button className="hidden md:block p-1 -mr-1 text-faint hover:text-ink rounded-md hover:bg-surface-2" title="Recolher o menu (Ctrl + \)"
          onClick={() => setHidden(true)}>
          <PanelLeftClose size={17} />
        </button>
      </div>
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
            active(href) ? "bg-accent-soft text-ink font-medium" : "text-muted hover:bg-surface-2 hover:text-ink"
          }`}
        >
          <Icon size={17} strokeWidth={1.8} />
          {label}
        </Link>
      ))}
      <div className="mt-auto pt-3 space-y-0.5">
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
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-12 border-b border-line bg-bg">
        <button className="btn btn-ghost px-2" onClick={() => setOpen(true)} aria-label="Abrir menu">
          <Menu size={18} />
        </button>
        <span className="font-semibold text-sm">Sistema de Estudos</span>
        <span className="w-8 text-xs font-mono tabular-nums text-muted">
          {showTimer ? fmtClock(timer.mode === "pomodoro" ? timer.remaining : timer.seconds) : ""}
        </span>
      </header>
      {!hidden && <aside className="hidden md:block fixed inset-y-0 left-0 w-60 border-r border-line bg-bg">{nav}</aside>}
      {hidden && (
        <button className="hidden md:flex fixed left-3 bottom-4 z-30 items-center gap-1.5 rounded-full border border-line bg-surface/90 backdrop-blur px-3 py-2 text-xs text-muted hover:text-ink shadow-sm"
          title="Mostrar o menu (Ctrl + \)" onClick={() => setHidden(false)}>
          <PanelLeftOpen size={15} /> Menu
        </button>
      )}
      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-bg border-r border-line">
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
