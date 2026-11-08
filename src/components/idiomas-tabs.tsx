"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Languages, Layers, ListMusic } from "lucide-react";

const TABS = [
  { href: "/idiomas", label: "Idiomas e lições", icon: Languages },
  { href: "/idiomas/anki", label: "Anki", icon: Layers },
  { href: "/idiomas/playlist", label: "Playlist", icon: ListMusic },
];

/** Abas da seção Idiomas: tempo/lições, Anki e playlist. */
export function IdiomasTabs() {
  const path = usePathname();
  const active = (href: string) =>
    href === "/idiomas" ? path === "/idiomas" || /^\/idiomas\/(?!anki|playlist)[^/]+$/.test(path) : path.startsWith(href);
  return (
    <nav className="flex gap-1 border-b border-line mb-6 -mt-2 overflow-x-auto">
      {TABS.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
            active(href) ? "border-accent text-ink font-medium" : "border-transparent text-muted hover:text-ink"}`}>
          <Icon size={15} /> {label}
        </Link>
      ))}
    </nav>
  );
}
