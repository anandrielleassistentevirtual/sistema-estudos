"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookHeart, ChevronRight, Feather, GraduationCap, HardDrive, Languages, LayoutDashboard, Library,
  LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, NotebookPen, Pause, Play, Sun, Timer, X,
 Sprout, HeartPulse } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useTimer } from "./timer-context";
import { TimerControls } from "./timer-controls";
import { fmtClock } from "@/lib/dates";
import { corDaCategoria } from "@/lib/cores";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/season", label: "Season", icon: Sprout },
  { href: "/timer", label: "Timer", icon: Timer },
  { sep: true },
  { href: "/lectio", label: "Oração", icon: BookHeart },
  { href: "/biblioteca", label: "Biblioteca", icon: Library },
  { href: "/estudos", label: "Estudos", icon: GraduationCap },
  { href: "/idiomas", label: "Idiomas", icon: Languages },
  { href: "/escrita", label: "Escrita", icon: Feather },
  { sep: true },
  { href: "/saude", label: "Saúde", icon: HeartPulse },
  { href: "/notas", label: "Notas", icon: NotebookPen },
] as const;

/** itens do rodapé do menu: o mesmo desenho dos itens de cima, num tom mais discreto */
const ITEM_RODAPE = "flex w-full items-center gap-3 md:gap-2.5 rounded-lg px-3 md:px-2.5 py-2.5 md:py-[7px] text-[15px] md:text-sm transition-colors";

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setDark(t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  return (
    <button
      className={`${ITEM_RODAPE} text-muted hover:bg-sel hover:text-ink`}
      onClick={() => {
        const next = dark ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem("tema", next); } catch {}
        setDark(!dark);
      }}
    >
      {dark ? <Sun size={17} strokeWidth={1.8} /> : <Moon size={17} strokeWidth={1.8} />} {dark ? "Tema claro" : "Tema escuro"}
    </button>
  );
}

/**
 * O item Timer do menu. No computador, com o menu à vista, o Timer mora aqui (a pílula flutuante some):
 * o relógio com a bolinha da categoria, ❚❚/▶ e o › que abre o painel rápido ao lado do item, sem cobrir o conteúdo.
 * No celular (gaveta) os botões ficam escondidos: lá continua a pílula.
 */
