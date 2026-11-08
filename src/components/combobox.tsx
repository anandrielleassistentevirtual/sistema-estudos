"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

export interface ComboOption {
  value: string;
  label: string;
  hint?: string; // texto menor (ex.: grupo, curso)
}

/** Remove acentos e caixa para buscar "flau" em "Flaubert" e "licao" em "Lição". */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Seleção com busca: digite parte do texto, use ↑↓ e Enter. */
export function Combobox({
  options, value, onChange, placeholder = "Digite para buscar…", emptyText = "Nada encontrado",
}: {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const terms = fold(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return options;
    return options.filter((o) => {
      const t = fold(`${o.label} ${o.hint ?? ""}`);
      return terms.every((w) => t.includes(w));
    });
  }, [options, q]);

  useEffect(() => setHi(0), [q]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi]);

  function pick(o: ComboOption) {
    onChange(o.value);
    setOpen(false);
    setQ("");
    input.current?.blur();
  }

  return (
    <div ref={box} className="relative">
      <div className={`input flex items-center gap-1.5 py-0 pr-1 ${open ? "border-accent" : ""}`} onClick={() => { setOpen(true); input.current?.focus(); }}>
        <Search size={14} className="text-faint shrink-0" />
        <input
          ref={input}
          className="flex-1 min-w-0 bg-transparent outline-none py-2 text-sm"
          value={open ? q : selected?.label ?? ""}
          placeholder={selected ? selected.label : placeholder}
          onFocus={() => { setOpen(true); setQ(""); }}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(filtered.length - 1, h + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
            else if (e.key === "Enter") { e.preventDefault(); if (filtered[hi]) pick(filtered[hi]); }
            else if (e.key === "Escape") { setOpen(false); setQ(""); input.current?.blur(); }
          }}
        />
        {value ? (
          <button type="button" className="p-1 text-faint hover:text-ink" title="Limpar" onClick={(e) => { e.stopPropagation(); onChange(""); setQ(""); }}><X size={14} /></button>
        ) : (
          <ChevronDown size={14} className="text-faint mr-1" />
        )}
      </div>
      {open && (
        <ul ref={list} className="absolute z-[80] mt-1 w-full max-h-64 overflow-y-auto card shadow-xl py-1 text-sm">
          {filtered.length === 0 && <li className="px-3 py-2 text-muted">{emptyText}</li>}
          {filtered.map((o, i) => (
            <li key={o.value} data-i={i}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setHi(i)}
              className={`px-3 py-1.5 cursor-pointer ${i === hi ? "bg-accent-soft" : ""} ${o.value === value ? "font-semibold" : ""}`}>
              <div className="truncate">{o.label}</div>
              {o.hint && <div className="text-[11px] text-muted truncate">{o.hint}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