function ItemTimer({ className }: { className: string }) {
  const timer = useTimer();
  const path = usePathname();
  const [aberto, setAberto] = useState(false);
  const [topo, setTopo] = useState(0);
  const item = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  useEffect(() => setAberto(false), [path]);
  // fecha com Esc (o foco volta ao ›) e com clique fora
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { setAberto(false); botao.current?.focus(); } };
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (!botao.current?.contains(alvo) && !painel.current?.contains(alvo)) setAberto(false);
    };
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fora);
    return () => { document.removeEventListener("keydown", tecla); document.removeEventListener("pointerdown", fora); };
  }, [aberto]);

  const ativo = timer.running || timer.seconds > 0;
  // na própria tela do Timer (e na sala de escrita, que tem o seu cronômetro) o painel rápido não faz sentido
  const rapido = path !== "/timer" && !/^\/escrita\/[^/]+/.test(path);
  const oQue = timer.phase === "pausa" ? "Pausa" : timer.what || timer.category;
  const botaoCls = "p-1 rounded-md text-faint hover:text-ink hover:bg-surface-2";

  return (
    <div ref={item} className="relative">
      <Link href="/timer" className={className} title={ativo ? `Timer · ${oQue}` : undefined}>
        <Timer size={17} strokeWidth={1.8} className="text-icon shrink-0" />
        Timer
        {/* sessão em andamento: o relógio no próprio item, com a cor da categoria (pulsando enquanto corre) */}
        {ativo && (
          <span className={`ml-auto inline-flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-muted ${rapido ? "md:mr-12" : "md:mr-6"}`}>
            {timer.phase !== "pausa" && <span className={`dot !w-1.5 !h-1.5 ${timer.running ? "animate-pulse" : ""}`} style={{ background: corDaCategoria(timer.category) }} aria-hidden />}
            {fmtClock(timer.mode === "pomodoro" ? timer.remaining : timer.seconds)}
          </span>
        )}
      </Link>
      {(ativo || rapido) && (
        <div className="hidden md:flex absolute right-1.5 top-1/2 -translate-y-1/2 items-center gap-0.5">
          {ativo && (
            <button type="button" className={botaoCls} onClick={timer.running ? timer.pause : timer.start}
              title={timer.running ? "Pausar" : "Continuar"} aria-label={timer.running ? "Pausar o timer" : "Continuar o timer"}>
              {timer.running ? <Pause size={14} /> : <Play size={14} />}
            </button>
          )}
          {rapido && (
            <button ref={botao} type="button" className={botaoCls} title="Abrir o timer rápido" aria-label="Abrir o timer rápido" aria-expanded={aberto}
              onClick={() => {
                if (!aberto) setTopo(Math.max(8, item.current?.getBoundingClientRect().top ?? 8));
                setAberto(!aberto);
              }}>
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      )}
      {/* o painel abre ao lado do item, por cima de tudo (portal: o menu tem o próprio empilhamento) */}
      {aberto && createPortal(
        <div ref={painel} role="dialog" aria-label="Timer rápido" className="popover fixed left-[15.5rem] z-[60] w-[340px] p-4 overflow-y-auto"
          style={{ top: topo, maxHeight: `calc(100dvh - ${topo}px - 1rem)` }}>
          <div className="flex justify-between items-center mb-2">
            <span className="font-medium text-sm">Timer</span>
            <button type="button" onClick={() => setAberto(false)} className="text-muted hover:text-ink" aria-label="Fechar"><X size={16} /></button>
          </div>
          <TimerControls compact />
        </div>,
        document.body,
      )}
    </div>
  );
}

export function Sidebar() {
  const path = usePathname();
  const timer = useTimer();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  // no celular, o nome da seção só aparece na barra do topo depois que o título da página sai da tela (não se repete)
  const [nomeVisivel, setNomeVisivel] = useState(true);
  useEffect(() => {
    let io: IntersectionObserver | undefined;
    const quadro = requestAnimationFrame(() => {
      const h1 = document.querySelector("main h1");
      if (!h1) { setNomeVisivel(true); return; }
      io = new IntersectionObserver(([e]) => setNomeVisivel(!e.isIntersecting), { rootMargin: "-48px 0px 0px 0px" });
      io.observe(h1);
    });
    return () => { cancelAnimationFrame(quadro); io?.disconnect(); };
  }, [path]);
  // com o menu aberto no celular, a página de trás não rola junto
  useEffect(() => {
    if (!open) return;
    const antes = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { document.documentElement.style.overflow = antes; };
  }, [open]);
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
        // o aviso sai fora do setState: dentro do updater (que o React pode rodar duas vezes) o 1º aperto se perdia;
        // o próprio aviso muda o menu (ouvinte abaixo), e o estado atual vem do atributo que espelha `hidden`
        const oculto = document.documentElement.dataset.menu !== "oculto";
        window.dispatchEvent(new CustomEvent("modo-foco", { detail: { oculto } }));
      }
    };
    document.addEventListener("keydown", k);
    // o timer (ou outra tela) pode pedir o modo foco
    const f = (e: Event) => setHidden((e as CustomEvent<{ oculto: boolean }>).detail.oculto);
    window.addEventListener("modo-foco", f);
    return () => { document.removeEventListener("keydown", k); window.removeEventListener("modo-foco", f); };
  }, []);

  const secao = (() => {
    if (path.startsWith("/armazenamento")) return "Armazenamento";
    const it = NAV.find((i) => "href" in i && i.href !== "/" && (path.startsWith(i.href) || (i.href === "/lectio" && path.startsWith("/oracao"))));
    return it && "label" in it ? it.label : path === "/" ? "Dashboard" : "Sistema de Estudos";
  })();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/lectio" && path.startsWith("/oracao")));
  const showTimer = timer.running || timer.seconds > 0;
  // leitor e sala de escrita ocupam a tela toda e têm o próprio cabeçalho
  // leitores e sala de escrita em tela cheia (a página de Tarefas dos Estudos não é um leitor)
  const telaCheia = /^\/(ler|escrita)\/[^/]+/.test(path) || /^\/estudos\/(?!tarefas(\/|$))[^/]+/.test(path);
  // nos leitores, o botão do menu sobe para cima da barra de progresso (como o cronômetro)
  const leitor = /^\/ler\/[^/]+/.test(path) || /^\/estudos\/(?!tarefas(\/|$))[^/]+/.test(path);

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
      {NAV.map((item, i) => {
        if ("sep" in item) return <div key={`sep${i}`} className="my-2 mx-2 border-t border-line" />;
        const cls = `flex items-center gap-3 md:gap-2.5 rounded-lg px-3 md:px-2.5 py-2.5 md:py-[7px] text-[15px] md:text-sm border transition-colors ${
          active(item.href) ? "bg-sel border-transparent text-ink font-medium" : "border-transparent text-ink/80 hover:bg-sel"
        }`;
        if (item.href === "/timer") return <ItemTimer key={item.href} className={cls} />;
        return (
          <Link key={item.href} href={item.href} className={cls}>
            <item.icon size={17} strokeWidth={1.8} className="text-icon shrink-0" />
            {item.label}
          </Link>
        );
      })}
      <div className="mt-auto pt-3 space-y-0.5">
        <Link href="/armazenamento" className={`${ITEM_RODAPE} ${active("/armazenamento") ? "bg-sel text-ink font-medium" : "text-muted hover:bg-sel hover:text-ink"}`}>
          <HardDrive size={17} strokeWidth={1.8} /> Armazenamento
        </Link>
        <ThemeToggle />
        <button
          className={`${ITEM_RODAPE} text-muted hover:bg-sel hover:text-ink`}
          onClick={async () => {
            await supabase().auth.signOut();
            window.location.href = "/login";
          }}
        >
          <LogOut size={17} strokeWidth={1.8} /> Sair
        </button>
      </div>
    </nav>
  );

  return (
    <>
      {!telaCheia && <header className="md:hidden sticky top-0 z-30 pt-safe border-b border-line bg-bg/85 backdrop-blur-xl">
        <div className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center px-2 h-12">
        <button className="btn btn-ghost p-2.5 justify-self-start" onClick={() => setOpen(true)} aria-label="Abrir menu">
          <Menu size={20} />
        </button>
        {/* no celular, o nome da seção em que você está (o nome do sistema fica no menu) */}
        <span className={`font-semibold text-[15px] text-center truncate transition-opacity duration-200 ${nomeVisivel ? "" : "opacity-0"}`}>{secao}</span>
        <span className="justify-self-end pr-2 text-xs font-mono tabular-nums text-muted">
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
        <div className="md:hidden fixed inset-0 z-[65]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[min(18rem,85vw)] overflow-y-auto bg-surface border-r border-line pt-safe pb-safe">
            <button className="btn btn-ghost absolute right-2 top-[calc(env(safe-area-inset-top)+0.5rem)] p-2" onClick={() => setOpen(false)} aria-label="Fechar">
              <X size={18} />
            </button>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
